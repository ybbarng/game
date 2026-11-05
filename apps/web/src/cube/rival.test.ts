import { botPlan, levelText } from "@game/cube-ai";
import {
  applyMoves,
  isRotation,
  isSolved,
  parseMoves,
  randomCubeState,
} from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { MoveCounter } from "./challenge";
import {
  rivalAt,
  rivalOutcome,
  rivalSeed,
  rivalShown,
  rivalVerdict,
} from "./rival";

/** 혼자 하는 모드의 컴퓨터: 계획에서 미리 계산한 결과가 혼자 맞추기 규칙과 같다 */

const start = randomCubeState(2, 5);
const plan = botPlan(levelText("novice"), 2, start, 3);

/** 계획 수를 혼자 맞추기와 같은 HTM으로 센 값 */
function htm(): number {
  const c = new MoveCounter();
  for (const m of plan.moves)
    for (const move of parseMoves(2, m.move))
      c.push(move, isRotation(2, move), 2);
  return c.count;
}

describe("컴퓨터와 겨루기", () => {
  it("씨앗은 섞기 씨앗·크기마다 늘 같다", () => {
    expect(rivalSeed(7, 3)).toBe(rivalSeed(7, 3));
    expect(rivalSeed(7, 3)).not.toBe(rivalSeed(7, 2));
  });

  it("체력이 없으면 마지막 수에서 맞추고, 지난 칩을 적는다", () => {
    const o = rivalOutcome(2, start, plan, null);
    expect(o.doneAt).toBe(plan.finishAt);
    expect(o.endAt).toBe(plan.finishAt);
    expect(o.splits.length).toBeGreaterThan(0);
    expect(o.score).toBeNull();
    const { state } = rivalAt(2, start, plan, rivalShown(plan, o, o.endAt + 1));
    expect(isSolved(2, state)).toBe(true);
    // 출발 전(t < 첫 수)은 섞인 그대로
    expect(rivalShown(plan, o, -1)).toBe(0);
  });

  it("시간 체력이 모자라면 체력이 다하는 순간 끝나고, 넉넉하면 남은 체력이 점수에 든다", () => {
    const short = rivalOutcome(2, start, plan, {
      kind: "time",
      startMs: 2_000,
      refillMs: 0,
    });
    expect(short).toMatchObject({ doneAt: null, endAt: 2_000, reason: "time" });
    expect(short.score).toBe(short.splits.length > 0 ? 100 : 0);
    const long = rivalOutcome(2, start, plan, {
      kind: "time",
      startMs: plan.finishAt + 5_000,
      refillMs: 1_000,
    });
    expect(long.doneAt).toBe(plan.finishAt);
    // 다 맞춘 칩은 채우지 않는다: 칩 수 − 1번 채움
    const refills = new Set(long.splits.map((s) => s.ms)).size - 1;
    expect(long.left).toBe(5_000 + refills * 1_000);
  });

  it("수 체력: 헛수를 되돌린 것은 돌려받고(HTM), 딱 맞게는 괜찮고 모자라면 끝(마지막 수로 맞추면 넘어도 성공)", () => {
    const need = htm();
    expect(need).toBeLessThan(plan.moves.length);
    const just = rivalOutcome(2, start, plan, { kind: "moves", budget: need });
    expect(just.doneAt).toBe(plan.finishAt);
    expect(just.left).toBe(0);
    expect(
      rivalOutcome(2, start, plan, { kind: "moves", budget: need - 1 }).doneAt,
    ).toBe(plan.finishAt);
    const out = rivalOutcome(2, start, plan, {
      kind: "moves",
      budget: need - 3,
    });
    expect(out.reason).toBe("moves");
    expect(out.doneAt).toBeNull();
  });

  it("결과 견주기: 시간이면 빠른 쪽, 점수면 높은 쪽", () => {
    const o = rivalOutcome(2, start, plan, null);
    const at = o.doneAt as number;
    expect(rivalVerdict({ total: at - 1, score: null }, o)).toBe("win");
    expect(rivalVerdict({ total: at + 1, score: null }, o)).toBe("lose");
    expect(rivalVerdict({ total: null, score: null }, o)).toBe("lose");
    const scored = { ...o, score: 300 };
    expect(rivalVerdict({ total: null, score: 301 }, scored)).toBe("win");
    expect(rivalVerdict({ total: 1, score: 300 }, scored)).toBe("tie");
  });

  it("계획 수를 엔진에 두면 맞춰진다(섞기 그대로에서 출발)", () => {
    const end = applyMoves(
      2,
      start,
      parseMoves(2, plan.moves.map((m) => m.move).join(" ")),
    );
    expect(isSolved(2, end)).toBe(true);
  });
});
