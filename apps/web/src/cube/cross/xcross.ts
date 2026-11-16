import { cubeTopology, faceColors } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import {
  applyToLocation,
  crossKey,
  crossNeighbors,
  crossTable,
  FACE_LETTERS,
  LOCATIONS,
  locationOf,
  MOVE_COUNT,
  moveName,
  OPPOSITE,
  solvedKey,
} from "./solver";

/**
 * 3×3 X십자 최적 풀이(십자 훈련 결과, docs/47 8-1 「십자 훈련」). X십자는 십자와 함께 F2L 짝 하나(첫 층 코너와
 * 그 위 둘째 층 엣지)까지 맞춘 것이다. 반 바퀴는 한 수(HTM).
 *
 * 상태는 십자 엣지 넷(`solver.ts`와 같은 스티커 자리 24곳) + 짝 엣지 하나(스티커 자리 24곳) + 짝 코너 하나(코너
 * 스티커 자리 24곳)다. 십자 거리표(`solver.ts`)와 작은 거리표 둘(짝 쪽 십자 엣지 둘 + 짝, 반대쪽 십자 엣지 둘
 * + 짝, 각 24^4칸 324KB)의 큰 값을 아래 어림으로 두고 반복 깊이 탐색(IDA*)으로 찾는다. 표는 기준 하나(십자 색이
 * 위 면 U, 짝이 앞-오른쪽 F·R)만 만들고, 다른 색·다른 칸은 큐브 돌리기(면 번호 바꾸기 24가지)로 기준에 옮겨
 * 읽는다. 처음 부를 때 만든다(이 맥에서 표 둘 합쳐 약 0.1초). 십자 + 짝 엣지·십자 + 짝 코너처럼 조각 다섯을 보는
 * 큰 표(각 24^5칸 7.6MB)는 어림이 더 세지만 만드는 데 몇 초씩 걸려 쓰지 않는다.
 */

const FACES = 6;

// ── 코너 스티커 자리 ─────────────────────────────────────────

/** 코너 스티커 자리 24곳: [스티커가 있는 면, 맞닿은 두 면(작은 번호 먼저)] */
export const CORNER_LOCATIONS: readonly (readonly [number, number, number])[] =
  (() => {
    const out: [number, number, number][] = [];
    const adjacent = (p: number, q: number) => p !== q && OPPOSITE[p] !== q;
    for (let a = 0; a < FACES; a++)
      for (let b = 0; b < FACES; b++)
        for (let c = b + 1; c < FACES; c++)
          if (adjacent(a, b) && adjacent(a, c) && adjacent(b, c))
            out.push([a, b, c]);
    return out;
  })();

const CORNER_INDEX = (() => {
  const t = new Int8Array(FACES * 36).fill(-1);
  CORNER_LOCATIONS.forEach(([a, b, c], i) => {
    t[a * 36 + b * 6 + c] = i;
  });
  return t;
})();

export function cornerLocationOf(face: number, p: number, q: number): number {
  const [b, c] = p < q ? [p, q] : [q, p];
  const i = CORNER_INDEX[face * 36 + b * 6 + c] as number;
  if (i < 0) throw new RangeError(`코너가 아닌 면 묶음: ${face}, ${p}, ${q}`);
  return i;
}

/** 면을 시계 방향으로 돌릴 때 둘레 면 차례(solver.ts RING과 같다) */
const RING: readonly (readonly number[])[] = [
  [2, 4, 5, 1],
  [2, 0, 5, 3],
  [0, 1, 3, 4],
  [2, 1, 5, 4],
  [0, 2, 3, 5],
  [0, 4, 3, 1],
];

const CORNER_MOVE: Uint8Array = (() => {
  const t = new Uint8Array(MOVE_COUNT * 24);
  for (let face = 0; face < FACES; face++) {
    const ring = RING[face] as readonly number[];
    const step = (x: number, turns: number) => {
      const k = ring.indexOf(x);
      return k < 0 ? x : (ring[(k + turns) % 4] as number);
    };
    for (let turns = 1; turns <= 3; turns++) {
      const m = face * 3 + turns - 1;
      CORNER_LOCATIONS.forEach(([a, b, c], i) => {
        t[m * 24 + i] =
          a === face || b === face || c === face
            ? cornerLocationOf(step(a, turns), step(b, turns), step(c, turns))
            : i;
      });
    }
  }
  return t;
})();

/** 엣지 스티커 자리의 수 표(solver.ts와 같은 값, 표 만들기에서 함수 부르기 없이 읽으려고 따로 둔다) */
const EDGE_MOVE: Uint8Array = (() => {
  const t = new Uint8Array(MOVE_COUNT * 24);
  for (let m = 0; m < MOVE_COUNT; m++)
    for (let i = 0; i < 24; i++) t[m * 24 + i] = applyToLocation(m, i);
  return t;
})();

export function applyToCorner(m: number, loc: number): number {
  return CORNER_MOVE[m * 24 + loc] as number;
}

// ── 큐브 돌리기(면 번호 바꾸기) ─────────────────────────────────

/** 큐브 돌리기 24가지. σ[f] = 면 f가 옮겨 가는 면 */
export const ROTATIONS: readonly (readonly number[])[] = (() => {
  const gen = [RING[0], RING[1]].map((ring) => {
    const s = [0, 1, 2, 3, 4, 5];
    const r = ring as readonly number[];
    for (let k = 0; k < 4; k++) s[r[k] as number] = r[(k + 1) % 4] as number;
    return s;
  });
  const seen = new Map<string, number[]>([["0,1,2,3,4,5", [0, 1, 2, 3, 4, 5]]]);
  const queue = [[0, 1, 2, 3, 4, 5]];
  while (queue.length) {
    const s = queue.shift() as number[];
    for (const g of gen) {
      const t = s.map((f) => g[f] as number);
      const id = t.join();
      if (!seen.has(id)) {
        seen.set(id, t);
        queue.push(t);
      }
    }
  }
  return [...seen.values()];
})();

export function rotateLocation(sigma: readonly number[], loc: number): number {
  const [a, b] = LOCATIONS[loc] as readonly [number, number];
  return locationOf(sigma[a] as number, sigma[b] as number);
}

export function rotateCorner(sigma: readonly number[], loc: number): number {
  const [a, b, c] = CORNER_LOCATIONS[loc] as readonly [number, number, number];
  return cornerLocationOf(
    sigma[a] as number,
    sigma[b] as number,
    sigma[c] as number,
  );
}

// ── 기준 표 ─────────────────────────────────────────────────

/** 기준: 십자 색 면 U(0), 짝은 앞 F(2)·오른쪽 R(1) */
const REF_X = 0;
const REF_A = 2;
const REF_B = 1;
const REF_NEIGHBORS = crossNeighbors(REF_X);
const REF_EDGE_HOME = locationOf(REF_A, REF_B);
const REF_CORNER_HOME = cornerLocationOf(REF_X, REF_A, REF_B);

const UNSEEN = 255;

/** 기준 상태: 십자 엣지 넷의 자리(REF_NEIGHBORS 차례), 짝 엣지(F 색 스티커) 자리, 짝 코너(십자 색 스티커) 자리 */
export interface XState {
  cross: number[];
  edge: number;
  corner: number;
}

/** 표 하나: 십자 엣지 둘 + 짝 엣지 + 짝 코너(24^4 = 331,776칸) */
const PART_SIZE = 24 ** 4;

/**
 * 십자 엣지 둘(REF_NEIGHBORS 차례 번호 i·j) + 짝 엣지 + 짝 코너의 거리표.
 * 너비 우선으로 맞춘 자리에서 채운다(253,440가지, 이 맥에서 수십 ms).
 */
function buildPart(i: number, j: number): Uint8Array {
  const dist = new Uint8Array(PART_SIZE).fill(UNSEEN);
  const queue = new Int32Array(24 * 22 * 20 * 24);
  const home = (k: number) => locationOf(REF_X, REF_NEIGHBORS[k] as number);
  const start =
    ((home(i) * 24 + home(j)) * 24 + REF_EDGE_HOME) * 24 + REF_CORNER_HOME;
  dist[start] = 0;
  queue[0] = start;
  let head = 0;
  let tail = 1;
  const em = EDGE_MOVE;
  const cm = CORNER_MOVE;
  while (head < tail) {
    const key = queue[head++] as number;
    const d = (dist[key] as number) + 1;
    const c = key % 24;
    let k = (key - c) / 24;
    const e = k % 24;
    k = (k - e) / 24;
    const b = k % 24;
    const a = (k - b) / 24;
    for (let m = 0; m < MOVE_COUNT; m++) {
      const o = m * 24;
      const nk =
        ((((em[o + a] as number) * 24 + (em[o + b] as number)) * 24 +
          (em[o + e] as number)) *
          24 +
          (cm[o + c] as number)) |
        0;
      if (dist[nk] === UNSEEN) {
        dist[nk] = d;
        queue[tail++] = nk;
      }
    }
  }
  return dist;
}

let near: Uint8Array | null = null;
let far: Uint8Array | null = null;

/** 짝 쪽 십자 엣지 둘(R·F)과 반대쪽 둘(L·B)의 표. REF_NEIGHBORS = R F L B */
const NEAR: readonly [number, number] = [0, 1];
const FAR: readonly [number, number] = [2, 3];

/** 표 둘을 만든다(이미 있으면 그대로) */
export function xcrossTables(): { near: Uint8Array; far: Uint8Array } {
  if (!near) near = buildPart(...NEAR);
  if (!far) far = buildPart(...FAR);
  return { near, far };
}

/** 기준 상태의 최적 수 아래 어림: 십자 표와 두 표 가운데 큰 값 */
function bound(s: XState): number {
  const t = xcrossTables();
  const part = (table: Uint8Array, [i, j]: readonly [number, number]) =>
    table[
      (((s.cross[i] as number) * 24 + (s.cross[j] as number)) * 24 + s.edge) *
        24 +
        s.corner
    ] as number;
  return Math.max(
    crossTable(REF_X)[crossKey(s.cross)] as number,
    part(t.near, NEAR),
    part(t.far, FAR),
  );
}

export function xSolved(s: XState): boolean {
  return (
    crossKey(s.cross) === solvedKey(REF_X) &&
    s.edge === REF_EDGE_HOME &&
    s.corner === REF_CORNER_HOME
  );
}

export function applyX(s: XState, m: number): XState {
  return {
    cross: s.cross.map((l) => applyToLocation(m, l)),
    edge: applyToLocation(m, s.edge),
    corner: applyToCorner(m, s.corner),
  };
}

export interface XSearchOptions {
  /** 돌려줄 해의 수 상한(기본 4) */
  limit?: number;
  /** 이 수보다 길면 찾지 않고 빈 목록(기본 없음) */
  maxDepth?: number;
}

/** 기준 상태의 최적 해들(기준 면 번호의 수 번호 목록) */
export function solveRef(s: XState, opts: XSearchOptions = {}): number[][] {
  const limit = opts.limit ?? 4;
  const cap = Math.max(limit * 8, 32);
  const found: number[][] = [];
  const path: number[] = [];
  const dfs = (st: XState, togo: number, lastFace: number): void => {
    if (found.length >= cap) return;
    if (togo === 0) {
      if (xSolved(st)) found.push([...path]);
      return;
    }
    for (let m = 0; m < MOVE_COUNT; m++) {
      const face = Math.floor(m / 3);
      if (face === lastFace) continue;
      if (lastFace >= 0 && OPPOSITE[face] === lastFace && face < lastFace)
        continue;
      const nx = applyX(st, m);
      if (bound(nx) > togo - 1) continue;
      path.push(m);
      dfs(nx, togo - 1, face);
      path.pop();
      if (found.length >= cap) return;
    }
  };
  const max = opts.maxDepth ?? 99;
  for (let depth = bound(s); found.length === 0 && depth <= max; depth++)
    dfs(s, depth, -1);
  return found;
}

// ── 엔진 상태에서 읽기 ──────────────────────────────────────────

interface Slots {
  edges: { s: [number, number]; f: [number, number] }[];
  corners: { s: [number, number, number]; f: [number, number, number] }[];
  centers: number[];
}

let slots: Slots | null = null;

function slots3(): Slots {
  if (slots) return slots;
  const topo = cubeTopology(3);
  const out: Slots = { edges: [], corners: [], centers: new Array(6).fill(-1) };
  const faceOf = (s: number) => topo.stickers[s]?.face as number;
  for (const p of topo.pieces) {
    const st = p.stickers as number[];
    if (p.kind === "edge") {
      const [s0, s1] = st as [number, number];
      out.edges.push({ s: [s0, s1], f: [faceOf(s0), faceOf(s1)] });
    } else if (p.kind === "corner") {
      const [s0, s1, s2] = st as [number, number, number];
      out.corners.push({
        s: [s0, s1, s2],
        f: [faceOf(s0), faceOf(s1), faceOf(s2)],
      });
    } else if (p.kind === "center") {
      out.centers[faceOf(st[0] as number)] = st[0] as number;
    }
  }
  slots = out;
  return out;
}

/** 짝 하나(십자 색 x의 두 옆 면 a·b, 지금 면 번호) */
export interface XSlot {
  x: number;
  a: number;
  b: number;
}

/** 면 x에 붙은 짝 칸 넷(옆 면 둘씩) */
export function slotsAround(x: number): [number, number][] {
  const n = crossNeighbors(x);
  const out: [number, number][] = [];
  for (let i = 0; i < n.length; i++)
    for (let j = i + 1; j < n.length; j++)
      if (OPPOSITE[n[i] as number] !== n[j])
        out.push([n[i], n[j]] as [number, number]);
  return out;
}

/** 십자 색 면 x·짝 a·b를 기준(U·F·R)으로 옮기는 큐브 돌리기 */
export function rotationFor(x: number, a: number, b: number): number[] {
  const hit = ROTATIONS.find(
    (s) =>
      s[x] === REF_X &&
      ((s[a] === REF_A && s[b] === REF_B) ||
        (s[a] === REF_B && s[b] === REF_A)),
  );
  if (!hit) throw new RangeError(`짝 칸이 아님: ${x}, ${a}, ${b}`);
  return [...hit];
}

/**
 * 지금 쥔 방향에서 색 `color` 십자 + 짝(옆 면 a·b, 지금 면 번호) 상태를 기준으로 옮겨 읽는다.
 * 센터가 옮겨 가도(x·y·z, 가운데 층) 센터 색 기준으로 읽는다.
 */
export function readXCross(
  state: PuzzleState,
  color: number,
  slot: readonly [number, number],
): { sigma: number[]; s: XState } {
  const { edges, corners, centers } = slots3();
  const colors = faceColors(3, state);
  const faceOfColor = new Array<number>(6);
  for (let f = 0; f < 6; f++)
    faceOfColor[colors[centers[f] as number] as number] = f;
  const x = faceOfColor[color] as number;
  const [a, b] = slot;
  const sigma = rotationFor(x, a, b);
  const s: XState = { cross: [0, 0, 0, 0], edge: -1, corner: -1 };
  // 짝 엣지는 기준 F(2) 색 스티커를 따라간다: 지금 면 번호로는 σ⁻¹(2)
  const trackA = sigma.indexOf(REF_A);
  for (const e of edges) {
    const f0 = faceOfColor[colors[e.s[0]] as number] as number;
    const f1 = faceOfColor[colors[e.s[1]] as number] as number;
    const at = (k: 0 | 1) =>
      rotateLocation(sigma, locationOf(e.f[k], e.f[1 - k] as number));
    if (f0 === x || f1 === x) {
      const k: 0 | 1 = f0 === x ? 0 : 1;
      const other = k === 0 ? f1 : f0;
      s.cross[REF_NEIGHBORS.indexOf(sigma[other] as number)] = at(k);
    } else if ((f0 === a && f1 === b) || (f0 === b && f1 === a)) {
      s.edge = at(f0 === trackA ? 0 : 1);
    }
  }
  for (const c of corners) {
    const fs = c.s.map((st) => faceOfColor[colors[st] as number] as number);
    if (!(fs.includes(x) && fs.includes(a) && fs.includes(b))) continue;
    const k = fs.indexOf(x);
    const others = c.f.filter((_, i) => i !== k) as [number, number];
    s.corner = rotateCorner(
      sigma,
      cornerLocationOf(c.f[k] as number, others[0], others[1]),
    );
  }
  return { sigma, s };
}

/** 기준 수 번호 → 지금 쥔 방향의 표기 */
function backName(sigma: readonly number[], m: number): string {
  const face = sigma.indexOf(Math.floor(m / 3));
  return moveName(face * 3 + (m % 3));
}

export interface XCrossSolution {
  /** 십자 색 */
  color: number;
  /** 최적 수 */
  depth: number;
  /** 최적 해들: 짝의 두 옆 면 색과 수(지금 쥔 방향의 표기) */
  solutions: { pair: [number, number]; moves: string[] }[];
}

/** 손이 편한 차례(뒤·아래 면이 적은 것 먼저, 십자 풀이와 같은 값) */
function cost(sol: readonly string[]): number {
  return sol.reduce((c, t) => {
    const f = FACE_LETTERS.indexOf(t[0] as (typeof FACE_LETTERS)[number]);
    return c + (f === 5 ? 3 : f === 3 ? 1 : 0) + (t.endsWith("2") ? 0.5 : 0);
  }, 0);
}

/**
 * 색 `color` X십자의 최적 풀이: 짝 칸 넷 가운데 가장 짧은 칸(같으면 모두)의 해를 손이 편한 차례로.
 * 짝 색은 지금 그 면에 있는 센터 색.
 */
export function solveXCross(
  state: PuzzleState,
  color: number,
  opts: XSearchOptions = {},
): XCrossSolution {
  const limit = opts.limit ?? 4;
  const colors = faceColors(3, state);
  const { centers } = slots3();
  const centerColor = (f: number) => colors[centers[f] as number] as number;
  let x = -1;
  for (let f = 0; f < 6; f++) if (centerColor(f) === color) x = f;
  let depth = 99;
  let all: XCrossSolution["solutions"] = [];
  // 어림이 작은 칸부터 풀어, 앞에서 찾은 길이보다 길어지는 칸은 거기서 멈춘다
  const reads = slotsAround(x)
    .map((slot) => ({ slot, ...readXCross(state, color, slot) }))
    .map((r) => ({ ...r, low: bound(r.s) }))
    .sort((p, q) => p.low - q.low);
  for (const { slot, sigma, s, low } of reads) {
    if (low > depth) continue;
    const sols = solveRef(s, { limit, maxDepth: depth });
    if (sols.length === 0) continue;
    const d = (sols[0] as number[]).length;
    const pair: [number, number] = [centerColor(slot[0]), centerColor(slot[1])];
    const named = sols.map((sol) => ({
      pair,
      moves: sol.map((m) => backName(sigma, m)),
    }));
    if (d < depth) {
      depth = d;
      all = named;
    } else all.push(...named);
  }
  const solutions = all
    .map((sol) => ({ sol, c: cost(sol.moves) }))
    .sort((p, q) => p.c - q.c)
    .slice(0, limit)
    .map(({ sol }) => sol);
  return { color, depth, solutions };
}
