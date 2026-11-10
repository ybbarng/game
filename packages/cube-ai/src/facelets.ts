import {
  applyMoves,
  type CubeMove,
  faceColors,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import {
  FACES,
  type Face,
  type FaceletMove,
  movePermutation,
} from "@game/cube-solver";
import type { PuzzleState } from "@game/puzzle-core";

/**
 * 엔진 상태 ↔ 해법기 스티커 문자열 잇기.
 *
 * 두 패키지의 스티커 순서는 같다: 면 U R F D L B 차례, 면마다 바깥에서 볼 때 위 줄 왼쪽부터
 * (U는 F가 아래, D는 F가 위에 오게 본다). 그래서 자리 번호는 그대로 두고 색(면 번호)만
 * 글자로 바꾸면 된다. 같은지는 시험(`facelets.test.ts`)이 수를 두 쪽에 똑같이 두어 확인한다.
 */

/**
 * 엔진 상태 → Kociemba 순서 스티커 문자열. 글자는 그 스티커 색이 맞춘 상태에서 있던 면 이름.
 * `colorMap`을 주면 색 c를 `FACES[colorMap[c]]` 글자로 읽는다(`firstFaceMap`: 다른 색을 흰색처럼 보고 풀기)
 */
export function toFacelets(
  n: number,
  state: PuzzleState,
  colorMap?: readonly number[],
): string {
  let s = "";
  for (const c of faceColors(n, state))
    s += FACES[colorMap ? (colorMap[c] as number) : c];
  return s;
}

/** 큐브 돌리기 한 번 안쪽으로 각 면을 위로 드는 표기(흰 면 위 맞춘 큐브 기준) */
const LIFT = ["", "z'", "x", "x2", "z", "x'"];

/**
 * 첫 면 색 고르기(사람 해법은 늘 「흰」 글자 면부터 맞춘다). 색 `first`(0 흰 · 1 빨강 · 2 초록 · 3 노랑 · 4 주황 ·
 * 5 파랑)를 흰 글자로 읽게 하는 색 → 글자 번호 표. 맞춘 큐브를 돌려 `first`가 위로 오는 방향에서 면마다 보이는 색을
 * 그 면 글자로 읽는다(큐브 돌리기 하나와 같은 바꿈이라 조각의 색 차례가 그대로다). 흰색이면 그대로(0~5)
 */
export function firstFaceMap(first: number): number[] {
  const solved = solvedCube(3);
  const rot = LIFT[first] as string;
  const s = rot ? applyMoves(3, solved, parseMoves(3, rot)) : solved;
  const colors = faceColors(3, s);
  const map = new Array<number>(6).fill(0);
  for (let k = 0; k < 6; k++) map[colors[k * 9 + 4] as number] = k;
  if (map[first] !== 0)
    throw new Error(`첫 면 색을 위로 들지 못했다: ${first}`);
  return map;
}

const AXIS_FACE: Readonly<Record<CubeMove["axis"], Face>> = {
  x: "R",
  y: "U",
  z: "F",
};

/**
 * 엔진의 수 → 해법기 스티커 시뮬레이터의 수. 둘 다 "+ 쪽(R·U·F) 바깥층이 1층,
 * + 쪽에서 볼 때 시계 방향"이라 축 이름만 면 이름으로 바꾼다.
 */
export function toFaceletMove(m: CubeMove): FaceletMove {
  return { face: AXIS_FACE[m.axis], from: m.from, to: m.to, turns: m.turns };
}

/** 스티커 글자 배열에 수 하나를 둔다(새 배열) */
export function applyToFacelets(
  n: number,
  f: readonly string[],
  m: CubeMove,
): string[] {
  const dest = movePermutation(n, toFaceletMove(m));
  const out = new Array<string>(f.length);
  for (let i = 0; i < f.length; i++) out[dest[i] as number] = f[i] as string;
  return out;
}

/** 맞은편 면 글자 */
export const OPPOSITE: Readonly<Record<Face, Face>> = {
  U: "D",
  D: "U",
  R: "L",
  L: "R",
  F: "B",
  B: "F",
};
