import {
  type Axis,
  type CubeMove,
  FACE_NORMAL,
  FACES,
  type Face,
  type Normal,
  type Sticker,
} from "./types";

/**
 * 큐브 좌표 계산(three.js 없이). 3D 장면과 시험이 함께 쓴다.
 */

export type Vec3 = readonly [number, number, number];

const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

/** 층 번호(+ 끝에서 1부터)의 좌표 */
export function coordOfLayer(n: number, layer: number): number {
  return (n + 1) / 2 - layer;
}

/** 좌표의 층 번호(+ 끝에서 1부터) */
export function layerOfCoord(n: number, c: number): number {
  return Math.round((n + 1) / 2 - c);
}

/** 겉에 보이는 조각의 중심 모두(n=1이면 하나) */
export function cubiePositions(n: number): Vec3[] {
  const out: Vec3[] = [];
  const h = (n - 1) / 2;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      for (let k = 0; k < n; k++) {
        const p: Vec3 = [i - h, j - h, k - h];
        if (p.some((v) => Math.abs(v) === h)) out.push(p);
      }
  return out;
}

/** 조각이 이 수에 함께 도는지 */
export function inMove(n: number, move: CubeMove, pos: Vec3): boolean {
  const layer = layerOfCoord(n, pos[AXIS_INDEX[move.axis]]);
  return layer >= move.from && layer <= move.to;
}

/**
 * 회전 각(라디안, 오른손 법칙). turns=1은 + 끝에서 봐서 시계 방향이라 -90°.
 * turns=3은 짧은 쪽(+90°)으로 돈다.
 */
export function moveAngle(move: CubeMove): number {
  if (move.turns === 1) return -Math.PI / 2;
  if (move.turns === 2) return -Math.PI;
  return Math.PI / 2;
}

/** 점을 축으로 -90°×turns 돌린다(정수 격자 그대로) */
export function rotateVec(v: Vec3, axis: Axis, turns: 1 | 2 | 3): Vec3 {
  let [x, y, z] = v;
  for (let t = 0; t < turns; t++) {
    if (axis === "x") [y, z] = [z, -y];
    else if (axis === "y") [x, z] = [-z, x];
    else [x, y] = [y, -x];
  }
  return [x + 0, y + 0, z + 0];
}

export function normalVec(normal: Normal): Vec3 {
  const s = normal[0] === "+" ? 1 : -1;
  const a = AXIS_INDEX[normal[1] as Axis];
  return [a === 0 ? s : 0, a === 1 ? s : 0, a === 2 ? s : 0];
}

export function normalOf(v: Vec3): Normal {
  const a = v.findIndex((c) => Math.abs(c) > 0.5);
  const axis = (["x", "y", "z"] as const)[a] ?? "x";
  return `${(v[a] ?? 1) > 0 ? "+" : "-"}${axis}` as Normal;
}

/**
 * 면을 밖에서 볼 때 읽는 차례의 오른쪽·아래 방향(펼친 그림 기준).
 * U는 B가 위, D는 F가 위, 옆면(F R B L)은 U가 위.
 * 엔진과 맞출 것.
 */
const FACE_AXES: Record<Face, { right: Vec3; down: Vec3 }> = {
  U: { right: [1, 0, 0], down: [0, 0, 1] },
  D: { right: [1, 0, 0], down: [0, 0, -1] },
  F: { right: [1, 0, 0], down: [0, -1, 0] },
  B: { right: [-1, 0, 0], down: [0, -1, 0] },
  R: { right: [0, 0, -1], down: [0, -1, 0] },
  L: { right: [0, 0, 1], down: [0, -1, 0] },
};

/**
 * 면 번호 배열로 스티커를 만든다. `faces[f]`는 면 f(FACES 차례)의 n×n 칸을 밖에서 보고
 * 위 줄부터 왼쪽→오른쪽으로 읽은 색 번호(null = 가림).
 */
export function stickersFromFaces(
  n: number,
  faces: readonly (readonly (number | null)[])[],
): Sticker[] {
  const h = (n - 1) / 2;
  const out: Sticker[] = [];
  FACES.forEach((face, f) => {
    const nv = normalVec(FACE_NORMAL[face]);
    const { right, down } = FACE_AXES[face];
    for (let row = 0; row < n; row++)
      for (let col = 0; col < n; col++) {
        const c = (i: 0 | 1 | 2) =>
          nv[i] * h + right[i] * (col - h) + down[i] * (row - h) + 0;
        out.push({
          center: [c(0), c(1), c(2)],
          normal: FACE_NORMAL[face],
          color: faces[f]?.[row * n + col] ?? null,
        });
      }
  });
  return out;
}

/** 맞춘 상태의 스티커 */
export function solvedStickers(n: number): Sticker[] {
  return stickersFromFaces(
    n,
    FACES.map((_, f) => new Array<number>(n * n).fill(f)),
  );
}

/**
 * 스티커 목록에 수 하나를 적용한다(그리기 없이 상태만 따라갈 때, 시험에서 장면 계산을 맞춰 볼 때).
 */
export function applyMoveToStickers(
  n: number,
  stickers: readonly Sticker[],
  move: CubeMove,
): Sticker[] {
  return stickers.map((s) => {
    if (!inMove(n, move, s.center)) return s;
    return {
      center: rotateVec(s.center, move.axis, move.turns),
      normal: normalOf(rotateVec(normalVec(s.normal), move.axis, move.turns)),
      color: s.color,
    };
  });
}
