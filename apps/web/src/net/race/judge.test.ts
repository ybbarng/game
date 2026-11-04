import { describe, expect, it } from "vitest";
import { judge, lowerMedian, suspicionFlags } from "./judge";
import { parseRaceMessage } from "./messages";
import { raceCommitment, raceSeed } from "./seed";

describe("판정 계산", () => {
  it("가운데 값: 짝수면 낮은 쪽", () => {
    expect(lowerMedian([])).toBeNull();
    expect(lowerMedian([5])).toBe(5);
    expect(lowerMedian([9000, 100])).toBe(100);
    expect(lowerMedian([3, 1, 2])).toBe(2);
  });

  it("의심 표시: 창 안 최대 수와 너무 적은 수", () => {
    const burst = suspicionFlags([0, 10, 20, 30, 40, 1000], {
      maxMovesInWindow: 4,
      minMoves: 10,
    });
    expect(burst).toMatchObject({
      maxMovesInWindow: 5,
      peakMovesPerSecond: 10,
      burst: true,
      fewMoves: true,
      even: false,
      fastStart: false,
    });
    const calm = suspicionFlags([0, 300, 600], undefined);
    expect(calm.burst).toBe(false);
    expect(calm.fewMoves).toBe(false);
    expect(calm.maxMovesInWindow).toBe(2);
  });

  it("⑤ 의심 표시 보강: 수가 적음은 센 수(큐브 돌리기 뺌)로, 고른 간격·첫 수 빠르기", () => {
    const rules = {
      minMoves: 30,
      evenCv: 0.2,
      evenMinMoves: 30,
      fastStartMoves: 12,
      fastStartMs: 600,
    };
    // 40수 가운데 20수는 돌리기(y y′): 모든 수로는 30을 넘지만 센 수는 20
    const all = Array.from(
      { length: 40 },
      (_, i) => 1000 + 137 * i + (i % 3) * 250,
    );
    const turns = all.filter((_, i) => i % 2 === 0);
    expect(suspicionFlags(all, rules).fewMoves).toBe(false);
    expect(suspicionFlags(all, rules, turns).fewMoves).toBe(true);
    // 0.1초마다 똑같이(프로그램)
    const even = Array.from({ length: 40 }, (_, i) => 2000 + 100 * i);
    const flagged = suspicionFlags(even, rules);
    expect(flagged.even).toBe(true);
    expect(flagged.intervalCv).toBe(0);
    // 빠른 손놀림과 살피는 멈춤이 섞인 사람
    const human = Array.from(
      { length: 40 },
      (_, i) => 800 + 110 * i + Math.floor(i / 4) * 600,
    );
    expect(suspicionFlags(human, rules).even).toBe(false);
    expect(suspicionFlags(human, rules).fastStart).toBe(false);
    // 풀리자마자 12수를 0.55초 안에(살펴보기 동안 몰래 풀어 둔 것을 흘림)
    const dumped = [...Array.from({ length: 12 }, (_, i) => 50 * i), ...human];
    expect(suspicionFlags(dumped, rules).fastStart).toBe(true);
  });

  it("③ 하한을 낸 기기가 하나뿐이고 폭을 넘으면 「확인 안 됨」, 증인이 둘이면 가운데 값을 그대로 쓴다. 증인이 없으면 약하지 않다", () => {
    const records = [
      { id: "a", status: "done" as const, moveTimes: [100], reported: 5_000 },
    ];
    const one = judge({
      records,
      bounds: { a: { b: 9_000_000 } },
      disputeMs: 1000,
    });
    expect(one.players.a).toMatchObject({ disputed: true, accepted: 5_000 });
    const near = judge({
      records,
      bounds: { a: { b: 5_900 } },
      disputeMs: 1000,
    });
    expect(near.players.a?.disputed).toBeUndefined();
    expect(near.players.a?.accepted).toBe(5_900);
    const two = judge({
      records,
      bounds: { a: { b: 9_000_000, c: 8_000 } },
      disputeMs: 1000,
    });
    expect(two.players.a?.disputed).toBeUndefined();
    expect(two.players.a?.accepted).toBe(8_000);
    const none = judge({ records, bounds: { a: {} }, disputeMs: 1000 });
    expect(none.players.a).toMatchObject({ weak: false, accepted: 5_000 });
  });

  it("인정 = max(보고, 하한), 약한 하한은 빼고, 순위는 맞춤 → 못 맞춤 → 기권", () => {
    const r = judge({
      records: [
        { id: "c", status: "forfeit", reason: "공개 안 함", moveTimes: [] },
        { id: "b", status: "playing", moveTimes: [10] },
        { id: "a", status: "done", moveTimes: [100, 200], reported: 200 },
        { id: "d", status: "done", moveTimes: [100], reported: 150 },
      ],
      bounds: { a: { b: 50, d: null }, d: { a: 400, b: 300 } },
    });
    expect(r.players.a).toMatchObject({
      accepted: 200,
      usedBound: 50,
      weak: false,
    });
    expect(r.players.d).toMatchObject({ accepted: 300, usedBound: 300 });
    expect(r.players.b).toMatchObject({ status: "dnf" });
    expect(r.ranking).toEqual(["a", "d", "b", "c"]);
  });

  it("약속·씨앗: 같은 재료면 같은 값, 순서와 상관없다", () => {
    expect(raceCommitment("r", 0, "a", "n", "s")).toBe(
      raceCommitment("r", 0, "a", "n", "s"),
    );
    expect(raceCommitment("r", 1, "a", "n", "s")).not.toBe(
      raceCommitment("r", 0, "a", "n", "s"),
    );
    expect(raceSeed("r", 0, { b: "2", a: "1" })).toBe(
      raceSeed("r", 0, { a: "1", b: "2" }),
    );
  });

  it("메시지 모양이 틀리면 버린다", () => {
    expect(
      parseRaceMessage({
        type: "race-done",
        race: "r",
        attempt: 0,
        n: 1,
        t: 5,
      }),
    ).toEqual({
      type: "race-done",
      race: "r",
      attempt: 0,
      n: 1,
      t: 5,
    });
    expect(
      parseRaceMessage({
        type: "race-done",
        race: "r",
        attempt: 0,
        n: "1",
        t: 5,
      }),
    ).toBeNull();
    expect(
      parseRaceMessage({
        type: "race-moves",
        race: "r",
        attempt: 0,
        moves: [{ i: 0, m: 1, t: 0 }],
      }),
    ).toBeNull();
    expect(parseRaceMessage("x")).toBeNull();
  });
});
