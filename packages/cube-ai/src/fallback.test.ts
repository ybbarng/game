import { randomCubeState } from "@game/cube-engine";
import { ReductionStuckError } from "@game/cube-reduction";
import { describe, expect, it } from "vitest";
import { type BotLevel, solveHuman } from "./methods";
import { BIG_BOT_SPEEDS, type BotPlanOptions, botPlan } from "./plan";

/**
 * 대체 길: 고른 단계의 해법이 실패하면 초고수 해를 그 단계 빠르기로 둔다.
 * 실패는 일부러 던지는 해법을 넣어 일으킨다(실제 막히는 섞기를 찾지 않는다).
 */

type SolveFn = NonNullable<BotPlanOptions["solve"]>;

/** `fails`에 든 단계만 실패하고 나머지는 진짜 해법 */
function failing(fails: readonly BotLevel[], error: () => Error): SolveFn {
  return (level, size, state) => {
    if (fails.includes(level)) throw error();
    return solveHuman(level, size, state);
  };
}

const stuck = () =>
  new ReductionStuckError("edges", "no-progress", "시험에서 일부러");

describe("botPlan 대체 길", () => {
  const start4 = randomCubeState(4, 41);

  it("축소법이 막히면 초고수 수를 고른 단계 빠르기로 둔다", () => {
    const p = botPlan("beginner", 4, start4, 3, {
      solve: failing(["beginner"], stuck),
    });
    expect(p.fallback).toBe(true);
    const expert = botPlan("expert", 4, start4, 3);
    expect(expert.fallback).toBeUndefined();
    // 수는 초고수와 같고, 입문 빠르기라 더 늦게 끝난다
    expect(p.moves.map((m) => m.move)).toEqual(expert.moves.map((m) => m.move));
    expect(p.finishAt).toBeGreaterThan(expert.finishAt);
    const tps = (p.moves.length / p.finishAt) * 1000;
    expect(tps).toBeLessThan(BIG_BOT_SPEEDS.beginner.tps * 1.4);
  });

  it("3×3 사람 해법의 일반 오류도 대신하고, 같은 입력이면 같은 계획이다(다른 기기의 확인)", () => {
    const solve = failing(["intermediate"], () => new Error("못 맞춤"));
    const a = botPlan("intermediate", 4, start4, 9, { solve });
    expect(botPlan("intermediate", 4, start4, 9, { solve })).toEqual(a);
    expect(a.fallback).toBe(true);
  });

  it("초고수 해도 실패하면 오류를 그대로 던진다", () => {
    const solve = failing(["advanced", "expert"], stuck);
    expect(() => botPlan("advanced", 4, start4, 1, { solve })).toThrow(
      ReductionStuckError,
    );
    expect(() => botPlan("expert", 4, start4, 1, { solve })).toThrow(
      ReductionStuckError,
    );
  });
});
