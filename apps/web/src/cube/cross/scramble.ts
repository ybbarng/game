import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import { scramble as officialScramble } from "@game/cube-scramble";
import {
  type CubieCube,
  cubieToFacelets,
  invertAlgorithm,
  parity,
  solve3x3,
} from "@game/cube-solver";
import {
  createRng,
  nextInt,
  type RngState,
  shuffleInPlace,
} from "@game/mighty-engine";
import type { PuzzleState } from "@game/puzzle-core";

import {
  crossKey,
  crossNeighbors,
  crossTable,
  keysAtDepth,
  LOCATIONS,
  locationOf,
  readCross,
  solveCrossKey,
} from "./solver";

/**
 * 십자 훈련의 섞기(docs/47 8절). 어려움은 고른 색들 가운데 가장 짧은 십자의 최적 수로 정한다.
 *
 * - 「무작위」: 대회 규칙 섞기(`@game/cube-scramble` 3×3) 그대로라 실제 대회 분포다.
 * - 수를 고르면: 대회 섞기와 같은 방식(무작위 상태 → 해법기 → 그 해의 거꾸로)으로 만들되, 무작위 상태를 뽑을 때
 *   한 색의 십자 모서리를 그 거리의 상태 가운데 하나로 놓고 나머지는 무작위로 둔다. 다른 색이 더 짧으면 버리고
 *   다시 뽑는다(표 찾기라 한 번에 몇 μs). 8수는 무작위 상태의 0.05%뿐이라 이렇게 해야 바로 나온다.
 *   모든 색에서 8수(여섯 색 모두 8수)는 거의 없는 상태라 고를 수 없게 한다(`difficultyAvailable`).
 */

export type CrossDifficulty = "le4" | 5 | 6 | 7 | 8 | "random";
export const CROSS_DIFFICULTIES: readonly CrossDifficulty[] = [
  "le4",
  5,
  6,
  7,
  8,
  "random",
];

/** 십자 색 묶음 */
export type CrossColorSet = "white" | "whiteYellow" | "all";
export const CROSS_COLOR_SETS: Record<CrossColorSet, readonly number[]> = {
  white: [0],
  whiteYellow: [0, 3],
  all: [0, 1, 2, 3, 4, 5],
};

/** 고를 수 있는 어려움인가(모든 색 8수는 거의 없어 뺀다) */
export function difficultyAvailable(
  set: CrossColorSet,
  d: CrossDifficulty,
): boolean {
  return !(set === "all" && d === 8);
}

/** 이 섞기에서 이 수를 넘는 뽑기는 포기한다(멈춘 계산을 막는 안전장치) */
export const MAX_TRIES = 400_000;

/** 해법기 모서리 자리(cube-solver `EDGE_COLORS`와 같은 차례: UR UF UL UB DR DF DL DB FR FL BL BR) */
const EDGE_FACES: readonly (readonly [number, number])[] = [
  [0, 1],
  [0, 2],
  [0, 4],
  [0, 5],
  [3, 1],
  [3, 2],
  [3, 4],
  [3, 5],
  [2, 1],
  [2, 4],
  [5, 4],
  [5, 1],
];

function edgeIndex(a: number, b: number): number {
  return EDGE_FACES.findIndex(
    ([p, q]) => (p === a && q === b) || (p === b && q === a),
  );
}

/** 조각 표현(cubie)에서 색 x 십자의 표 번호(해법기 쪽 상태로 거르기용) */
export function cubieCrossKey(c: CubieCube, x: number): number {
  const neighbors = crossNeighbors(x);
  const locs = [0, 0, 0, 0];
  for (let i = 0; i < 12; i++) {
    const col = EDGE_FACES[c.ep[i] as number] as readonly [number, number];
    const k = col.indexOf(x);
    if (k < 0) continue;
    const pos = EDGE_FACES[i] as readonly [number, number];
    const flip = c.eo[i] === 1;
    const face = pos[flip ? 1 - k : k] as number;
    const other = pos[flip ? k : 1 - k] as number;
    locs[neighbors.indexOf(col[1 - k] as number)] = locationOf(face, other);
  }
  return crossKey(locs);
}

function randomCubie(rng: RngState): CubieCube {
  const cp = shuffleInPlace(rng, [0, 1, 2, 3, 4, 5, 6, 7]);
  const co: number[] = [];
  for (let i = 0; i < 7; i++) co.push(nextInt(rng, 3));
  co.push((3 - (co.reduce((a, b) => a + b, 0) % 3)) % 3);
  return { cp, co, ep: [], eo: [] };
}

/**
 * 색 x 십자 모서리를 표 번호 `key`대로 놓고 나머지 모서리는 무작위로 둔다.
 * 모서리 방향 합·순열 홀짝은 십자가 아닌 조각으로 맞춘다.
 */
function placeEdges(
  c: CubieCube,
  x: number,
  key: number,
  rng: RngState,
): CubieCube {
  const ep = new Array<number>(12).fill(-1);
  const eo = new Array<number>(12).fill(0);
  const locs = [
    Math.floor(key / 13_824),
    Math.floor(key / 576) % 24,
    Math.floor(key / 24) % 24,
    key % 24,
  ];
  const neighbors = crossNeighbors(x);
  const used = new Set<number>();
  neighbors.forEach((y, n) => {
    const [f, g] = LOCATIONS[locs[n] as number] as readonly [number, number];
    const i = edgeIndex(f, g);
    const j = edgeIndex(x, y);
    const k = (EDGE_FACES[j] as readonly number[]).indexOf(x);
    ep[i] = j;
    eo[i] = (EDGE_FACES[i] as readonly number[])[k] === f ? 0 : 1;
    used.add(j);
  });
  const rest = shuffleInPlace(
    rng,
    Array.from({ length: 12 }, (_, j) => j).filter((j) => !used.has(j)),
  );
  const free: number[] = [];
  for (let i = 0; i < 12; i++) {
    if (ep[i] !== -1) continue;
    ep[i] = rest.pop() as number;
    eo[i] = nextInt(rng, 2);
    free.push(i);
  }
  if (eo.reduce((a, b) => a + b, 0) % 2 === 1) {
    const i = free[0] as number;
    eo[i] = 1 - (eo[i] as number);
  }
  const cp = [...c.cp];
  if (parity(cp) !== parity(ep))
    [cp[0], cp[1]] = [cp[1] as number, cp[0] as number];
  return { cp, co: c.co, ep, eo };
}

function bucketFor(x: number, d: CrossDifficulty): Int32Array[] {
  return d === "le4"
    ? [2, 3, 4].map((k) => keysAtDepth(x, k))
    : [keysAtDepth(x, d as number)];
}

function pickKey(rng: RngState, lists: Int32Array[]): number {
  const total = lists.reduce((s, l) => s + l.length, 0);
  let r = nextInt(rng, total);
  for (const l of lists) {
    if (r < l.length) return l[r] as number;
    r -= l.length;
  }
  throw new Error("빈 목록");
}

function accepts(min: number, d: CrossDifficulty): boolean {
  return d === "le4" ? min >= 2 && min <= 4 : min === d;
}

/** 고른 거리의 조각 상태(수를 고른 어려움). 못 찾으면 오류 */
export function crossCubie(
  colors: readonly number[],
  d: Exclude<CrossDifficulty, "random">,
  seed: number,
): CubieCube {
  const rng = createRng(seed);
  for (const x of colors) crossTable(x);
  const lists = colors.map((x) => bucketFor(x, d));
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    const pick = nextInt(rng, colors.length);
    const x = colors[pick] as number;
    const key = pickKey(rng, lists[pick] as Int32Array[]);
    const c = placeEdges(randomCubie(rng), x, key, rng);
    let min = 99;
    for (const y of colors) {
      const dy = crossTable(y)[cubieCrossKey(c, y)] as number;
      if (dy < min) min = dy;
    }
    if (accepts(min, d)) return c;
  }
  throw new Error("이 조건의 섞기를 찾지 못했습니다");
}

/** 3×3 섞기 글(대회 섞기 방식) */
export function crossScrambleText(
  colors: readonly number[],
  d: CrossDifficulty,
  seed: number,
): string {
  if (d === "random") return officialScramble("333", seed).text;
  return invertAlgorithm(
    solve3x3(cubieToFacelets(crossCubie(colors, d, seed)), { maxLength: 21 }),
  );
}

/** 십자 색이 아래로 가게 쥐는 큐브 돌리기(섞기는 위 흰색·앞 초록으로 쥔 채 한다) */
export const HOLD_DOWN: readonly string[] = ["z2", "z", "x'", "", "z'", "x"];

export interface CrossSolution {
  /** 십자 색 */
  color: number;
  /** 최적 해(지금 쥔 방향의 표기) */
  moves: string;
}

export interface CrossRound {
  scramble: string;
  /** 섞기 뒤 쥐는 큐브 돌리기(「아래에서」) */
  hold: string;
  /** 고른 색마다 최적 수(색 → 수) */
  depths: Partial<Record<number, number>>;
  /** 고른 색 가운데 가장 짧은 최적 수 */
  optimal: number;
  /** 그 수가 나오는 색들 */
  best: number[];
  /** 가장 짧은 색의 최적 해 몇 개(쥔 방향 기준) */
  solutions: CrossSolution[];
}

/** 섞기 글 + 쥐기 → 시작 상태 */
export function roundStart(
  round: Pick<CrossRound, "scramble" | "hold">,
): PuzzleState {
  return applyMoves(
    3,
    solvedCube(3),
    parseMoves(3, `${round.scramble} ${round.hold}`.trim()),
  );
}

export interface CrossRoundRequest {
  colors: readonly number[];
  difficulty: CrossDifficulty;
  seed: number;
  /** 첫 색을 아래로 쥔다 */
  fromBottom: boolean;
}

/** 섞기 글로 한 판을 계산한다(최적 수·해). 「같은 섞기 다시」와 기록 다시 보기에도 쓴다 */
export function analyzeRound(
  scramble: string,
  colors: readonly number[],
  fromBottom: boolean,
  solutionLimit = 4,
): CrossRound {
  const hold = fromBottom ? (HOLD_DOWN[colors[0] as number] as string) : "";
  const start = roundStart({ scramble, hold });
  const depths: Partial<Record<number, number>> = {};
  const keys = new Map<number, { face: number; key: number }>();
  let optimal = 99;
  for (const c of colors) {
    const r = readCross(start, c);
    keys.set(c, r);
    const d = crossTable(r.face)[r.key] as number;
    depths[c] = d;
    if (d < optimal) optimal = d;
  }
  const best = colors.filter((c) => depths[c] === optimal);
  const solutions: CrossSolution[] = [];
  const per = Math.max(1, Math.ceil(solutionLimit / best.length));
  for (const c of best) {
    const r = keys.get(c) as { face: number; key: number };
    for (const s of solveCrossKey(r.face, r.key, { limit: per }))
      solutions.push({ color: c, moves: s.join(" ") });
  }
  return {
    scramble,
    hold,
    depths,
    optimal,
    best,
    solutions: solutions.slice(0, solutionLimit),
  };
}

/** 새 판(워커에서 부른다) */
export function makeCrossRound(req: CrossRoundRequest): CrossRound {
  const text = crossScrambleText(req.colors, req.difficulty, req.seed);
  return analyzeRound(text, req.colors, req.fromBottom);
}
