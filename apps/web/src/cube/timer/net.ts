import {
  applyMoves,
  faceColors,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";

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

/** 공식을 맞춘 큐브에 적용한 모습. 공식을 읽지 못하면 오류를 던진다 */
export function scrambledNet(n: number, scramble: string): NetSticker[] {
  const state = applyMoves(n, solvedCube(n), parseMoves(n, scramble));
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
