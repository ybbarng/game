import {
  type Board,
  CELLS,
  type Cell,
  HEIGHT,
  type Kind,
  type Side,
  WIDTH,
} from "@game/janggi-engine";

/*
 * 고수 탐색용 빠른 판. 엔진의 `pseudoTargets`·`attacked`와 같은 규칙을
 * 미리 계산한 표와 정수 배열로 다시 적었다(결과가 같은지는 fast-board.test.ts가 본다).
 *
 * 기물 부호: 0 빈칸, 편(초 0, 한 8) + 종류(궁 1 사 2 차 3 포 4 마 5 상 6 졸 7)
 */
export const K = 1;
export const A = 2;
export const R = 3;
export const C = 4;
export const N = 5;
export const E = 6;
export const P = 7;

const KIND_CODE: Record<Kind, number> = { K, A, R, C, N, E, P };
const CODE_KIND: Kind[] = ["K", "K", "A", "R", "C", "N", "E", "P"];

/** 편 번호: 초 0, 한 1 */
export function sideIndex(side: Side): number {
  return side === "c" ? 0 : 1;
}

export function codeOf(cell: Cell): number {
  if (cell === "") return 0;
  return KIND_CODE[cell[1] as Kind] | (cell[0] === "h" ? 8 : 0);
}

export function cellOf(code: number): Cell {
  if (code === 0) return "";
  return `${code >> 3 ? "h" : "c"}${CODE_KIND[code & 7] as Kind}`;
}

export function toFast(board: Board): Int8Array {
  const out = new Int8Array(CELLS);
  for (let at = 0; at < CELLS; at++) out[at] = codeOf(board[at] ?? "");
  return out;
}

const at = (x: number, y: number) => y * WIDTH + x;
const inBounds = (x: number, y: number) =>
  x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;

/** 궁성: 한 1, 초 0, 밖 -1 (엔진 `palaceOf`와 같다) */
function palaceOf(x: number, y: number): number {
  if (x < 3 || x > 5 || y < 0 || y >= HEIGHT) return -1;
  if (y <= 2) return 1;
  if (y >= 7) return 0;
  return -1;
}

function palaceDiagonals(x: number, y: number): [number, number][] {
  const palace = palaceOf(x, y);
  if (palace < 0) return [];
  const cy = palace === 1 ? 1 : 8;
  if (x === 4 && y === cy)
    return [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
  const dx = 4 - x;
  const dy = cy - y;
  if (Math.abs(dx) === 1 && Math.abs(dy) === 1) return [[dx, dy]];
  return [];
}

function diagonalStep(
  x: number,
  y: number,
  dx: number,
  dy: number,
): [number, number] | null {
  const palace = palaceOf(x, y);
  if (palace < 0) return null;
  if (!palaceDiagonals(x, y).some(([a, b]) => a === dx && b === dy))
    return null;
  const nx = x + dx;
  const ny = y + dy;
  return palaceOf(nx, ny) === palace ? [nx, ny] : null;
}

const ORTHOGONAL: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAGONAL: [number, number][] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** 칸마다 차·포가 따라가는 줄(직선 넷 + 궁성 대각선) */
export const RAYS: number[][][] = [];
/** 마: [다리, 도착] */
export const HORSE: [number, number][][] = [];
/** 상: [다리1, 다리2, 도착] */
export const ELEPHANT: [number, number, number][][] = [];
/** 궁·사: [편*90 + 칸]마다 갈 곳(편 0 초, 1 한) */
export const PALACE_STEP: number[][] = [];
/** 졸: [편*90 + 칸]마다 갈 곳 */
export const PAWN: number[][] = [];

/** 거꾸로 표(이 칸을 노리는 자리): 마 [자리, 다리], 상 [자리, 다리1, 다리2] */
export const HORSE_FROM: [number, number][][] = [];
export const ELEPHANT_FROM: [number, number, number][][] = [];
export const PALACE_FROM: number[][] = [];
export const PAWN_FROM: number[][] = [];

for (let s = 0; s < CELLS; s++) {
  HORSE_FROM.push([]);
  ELEPHANT_FROM.push([]);
  PALACE_STEP.push([], []);
  PALACE_FROM.push([], []);
  PAWN.push([], []);
  PAWN_FROM.push([], []);
}

for (let s = 0; s < CELLS; s++) {
  const x = s % WIDTH;
  const y = Math.floor(s / WIDTH);
  const rays: number[][] = [];
  for (const [dx, dy] of ORTHOGONAL) {
    const ray: number[] = [];
    for (let nx = x + dx, ny = y + dy; inBounds(nx, ny); nx += dx, ny += dy)
      ray.push(at(nx, ny));
    if (ray.length) rays.push(ray);
  }
  for (const [dx, dy] of DIAGONAL) {
    const ray: number[] = [];
    let p = diagonalStep(x, y, dx, dy);
    while (p) {
      ray.push(at(p[0], p[1]));
      p = diagonalStep(p[0], p[1], dx, dy);
    }
    if (ray.length) rays.push(ray);
  }
  RAYS.push(rays);

  const horse: [number, number][] = [];
  const elephant: [number, number, number][] = [];
  for (const [dx, dy] of ORTHOGONAL) {
    if (!inBounds(x + dx, y + dy)) continue;
    const leg = at(x + dx, y + dy);
    for (const side2 of [-1, 1]) {
      const ex = dx === 0 ? side2 : dx;
      const ey = dy === 0 ? side2 : dy;
      if (inBounds(x + dx + ex, y + dy + ey)) {
        const to = at(x + dx + ex, y + dy + ey);
        horse.push([leg, to]);
        HORSE_FROM[to]?.push([s, leg]);
        if (inBounds(x + dx + 2 * ex, y + dy + 2 * ey)) {
          const to2 = at(x + dx + 2 * ex, y + dy + 2 * ey);
          elephant.push([leg, to, to2]);
          ELEPHANT_FROM[to2]?.push([s, leg, to]);
        }
      }
    }
  }
  HORSE.push(horse);
  ELEPHANT.push(elephant);

  for (const side of [0, 1]) {
    const steps: number[] = [];
    if (palaceOf(x, y) === side) {
      for (const [dx, dy] of ORTHOGONAL)
        if (palaceOf(x + dx, y + dy) === side) steps.push(at(x + dx, y + dy));
      for (const [dx, dy] of DIAGONAL) {
        const p = diagonalStep(x, y, dx, dy);
        if (p && palaceOf(p[0], p[1]) === side) steps.push(at(p[0], p[1]));
      }
    }
    PALACE_STEP[side * CELLS + s] = steps;
    for (const to of steps) PALACE_FROM[side * CELLS + to]?.push(s);

    const f = side === 0 ? -1 : 1;
    const pawn: number[] = [];
    if (inBounds(x, y + f)) pawn.push(at(x, y + f));
    if (inBounds(x - 1, y)) pawn.push(at(x - 1, y));
    if (inBounds(x + 1, y)) pawn.push(at(x + 1, y));
    for (const dx of [-1, 1]) {
      const p = diagonalStep(x, y, dx, f);
      if (p) pawn.push(at(p[0], p[1]));
    }
    PAWN[side * CELLS + s] = pawn;
    for (const to of pawn) PAWN_FROM[side * CELLS + to]?.push(s);
  }
}

/** 수 부호: 출발 << 7 | 도착 */
export const encodeMove = (from: number, to: number) => (from << 7) | to;
export const moveFrom = (m: number) => m >> 7;
export const moveTo = (m: number) => m & 127;

/**
 * 그 편(0 초, 1 한)의 모든 수를 `out[start..]`에 적고 끝 자리를 돌려준다.
 * 궁이 잡히는지는 보지 않는다. `capturesOnly`면 잡는 수만
 */
export function generate(
  b: Int8Array,
  side: number,
  out: Int32Array,
  start: number,
  capturesOnly: boolean,
): number {
  let n = start;
  for (let from = 0; from < CELLS; from++) {
    const code = b[from] as number;
    if (code === 0 || code >> 3 !== side) continue;
    const kind = code & 7;
    const base = from << 7;
    if (kind === R) {
      for (const ray of RAYS[from] as number[][])
        for (const to of ray) {
          const t = b[to] as number;
          if (t === 0) {
            if (!capturesOnly) out[n++] = base | to;
          } else {
            if (t >> 3 !== side) out[n++] = base | to;
            break;
          }
        }
    } else if (kind === C) {
      for (const ray of RAYS[from] as number[][]) {
        let i = 0;
        while (i < ray.length && b[ray[i] as number] === 0) i++;
        if (i >= ray.length || ((b[ray[i] as number] as number) & 7) === C)
          continue;
        for (i++; i < ray.length; i++) {
          const to = ray[i] as number;
          const t = b[to] as number;
          if (t === 0) {
            if (!capturesOnly) out[n++] = base | to;
          } else {
            if ((t & 7) !== C && t >> 3 !== side) out[n++] = base | to;
            break;
          }
        }
      }
    } else if (kind === N) {
      for (const [leg, to] of HORSE[from] as [number, number][]) {
        if (b[leg] !== 0) continue;
        const t = b[to] as number;
        if (t === 0 ? !capturesOnly : t >> 3 !== side) out[n++] = base | to;
      }
    } else if (kind === E) {
      for (const [l1, l2, to] of ELEPHANT[from] as [number, number, number][]) {
        if (b[l1] !== 0 || b[l2] !== 0) continue;
        const t = b[to] as number;
        if (t === 0 ? !capturesOnly : t >> 3 !== side) out[n++] = base | to;
      }
    } else {
      const targets =
        kind === P
          ? (PAWN[side * CELLS + from] as number[])
          : (PALACE_STEP[side * CELLS + from] as number[]);
      for (const to of targets) {
        const t = b[to] as number;
        if (t === 0 ? !capturesOnly : t >> 3 !== side) out[n++] = base | to;
      }
    }
  }
  return n;
}

/**
 * `sq` 칸을 `by` 편(0 초, 1 한) 기물이 잡을 수 있나(그 칸이 비었거나 상대 기물일 때).
 * 포는 포를 잡지 못하므로 그 칸이 포면 포의 공격은 세지 않는다
 */
export function attacked(b: Int8Array, sq: number, by: number): boolean {
  const own = by << 3;
  const targetIsCannon = ((b[sq] as number) & 7) === C;
  for (const ray of RAYS[sq] as number[][]) {
    let i = 0;
    while (i < ray.length && b[ray[i] as number] === 0) i++;
    if (i >= ray.length) continue;
    const first = b[ray[i] as number] as number;
    if (first === (own | R)) return true;
    if ((first & 7) === C || targetIsCannon) continue;
    for (i++; i < ray.length; i++) {
      const t = b[ray[i] as number] as number;
      if (t === 0) continue;
      if (t === (own | C)) return true;
      break;
    }
  }
  for (const [from, leg] of HORSE_FROM[sq] as [number, number][])
    if (b[from] === (own | N) && b[leg] === 0) return true;
  for (const [from, l1, l2] of ELEPHANT_FROM[sq] as [number, number, number][])
    if (b[from] === (own | E) && b[l1] === 0 && b[l2] === 0) return true;
  for (const from of PAWN_FROM[by * CELLS + sq] as number[])
    if (b[from] === (own | P)) return true;
  for (const from of PALACE_FROM[by * CELLS + sq] as number[]) {
    const t = b[from] as number;
    if (t === (own | K) || t === (own | A)) return true;
  }
  return false;
}
