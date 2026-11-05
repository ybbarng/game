import { randomCubeState } from "@game/cube-engine";
import { ReductionStuckError } from "@game/cube-reduction";
import { describe, expect, it } from "vitest";
import { type SolveMethod, solveHuman } from "./methods";
import { type BotPlanOptions, botPlan, botSpeed } from "./plan";
import type { BotSkill } from "./skill";

/**
 * 대체 길: 고른 해법이 실패하면 2단계 해법 해(`expert`)를 그 단계 빠르기로 둔다.
 * 4×4·5×5 축소법이 막히면 대신하지 않고 바로 던진다(대체 해도 같은 축소법이라 똑같이 막힌다).
 */

type SolveFn = NonNullable<BotPlanOptions["solve"]>;

const novice: BotSkill = { kind: "level", level: "novice" };
const club: BotSkill = { kind: "level", level: "club" };

/** `fails`에 든 해법만 실패하고 나머지는 진짜 해법. 부른 해법을 적어 둔다 */
function failing(fails: readonly SolveMethod[], error: () => Error) {
  const calls: SolveMethod[] = [];
  const solve: SolveFn = (method, size, state) => {
    calls.push(method);
    if (fails.includes(method)) throw error();
    return solveHuman(method, size, state);
  };
  return { solve, calls };
}

describe("botPlan 대체 길", () => {
  const start4 = randomCubeState(4, 41);

  it("3×3 사람 해법이 실패하면 대체 해를 고른 단계 빠르기로 둔다", () => {
    const { solve, calls } = failing(["beginner"], () => new Error("못 맞춤"));
    const p = botPlan(novice, 4, start4, 3, { solve });
    expect(p.fallback).toBe(true);
    expect(calls).toEqual(["beginner", "expert"]);
    const expert = solveHuman("expert", 4, start4);
    // 헛수를 빼면 대체 해 그대로, 입문 빠르기라 늦다
    expect(p.moves.filter((m) => !m.slip).map((m) => m.move)).toEqual(
      expert.moves,
    );
    const tps = (p.moves.length / p.finishAt) * 1000;
    expect(tps).toBeLessThan(botSpeed("novice", 4).tps * 1.4);
  });

  it("같은 입력이면 같은 대체 계획이다(다른 기기의 확인)", () => {
    const { solve } = failing(["fourlook"], () => new Error("못 맞춤"));
    const a = botPlan(club, 4, start4, 9, { solve });
    expect(botPlan(club, 4, start4, 9, { solve })).toEqual(a);
    expect(a.fallback).toBe(true);
  });

  it("대체 해도 실패하면 오류를 그대로 던진다", () => {
    const { solve } = failing(
      ["fourlook", "expert"],
      () => new Error("못 맞춤"),
    );
    expect(() => botPlan(club, 4, start4, 1, { solve })).toThrow("못 맞춤");
  });

  it("축소법이 실제로 막히면 다시 풀지 않고 바로 던진다", () => {
    // 되풀이 상한을 줄여 진짜 축소법(돌려 쥐기 포함)이 가운데 단계에서 막히게 한다
    const calls: SolveMethod[] = [];
    const solve: SolveFn = (method, size, state) => {
      calls.push(method);
      return solveHuman(method, size, state, { centerSteps: 1 });
    };
    let error: unknown;
    try {
      botPlan(novice, 4, start4, 1, { solve });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ReductionStuckError);
    expect((error as ReductionStuckError).stage).toBe("centers-ud");
    expect(calls).toEqual(["beginner"]);
    // 대체 해도 같은 축소법이라 똑같이 막힌다(대체해도 소용없는 까닭)
    expect(() => solveHuman("expert", 4, start4, { centerSteps: 1 })).toThrow(
      ReductionStuckError,
    );
  });
});
