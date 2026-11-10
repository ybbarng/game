import {
  applyMoves,
  faceColors,
  isSolved,
  parseMoves,
  randomCubeState,
} from "@game/cube-engine";
import { describe, expect, test } from "vitest";
import { wingDepths, wingParity } from "./geometry";
import { solveReductionState } from "./solve";
import { after, checkStages } from "./test-util";

/**
 * 7×7: 날개 묶음이 둘이라 묶음마다 홀짝을 따로 고친다. 씨앗 5는 맞은편 면끼리 바뀐 가운데 조각이 남아
 * 옆면으로 옮겨 두는 걸음을 쓴다. 한 판에 1초 남짓이라 씨앗은 하나만 둔다(씨앗 1~12는 손으로 돌려 보았다).
 */
const n = 7;

describe("7×7 무작위 상태", () => {
  const state = randomCubeState(n, 5);
  const sol = solveReductionState(n, state);

  test("풀리고, 단계가 끝날 때마다 그 단계의 조각이 맞아 있다", () => {
    expect(isSolved(n, applyMoves(n, state, parseMoves(n, sol.moves)))).toBe(
      true,
    );
    expect(sol.stages.map((s) => s.id)).toEqual([
      "centers-ud",
      "centers-rest",
      "edges",
      "last-edges",
      "three",
    ]);
    checkStages(n, state, sol);
  });

  test("짝을 다 지은 뒤에는 날개 묶음마다 홀짝이 짝이다", () => {
    const end = sol.stages.find((s) => s.id === "last-edges")?.to as number;
    const colors = faceColors(n, after(n, state, sol, end));
    expect(wingDepths(n)).toEqual([1, 2]);
    for (const d of wingDepths(n)) expect(wingParity(n, colors, d)).toBe(0);
  });
});
