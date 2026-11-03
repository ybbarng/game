/** 대회 섞기 시험에서만 쓰는 도구 */
import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import { scramble } from "@game/cube-scramble";
import type { PuzzleState } from "@game/puzzle-core";
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

/**
 * 고수 사람 흉내와 축소법 해(초고수)가 그 상태를 엔진에서 맞춘다. 둘은 같은 축소법 결과를
 * 쓰므로(big.ts가 최근 상태를 기억한다) 축소법은 한 번만 돈다. 5×5는 한 번에 수백 ms라
 * 두 번 돌리면 파일 하나가 2초에 바투 붙는다.
 */
export function checkScramble(event: "444" | "555", seed: number): void {
  const n = event === "444" ? 4 : 5;
  const start = scrambledState(event, seed);
  checkSolve(n, start, solveHuman("advanced", n, start));
  checkSolve(n, start, solveHuman("expert", n, start));
}
