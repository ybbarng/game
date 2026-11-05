import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

/**
 * 섞인 모습 계산(타이머 그림, 비스듬한 큐브 그림 둘). 엔진의 스티커 번호는 면 × n² + 줄 × n + 칸(면을 바깥에서 볼 때
 * 왼쪽 위가 0)이다.
 */

/** 공식을 맞춘 큐브(흰 위·초록 앞)에 적용한 상태. 공식을 읽지 못하면 오류를 던진다 */
export function scrambledState(n: number, scramble: string): PuzzleState {
  return applyMoves(n, solvedCube(n), parseMoves(n, scramble));
}

/**
 * 비스듬한 그림(위·앞·오른쪽만 보인다)으로 뒤쪽 세 면을 보이려고 큐브를 돌려 쥐는 수.
 * x2 y' 뒤에는 위에 원래 아래(D), 앞에 원래 왼쪽(L), 오른쪽에 원래 뒤(B)가 온다(뒤-아래-왼쪽 꼭짓점이 앞으로).
 */
export const BACK_TURN = "x2 y'";

/** 뒤쪽 세 면(D·L·B)이 위·앞·오른쪽에 오게 돌려 쥔 상태 */
export function backSideState(n: number, state: PuzzleState): PuzzleState {
  return applyMoves(n, state, parseMoves(n, BACK_TURN));
}
