/** 대회 섞기 시험에서만 쓰는 도구 */
import {
  applyMoves,
  isSolved,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import { solveReductionState } from "@game/cube-reduction";
import { scramble } from "@game/cube-scramble";
import type { PuzzleState } from "@game/puzzle-core";
import { expect } from "vitest";
import { checkSolve } from "./big-test-util";
import { solveHuman } from "./methods";

/** 대회 규칙 섞기(cube-scramble)를 엔진에 두어 만든 상태 */
export function scrambledState(
  event: "444" | "555",
  seed: number,
): PuzzleState {
  const n = event === "444" ? 4 : 5;
  return applyMoves(
    n,
    solvedCube(n),
    parseMoves(n, scramble(event, seed).text),
  );
}

/** 고수 사람 흉내와 축소법 해가 그 상태를 엔진에서 맞춘다 */
export function checkScramble(event: "444" | "555", seed: number): void {
  const n = event === "444" ? 4 : 5;
  const start = scrambledState(event, seed);
  checkSolve(n, start, solveHuman("advanced", n, start));
  const red = solveReductionState(n, start);
  const end = applyMoves(n, start, parseMoves(n, red.moves));
  expect(isSolved(n, end)).toBe(true);
}
