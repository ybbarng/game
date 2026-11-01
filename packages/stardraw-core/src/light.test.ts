import { describe, expect, it } from "vitest";
import { toBase64Url, toHex, utf8 } from "./bytes";
import {
  LIGHT_BUNDLE_SIZES,
  type LightBundleFile,
  type LightFile,
  LightMissing,
  lightBundlePath,
  lightFilePath,
  lightPieces,
  loadLightFiles,
  makeLightFile,
  roundSummary,
  sameSummary,
  twinCount,
} from "./light";
import { emptyWinners, encodeRecord, type RoundRecord } from "./record";
import type { KeyRegistration } from "./registration";
import { registrationRoot, sealRoot, sortTickets } from "./round";
import type { Ticket } from "./ticket";

// 서명·작업 증명은 요약·증명과 상관없어 고정 바이트로 만든 가짜 응모권을 쓴다(결정적)
const SIG = {
  kind: "webauthn" as const,
  authenticatorData: new Uint8Array(37),
  clientDataJSON: utf8("{}"),
  signature: new Uint8Array(8),
};
const pubOf = (n: number) => {
  const pub = new Uint8Array(65);
  pub[0] = 4;
  pub[1] = n;
  return pub;
};
function ticket(
  n: number,
  numbers: number[],
  qualPub?: number,
  round = 7,
): Ticket {
  const base = { round, numbers, pub: pubOf(n), nonce: n, sig: SIG };
  if (qualPub === undefined) return { v: 1, ...base };
  const q = new Uint8Array(33);
  q[0] = 2;
  q[1] = qualPub;
  return {
    v: 2,
    ...base,
    qual: {
      cert: {
        periodId: new Uint8Array(32),
        qualPub: q,
        stamp: new Uint8Array(48),
      },
      sig: new Uint8Array(64),
    },
  };
}
function record(
  round: number,
  tickets: readonly Ticket[],
  regs: readonly KeyRegistration[] = [],
): RoundRecord {
  return {
    v: 1,
    round,
    prev: new Uint8Array(32),
    count: tickets.length,
    merkleRoot: sealRoot(tickets),
    registrationCount: regs.length,
    registrationRoot: registrationRoot(regs),
    rootLoggedAt: 0,
    void: true,
    drandRound: 1,
    drandSignature: new Uint8Array(0),
    numbers: [],
    bonus: 0,
    winners: emptyWinners(),
    scheduleChanges: [],
    nicknames: [],
  };
}

const TICKETS = [
  ticket(1, [1, 2, 3, 4, 5, 6]),
  ticket(2, [7, 8, 9, 10, 11, 12], 9),
  ticket(3, [1, 2, 3, 4, 5, 6], 9),
  ticket(4, [40, 41, 42, 43, 44, 45], 5),
  ticket(5, [1, 2, 3, 4, 5, 6]),
  ticket(6, [7, 8, 9, 10, 11, 12]),
];

describe("회차 요약(roundSummary)", () => {
  it("소속 응모 수, 소속 열쇠 앞부분(응모권 id 순), 같은 조합 2장 이상", () => {
    const s = roundSummary(TICKETS);
    expect(s.qualified).toBe(3);
    const expectedQual = sortTickets(TICKETS).flatMap((t) =>
      t.qual ? [toHex(t.qual.cert.qualPub.subarray(0, 8))] : [],
    );
    expect(s.qualPubs).toEqual(expectedQual);
    expect(s.qualPubs.filter((p) => p === "0209000000000000")).toHaveLength(2);
    expect(s.twins).toEqual([
      [[1, 2, 3, 4, 5, 6], 3],
      [[7, 8, 9, 10, 11, 12], 2],
    ]);
  });

  it("순서와 상관없이 같은 값", () => {
    const shuffled = [...TICKETS].reverse();
    expect(roundSummary(shuffled)).toEqual(roundSummary(TICKETS));
    expect(sameSummary(roundSummary(shuffled), roundSummary(TICKETS))).toBe(
      true,
    );
  });

  it("빈 회차와 겹침 없는 회차", () => {
    expect(roundSummary([])).toEqual({ qualified: 0, qualPubs: [], twins: [] });
    const s = roundSummary([TICKETS[0] as Ticket, TICKETS[1] as Ticket]);
    expect(s.twins).toEqual([]);
    expect(twinCount(s, [1, 2, 3, 4, 5, 6])).toBe(1);
    expect(twinCount(roundSummary(TICKETS), [6, 5, 4, 3, 2, 1])).toBe(3);
  });

  it("다르면 sameSummary가 false", () => {
    const a = roundSummary(TICKETS);
    expect(sameSummary(a, { ...a, qualified: 2 })).toBe(false);
    expect(sameSummary(a, { ...a, twins: [] })).toBe(false);
    // 모르는 칸은 무시한다(판 올림)
    expect(sameSummary(a, { ...a, picks: [1] } as unknown as typeof a)).toBe(
      true,
    );
  });
});

describe("가벼운 기록 파일", () => {
  it("회차 파일의 기록 글을 그대로 담는다", () => {
    const r = record(7, TICKETS);
    const text = toBase64Url(encodeRecord(r));
    const file = makeLightFile(text, TICKETS);
    expect(file).toEqual({
      v: 1,
      round: 7,
      record: text,
      summary: roundSummary(TICKETS),
    });
  });

  it("받을 조각: 1000·100·10 묶음부터, 나머지는 낱개", () => {
    expect(LIGHT_BUNDLE_SIZES).toEqual([1000, 100, 10]);
    expect(lightPieces(1, 1234)).toEqual([
      { first: 1, size: 1000 },
      { first: 1001, size: 100 },
      { first: 1101, size: 100 },
      { first: 1201, size: 10 },
      { first: 1211, size: 10 },
      { first: 1221, size: 10 },
      { first: 1231, size: 1 },
      { first: 1232, size: 1 },
      { first: 1233, size: 1 },
      { first: 1234, size: 1 },
    ]);
    expect(lightPieces(15, 31)).toEqual([
      ...[15, 16, 17, 18, 19, 20].map((first) => ({ first, size: 1 })),
      { first: 21, size: 10 },
      { first: 31, size: 1 },
    ]);
  });

  function server(files: Map<string, unknown>): typeof fetch {
    return (async (input: string | URL | Request) => {
      const url = String(input);
      const path = url.slice(url.indexOf("/ledger/"));
      const body = files.get(path);
      return body === undefined
        ? new Response("없음", { status: 404 })
        : new Response(JSON.stringify(body));
    }) as typeof fetch;
  }
  const lightOf = (round: number): LightFile =>
    makeLightFile(toBase64Url(encodeRecord(record(round, []))), []);

  it("묶음과 낱개를 섞어 받고, 묶음이 없으면 작은 조각으로", async () => {
    const files = new Map<string, unknown>();
    for (let r = 1; r <= 23; r++) files.set(lightFilePath(r), lightOf(r));
    // 1~10 묶음만 있다(11~20 묶음은 아직 없다)
    files.set(lightBundlePath(10, 1), {
      v: 1,
      first: 1,
      size: 10,
      items: Array.from({ length: 10 }, (_, i) => lightOf(i + 1)),
    } satisfies LightBundleFile);
    const asked: string[] = [];
    const base = server(files);
    const f = (async (input: string | URL | Request) => {
      asked.push(String(input));
      return base(input);
    }) as typeof fetch;
    const got = await loadLightFiles("https://x", f, 1, 23);
    expect(got.map((g) => g.record.round)).toEqual(
      Array.from({ length: 23 }, (_, i) => i + 1),
    );
    expect(asked).toContain(`https://x${lightBundlePath(10, 1)}`);
    expect(asked).not.toContain(`https://x${lightFilePath(5)}`);
    expect(asked).toContain(`https://x${lightFilePath(15)}`);
  });

  it("낱개가 없으면 LightMissing(가벼운 기록을 내지 않는 서버)", async () => {
    await expect(
      loadLightFiles("https://x", server(new Map()), 1, 3),
    ).rejects.toBeInstanceOf(LightMissing);
  });

  it("다른 회차를 담은 파일은 거절", async () => {
    const files = new Map<string, unknown>([[lightFilePath(1), lightOf(2)]]);
    await expect(
      loadLightFiles("https://x", server(files), 1, 1),
    ).rejects.toThrow(/모양이 맞지 않습니다/);
  });
});
