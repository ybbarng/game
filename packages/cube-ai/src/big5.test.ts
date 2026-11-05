import { randomCubeState } from "@game/cube-engine";
import { describe, expect, it } from "vitest";
import {
  checkSolve,
  REDUCTION_STAGES,
  stageNames,
  THREE_STAGES,
} from "./big-test-util";
import { SOLVE_METHODS, solveHuman } from "./methods";
import { botPlan } from "./plan";

/**
 * 5×5 사람 흉내: 축소법 단계 뒤 같은 단계의 3×3 해법. 5×5는 4×4 같은 패리티가 없다
 * (모서리 패리티는 축소법의 모서리 짝 단계 안에서 고친다). 축소법이 상태마다 수백 ms라
 * 무작위 상태는 하나만 보고, 네 단계가 같은 축소 결과를 함께 쓴다. 이 파일은 축소 단계 뒤에
 * 단계별 3×3 해법이 이어 붙는지를 본다. 여러 상태(모서리 패리티가 생기는 것 포함)를 축소법이
 * 푸는지는 cube-reduction의 reduction5.test.ts가 본다(2026-11-04, 상태 둘이면 CI 약 3초).
 */

describe("5×5", () => {
  // 씨앗 22는 축소법이 보통 길이(약 250ms). 21은 그 두 배쯤이라 뺐다
  const first = randomCubeState(5, 22);

  it.each(SOLVE_METHODS)("%s: 엔진에서 맞춰지고 단계가 이어진다", (level) => {
    const solve = solveHuman(level, 5, first);
    checkSolve(5, first, solve);
    expect(stageNames(solve)).toEqual([
      ...REDUCTION_STAGES,
      ...(THREE_STAGES[level] ?? []),
    ]);
  });

  it("같은 단계의 3×3보다 오래 걸린다", () => {
    const start3 = randomCubeState(3, 21);
    for (const level of ["novice", "pro"] as const) {
      const skill = { kind: "level", level } as const;
      expect(botPlan(skill, 5, first, 5).finishAt).toBeGreaterThan(
        botPlan(skill, 3, start3, 5).finishAt,
      );
    }
  });
});
