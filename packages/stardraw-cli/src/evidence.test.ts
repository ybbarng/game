import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { earlySealPath, ledgerId, type Schedule } from "@game/stardraw-core";
import { afterEach, describe, expect, it } from "vitest";

import { folderEarlySealSource, SEEN_FILE, watchOnce } from "./evidence";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const seal = (round: number, digest: string, tokens = true) =>
  `${JSON.stringify({
    v: 1,
    round,
    digest,
    loggedAt: tokens ? 1793327710 : 0,
    log: tokens
      ? { kind: "tsa", tokens: [{ tsa: "digicert", genTime: 1793327710 }] }
      : null,
  })}\n`;

/** 서버 흉내: head.json의 sealed와 봉인 파일들 */
function server(state: { sealed: number; files: Map<number, string> }) {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/ledger/head.json"))
      return new Response(JSON.stringify({ sealed: state.sealed }));
    const m = /\/ledger\/seals\/(\d{6})\.json$/.exec(url);
    const text = m ? state.files.get(Number(m[1])) : undefined;
    return text === undefined
      ? new Response("없음", { status: 404 })
      : new Response(text);
  }) as typeof fetch;
}

describe("추첨 전 봉인 증거 모으기(watch)", () => {
  it("처음엔 막 봉인한 회차부터, 그 뒤로는 새 회차를 차례로 받아 두고, 서버가 파일을 바꾸면 따로 둔다", async () => {
    const out = mkdtempSync(join(tmpdir(), "stardraw-ev-"));
    dirs.push(out);
    const state = {
      sealed: 3,
      files: new Map([
        [3, seal(3, "aa")],
        [4, seal(4, "bb")],
        [5, seal(5, "cc", false)],
      ]),
    };
    expect(await watchOnce("", out, server(state))).toEqual([
      "3회 봉인 받음(시각 인증 digicert)",
    ]);
    state.sealed = 5;
    expect(await watchOnce("", out, server(state))).toEqual([
      "4회 봉인 받음(시각 인증 digicert)",
      "5회 봉인 받음(시각 인증 없음 — 이 회차는 무효로 닫힙니다)",
    ]);
    expect(readdirSync(out).sort()).toEqual([
      "000003.json",
      "000004.json",
      "000005.json",
    ]);

    // 추첨 뒤에 서버가 4회 봉인 파일에서 토큰을 빼면 따로 남기고 알린다
    state.files.set(4, seal(4, "bb", false));
    const changed = await watchOnce("", out, server(state));
    expect(changed).toHaveLength(1);
    expect(changed[0]).toContain(
      "주의: 4회 봉인 파일이 전에 받은 것과 다릅니다",
    );
    expect(readdirSync(out)).toContain("000004.1.json");

    // 증거 폴더로 읽으면 회차마다 받아 둔 파일이 나온다
    const source = folderEarlySealSource(out);
    expect((await source(4)).map((f) => f.loggedAt).sort()).toEqual([
      0, 1793327710,
    ]);
    expect(await source(9)).toEqual([]);
  });
});

describe("관측 전 사본도 받아 두기(docs/36 11-51)", () => {
  const schedule: Schedule = {
    epoch: 1793321700,
    entries: [
      {
        fromRound: 1,
        length: 3600,
        closeMargin: 5,
        powTarget: 2 ** 31,
        registerPowTarget: 2 ** 31,
        phase: "live",
      },
    ],
  };
  const id = ledgerId(schedule);
  const REPO = "ybbarng/stardraw-ledger";

  it("서버가 봉인한 다음 회차의 사본까지 main에서 찾아 받아 두고, 처음 본 시각을 남긴다", async () => {
    const out = mkdtempSync(join(tmpdir(), "stardraw-ev-"));
    dirs.push(out);
    const copies = new Map<string, string>([
      // 서버는 2회까지 봉인했고, 3회 사본은 공개 전에 먼저 올랐다
      [earlySealPath(id, 2), seal(2, "bb")],
      [earlySealPath(id, 3), seal(3, "cc")],
    ]);
    const fetchFn = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/ledger/genesis.json"))
        return Response.json({ v: 1, schedule });
      if (url.endsWith("/ledger/head.json"))
        return Response.json({ sealed: 2 });
      if (url.endsWith("/ledger/seals/000002.json"))
        return new Response(seal(2, "bb"));
      const prefix = `https://raw.githubusercontent.com/${REPO}/main/`;
      const text = url.startsWith(prefix)
        ? copies.get(url.slice(prefix.length))
        : undefined;
      return text === undefined
        ? new Response("없음", { status: 404 })
        : new Response(text);
    }) as typeof fetch;
    const now = () => new Date("2026-11-03T09:55:04Z");
    expect(
      await watchOnce("", out, fetchFn, { anchorRepo: REPO, now }),
    ).toEqual([
      "2회 봉인 받음(시각 인증 digicert)",
      "2회 관측 전 사본 봄(main, 2026-11-03T09:55:04.000Z)",
      "3회 관측 전 사본 봄(main, 2026-11-03T09:55:04.000Z)",
    ]);
    expect(readdirSync(join(out, "early-seals")).sort()).toEqual([
      "000002.json",
      "000003.json",
    ]);
    const seen = readFileSync(join(out, SEEN_FILE), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(seen.map((s) => [s.round, s.branch, s.seenAt])).toEqual([
      [2, "main", "2026-11-03T09:55:04.000Z"],
      [3, "main", "2026-11-03T09:55:04.000Z"],
    ]);
    // 한 번 본 사본은 다시 적지 않는다
    expect(
      await watchOnce("", out, fetchFn, { anchorRepo: REPO, now }),
    ).toEqual([]);
    // 증거 폴더로 읽을 때 사본 폴더는 섞이지 않는다
    expect(await folderEarlySealSource(out)(3)).toEqual([]);
  });
});
