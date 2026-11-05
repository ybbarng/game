import {
  applyMoves,
  faceColors,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

/**
 * 섞인 모습을 펼친 그림(십자 모양): 위에 U, 가운데 줄에 L F R B, 아래에 D.
 * 엔진의 스티커 번호(면 × n² + 줄 × n + 칸, 면을 바깥에서 볼 때 왼쪽 위가 0, U는 F가 아래·D는 F가 위)가
 * 이 펼친 그림의 방향과 같아 그대로 놓으면 된다.
 */

/** 펼친 그림에서 면이 놓이는 칸(면 크기 단위). 면 번호 차례 U R F D L B */
export const NET_SLOTS: readonly (readonly [number, number])[] = [
  [1, 0], // U
  [2, 1], // R
  [1, 1], // F
  [1, 2], // D
  [0, 1], // L
  [3, 1], // B
];

export interface NetSticker {
  /** 면 단위가 아니라 스티커 단위 좌표(왼쪽 위 0) */
  readonly x: number;
  readonly y: number;
  /** 보이는 색(면 번호 0~5) */
  readonly color: number;
}

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

/** 공식을 맞춘 큐브에 적용한 모습. 공식을 읽지 못하면 오류를 던진다 */
export function scrambledNet(n: number, scramble: string): NetSticker[] {
  const state = scrambledState(n, scramble);
  const colors = faceColors(n, state);
  const out: NetSticker[] = [];
  for (let face = 0; face < 6; face++) {
    const [sx, sy] = NET_SLOTS[face] as readonly [number, number];
    for (let row = 0; row < n; row++)
      for (let col = 0; col < n; col++)
        out.push({
          x: sx * n + col,
          y: sy * n + row,
          color: colors[face * n * n + row * n + col] as number,
        });
  }
  return out;
}
