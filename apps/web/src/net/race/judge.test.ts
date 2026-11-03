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
    expect(burst).toEqual({
      maxMovesInWindow: 5,
      peakMovesPerSecond: 10,
      burst: true,
      fewMoves: true,
    });
    const calm = suspicionFlags([0, 300, 600], undefined);
    expect(calm.burst).toBe(false);
    expect(calm.fewMoves).toBe(false);
    expect(calm.maxMovesInWindow).toBe(2);
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
