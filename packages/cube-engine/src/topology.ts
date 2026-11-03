import type {
  FaceDef,
  PieceGeometry,
  StickerGeometry,
  Vec3,
} from "@game/puzzle-core";

/**
 * n×n 큐브의 생김새: 스티커 자리, 조각, 좌표.
 *
 * - 면 번호는 U R F D L B 차례(0~5). 스티커 자리 번호 = 면 × n² + 줄 × n +칸.
 *   면마다 그 면을 바깥에서 바라볼 때 왼쪽 위가 0번이다(U는 F가 아래쪽에, D는 F가 위쪽에 오게 본다).
 * - 좌표: x 오른쪽(R), y 위(U), z 앞(F). 큐브 가운데가 원점, 조각 사이 간격은 1
 *   (n이 홀수면 0, ±1, …, 짝수면 ±0.5, ±1.5, …). 스티커 중심 = 조각 중심 + 바라보는 방향 × 0.5(조각 표면).
 * - 층 번호: 축(x·y·z)을 따라 + 쪽(R·U·F) 바깥층이 1, 반대쪽 바깥층이 n.
 */

export const FACE_NAMES = ["U", "R", "F", "D", "L", "B"] as const;
export type FaceName = (typeof FACE_NAMES)[number];

export const U = 0;
export const R = 1;
export const F = 2;
export const D = 3;
export const L = 4;
export const B = 5;

/** 맞은편 면 */
export const OPPOSITE_FACE = [D, L, B, U, R, F] as const;

export const FACE_NORMALS: readonly Vec3[] = [
  [0, 1, 0],
  [1, 0, 0],
  [0, 0, 1],
  [0, -1, 0],
  [-1, 0, 0],
  [0, 0, -1],
];

/** 자리마다 기준 "위" 방향(펼친 그림에서 줄 번호가 줄어드는 쪽) */
const FACE_UPS: readonly Vec3[] = [
  [0, 0, -1],
  [0, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [0, 1, 0],
  [0, 1, 0],
];

/**
 * 기본 색표(대회 표준: 위 흰색·앞 초록·오른쪽 빨강, 맞은편 노랑·파랑·주황).
 * 엔진은 면 번호로만 다루고, 화면이 이 표(또는 사용자 설정)로 칠한다.
 */
export const DEFAULT_FACE_COLORS: readonly string[] = [
  "#ffffff", // U 흰색
  "#c41e3a", // R 빨강
  "#009e60", // F 초록
  "#ffd500", // D 노랑
  "#ff5800", // L 주황
  "#0051ba", // B 파랑
];

export const FACE_DEFS: readonly FaceDef[] = FACE_NAMES.map((name, id) => ({
  id,
  name,
  normal: FACE_NORMALS[id] as Vec3,
}));

export const MIN_SIZE = 2;
export const MAX_SIZE = 7;

/**
 * 조각 종류.
 * - corner: 꼭짓점, edge: 홀수 크기의 가운데 모서리, wing: 4×4 이상의 날개 모서리
 * - center: 홀수 크기의 면 정가운데(움직이지 않는 가운데), innerCenter: 4×4 이상의 나머지 가운데 조각
 */
export type PieceKind = "corner" | "edge" | "wing" | "center" | "innerCenter";

export interface CubePiece extends PieceGeometry {
  readonly kind: PieceKind;
  /** 같은 궤도(수로 서로 자리를 바꿀 수 있는 조각 묶음) 번호 */
  readonly orbit: number;
}

export interface CubeSticker extends StickerGeometry {
  readonly row: number;
  readonly col: number;
}

export interface CubeOrbit {
  readonly kind: PieceKind;
  readonly pieces: readonly number[];
}

export interface CubeTopology {
  readonly n: number;
  readonly stickerCount: number;
  readonly stickers: readonly CubeSticker[];
  readonly pieces: readonly CubePiece[];
  readonly orbits: readonly CubeOrbit[];
  /** 좌표와 면으로 스티커 자리 찾기. 없으면 -1 */
  stickerAt(position: Vec3, face: number): number;
  /** 좌표로 조각 자리 찾기. 없으면 -1 */
  pieceAt(position: Vec3): number;
}

// ---------- 정수 회전 ----------

/** 3×3 정수 회전 행렬(행 우선 9칸) */
export type Rot = readonly number[];

export function rotate(m: Rot, v: Vec3): Vec3 {
  return [
    (m[0] as number) * v[0] + (m[1] as number) * v[1] + (m[2] as number) * v[2],
    (m[3] as number) * v[0] + (m[4] as number) * v[1] + (m[5] as number) * v[2],
    (m[6] as number) * v[0] + (m[7] as number) * v[1] + (m[8] as number) * v[2],
  ];
}

function mulRot(a: Rot, b: Rot): Rot {
  // a 다음 b: v → b(a(v)) 의 행렬 = b·a
  const out: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let k = 0; k < 3; k++)
        s += (b[r * 3 + k] as number) * (a[k * 3 + c] as number);
      out.push(s);
    }
  }
  return out;
}

export const ROT_IDENTITY: Rot = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** 축의 + 쪽에서 볼 때 시계 방향 90°(R·U·F와 같은 방향) */
export const QUARTER_TURNS: Readonly<Record<"x" | "y" | "z", Rot>> = {
  // (x, y, z) → (x, z, -y)
  x: [1, 0, 0, 0, 0, 1, 0, -1, 0],
  // (x, y, z) → (-z, y, x)
  y: [0, 0, -1, 0, 1, 0, 1, 0, 0],
  // (x, y, z) → (y, -x, z)
  z: [0, 1, 0, -1, 0, 0, 0, 0, 1],
};

export function rotPower(m: Rot, times: number): Rot {
  let out = ROT_IDENTITY;
  for (let i = 0; i < times; i++) out = mulRot(out, m);
  return out;
}

function rotKey(m: Rot): string {
  return m.join(",");
}

/** 큐브 전체를 돌리는 24가지 회전(첫째는 그대로) */
export const CUBE_ROTATIONS: readonly Rot[] = (() => {
  const out: Rot[] = [ROT_IDENTITY];
  const seen = new Set([rotKey(ROT_IDENTITY)]);
  for (let i = 0; i < out.length; i++) {
    for (const g of [QUARTER_TURNS.x, QUARTER_TURNS.y]) {
      const next = mulRot(out[i] as Rot, g);
      const k = rotKey(next);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(next);
      }
    }
  }
  return out;
})();

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function vecEqual(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/**
 * 자리 기준 위 방향 `up`을 면 방향 `normal` 둘레로 몇 번 돌려야 `v`가 되나(0~3).
 * 한 번 = 바깥에서 볼 때 시계 반대 방향 90°.
 */
export function quarterTurnsBetween(up: Vec3, normal: Vec3, v: Vec3): number {
  let t = up;
  for (let k = 0; k < 4; k++) {
    if (vecEqual(t, v)) return k;
    t = cross(normal, t);
  }
  throw new Error("면 위의 방향이 아니다");
}

export function faceOfNormal(v: Vec3): number {
  for (let f = 0; f < 6; f++)
    if (vecEqual(FACE_NORMALS[f] as Vec3, v)) return f;
  throw new Error("면 방향이 아니다");
}

// ---------- 생김새 만들기 ----------

/** 면 f의 줄 r·칸 c 스티커가 붙은 조각의 중심 좌표 */
function piecePosition(n: number, f: number, r: number, c: number): Vec3 {
  // -0 이 섞이지 않게 + 0 으로 맞춘다
  const co = (i: number) => i - (n - 1) / 2 + 0;
  const m = (n - 1) / 2;
  switch (f) {
    case U:
      return [co(c), m, co(r)];
    case R:
      return [m, -co(r) + 0, -co(c) + 0];
    case F:
      return [co(c), -co(r) + 0, m];
    case D:
      return [co(c), -m, -co(r) + 0];
    case L:
      return [-m, -co(r) + 0, co(c)];
    default:
      return [-co(c) + 0, -co(r) + 0, -m];
  }
}

const cache = new Map<number, CubeTopology>();

export function assertSize(n: number): void {
  if (!Number.isInteger(n) || n < MIN_SIZE || n > MAX_SIZE) {
    throw new RangeError(`큐브 크기는 ${MIN_SIZE}~${MAX_SIZE}: ${n}`);
  }
}

export function cubeTopology(n: number): CubeTopology {
  assertSize(n);
  const hit = cache.get(n);
  if (hit) return hit;

  const span = 2 * n + 1;
  // 좌표는 0.5 단위라 두 배 해서 정수로 찾는다
  const posKey = (p: Vec3) =>
    ((2 * p[0] + n) * span + (2 * p[1] + n)) * span + (2 * p[2] + n);

  const pieceIndex = new Map<number, number>();
  const pieceStickers: number[][] = [];
  const piecePositions: Vec3[] = [];
  const stickerIndex = new Map<number, number>();
  const stickers: CubeSticker[] = [];

  for (let f = 0; f < 6; f++) {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const pos = piecePosition(n, f, r, c);
        const pk = posKey(pos);
        let piece = pieceIndex.get(pk);
        if (piece === undefined) {
          piece = piecePositions.length;
          pieceIndex.set(pk, piece);
          piecePositions.push(pos);
          pieceStickers.push([]);
        }
        const id = stickers.length;
        (pieceStickers[piece] as number[]).push(id);
        stickerIndex.set(pk * 6 + f, id);
        const normal = FACE_NORMALS[f] as Vec3;
        stickers.push({
          piece,
          face: f,
          row: r,
          col: c,
          position: [
            pos[0] + normal[0] / 2,
            pos[1] + normal[1] / 2,
            pos[2] + normal[2] / 2,
          ],
          normal,
          up: FACE_UPS[f] as Vec3,
        });
      }
    }
  }

  const pieceAt = (p: Vec3) => pieceIndex.get(posKey(p)) ?? -1;
  const stickerAt = (p: Vec3, face: number) =>
    stickerIndex.get(posKey(p) * 6 + face) ?? -1;

  // 궤도: 큐브 전체 돌리기 24가지로 서로 옮겨 가는 조각 묶음
  const orbitOf = new Array<number>(piecePositions.length).fill(-1);
  const orbits: { kind: PieceKind; pieces: number[] }[] = [];
  const kindOf = (piece: number): PieceKind => {
    const count = (pieceStickers[piece] as number[]).length;
    if (count === 3) return "corner";
    const p = piecePositions[piece] as Vec3;
    const zeros = p.filter((v) => v === 0).length;
    if (count === 2) return zeros === 1 ? "edge" : "wing";
    return zeros === 2 ? "center" : "innerCenter";
  };
  for (let i = 0; i < piecePositions.length; i++) {
    if (orbitOf[i] !== -1) continue;
    const id = orbits.length;
    const members = new Set<number>();
    for (const g of CUBE_ROTATIONS) {
      members.add(pieceAt(rotate(g, piecePositions[i] as Vec3)));
    }
    const list = [...members].sort((a, b) => a - b);
    for (const m of list) orbitOf[m] = id;
    orbits.push({ kind: kindOf(i), pieces: list });
  }

  const pieces: CubePiece[] = piecePositions.map((position, i) => ({
    position,
    stickers: pieceStickers[i] as number[],
    kind: kindOf(i),
    orbit: orbitOf[i] as number,
  }));

  const topo: CubeTopology = {
    n,
    stickerCount: 6 * n * n,
    stickers,
    pieces,
    orbits,
    stickerAt,
    pieceAt,
  };
  cache.set(n, topo);
  return topo;
}

/** 3D 화면이 스티커 하나를 그리는 데 쓰는 정보 */
export interface StickerDrawInfo {
  /** 스티커 자리 번호(= 맞춘 상태에서 그 자리에 있는 스티커 번호) */
  readonly index: number;
  /** 면 번호(U R F D L B = 0~5) */
  readonly face: number;
  readonly row: number;
  readonly col: number;
  /** 조각 자리 번호 */
  readonly piece: number;
  /** 조각 중심(큐브 가운데가 원점, 간격 1) */
  readonly center: Vec3;
  /** 스티커 중심(조각 중심 + 법선 × 0.5) */
  readonly position: Vec3;
  /** 법선 축과 부호(예: R 면은 x, +1) */
  readonly axis: "x" | "y" | "z";
  readonly sign: 1 | -1;
  readonly normal: Vec3;
  /** 자리 기준 위 방향(twist 0일 때 스티커의 위) */
  readonly up: Vec3;
}

const drawCache = new Map<number, readonly StickerDrawInfo[]>();

/** 스티커 자리마다 3D 정보. 화면은 이것과 상태의 `perm`(색)·`twist`(방향)만으로 그린다 */
export function stickerGeometry(n: number): readonly StickerDrawInfo[] {
  const hit = drawCache.get(n);
  if (hit) return hit;
  const topo = cubeTopology(n);
  const out = topo.stickers.map((s, index): StickerDrawInfo => {
    const ai = s.normal[0] !== 0 ? 0 : s.normal[1] !== 0 ? 1 : 2;
    return {
      index,
      face: s.face,
      row: s.row,
      col: s.col,
      piece: s.piece,
      center: topo.pieces[s.piece]?.position as Vec3,
      position: s.position,
      axis: (["x", "y", "z"] as const)[ai],
      sign: (s.normal[ai] as number) > 0 ? 1 : -1,
      normal: s.normal,
      up: s.up,
    };
  });
  drawCache.set(n, out);
  return out;
}

/** 조각 좌표의 축 값 → 층 번호(1 = + 쪽 바깥층) */
export function layerOf(n: number, coord: number): number {
  return (n - 1) / 2 - coord + 1;
}
