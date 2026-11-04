// 공식 바꾸기(대칭·거꾸로·돌려 쥐기·윗면 돌리기 붙이기·수 세기). 엔진 수(CubeMove)로 바꿔 계산하고 WCA 표기로 돌려준다.
// 넓게(Rw·r)·가운데(M E S)·큐브 돌리기(x y z)·안쪽 층(2R)도 같은 식으로 다룬다: 수 하나를 "축·층 범위·돌린 양"으로 보고,
// 공간을 뒤집거나 돌리는 3×3 행렬로 축과 방향을 옮긴다.
import {
  type Axis,
  type CubeMove,
  formatMoves,
  invertMoves,
  isRotation,
  parseMoves,
} from "@game/cube-engine";

type Vec = readonly [number, number, number];
/** 행 단위 3×3 정수 행렬(각 행·열에 ±1이 하나) */
type Mat = readonly [Vec, Vec, Vec];

const AXIS_INDEX: Readonly<Record<Axis, 0 | 1 | 2>> = { x: 0, y: 1, z: 2 };
const AXES: readonly Axis[] = ["x", "y", "z"];

const IDENTITY: Mat = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

function mul(a: Mat, b: Mat): Mat {
  const row = (r: Vec): Vec => [
    r[0] * b[0][0] + r[1] * b[1][0] + r[2] * b[2][0],
    r[0] * b[0][1] + r[1] * b[1][1] + r[2] * b[2][1],
    r[0] * b[0][2] + r[1] * b[1][2] + r[2] * b[2][2],
  ];
  return [row(a[0]), row(a[1]), row(a[2])];
}

function det(m: Mat): number {
  const [a, b, c] = m;
  return (
    a[0] * (b[1] * c[2] - b[2] * c[1]) -
    a[1] * (b[0] * c[2] - b[2] * c[0]) +
    a[2] * (b[0] * c[1] - b[1] * c[0])
  );
}

/** + 축 둘레로 +90°(오른손 법칙) × k */
function quarter(axis: Axis, k: number): Mat {
  const t = ((k % 4) + 4) % 4;
  let m: Mat = IDENTITY;
  const one: Record<Axis, Mat> = {
    x: [
      [1, 0, 0],
      [0, 0, -1],
      [0, 1, 0],
    ],
    y: [
      [0, 0, 1],
      [0, 1, 0],
      [-1, 0, 0],
    ],
    z: [
      [0, -1, 0],
      [1, 0, 0],
      [0, 0, 1],
    ],
  };
  for (let i = 0; i < t; i++) m = mul(one[axis], m);
  return m;
}

/**
 * 수 하나를 공간 변환 m(회전 또는 거울)으로 옮긴다.
 * 축 a의 수는 m·e_a = s·e_b 이면 축 b로 가고, s가 음수면 층 차례가 뒤집힌다.
 * 회전 방향은 축이 뒤집히거나(s < 0) 거울이면(det < 0) 반대가 된다(둘 다면 그대로).
 */
function transformMove(n: number, mv: CubeMove, m: Mat): CubeMove {
  const ai = AXIS_INDEX[mv.axis];
  const col = [m[0][ai], m[1][ai], m[2][ai]];
  const bi = col.findIndex((v) => v !== 0);
  const s = col[bi] as number;
  const axis = AXES[bi] as Axis;
  const [from, to] =
    s > 0 ? [mv.from, mv.to] : [n + 1 - mv.to, n + 1 - mv.from];
  const keep = s * det(m) > 0;
  const turns = keep ? mv.turns : ((4 - mv.turns) as 1 | 2 | 3);
  return { axis, from, to, turns };
}

/** 같은 층을 잇달아 돌린 수를 합치고, 합쳐 제자리가 되면 지운다 */
export function simplifyMoves(moves: readonly CubeMove[]): CubeMove[] {
  const out: CubeMove[] = [];
  for (const m of moves) {
    const last = out.at(-1);
    if (
      last &&
      last.axis === m.axis &&
      last.from === m.from &&
      last.to === m.to
    ) {
      const t = (last.turns + m.turns) % 4;
      out.pop();
      if (t !== 0) out.push({ ...m, turns: t as 1 | 2 | 3 });
    } else out.push(m);
  }
  return out;
}

const fmt = (n: number, moves: readonly CubeMove[]) =>
  formatMoves(n, simplifyMoves(moves));

export type MirrorPlane = "M" | "S" | "E";

const MIRROR: Readonly<Record<MirrorPlane, Mat>> = {
  // 좌우(R↔L), 앞뒤(F↔B), 위아래(U↔D)
  M: [
    [-1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  S: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, -1],
  ],
  E: [
    [1, 0, 0],
    [0, -1, 0],
    [0, 0, 1],
  ],
};

/** 거울 공식. M = 좌우(R U R' → L' U' L), S = 앞뒤, E = 위아래. 거울 상황을 푼다 */
export function mirrorAlg(n: number, alg: string, plane: MirrorPlane): string {
  return fmt(
    n,
    parseMoves(n, alg).map((m) => transformMove(n, m, MIRROR[plane])),
  );
}

/** 거꾸로(되돌리는 공식). 맞춘 큐브에 하면 그 공식이 푸는 상황이 된다 */
export function inverseAlg(n: number, alg: string): string {
  return fmt(n, invertMoves(parseMoves(n, alg)));
}

/** 큐브 돌리기 x·y·z가 이 몸통 회전 행렬이 된다(+ 쪽에서 볼 때 시계 = + 축 둘레 -90°) */
function rotationMatrix(m: CubeMove): Mat {
  return quarter(m.axis, -m.turns);
}

function transpose(m: Mat): Mat {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
}

/**
 * 큐브 돌리기를 빼고 옮겨 적는다. 돌린 뒤의 수를 처음 쥔 방향의 수로 바꾼다.
 * 끝에 남는 큐브 방향 차이는 판정(가운데 색 기준)과 상관없어 버린다.
 */
export function removeRotations(n: number, alg: string): string {
  return fmt(n, removeRotationMoves(n, parseMoves(n, alg)));
}

/** removeRotations의 엔진 수판. 친 수(훈련 기록)처럼 이미 수로 가진 것을 옮겨 적을 때 */
export function removeRotationMoves(
  n: number,
  moves: readonly CubeMove[],
): CubeMove[] {
  let frame: Mat = IDENTITY;
  const out: CubeMove[] = [];
  for (const m of moves) {
    if (isRotation(n, m)) {
      // 회전 행렬의 거꾸로는 전치
      frame = mul(frame, transpose(rotationMatrix(m)));
      continue;
    }
    out.push(transformMove(n, m, frame));
  }
  return out;
}

export type Grip = "y" | "y'" | "y2";

/** 큐브를 y·y'·y2만큼 돌려 쥐고 하는 공식을, 돌리기 없이 처음 방향으로 옮겨 적는다 */
export function regripAlg(n: number, alg: string, grip: Grip): string {
  return removeRotations(n, `${grip} ${alg}`);
}

/** 윗면 돌리기(U)를 앞이나 뒤에 붙인다. 같은 쪽 U와 합친다(U + U = U2) */
export function addAuf(
  n: number,
  alg: string,
  where: "pre" | "post",
  turn: "U" | "U'" | "U2" = "U",
): string {
  const u = parseMoves(n, turn);
  const moves = parseMoves(n, alg);
  return fmt(n, where === "pre" ? [...u, ...moves] : [...moves, ...u]);
}

/** 수 세기. HTM: 큐브 돌리기 빼고 한 번에 1(바깥에 닿지 않는 가운데 층은 2), STM: 가운데 층도 1 */
export function moveCounts(
  n: number,
  moves: readonly CubeMove[],
): { htm: number; stm: number } {
  let htm = 0;
  let stm = 0;
  for (const m of moves) {
    if (isRotation(n, m)) continue;
    stm++;
    htm += m.from > 1 && m.to < n ? 2 : 1;
  }
  return { htm, stm };
}

/** 공식 글을 다듬는다(빈칸 하나로, 앞뒤 빈칸 없이). 괄호·표기는 그대로 둔다 */
export function tidyAlg(text: string): string {
  return text.replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
}
