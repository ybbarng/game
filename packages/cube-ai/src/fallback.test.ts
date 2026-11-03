import { randomCubeState } from "@game/cube-engine";
import { ReductionStuckError } from "@game/cube-reduction";
import { describe, expect, it } from "vitest";
import { type BotLevel, solveHuman } from "./methods";
import { BIG_BOT_SPEEDS, type BotPlanOptions, botPlan } from "./plan";

/**
 * 대체 길: 고른 단계의 3×3 해법이 실패하면 초고수 해를 그 단계 빠르기로 둔다.
 * 4×4·5×5 축소법이 막히면 대신하지 않고 바로 던진다(초고수도 같은 축소법이라 똑같이 막힌다).
 */

type SolveFn = NonNullable<BotPlanOptions["solve"]>;

/** `fails`에 든 단계만 실패하고 나머지는 진짜 해법. 부른 단계를 적어 둔다 */
function failing(fails: readonly BotLevel[], error: () => Error) {
  const calls: BotLevel[] = [];
  const solve: SolveFn = (level, size, state) => {
    calls.push(level);
    if (fails.includes(level)) throw error();
    return solveHuman(level, size, state);
  };
  return { solve, calls };
}

describe("botPlan 대체 길", () => {
  const start4 = randomCubeState(4, 41);

  it("3×3 사람 해법이 실패하면 초고수 수를 고른 단계 빠르기로 둔다", () => {
    const { solve } = failing(["beginner"], () => new Error("못 맞춤"));
    const p = botPlan("beginner", 4, start4, 3, { solve });
    expect(p.fallback).toBe(true);
    const expert = botPlan("expert", 4, start4, 3);
    expect(expert.fallback).toBeUndefined();
    // 수는 초고수와 같고, 입문 빠르기라 더 늦게 끝난다
    expect(p.moves.map((m) => m.move)).toEqual(expert.moves.map((m) => m.move));
    expect(p.finishAt).toBeGreaterThan(expert.finishAt);
    const tps = (p.moves.length / p.finishAt) * 1000;
    expect(tps).toBeLessThan(BIG_BOT_SPEEDS.beginner.tps * 1.4);
  });

  it("같은 입력이면 같은 대체 계획이다(다른 기기의 확인)", () => {
    const { solve } = failing(["intermediate"], () => new Error("못 맞춤"));
    const a = botPlan("intermediate", 4, start4, 9, { solve });
    expect(botPlan("intermediate", 4, start4, 9, { solve })).toEqual(a);
    expect(a.fallback).toBe(true);
  });

  it("초고수 해도 실패하면 오류를 그대로 던진다", () => {
    const { solve } = failing(
      ["advanced", "expert"],
      () => new Error("못 맞춤"),
    );
    expect(() => botPlan("advanced", 4, start4, 1, { solve })).toThrow(
      "못 맞춤",
    );
  });

  it("축소법이 실제로 막히면 초고수로 다시 풀지 않고 바로 던진다", () => {
    // 되풀이 상한을 줄여 진짜 축소법(돌려 쥐기 포함)이 가운데 단계에서 막히게 한다
    const calls: BotLevel[] = [];
    const solve: SolveFn = (level, size, state) => {
      calls.push(level);
      return solveHuman(level, size, state, { centerSteps: 1 });
    };
    let error: unknown;
    try {
      botPlan("beginner", 4, start4, 1, { solve });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ReductionStuckError);
    expect((error as ReductionStuckError).stage).toBe("centers-ud");
    expect(calls).toEqual(["beginner"]);
    // 초고수도 같은 축소법이라 똑같이 막힌다(대체해도 소용없는 까닭)
    expect(() => solveHuman("expert", 4, start4, { centerSteps: 1 })).toThrow(
      ReductionStuckError,
    );
  });
});
