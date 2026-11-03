import {
  applyTable,
  type MoveGeometry,
  type MoveTable,
  type PuzzleState,
  type Vec3,
} from "@game/puzzle-core";
import {
  cubeTopology,
  faceOfNormal,
  layerOf,
  QUARTER_TURNS,
  quarterTurnsBetween,
  type Rot,
  rotate,
  rotPower,
} from "./topology";

export type Axis = "x" | "y" | "z";
export const AXES: readonly Axis[] = ["x", "y", "z"];

/**
 * n×n 큐브의 수 하나(docs/47 2-2).
 * 축을 따라 `from`~`to`층(1 = R·U·F 쪽 바깥층)을, 그 축의 + 쪽에서 볼 때 시계 방향으로 90° × `turns`.
 * 예(3×3): R = {x,1,1,1}, L = {x,3,3,3}, M = {x,2,2,3}, x = {x,1,3,1}, Rw = {x,1,2,1}.
 */
export interface CubeMove {
  readonly axis: Axis;
  readonly from: number;
  readonly to: number;
  readonly turns: 1 | 2 | 3;
}

const AXIS_INDEX: Readonly<Record<Axis, 0 | 1 | 2>> = { x: 0, y: 1, z: 2 };
const AXIS_VECTOR: Readonly<Record<Axis, Vec3>> = {
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
};

export function isValidMove(n: number, m: CubeMove): boolean {
  return (
    AXES.includes(m.axis) &&
    Number.isInteger(m.from) &&
    Number.isInteger(m.to) &&
    m.from >= 1 &&
    m.from <= m.to &&
    m.to <= n &&
    (m.turns === 1 || m.turns === 2 || m.turns === 3)
  );
}

function assertMove(n: number, m: CubeMove): void {
  if (!isValidMove(n, m)) {
    throw new RangeError(`${n}×${n}에 둘 수 없는 수: ${JSON.stringify(m)}`);
  }
}

/** 큐브 전체를 돌리는 수(x·y·z)인가 */
export function isRotation(n: number, m: CubeMove): boolean {
  return m.from === 1 && m.to === n;
}

const tableCache = new Map<string, MoveTable>();

/** 수 하나의 스티커 순열 표(크기·수마다 한 번 만들어 둔다) */
export function moveTable(n: number, m: CubeMove): MoveTable {
  const key = `${n}:${m.axis}:${m.from}:${m.to}:${m.turns}`;
  const hit = tableCache.get(key);
  if (hit) return hit;
  assertMove(n, m);
  const topo = cubeTopology(n);
  const rot: Rot = rotPower(QUARTER_TURNS[m.axis], m.turns);
  const ai = AXIS_INDEX[m.axis];
  const size = topo.stickerCount;
  const dest = new Uint16Array(size);
  const twistDelta = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const s = topo.stickers[i];
    if (!s) continue;
    const piece = topo.pieces[s.piece];
    if (!piece) continue;
    const layer = layerOf(n, piece.position[ai]);
    if (layer < m.from || layer > m.to) {
      dest[i] = i;
      continue;
    }
    const pos = rotate(rot, piece.position);
    const normal = rotate(rot, s.normal);
    const face = faceOfNormal(normal);
    const j = topo.stickerAt(pos, face);
    const target = topo.stickers[j];
    if (!target) throw new Error("스티커 자리를 찾지 못했다");
    dest[i] = j;
    twistDelta[i] = quarterTurnsBetween(
      target.up,
      target.normal,
      rotate(rot, s.up),
    );
  }
  const table: MoveTable = { dest, twistDelta, twistMod: 4 };
  tableCache.set(key, table);
  return table;
}

export function applyMove(
  n: number,
  state: PuzzleState,
  move: CubeMove,
): PuzzleState {
  return applyTable(state, moveTable(n, move));
}

export function applyMoves(
  n: number,
  state: PuzzleState,
  moves: readonly CubeMove[],
): PuzzleState {
  let s = state;
  for (const m of moves) s = applyMove(n, s, m);
  return s;
}

export function invertMove(m: CubeMove): CubeMove {
  return { ...m, turns: (4 - m.turns) as 1 | 2 | 3 };
}

/** 되돌리는 수열(차례를 뒤집고 방향을 반대로) */
export function invertMoves(moves: readonly CubeMove[]): CubeMove[] {
  return moves.toReversed().map(invertMove);
}

/** 화면이 회전을 그릴 정보: 축·각도·움직이는 조각 */
export function moveGeometry(n: number, m: CubeMove): MoveGeometry {
  assertMove(n, m);
  const topo = cubeTopology(n);
  const ai = AXIS_INDEX[m.axis];
  const pieces: number[] = [];
  topo.pieces.forEach((p, i) => {
    const layer = layerOf(n, p.position[ai]);
    if (layer >= m.from && layer <= m.to) pieces.push(i);
  });
  // 시계 방향(+ 쪽에서 볼 때) = 오른손 법칙으로 음의 각도. 반 바퀴는 -π로 둔다.
  const angle = -(Math.PI / 2) * (m.turns === 3 ? -1 : m.turns);
  return { axis: AXIS_VECTOR[m.axis], angle, pieces };
}
