import { describe, expect, it } from "vitest";

import {
  boardStatus,
  type ClaimMessage,
  isClaimWire,
  parseClaim,
  parseResolved,
  resolveClaimBatch,
} from "./claim";

const claim = (
  over: Partial<ClaimMessage<{ button: number }>> = {},
): ClaimMessage<{ button: number }> => ({
  v: 1,
  kind: "claim",
  game: "buttons",
  claimId: "id1",
  seat: 1,
  seen: 3,
  body: { button: 2 },
  ...over,
});

describe("ClaimMessage v1 모양 검사", () => {
  it.each([
    ["맞는 청구", claim(), true],
    ["rtMs·hidden까지", claim({ rtMs: 412.5, hidden: true }), true],
    ["다른 게임", claim({ game: "hearts" }), false],
    ["판이 다르다", { ...claim(), v: 2 }, false],
    ["음수 판 번호", claim({ seen: -1 }), false],
    ["소수 자리", claim({ seat: 1.5 }), false],
    ["음수 rtMs", claim({ rtMs: -1 }), false],
    ["무한 rtMs", claim({ rtMs: Number.POSITIVE_INFINITY }), false],
    ["아이디 글자", claim({ claimId: "a b" }), false],
    ["긴 아이디", claim({ claimId: "x".repeat(65) }), false],
    ["내용 없음", { ...claim(), body: undefined }, false],
    ["문자열 hidden", { ...claim(), hidden: "yes" }, false],
  ])("%s", (_name, value, ok) => {
    expect(parseClaim(value, "buttons") !== null).toBe(ok);
  });

  it("내용 검사를 거치고, 모르는 필드는 버린 사본을 돌려준다", () => {
    const isBody = (b: unknown) => (b as { button?: unknown }).button === 2;
    expect(parseClaim(claim({ body: { button: 1 } }), "buttons", isBody)).toBe(
      null,
    );
    const parsed = parseClaim(
      { extra: "x", ...claim(), hidden: false },
      "buttons",
      isBody,
    );
    expect(parsed).toEqual(claim());
    expect(Object.keys(parsed ?? {})).toEqual(Object.keys(claim()));
  });

  it("방장 발표 모양 검사", () => {
    const ok = {
      v: 1,
      kind: "claims-resolved",
      game: "buttons",
      batch: 0,
      at: 3,
      entries: [
        { claim: claim(), outcome: { status: "judged", verdict: "hit" } },
        {
          claim: claim({ claimId: "id2" }),
          outcome: { status: "ignored", reason: "stale" },
        },
      ],
    };
    expect(parseResolved(ok, "buttons")?.entries).toHaveLength(2);
    expect(
      parseResolved(
        {
          ...ok,
          entries: [
            { claim: claim(), outcome: { status: "ignored", reason: "why" } },
          ],
        },
        "buttons",
      ),
    ).toBe(null);
    expect(parseResolved({ ...ok, at: -1 }, "buttons")).toBe(null);
    expect(parseResolved({ ...ok, game: "x" }, "buttons")).toBe(null);
  });

  it("방 코드 메시지(`t`)와 섞이지 않는다", () => {
    expect(isClaimWire(claim())).toBe(true);
    expect(isClaimWire({ v: 1, kind: "claims-resolved" })).toBe(true);
    expect(isClaimWire({ ...claim(), t: "action" })).toBe(false);
    expect(isClaimWire({ t: "snapshot" })).toBe(false);
    expect(isClaimWire({ lat: 1, t: "ping" })).toBe(false);
  });
});

describe("판 번호 판정", () => {
  it.each([
    [5, 5, 1, "ok"],
    [4, 5, 1, "ok"],
    [3, 5, 1, "stale"],
    [3, 5, 2, "ok"],
    [6, 5, 1, "future"],
    [0, 0, 0, "ok"],
  ] as const)("seen %i, at %i, 창 %i → %s", (seen, at, stale, expected) => {
    expect(boardStatus(seen, at, stale)).toBe(expected);
  });

  const boards = new Map([
    [3, { target: 2 }],
    [4, { target: 1 }],
  ]);
  const judge = (
    board: { target: number },
    c: ClaimMessage<{ button: number }>,
  ) => (c.body.button === board.target ? "hit" : "miss");
  const rules = { staleBoards: 1, maxPerSeat: 2 };

  it("도착 순이 아니라 (판, 자리, 아이디) 순으로, 각자 본 판 기준으로 판정한다", () => {
    const result = resolveClaimBatch({
      claims: [
        claim({ claimId: "z", seat: 2, seen: 4, body: { button: 1 } }),
        claim({ claimId: "b", seat: 1, seen: 4, body: { button: 2 } }),
        // 한 판 늦게 본 사람: 3번 판에서 맞는 단추(4번 판 기준이면 틀림)
        claim({ claimId: "a", seat: 2, seen: 3, body: { button: 2 } }),
      ],
      at: 4,
      rules,
      board: (seen) => boards.get(seen),
      judge,
    });
    expect(result.map((r) => [r.claim.claimId, r.outcome])).toEqual([
      ["a", { status: "judged", verdict: "hit" }],
      ["b", { status: "judged", verdict: "miss" }],
      ["z", { status: "judged", verdict: "hit" }],
    ]);
  });

  it("옛 판·없는 판·기록 없는 판·넘친 청구는 벌칙 없이 버린다", () => {
    const result = resolveClaimBatch({
      claims: [
        claim({ claimId: "old", seen: 2 }),
        claim({ claimId: "new", seen: 5 }),
        claim({ claimId: "c1", seat: 3, seen: 4, body: { button: 1 } }),
        claim({ claimId: "c2", seat: 3, seen: 4, body: { button: 1 } }),
        claim({ claimId: "c3", seat: 3, seen: 4, body: { button: 1 } }),
      ],
      at: 4,
      rules,
      board: (seen) => (seen === 4 ? boards.get(4) : undefined),
      judge,
    });
    expect(result.map((r) => [r.claim.claimId, r.outcome])).toEqual([
      ["old", { status: "ignored", reason: "stale" }],
      ["c1", { status: "judged", verdict: "hit" }],
      ["c2", { status: "judged", verdict: "hit" }],
      ["c3", { status: "ignored", reason: "too-many" }],
      ["new", { status: "ignored", reason: "future" }],
    ]);
    const unknown = resolveClaimBatch({
      claims: [claim({ seen: 3 })],
      at: 4,
      rules,
      board: () => undefined,
      judge,
    });
    expect(unknown[0]?.outcome).toEqual({
      status: "ignored",
      reason: "unknown-board",
    });
  });
});
