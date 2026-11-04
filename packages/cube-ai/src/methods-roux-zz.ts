import { FACES, type Face } from "@game/cube-solver";
import type { PuzzleState } from "@game/puzzle-core";
import { CPLL, OCLL, PLL } from "./algs";
import { cornerCoord, edgeCoord } from "./cubie";
import { toFacelets } from "./facelets";
import { applyMatch, lowerSolved, topOriented } from "./ll";
import {
  CENTER_OFFSET,
  chunkHeuristic,
  moveSet,
  type PieceMove,
  pdb,
  pieceSearch,
  type SearchSpec,
} from "./piece-search";
import type { Tracked } from "./search";
import { type HumanSolve, Solve, type StageName, yTurn } from "./solve";

/**
 * 루(Roux)·ZZ 사람 흉내 해법(3×3, docs/47 8-2). 단계마다 사람이 하는 일을 그대로 둔다.
 *
 * - 루: 첫 블록(왼쪽 1×2×3) → 둘째 블록(오른쪽, R·r·M·U만) → CMLL(위 꼭짓점, 여기서는 2단계:
 *   방향 7가지 + 자리 2가지) → LSE(EO → 왼쪽·오른쪽 위 모서리 → 가운데 줄 모서리, M·U만).
 * - ZZ: EO라인(모서리 방향 + 아래 앞·뒤 모서리) → 왼쪽·오른쪽 블록(R·U·L만) → 윗면(EO가 이미
 *   맞아 꼭짓점 7가지) → PLL.
 *
 * 블록·EO·LSE 단계는 작은 탐색(`piece-search.ts`)으로 가장 짧은 수를 찾는다. 사람이 「짧게」
 * 두는 것을 흉내 낸 것이고, 같은 상태면 늘 같은 수가 나온다.
 */

const c = (piece: number): Tracked => ({ kind: "c", piece });
const e = (piece: number): Tracked => ({ kind: "e", piece });

// 자리 번호(cubie.ts): 꼭짓점 DFR 4, DLF 5, DBL 6, DRB 7 / 모서리 DR 4, DF 5, DL 6, DB 7, FR 8, FL 9, BL 10, BR 11
const LEFT_SQUARES = [
  [e(6), c(5), e(9)],
  [e(6), c(6), e(10)],
];
const LEFT_PAIRS = [
  [c(6), e(10)],
  [c(5), e(9)],
];
const RIGHT_SQUARES = [
  [e(4), c(4), e(8)],
  [e(4), c(7), e(11)],
];
const RIGHT_PAIRS = [
  [c(7), e(11)],
  [c(4), e(8)],
];
const LEFT_BLOCK = [e(6), e(9), e(10), c(5), c(6)];
const RIGHT_BLOCK = [e(4), e(8), e(11), c(4), c(7)];

const OUTER = moveSet("URFDLB");
const FB_MOVES = moveSet("URFDLBM");
const SB_MOVES = moveSet("URrM");
const LSE_MOVES = moveSet("UM");
const RUL_MOVES = moveSet("RUL");
const Y_TURNS = [0, 1, 2, 3].map(yTurn);

function coords(s: Solve, tracked: readonly Tracked[]): number[] {
  const cb = s.cubie();
  return tracked.map((t) =>
    t.kind === "c" ? cornerCoord(cb, t.piece) : edgeCoord(cb, t.piece),
  );
}

/** 가운데 층이 돈 만큼(위 가운데 자리에 무엇이 와 있나) */
function centerOf(s: Solve): number {
  return CENTER_OFFSET.indexOf(s.rel()[4] as (typeof CENTER_OFFSET)[number]);
}

function piecesHome(s: Solve, tracked: readonly Tracked[]): boolean {
  const cb = s.cubie();
  return tracked.every((t) =>
    t.kind === "c"
      ? cb.cp[t.piece] === t.piece && cb.co[t.piece] === 0
      : cb.ep[t.piece] === t.piece && cb.eo[t.piece] === 0,
  );
}

interface Candidate {
  /** 먼저 둘 큐브 돌리기(y 등) */
  pre: string;
  spec: (t: Solve) => SearchSpec;
}

/**
 * 후보(돌려 쥐기 × 조각 묶음) 가운데 가장 짧게 끝나는 것을 길이 0부터 함께 찾아 둔다.
 * 사람이 살펴보기에서 쉬운 쪽을 고르는 것과 같다.
 */
function bestOf(s: Solve, cands: readonly Candidate[], maxDepth = 20): void {
  const ready = cands.map((cand) => {
    const t = s.clone().apply(cand.pre);
    return { pre: cand.pre, spec: cand.spec(t) };
  });
  for (let d = 0; d <= maxDepth; d++) {
    for (const { pre, spec } of ready) {
      const path = pieceSearch(spec, { depth: d });
      if (path) {
        s.apply(pre);
        if (path.length > 0) s.apply(path.join(" "));
        return;
      }
    }
  }
  throw new Error("블록을 찾지 못했다");
}

/** 지켜볼 조각이 모두 제자리가 되게(앞에 둔 것도 지킨다) */
function blockSpec(
  tracked: readonly Tracked[],
  moves: readonly PieceMove[],
): (t: Solve) => SearchSpec {
  const h = chunkHeuristic(tracked, moves);
  return (t) => ({ tracked, start: coords(t, tracked), moves, h });
}

/** 사각형(1×2×2) 후보 둘 중 쉬운 쪽 → 남은 짝. 고른 사각형 번호를 돌려준다 */
function squareThenPair(
  s: Solve,
  keep: readonly Tracked[],
  squares: readonly Tracked[][],
  pairs: readonly Tracked[][],
  moves: readonly PieceMove[],
  turns: readonly string[] = [""],
): void {
  const cands: Candidate[] = [];
  const which: number[] = [];
  for (const pre of turns)
    squares.forEach((sq, i) => {
      cands.push({ pre, spec: blockSpec([...keep, ...sq], moves) });
      which.push(i);
    });
  // 어느 후보가 이겼는지는 지금 상태로 다시 본다(이긴 사각형은 이미 맞아 있다)
  bestOf(s, cands);
  const i = squares.findIndex((sq) => piecesHome(s, [...keep, ...sq]));
  const pair = pairs[i < 0 ? 0 : i] as Tracked[];
  const tracked = [...keep, ...(squares[i < 0 ? 0 : i] as Tracked[]), ...pair];
  bestOf(s, [{ pre: "", spec: blockSpec(tracked, moves) }]);
}

function finish(s: Solve): HumanSolve {
  if (!s.isSolved()) throw new Error("다 맞추지 못했다");
  return s.result();
}

/** 흰 가운데를 아래로(첫 수가 z2 같은 큐브 돌리기) */
function whiteDown(s: Solve): void {
  for (const r of ["", "z2", "x", "x'", "z", "z'"]) {
    const t = s.clone().apply(r);
    if (t.f[31] === "U") {
      s.apply(r);
      return;
    }
  }
  throw new Error("흰 가운데를 찾지 못했다");
}

// ---------- 루 ----------

/** 루는 가운데 층을 돌리므로 처음 가운데 색을 기준 방향으로 고정한다 */
function startFramed(state: PuzzleState): Solve {
  const f = toFacelets(3, state);
  const frame = FACES.map((_, k) => f[k * 9 + 4] as Face);
  return new Solve(3, f, frame);
}

const blocksOk = (t: Solve) => piecesHome(t, [...LEFT_BLOCK, ...RIGHT_BLOCK]);

/** CMLL(2단계): 위 꼭짓점 방향(공식 7가지) → 자리(2가지). 두 블록을 지킨다 */
function cmll(s: Solve): void {
  applyMatch(s, OCLL, (t) => {
    const cb = t.cubie();
    return blocksOk(t) && [0, 1, 2, 3].every((i) => cb.co[i] === 0);
  });
  applyMatch(
    s,
    CPLL,
    (t) => {
      const cb = t.cubie();
      return blocksOk(t) && cb.cp.every((p, i) => p === i && cb.co[i] === 0);
    },
    true,
  );
}

// LSE가 보는 조각: 위 모서리 넷(UR UF UL UB), 아래 앞·뒤(DF DB), 꼭짓점 하나(윗면 돌리기를 보려고)
const LSE_TRACKED = [e(0), e(1), e(2), e(3), e(5), e(7), c(0)];
const LSE_HOME = [0, 2, 4, 6, 10, 14, 0];

/** EO: 여섯 모서리의 흰·노랑(없으면 초록·파랑) 칸이 위아래를 보고, 가운데도 위아래에 흰·노랑 */
export const lseEoDone = (x: Int8Array, center: number) =>
  center % 2 === 0 &&
  [0, 1, 2, 3, 4, 5].every((i) => (x[i] as number) % 2 === 0);

const ulurDone = (x: Int8Array, center: number) =>
  lseEoDone(x, center) &&
  x[0] === LSE_HOME[0] &&
  x[2] === LSE_HOME[2] &&
  x[6] === LSE_HOME[6];

const lseSolved = (x: Int8Array, center: number) =>
  center === 0 && LSE_HOME.every((h, i) => x[i] === h);

function lse(s: Solve): void {
  const full = chunkHeuristic(LSE_TRACKED, LSE_MOVES);
  const ulur = pdb([e(0), e(2), c(0)], LSE_MOVES);
  const ulurH = (x: Int8Array) =>
    ulur[
      (x[0] as number) + 24 * (x[2] as number) + 576 * (x[6] as number)
    ] as number;
  const steps: [StageName, NonNullable<SearchSpec["goal"]>, SearchSpec["h"]][] =
    [
      ["lse-eo", lseEoDone, () => 0],
      ["lse-ulur", ulurDone, ulurH],
      ["lse-ep", lseSolved, full],
    ];
  for (const [name, goal, h] of steps) {
    s.look();
    const path = pieceSearch(
      {
        tracked: LSE_TRACKED,
        start: coords(s, LSE_TRACKED),
        center: centerOf(s),
        moves: LSE_MOVES,
        h,
        goal,
      },
      { maxDepth: 20 },
    );
    if (!path) throw new Error(`${name} 단계를 찾지 못했다`);
    if (path.length > 0) s.apply(path.join(" "));
    s.stage(name);
  }
}

/** 3×3 루: 첫 블록 → 둘째 블록 → CMLL → LSE */
export function solveRoux(state: PuzzleState): HumanSolve {
  const s = startFramed(state);
  whiteDown(s);
  squareThenPair(s, [], LEFT_SQUARES, LEFT_PAIRS, FB_MOVES, Y_TURNS);
  s.stage("fb");
  squareThenPair(s, [], RIGHT_SQUARES, RIGHT_PAIRS, SB_MOVES);
  s.stage("sb");
  cmll(s);
  s.stage("cmll");
  lse(s);
  return finish(s);
}

// ---------- ZZ ----------

const EDGES = Array.from({ length: 12 }, (_, i) => e(i));
const DF_HOME = 10;
const DB_HOME = 14;

let eoTable: Uint8Array | null = null;

/** 모서리 방향(자리마다 뒤집힘 12비트)의 거리 표. F·B 4분의 1 돌리기만 방향을 바꾼다 */
function eoDistances(): Uint8Array {
  if (eoTable) return eoTable;
  const dist = new Uint8Array(4096).fill(255);
  const queue: number[] = [0];
  dist[0] = 0;
  for (let head = 0; head < queue.length; head++) {
    const bits = queue[head] as number;
    for (const m of OUTER) {
      let next = 0;
      for (let slot = 0; slot < 12; slot++) {
        const to = m.edge[slot * 2 + ((bits >> slot) & 1)] as number;
        next |= (to & 1) << (to >> 1);
      }
      if (dist[next] === 255) {
        dist[next] = (dist[bits] as number) + 1;
        queue.push(next);
      }
    }
  }
  eoTable = dist;
  return dist;
}

function eoBits(x: Int8Array): number {
  let bits = 0;
  for (let i = 0; i < 12; i++) {
    const v = x[i] as number;
    bits |= (v & 1) << (v >> 1);
  }
  return bits;
}

/** EO라인 조건: 모서리 열둘이 모두 바른 방향, 아래 앞·뒤 모서리 제자리 */
export const eoLineDone = (x: Int8Array) =>
  eoBits(x) === 0 && x[5] === DF_HOME && x[7] === DB_HOME;

function eoLineSpec(t: Solve): SearchSpec {
  const eo = eoDistances();
  const line = pdb([e(5), e(7)], OUTER);
  return {
    tracked: EDGES,
    start: coords(t, EDGES),
    moves: OUTER,
    h: (x) =>
      Math.max(
        eo[eoBits(x)] as number,
        line[(x[5] as number) + 24 * (x[7] as number)] as number,
      ),
    goal: eoLineDone,
  };
}

const f2lOk = (t: Solve) => lowerSolved(t.rel(), 3);
const PLL_ALGS = PLL.map(([, alg]) => alg);

/** 3×3 ZZ: EO라인 → 왼쪽 블록 → 오른쪽 블록(R·U·L만) → 윗면(꼭짓점 7가지) → PLL */
export function solveZZ(state: PuzzleState): HumanSolve {
  const s = new Solve(3, toFacelets(3, state));
  whiteDown(s);
  bestOf(
    s,
    Y_TURNS.map((pre) => ({ pre, spec: eoLineSpec })),
  );
  s.stage("eoline");
  squareThenPair(s, [], LEFT_SQUARES, LEFT_PAIRS, RUL_MOVES);
  s.stage("zz-left");
  squareThenPair(s, LEFT_BLOCK, RIGHT_SQUARES, RIGHT_PAIRS, RUL_MOVES);
  s.stage("zz-right");
  applyMatch(s, OCLL, (t) => f2lOk(t) && topOriented(t.rel(), 3));
  s.stage("oll");
  applyMatch(s, PLL_ALGS, (t) => t.isSolved(), true);
  s.stage("pll");
  return finish(s);
}
