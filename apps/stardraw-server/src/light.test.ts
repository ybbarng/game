import { readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import {
  ledgerId,
  ledgerMirrorPath,
  lightBundleName,
  lightFileName,
  loadLightFiles,
  roundSummary,
  toHex,
} from "@mighty/stardraw-core";
import { afterEach, describe, expect, it } from "vitest";

import { createHttpServer } from "./http";
import { GitHubAnchor } from "./outside";
import { pad } from "./publish";
import {
  drawOf,
  EPOCH,
  enter,
  FakeGitHub,
  makeRig,
  type Player,
  player,
  type Rig,
  readLedger,
} from "./testing";

/**
 * 가벼운 확인(docs/36 11-30): 서버가 회차를 닫을 때 가벼운 기록 파일(기록 + 요약)과 묶음을 내고,
 * 이미 닫힌 회차는 띄울 때 채운다(운영 장부에 그대로 붙는다). 앵커 사본에도 오른다.
 * 증명 API는 내 응모권이 그 회차 기록의 머클 루트에 있다는 증명을 낸다
 */

let rigs: Rig[] = [];
let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
  const open = rigs;
  rigs = [];
  for (const r of open) r.close();
});

const REPO = "ybbarng/stardraw-ledger";
const served = (rig: Rig, path: string) =>
  readFileSync(join(rig.dir, "ledger", path), "utf8");
const json = (rig: Rig, path: string) => JSON.parse(served(rig, path));

/** 사람 셋이 1·2회차에 응모하고(둘은 같은 번호) n회차까지 닫는다 */
async function rigWithEntries(
  n: number,
  options: Parameters<typeof makeRig>[0] = {},
): Promise<{ rig: Rig; players: Player[] }> {
  const rig = await makeRig(options);
  rigs.push(rig);
  await rig.at(EPOCH + 10);
  const players = [await player(), await player(), await player()];
  for (let round = 1; round <= n; round++) {
    if (round <= 2) {
      const same = drawOf(round + 5).numbers;
      await enter(rig, players[0] as Player, same);
      await enter(rig, players[1] as Player, same);
      await enter(rig, players[2] as Player, drawOf(round + 9).numbers);
    }
    await rig.finish(round);
  }
  return { rig, players };
}

async function reopen(rig: Rig, options: Parameters<typeof makeRig>[0] = {}) {
  await rig.engine.anchorIdle();
  rig.store.close();
  rigs = rigs.filter((r) => r !== rig);
  const again = await makeRig({
    ...options,
    dir: rig.dir,
    at: rig.clock.now() / 1000,
  });
  rigs.push(again);
  return again;
}

describe("가벼운 기록 파일", () => {
  it("회차를 닫으면 회차 파일과 같은 기록 글과 그 응모권의 요약을 낸다", async () => {
    const { rig } = await rigWithEntries(3);
    const l = readLedger(rig.dir);
    for (let r = 1; r <= 3; r++) {
      const light = json(rig, lightFileName(r));
      expect(light).toEqual({
        v: 1,
        round: r,
        record: json(rig, `rounds/${pad(r)}.json`).record,
        summary: roundSummary(l.tickets[r - 1] ?? []),
      });
    }
    expect(json(rig, lightFileName(1)).summary.twins).toEqual([
      [[...drawOf(6).numbers].sort((a, b) => a - b), 2],
    ]);
  });

  it("10회차가 닫히면 묶음을 내고, 받는 쪽은 묶음으로 받아 서버 기록과 같은 사슬을 얻는다", async () => {
    const { rig } = await rigWithEntries(12);
    const bundle = json(rig, lightBundleName(10, 1));
    expect(bundle.first).toBe(1);
    expect(bundle.size).toBe(10);
    for (let r = 1; r <= 10; r++)
      expect(bundle.items[r - 1]).toEqual(json(rig, lightFileName(r)));

    const server = createHttpServer(rig.engine, rig.relay, {
      basePath: "/stardraw-api",
      ledgerDir: join(rig.dir, "ledger"),
      devOrigins: [],
      trustProxy: false,
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    close = () => new Promise((r) => server.close(() => r()));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}/stardraw-api`;
    const res = await fetch(`${base}/ledger/${lightBundleName(10, 1)}`);
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(
      (await fetch(`${base}/ledger/light/bundles/7/000001.json`)).status,
    ).toBe(404);
    const asked: string[] = [];
    const counting = ((url: string, init?: RequestInit) => {
      asked.push(url.slice(base.length));
      return fetch(url, init);
    }) as typeof fetch;
    const got = await loadLightFiles(base, counting, 1, 12);
    expect(got.map((g) => toHex(g.record.merkleRoot))).toEqual(
      readLedger(rig.dir).records.map((r) => toHex(r.merkleRoot)),
    );
    // 묶음 1개 + 11·12회차 낱개
    expect(asked).toHaveLength(3);
  });

  it("가벼운 기록을 내기 전에 닫힌 회차(운영 장부)는 서버를 다시 띄우면 같은 내용으로 채운다", async () => {
    const { rig } = await rigWithEntries(11);
    const before = new Map(
      [...Array(11).keys()].map((i) => [
        i + 1,
        served(rig, lightFileName(i + 1)),
      ]),
    );
    const bundle = served(rig, lightBundleName(10, 1));
    // 가벼운 기록을 내지 않던 판의 데이터 폴더와 같게
    rmSync(join(rig.dir, "ledger", "light"), { recursive: true });
    const again = await reopen(rig);
    for (const [r, text] of before)
      expect(served(again, lightFileName(r))).toBe(text);
    expect(served(again, lightBundleName(10, 1))).toBe(bundle);
  });
});

describe("앵커 사본의 가벼운 기록", () => {
  it("새 회차는 회차 파일과 같은 커밋에 오른다", async () => {
    const gh = new FakeGitHub();
    const anchor = new GitHubAnchor(REPO, "test-token", gh.fetch);
    const { rig } = await rigWithEntries(11, { anchor });
    await rig.engine.anchorIdle();
    const id = ledgerId(rig.engine.genesis);
    const at = (path: string) => gh.text("main", ledgerMirrorPath(id, path));
    for (let r = 1; r <= 11; r++)
      expect(at(lightFileName(r))).toBe(served(rig, lightFileName(r)));
    expect(at(lightBundleName(10, 1))).toBe(
      served(rig, lightBundleName(10, 1)),
    );
    expect(gh.commits.at(-1)?.paths).toContain(
      ledgerMirrorPath(id, lightFileName(11)),
    );
    expect(rig.store.lightMirrored("main")).toBe(11);
  });

  it("가벼운 기록을 올리기 전 판에서 사본에 오른 회차는 다시 띄우면 채운다", async () => {
    const gh = new FakeGitHub();
    const real = new GitHubAnchor(REPO, "test-token", gh.fetch);
    // 옛 판: 회차·봉인·묶음 파일만 올린다
    const old = (files?: readonly { path: string; text: string }[]) =>
      files?.filter((f) => !f.path.includes("/ledger/light/"));
    const oldAnchor: typeof real = Object.assign(Object.create(real), {
      anchor: (e: never, branch: string, files?: never) =>
        real.anchor(e, branch, old(files) as never),
      mirror: (branch: string, files: never, message: string) =>
        real.mirror(branch, old(files) as never, message),
    });
    const { rig } = await rigWithEntries(11, { anchor: oldAnchor });
    await rig.engine.anchorIdle();
    const id = ledgerId(rig.engine.genesis);
    const at = (path: string) => gh.text("main", ledgerMirrorPath(id, path));
    expect(at(lightFileName(1))).toBeUndefined();
    // 옛 판 DB에는 가벼운 기록 진행이 없다
    rig.store.setLightMirrored("main", 0);
    const before = gh.commits.length;
    const again = await reopen(rig, { anchor: real });
    await again.at(again.clock.now() / 1000 + 1);
    await again.engine.anchorIdle();
    expect(again.store.lightMirrored("main")).toBe(11);
    const fills = gh.commits.slice(before);
    expect(fills.map((c) => c.message)).toEqual([
      `하늘의 별 따기 가벼운 기록 파일 1~11회 (장부 ${id})`,
    ]);
    expect(fills[0]?.paths.sort()).toEqual(
      [
        ...[...Array(11).keys()].map((i) => lightFileName(i + 1)),
        lightBundleName(10, 1),
      ]
        .map((p) => ledgerMirrorPath(id, p))
        .sort(),
    );
    for (let r = 1; r <= 11; r++)
      expect(at(lightFileName(r))).toBe(served(again, lightFileName(r)));
    // 다음 회차는 다시 회차 파일과 같은 커밋에
    await again.finish(12);
    await again.engine.anchorIdle();
    expect(gh.commits.at(-1)?.paths).toContain(
      ledgerMirrorPath(id, lightFileName(12)),
    );
    expect(again.store.lightMirrored("main")).toBe(12);
  });
});
