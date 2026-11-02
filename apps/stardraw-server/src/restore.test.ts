import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { anchorPath, ledgerId, verifyLedger } from "@game/stardraw-core";
import { afterEach, describe, expect, it } from "vitest";

import { GitHubAnchor } from "./outside";
import { pad } from "./publish";
import { restoreFromAnchor } from "./restore";
import {
  drawTimeOf,
  EPOCH,
  enter,
  FakeGitHub,
  makeRig,
  type Player,
  player,
  type Rig,
  readLedger,
  TEST_POW,
} from "./testing";

/**
 * 앵커로 다시 세우기(docs/36 11-26): DB와 백업을 모두 잃었을 때 앵커 저장소 사본으로 DB를 다시 세우고,
 * 같은 장부 끝 해시로 다음 회차를 이어 간다
 */

const REPO = "ybbarng/stardraw-ledger";
const POLICY = { rpId: "game.byb.kr", origins: ["https://game.byb.kr"] };

let rigs: Rig[] = [];
let dirs: string[] = [];
afterEach(() => {
  for (const r of rigs) r.close();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  rigs = [];
  dirs = [];
});

const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "stardraw-restore-"));
  dirs.push(dir);
  return dir;
};

/** 3회차를 닫은 장부(두 사람이 1·2회차에 응모)와 그 앵커 저장소 */
async function closedLedger() {
  const gh = new FakeGitHub();
  const rig = await makeRig({
    anchor: new GitHubAnchor(REPO, "test-token", gh.fetch),
  });
  rigs.push(rig);
  const a = await player();
  const b = await player();
  await rig.at(EPOCH + 10);
  await enter(rig, a, [1, 2, 3, 4, 5, 6]);
  await enter(rig, b, [7, 8, 9, 10, 11, 12], "198.51.100.9");
  await rig.finish(1);
  await enter(rig, a, [2, 3, 4, 5, 6, 7]);
  await rig.finish(2);
  await rig.finish(3);
  await rig.engine.anchorIdle();
  return { gh, rig, a, b };
}

/** 앵커 저장소 main 브랜치를 git clone 한 폴더처럼 쓴다 */
function cloneOf(gh: FakeGitHub): string {
  const root = tempDir();
  for (const [path, text] of gh.files("main")) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const restoreInto = (from: string, dir: string) =>
  restoreFromAnchor({
    from,
    out: join(dir, "stardraw.sqlite"),
    ledgerDir: join(dir, "ledger"),
    policy: POLICY,
    pow: TEST_POW,
    beaconVerifier: () => true,
  });

describe("앵커 저장소 폴더에서 다시 세우기", () => {
  it("같은 끝 해시로 되살리고, 공개 장부 파일도 같은 바이트로 다시 쓴다", async () => {
    const { gh, rig } = await closedLedger();
    const before = readLedger(rig.dir);
    const dir = tempDir();

    const result = await restoreInto(cloneOf(gh), dir);

    expect(result.rounds).toBe(3);
    expect(result.head).toBe(before.head.head);
    for (const path of [
      "genesis.json",
      `rounds/${pad(1)}.json`,
      `seals/${pad(3)}.json`,
    ])
      expect(readFileSync(join(dir, "ledger", path), "utf8")).toBe(
        readFileSync(join(rig.dir, "ledger", path), "utf8"),
      );
  });

  it("다시 띄운 서버가 다음 회차를 이어 닫고, 되살린 등록으로 등록 없이 응모한다", async () => {
    const { gh, rig, a } = await closedLedger();
    const head = readLedger(rig.dir).head.head;
    const dir = tempDir();
    await restoreInto(cloneOf(gh), dir);

    const back = await makeRig({
      dir,
      at: drawTimeOf(3) + 10,
      anchor: new GitHubAnchor(REPO, "test-token", gh.fetch),
    });
    rigs.push(back);
    expect(Buffer.from(back.engine.head()).toString("hex")).toBe(head);
    const again: Player = { signer: a.signer, registered: true };
    await enter(back, again, [3, 4, 5, 6, 7, 8]);
    await back.finish(4);
    await back.engine.anchorIdle();

    const after = readLedger(dir);
    expect(after.head.rounds).toBe(4);
    const report = await verifyLedger(
      after.genesis,
      after.records,
      after.tickets,
      after.registrations,
      { beaconVerifier: () => true, powParams: TEST_POW },
    );
    expect(report.problems).toEqual([]);
    // 1~3회차 앵커는 같은 내용이라 그대로 넘어가고, 4회차 앵커가 새로 오른다
    expect(back.logs.filter((l) => l.includes("다른 내용"))).toEqual([]);
    expect(
      gh.text("main", anchorPath(ledgerId(after.genesis), 4)),
    ).toBeDefined();
  });
});

describe("서버의 공개 장부 폴더에서 다시 세우기(DB만 잃음)", () => {
  it("공개 장부 폴더를 원본으로 같은 끝 해시가 된다", async () => {
    const { rig } = await closedLedger();
    const dir = tempDir();
    const result = await restoreInto(join(rig.dir, "ledger"), dir);
    expect(result.head).toBe(readLedger(rig.dir).head.head);
  });
});

describe("거절", () => {
  it("앵커 저장소에 원본보다 앞선 회차 앵커가 있으면 거절하고 DB를 만들지 않는다", async () => {
    const { gh, rig } = await closedLedger();
    const root = cloneOf(gh);
    const id = ledgerId(readLedger(rig.dir).genesis);
    writeFileSync(join(root, anchorPath(id, 4)), "stardraw-anchor v1\n");
    const dir = tempDir();

    await expect(restoreInto(root, dir)).rejects.toThrow("4회차 앵커가 있는데");
    expect(existsSync(join(dir, "stardraw.sqlite"))).toBe(false);
  });

  it("원본 응모권 목록이 기록과 다르면 거절한다", async () => {
    const { gh, rig } = await closedLedger();
    const root = cloneOf(gh);
    const id = ledgerId(readLedger(rig.dir).genesis);
    const file = join(
      root,
      "ledgers",
      id,
      "ledger",
      "rounds",
      `${pad(1)}.json`,
    );
    const round = JSON.parse(readFileSync(file, "utf8")) as {
      tickets: string[];
    };
    round.tickets = round.tickets.slice(1);
    writeFileSync(file, `${JSON.stringify(round)}\n`);
    const dir = tempDir();

    await expect(restoreInto(root, dir)).rejects.toThrow(
      "검사가 통과하지 않는다",
    );
    expect(existsSync(join(dir, "stardraw.sqlite"))).toBe(false);
  });

  it("이미 DB 파일이 있으면 덮어쓰지 않는다", async () => {
    const { gh } = await closedLedger();
    const dir = tempDir();
    writeFileSync(join(dir, "stardraw.sqlite"), "");
    await expect(restoreInto(cloneOf(gh), dir)).rejects.toThrow(
      "덮어쓰지 않는다",
    );
  });

  it("공개 장부 폴더가 원본보다 앞서 있으면 거절한다", async () => {
    const { gh } = await closedLedger();
    const dir = tempDir();
    mkdirSync(join(dir, "ledger"));
    writeFileSync(
      join(dir, "ledger", "head.json"),
      `${JSON.stringify({ v: 1, rounds: 9, head: "", sealed: 9, serverKey: "" })}\n`,
    );
    await expect(restoreInto(cloneOf(gh), dir)).rejects.toThrow("앞선다");
  });
});
