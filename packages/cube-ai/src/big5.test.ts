import { randomCubeState } from "@game/cube-engine";
import { describe, expect, it } from "vitest";
import {
  checkSolve,
  REDUCTION_STAGES,
  stageNames,
  THREE_STAGES,
} from "./big-test-util";
import { BOT_LEVELS, solveHuman } from "./methods";
import { botPlan } from "./plan";

/**
 * 5×5 사람 흉내: 축소법 단계 뒤 같은 단계의 3×3 해법. 5×5는 4×4 같은 패리티가 없다
 * (모서리 패리티는 축소법의 모서리 짝 단계 안에서 고친다). 축소법이 상태마다 수백 ms라
 * 무작위 상태는 둘만 보고, 네 단계가 같은 축소 결과를 함께 쓴다.
 */

describe("5×5", () => {
  const first = randomCubeState(5, 21);
  const starts = [first, randomCubeState(5, 22)];

  it.each(BOT_LEVELS)("%s: 엔진에서 맞춰지고 단계가 이어진다", (level) => {
    for (const start of starts) {
      const solve = solveHuman(level, 5, start);
      checkSolve(5, start, solve);
      expect(stageNames(solve)).toEqual([
        ...REDUCTION_STAGES,
        ...THREE_STAGES[level],
      ]);
    }
  });

  it("같은 단계의 3×3보다 오래 걸린다", () => {
    const start3 = randomCubeState(3, 21);
    for (const level of ["beginner", "expert"] as const) {
      expect(botPlan(level, 5, first, 5).finishAt).toBeGreaterThan(
        botPlan(level, 3, start3, 5).finishAt,
      );
    }
  });
});
