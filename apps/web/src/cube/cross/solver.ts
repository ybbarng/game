import { cubeTopology, faceColors } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

/**
 * 3×3 십자 최적 풀이(십자 훈련 `/cube/train/cross`, docs/47 8절).
 *
 * 십자 색 X의 엣지 넷만 본다. 조각마다 "X 스티커가 어느 자리에 있나"(엣지 스티커 자리 24곳)만 알면 자리와
 * 방향이 함께 정해지므로, 상태는 서로 다른 엣지에 놓인 네 값(24·22·20·18 = 190,080가지)이다.
 * 표는 빈칸을 두고 24^4 = 331,776칸을 그대로 쓴다(번호 매기기 계산이 없어 빠르다, 한 색에 324KB).
 *
 * 면 번호는 엔진과 같다(U R F D L B = 0~5). 스티커 자리 (a, b)는 "면 a 위, 면 b와 맞닿은 엣지의 스티커"다.
 * 면 m을 시계 방향으로 돌리면 m에 닿은 자리의 두 면이 m 둘레 차례(`RING`)로 한 칸씩 옮겨 간다.
 * 반 바퀴는 한 수로 센다(HTM). 거리표는 맞춘 십자에서 너비 우선으로 채운다(수 묶음이 거꾸로에 닫혀 있어 거리가 같다).
 */

export const FACE_COUNT = 6;
export const OPPOSITE = [3, 4, 5, 0, 1, 2] as const;
export const FACE_LETTERS = ["U", "R", "F", "D", "L", "B"] as const;

/** 면을 시계 방향으로 돌릴 때 둘레 면이 옮겨 가는 차례(앞 면 → 다음 면) */
const RING: readonly (readonly number[])[] = [
  [2, 4, 5, 1], // U: F→L→B→R
  [2, 0, 5, 3], // R: F→U→B→D
  [0, 1, 3, 4], // F: U→R→D→L
  [2, 1, 5, 4], // D: F→R→B→L
  [0, 2, 3, 5], // L: U→F→D→B
  [0, 4, 3, 1], // B: U→L→D→R
];

/** 스티커 자리 24곳: [면, 맞닿은 면] */
export const LOCATIONS: readonly (readonly [number, number])[] = (() => {
  const out: [number, number][] = [];
  for (let a = 0; a < 6; a++)
    for (let b = 0; b < 6; b++)
      if (a !== b && OPPOSITE[a] !== b) out.push([a, b]);
  return out;
})();

const LOC_INDEX = (() => {
  const t = new Int8Array(36).fill(-1);
  LOCATIONS.forEach(([a, b], i) => {
    t[a * 6 + b] = i;
  });
  return t;
})();

export function locationOf(face: number, neighbor: number): number {
  const i = LOC_INDEX[face * 6 + neighbor] as number;
  if (i < 0) throw new RangeError(`맞닿지 않은 면: ${face}, ${neighbor}`);
  return i;
}

/** 수 18개: 면 × (시계 1, 반 바퀴 2, 반시계 3). 번호 = 면 × 3 + (돌림 − 1) */
export const MOVE_COUNT = 18;

export function moveName(m: number): string {
  return (FACE_LETTERS[Math.floor(m / 3)] as string) + ["", "2", "'"][m % 3];
}

/** 수마다 자리 → 옮겨 간 자리 */
const MOVE_TABLE: Uint8Array = (() => {
  const t = new Uint8Array(MOVE_COUNT * 24);
  for (let face = 0; face < 6; face++) {
    const ring = RING[face] as readonly number[];
    const step = (x: number, turns: number) => {
      const k = ring.indexOf(x);
      return k < 0 ? x : (ring[(k + turns) % 4] as number);
    };
    for (let turns = 1; turns <= 3; turns++) {
      const m = face * 3 + turns - 1;
      LOCATIONS.forEach(([a, b], i) => {
        const moved =
          a === face || b === face
            ? locationOf(step(a, turns), step(b, turns))
            : i;
        t[m * 24 + i] = moved;
      });
    }
  }
  return t;
})();

export function applyToLocation(m: number, loc: number): number {
  return MOVE_TABLE[m * 24 + loc] as number;
}

/** 십자 색(면) X의 조각 차례: X에 맞닿은 면을 번호 차례로 */
export function crossNeighbors(x: number): number[] {
  const out: number[] = [];
  for (let f = 0; f < 6; f++) if (f !== x && f !== OPPOSITE[x]) out.push(f);
  return out;
}

/** 네 조각의 X 스티커 자리 → 표 번호 */
export function crossKey(locs: readonly number[]): number {
  return (
    (((locs[0] as number) * 24 + (locs[1] as number)) * 24 +
      (locs[2] as number)) *
      24 +
    (locs[3] as number)
  );
}

function unkey(key: number, out: number[]): number[] {
  out[3] = key % 24;
  out[2] = Math.floor(key / 24) % 24;
  out[1] = Math.floor(key / 576) % 24;
  out[0] = Math.floor(key / 13_824);
  return out;
}

export const TABLE_SIZE = 24 ** 4;
/** 닿을 수 있는 상태 수 */
export const REACHABLE = 24 * 22 * 20 * 18;
const UNSEEN = 255;

/** 맞춘 십자의 표 번호 */
export function solvedKey(x: number): number {
  return crossKey(crossNeighbors(x).map((y) => locationOf(x, y)));
}

function moveKey(key: number, m: number, tmp: number[]): number {
  unkey(key, tmp);
  const base = m * 24;
  return crossKey([
    MOVE_TABLE[base + (tmp[0] as number)] as number,
    MOVE_TABLE[base + (tmp[1] as number)] as number,
    MOVE_TABLE[base + (tmp[2] as number)] as number,
    MOVE_TABLE[base + (tmp[3] as number)] as number,
  ]);
}

const tables: (Uint8Array | null)[] = [null, null, null, null, null, null];
/** 표 만들기에 걸린 시간(ms, 색마다). 보고·시험에서 본다 */
export const tableBuildMs: number[] = [];

/** 색 X 십자의 거리표(처음 부를 때 만든다) */
export function crossTable(x: number): Uint8Array {
  const hit = tables[x];
  if (hit) return hit;
  const t0 = typeof performance === "undefined" ? 0 : performance.now();
  const dist = new Uint8Array(TABLE_SIZE).fill(UNSEEN);
  const queue = new Int32Array(REACHABLE);
  const start = solvedKey(x);
  dist[start] = 0;
  queue[0] = start;
  let head = 0;
  let tail = 1;
  const tmp = [0, 0, 0, 0];
  const nextLocs = [0, 0, 0, 0];
  while (head < tail) {
    const key = queue[head++] as number;
    const d = dist[key] as number;
    unkey(key, tmp);
    for (let m = 0; m < MOVE_COUNT; m++) {
      const base = m * 24;
      for (let k = 0; k < 4; k++)
        nextLocs[k] = MOVE_TABLE[base + (tmp[k] as number)] as number;
      const nk = crossKey(nextLocs);
      if (dist[nk] === UNSEEN) {
        dist[nk] = d + 1;
        queue[tail++] = nk;
      }
    }
  }
  tables[x] = dist;
  if (typeof performance !== "undefined")
    tableBuildMs[x] = performance.now() - t0;
  return dist;
}

/** 표 번호의 최적 수(닿을 수 없는 번호면 오류) */
export function crossDistance(x: number, key: number): number {
  const d = crossTable(x)[key] as number;
  if (d === UNSEEN) throw new RangeError("닿을 수 없는 십자 상태");
  return d;
}

/** 거리마다 상태 수(시험·보고용) */
export function depthCounts(x: number): number[] {
  const out: number[] = [];
  for (const d of crossTable(x)) if (d !== UNSEEN) out[d] = (out[d] ?? 0) + 1;
  return out;
}

const buckets = new Map<string, Int32Array>();

/** 거리가 `d`인 상태의 표 번호 목록(어려움 고르기용) */
export function keysAtDepth(x: number, d: number): Int32Array {
  const id = `${x}:${d}`;
  const hit = buckets.get(id);
  if (hit) return hit;
  const t = crossTable(x);
  const list: number[] = [];
  for (let k = 0; k < t.length; k++) if (t[k] === d) list.push(k);
  const out = Int32Array.from(list);
  buckets.set(id, out);
  return out;
}

export interface CrossSolveOptions {
  /** 돌려줄 해의 수 상한(기본 6) */
  limit?: number;
}

/**
 * 최적 해 여러 개(모두 같은 길이). 같은 면을 잇달아 두지 않고, 맞은편 두 면은 한 차례(작은 번호 먼저)만 센다.
 * 찾은 해 가운데 손이 편한 것(뒤·아래 면이 적은 것)이 앞에 온다.
 */
export function solveCrossKey(
  x: number,
  key: number,
  opts: CrossSolveOptions = {},
): string[][] {
  const limit = opts.limit ?? 6;
  const table = crossTable(x);
  const depth = crossDistance(x, key);
  const found: number[][] = [];
  const path: number[] = [];
  const cap = Math.max(limit * 8, 48);
  const tmp = [0, 0, 0, 0];
  const dfs = (k: number, togo: number, lastFace: number): void => {
    if (found.length >= cap) return;
    if (togo === 0) {
      found.push([...path]);
      return;
    }
    for (let m = 0; m < MOVE_COUNT; m++) {
      const face = Math.floor(m / 3);
      if (face === lastFace) continue;
      if (lastFace >= 0 && OPPOSITE[face] === lastFace && face < lastFace)
        continue;
      const nk = moveKey(k, m, tmp);
      if (table[nk] !== togo - 1) continue;
      path.push(m);
      dfs(nk, togo - 1, face);
      path.pop();
      if (found.length >= cap) return;
    }
  };
  dfs(key, depth, -1);
  const cost = (sol: number[]) =>
    sol.reduce((c, m) => {
      const f = Math.floor(m / 3);
      return c + (f === 5 ? 3 : f === 3 ? 1 : 0) + (m % 3 === 1 ? 0.5 : 0);
    }, 0);
  return found
    .map((sol) => ({ sol, c: cost(sol) }))
    .sort((a, b) => a.c - b.c)
    .slice(0, limit)
    .map(({ sol }) => sol.map(moveName));
}

// ── 엔진 상태에서 읽기 ──────────────────────────────────────────

interface EdgeSlot {
  /** 두 스티커 자리 번호와 그 면 */
  s: readonly [number, number];
  f: readonly [number, number];
}

let edgeSlots: EdgeSlot[] | null = null;
let centerSlots: number[] | null = null;

function slots3(): { edges: EdgeSlot[]; centers: number[] } {
  if (!edgeSlots || !centerSlots) {
    const topo = cubeTopology(3);
    const edges: EdgeSlot[] = [];
    const centers: number[] = new Array(6).fill(-1);
    for (const p of topo.pieces) {
      if (p.kind === "edge") {
        const [s0, s1] = p.stickers as [number, number];
        edges.push({
          s: [s0, s1],
          f: [
            topo.stickers[s0]?.face as number,
            topo.stickers[s1]?.face as number,
          ],
        });
      } else if (p.kind === "center") {
        const s = p.stickers[0] as number;
        centers[topo.stickers[s]?.face as number] = s;
      }
    }
    edgeSlots = edges;
    centerSlots = centers;
  }
  return { edges: edgeSlots, centers: centerSlots };
}

/**
 * 지금 쥔 방향에서 색 `color`(맞춘 상태의 면 번호) 십자를 읽는다.
 * `face`는 그 색 센터가 지금 있는 면, `key`는 그 면 기준 표 번호. 센터가 옮겨 가도(x·y·z, 가운데 층) 맞게 읽는다.
 */
export function readCross(
  state: PuzzleState,
  color: number,
): { face: number; key: number } {
  const { edges, centers } = slots3();
  const colors = faceColors(3, state);
  /** 색 → 지금 그 색 센터가 있는 면 */
  const faceOf = new Array<number>(6);
  for (let f = 0; f < 6; f++)
    faceOf[colors[centers[f] as number] as number] = f;
  const x = faceOf[color] as number;
  const neighbors = crossNeighbors(x);
  const locs = [0, 0, 0, 0];
  for (const e of edges) {
    const c0 = colors[e.s[0]] as number;
    const c1 = colors[e.s[1]] as number;
    let k = -1;
    if (c0 === color) k = 0;
    else if (c1 === color) k = 1;
    if (k < 0) continue;
    const other = faceOf[k === 0 ? c1 : c0] as number;
    const at = locationOf(e.f[k] as number, e.f[1 - k] as number);
    locs[neighbors.indexOf(other)] = at;
  }
  return { face: x, key: crossKey(locs) };
}

/** 지금 상태에서 색 `color` 십자의 최적 수 */
export function crossDepth(state: PuzzleState, color: number): number {
  const { face, key } = readCross(state, color);
  return crossDistance(face, key);
}

/** 색 `color` 십자가 다 되었나(센터 기준) */
export function crossDone(state: PuzzleState, color: number): boolean {
  const { face, key } = readCross(state, color);
  return key === solvedKey(face);
}

/** 지금 상태에서 색 `color` 십자의 최적 해(지금 쥔 방향의 표기) */
export function solveCross(
  state: PuzzleState,
  color: number,
  opts: CrossSolveOptions = {},
): string[][] {
  const { face, key } = readCross(state, color);
  return solveCrossKey(face, key, opts);
}
