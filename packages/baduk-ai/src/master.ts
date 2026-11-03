import { nextFloat, nextInt, type RngState } from "@game/mighty-engine";

import { type Color, FastBoard, PASS } from "./fast-board";
import { matchesPattern } from "./patterns";
import { candidateMoves } from "./search";
import { atariMoves, isSelfAtari } from "./tactics";

/*
 * 초고수의 탐색. 고수(`search.ts`)와 같은 몬테카를로 나무 탐색 + RAVE지만 바둑 지식을 더 쓴다(michi·Pachi 방식).
 * - 끝까지 둬 보기(무거운 플레이아웃): 상대 마지막 수 곁의 단수(따내기·달아나기·맞따내기) → 3×3 좋은 모양 →
 *   무작위. 무작위 수도 스스로 단수가 되는 수는 대부분 버린다.
 * - 나무의 사전 지식: 새 마디를 펼칠 때 수마다 "이긴 판·둔 판"을 미리 얹어 둔다. 따내기·달아나기·축으로 잡기(+),
 *   좋은 모양(+), 마지막 수와 가까움(+), 빈 곳의 1·2선(−)·3선(+), 스스로 단수(−), 큰 판 초반의 귀(+).
 * - 결정: 가장 많이 읽은 수. 승률이 거의 같으면 평균 집 차이가 큰 쪽.
 */

export interface MasterOptions {
  /** 맨 위에서 볼 자리(엔진이 허락한 자리) */
  allowed?: readonly number[];
  /** 판세에 따라 목표를 바꾸는 목적 층(기본 켬). 끄면 순수하게 승률만 본다 */
  purpose?: boolean;
}

interface MNode {
  move: number;
  color: Color;
  /** 실제로 둬 본 판 수·이긴 판 수 */
  v: number;
  w: number;
  /** 덤 그대로 셌을 때 이긴 판 수(목표를 바꿔도 실제 승률은 이것) */
  rw: number;
  /** 사전 지식으로 미리 얹은 판 수·이긴 판 수 */
  pv: number;
  pw: number;
  /** RAVE(같은 수를 나중에 둔 판) */
  av: number;
  aw: number;
  /** 이 수를 둔 쪽에서 본 집 차이 합(맨 위에서 결정에 쓴다) */
  margin: number;
  children: MNode[] | null;
}

const PRIOR_EVEN = 10;
const PRIOR_SELF_ATARI = 10;
const PRIOR_CAPTURE_ONE = 15;
const PRIOR_CAPTURE_MANY = 30;
const PRIOR_PATTERN = 10;
const PRIOR_CFG = [24, 22, 8] as const;
const PRIOR_EMPTY_AREA = 10;
const PRIOR_CORNER = 20;
const RAVE_EQUIV = 3500;
const EXPAND_VISITS = 8;
/** 축 읽기에 쓸 판 복사 수: 맨 위는 넉넉히, 나무 안 마디는 조금 */
const ROOT_READS = 2000;
const NODE_READS = 150;
/** 판세 가르기: 실제 승률이 이만큼 넘으면 이기는 중, 이만큼 밑이면 지는 중 */
const AHEAD = 0.8;
const BEHIND = 0.2;
/** 목적에 맞는 수(무리 살리기·잡기·침입)에 얹는 사전 점수 */
const PRIOR_AIM = 20;
/** 이만큼 넘게 질 때만 목표를 낮춰 따라잡을 길을 찾는다 */
const CATCH_UP = 10;

/** 판세: 이기는 중·비슷함·지는 중 */
export type MasterMode = "ahead" | "even" | "behind";

/** 끝까지 둬 보기에서 단수 수·모양 수를 볼 확률, 무작위 한 점 스스로 단수를 버릴 확률 */
const P_CAPTURE = 0.9;
const P_PATTERN = 0.95;
const P_REJECT_SINGLE_SELF_ATARI = 0.5;

function newNode(move: number, color: Color): MNode {
  return {
    move,
    color,
    v: 0,
    w: 0,
    rw: 0,
    pv: PRIOR_EVEN,
    pw: PRIOR_EVEN / 2,
    av: 0,
    aw: 0,
    margin: 0,
    children: null,
  };
}

function urgency(n: MNode): number {
  const v = n.v + n.pv;
  const q = (n.w + n.pw) / v;
  if (n.av === 0) return q;
  const beta = n.av / (n.av + v + (v * n.av) / RAVE_EQUIV);
  return beta * (n.aw / n.av) + (1 - beta) * q;
}

function select(node: MNode): MNode {
  const children = node.children as MNode[];
  let best = children[0] as MNode;
  let bestValue = -Infinity;
  for (const c of children) {
    const u = urgency(c);
    if (u > bestValue) {
      bestValue = u;
      best = c;
    }
  }
  return best;
}

/** 자리의 줄(0이 1선) */
function lineOf(size: number, at: number): number {
  const x = at % size;
  const y = Math.floor(at / size);
  return Math.min(x, y, size - 1 - x, size - 1 - y);
}

/** 맨해튼 거리 `dist` 안에 돌이 하나도 없나 */
function emptyArea(board: FastBoard, at: number, dist: number): boolean {
  const size = board.size;
  const x0 = at % size;
  const y0 = Math.floor(at / size);
  for (let dy = -dist; dy <= dist; dy++) {
    const y = y0 + dy;
    if (y < 0 || y >= size) continue;
    const span = dist - Math.abs(dy);
    for (let dx = -span; dx <= span; dx++) {
      const x = x0 + dx;
      if (x < 0 || x >= size || (dx === 0 && dy === 0)) continue;
      if (board.cells[y * size + x] !== 0) return false;
    }
  }
  return true;
}

/**
 * 큰 판(13줄 이상) 초반의 귀: 둘레 귀 칸(가장자리에서 6줄 안쪽 네모)에 돌이 없고 3·4선 교차점이면.
 * "귀 → 변 → 가운데" 차례를 사전 점수로 일러 준다
 */
function emptyCornerPoint(board: FastBoard, at: number): boolean {
  const size = board.size;
  if (size < 13) return false;
  const x = at % size;
  const y = Math.floor(at / size);
  const lx = Math.min(x, size - 1 - x);
  const ly = Math.min(y, size - 1 - y);
  if (lx < 2 || lx > 3 || ly < 2 || ly > 3) return false;
  const span = size >= 19 ? 6 : 5;
  const x0 = x < size / 2 ? 0 : size - span;
  const y0 = y < size / 2 ? 0 : size - span;
  for (let yy = y0; yy < y0 + span; yy++)
    for (let xx = x0; xx < x0 + span; xx++)
      if (board.cells[yy * size + xx] !== 0) return false;
  return true;
}

/** 마지막 수에서 무리를 한 점으로 본 거리(Common Fate Graph). 3 넘으면 99 */
function cfgDistances(board: FastBoard, from: number, dist: Uint8Array): void {
  dist.fill(99);
  if (from < 0 || board.cells[from] === 0) return;
  const queue: number[] = [];
  board.scanGroup(from);
  for (let i = 0; i < board.groupSize; i++) {
    const s = board.groupStones[i] as number;
    dist[s] = 0;
    queue.push(s);
  }
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head] as number;
    const d = dist[p] as number;
    if (d >= 3) continue;
    for (let k = 0; k < 4; k++) {
      const q = board.neighbor(p, k);
      if (q < 0 || (dist[q] as number) <= d + 1) continue;
      if (board.cells[q] === 0) {
        dist[q] = d + 1;
        queue.push(q);
      } else {
        board.scanGroup(q);
        for (let i = 0; i < board.groupSize; i++) {
          const s = board.groupStones[i] as number;
          dist[s] = d + 1;
          queue.push(s);
        }
      }
    }
  }
}

/** 나무를 펼칠 때 수마다 사전 점수를 얹는다(`board`는 그 수를 두기 전 판) */
function addPriors(
  board: FastBoard,
  children: MNode[],
  cfg: Uint8Array,
  readBudget: number,
): void {
  // 축 읽기 몫은 이 마디 전체가 나눠 쓴다(무리가 많은 중반에 한 수가 튀지 않게)
  const reader = { budget: readBudget, depth: 0 };
  const index = new Map<number, MNode>();
  for (const c of children) index.set(c.move, c);
  // 판 위 모든 무리의 단수·축: 따내기, 달아나기, 맞따내기, 축으로 잡기
  const seen = new Uint8Array(board.n);
  const moves: number[] = [];
  for (let i = 0; i < board.n; i++) {
    if (board.cells[i] === 0 || seen[i]) continue;
    board.scanGroup(i);
    const size = board.groupSize;
    for (let j = 0; j < size; j++) seen[board.groupStones[j] as number] = 1;
    if (board.libCount > 2) continue;
    moves.length = 0;
    atariMoves(board, i, true, moves, reader);
    const bonus = size > 1 ? PRIOR_CAPTURE_MANY : PRIOR_CAPTURE_ONE;
    for (const m of moves) {
      const c = index.get(m);
      if (!c) continue;
      c.pv += bonus;
      c.pw += bonus;
    }
  }
  cfgDistances(board, board.last, cfg);
  const size = board.size;
  for (const c of children) {
    const m = c.move;
    if (matchesPattern(board, m)) {
      c.pv += PRIOR_PATTERN;
      c.pw += PRIOR_PATTERN;
    }
    const d = cfg[m] as number;
    if (d >= 1 && d <= 3) {
      const p = PRIOR_CFG[d - 1] as number;
      c.pv += p;
      c.pw += p;
    }
    const line = lineOf(size, m);
    if (line <= 2 && emptyArea(board, m, 3)) {
      c.pv += PRIOR_EMPTY_AREA;
      if (line === 2) c.pw += PRIOR_EMPTY_AREA;
    }
    if (emptyCornerPoint(board, m)) {
      c.pv += PRIOR_CORNER;
      c.pw += PRIOR_CORNER;
    }
    if (isSelfAtari(board, m)) c.pv += PRIOR_SELF_ATARI;
  }
}

function expand(
  node: MNode,
  board: FastBoard,
  cfg: Uint8Array,
  allowed: ReadonlySet<number> | null,
  reads: number,
): void {
  const color = board.toPlay;
  const moves = candidateMoves(board);
  node.children = (allowed ? moves.filter((m) => allowed.has(m)) : moves).map(
    (m) => newNode(m, color),
  );
  addPriors(board, node.children, cfg, reads);
}

/** 고른 수를 둬도 되나: 둘 수 있고, 내 눈이 아니고, 스스로 단수가 되는 두 점 넘는 무리가 아니다 */
function sane(board: FastBoard, m: number): boolean {
  if (!board.isLegal(m) || board.isEye(m, board.toPlay)) return false;
  return !(
    board.libertiesAfter(m, 2) === 1 && board.hasNeighbor(m, board.toPlay)
  );
}

/** 끝까지 둬 보기의 한 수(무거운 플레이아웃) */
export function heavyMove(
  board: FastBoard,
  rng: RngState,
  empties: Int16Array,
  cand: number[],
): number {
  const last = board.last;
  if (last >= 0) {
    if (nextFloat(rng) < P_CAPTURE) {
      cand.length = 0;
      atariMoves(board, last, false, cand);
      for (let k = 0; k < 4; k++) {
        const q = board.neighbor(last, k);
        if (q >= 0 && board.cells[q] !== 0) atariMoves(board, q, false, cand);
      }
      while (cand.length > 0) {
        const i = nextInt(rng, cand.length);
        const m = cand[i] as number;
        cand[i] = cand[cand.length - 1] as number;
        cand.length--;
        if (sane(board, m)) return m;
      }
    }
    if (nextFloat(rng) < P_PATTERN) {
      cand.length = 0;
      for (let k = 0; k < 4; k++) {
        const q = board.neighbor(last, k);
        if (q >= 0 && board.cells[q] === 0 && matchesPattern(board, q))
          cand.push(q);
        const d = board.diagonal(last, k);
        if (d >= 0 && board.cells[d] === 0 && matchesPattern(board, d))
          cand.push(d);
      }
      while (cand.length > 0) {
        const i = nextInt(rng, cand.length);
        const m = cand[i] as number;
        cand[i] = cand[cand.length - 1] as number;
        cand.length--;
        if (sane(board, m) && board.libertiesAfter(m, 2) >= 2) return m;
      }
    }
  }
  const color = board.toPlay;
  let count = 0;
  for (let i = 0; i < board.n; i++)
    if (board.cells[i] === 0) empties[count++] = i;
  let fallback = PASS;
  while (count > 0) {
    const pick = nextInt(rng, count);
    const at = empties[pick] as number;
    empties[pick] = empties[--count] as number;
    if (board.isEye(at, color) || !board.isLegal(at)) continue;
    if (board.libertiesAfter(at, 2) === 1) {
      // 스스로 단수: 두 점 넘는 무리는 다른 수가 없을 때만, 한 점은 반쯤 버린다(먹여치기·치중은 남긴다)
      if (
        board.hasNeighbor(at, color) ||
        nextFloat(rng) < P_REJECT_SINGLE_SELF_ATARI
      ) {
        if (fallback === PASS) fallback = at;
        continue;
      }
    }
    return at;
  }
  return fallback;
}

/** 끝까지 둬 본다. 자리마다 처음 둔 색·때를 남긴다(RAVE). 흑 − 백 − 덤 점수 */
function heavyPlayout(
  board: FastBoard,
  komi: number,
  rng: RngState,
  empties: Int16Array,
  cand: number[],
  firstColor: Uint8Array,
  firstStep: Int16Array,
  start: number,
): number {
  const limit = board.n * 3;
  let stepNo = start;
  for (let i = 0; i < limit && board.passes < 2; i++) {
    const at = heavyMove(board, rng, empties, cand);
    if (at >= 0 && firstColor[at] === 0) {
      firstColor[at] = board.toPlay;
      firstStep[at] = stepNo;
    }
    stepNo++;
    board.play(at);
  }
  return board.score(komi);
}

export interface MasterResult {
  move: number;
  /** 고른 수의 승률(둔 쪽) */
  winRate: number;
  /** 고른 수의 평균 집 차이(둔 쪽, 덤 포함) */
  margin: number;
  /** 판세 */
  mode: MasterMode;
  /** 목표로 더한 집(+ 안전 여유, − 따라잡기) */
  shift: number;
  stats: { move: number; visits: number; winRate: number; margin: number }[];
  /** 자리마다 흑 것이 될 몫 −1(백)~1(흑) */
  ownership: Float32Array;
}

/** 초고수의 나무 탐색. `playouts`판을 둬 보고 고른다(같은 시드면 같은 수) */
export function masterSearch(
  root: FastBoard,
  komi: number,
  playouts: number,
  rng: RngState,
  options: MasterOptions = {},
): MasterResult {
  const me = root.toPlay;
  const n = root.n;
  const cfg = new Uint8Array(n);
  const top = newNode(PASS, me === 1 ? 2 : 1);
  const allowed = options.allowed ? new Set(options.allowed) : null;
  expand(top, root, cfg, allowed, ROOT_READS);
  const children = top.children as MNode[];
  const ownAcc = new Int32Array(n);
  if (children.length === 0)
    return {
      move: PASS,
      winRate: 0,
      margin: 0,
      mode: "even",
      shift: 0,
      stats: [],
      ownership: new Float32Array(n),
    };

  const board = new FastBoard(root.size);
  const empties = new Int16Array(n);
  const cand: number[] = [];
  const firstColor = new Uint8Array(n);
  const firstStep = new Int16Array(n);
  const path: MNode[] = [];

  // 목적: 판세를 보고 목표를 바꾼다(michi에 없는 부분, Pachi의 dynamic komi와 비슷하다).
  // shift는 "내가 이 집만큼 더 이겨야 이긴 것으로 센다". 이기고 있으면 +(안전 여유), 지고 있으면 −(따라잡을 길)
  let shift = 0;
  let mode: MasterMode = "even";
  let aimed = false;
  const purpose = options.purpose ?? true;
  const checkpoints = new Set(
    [0.2, 0.45, 0.7].map((f) => Math.floor(playouts * f)),
  );

  for (let i = 0; i < playouts; i++) {
    if (purpose && i > 0 && checkpoints.has(i)) {
      const judged = judge(children);
      mode = judged.mode;
      if (mode === "ahead")
        shift = Math.max(shift, Math.floor(judged.lead / 2));
      else if (mode === "behind" && judged.lead <= -CATCH_UP)
        // 크게 질 때만 목표를 낮춘다. 차이가 작으면 진짜 승리만 본다(반 집 지는 것을 이긴 것으로 세면 조용히 진다)
        shift = Math.min(shift, -Math.floor(-judged.lead / 2));
      if (!aimed) {
        aimPriors(root, children, ownAcc, i, mode);
        aimed = true;
      }
    }
    board.copyFrom(root);
    firstColor.fill(0);
    path.length = 0;
    let node = top;
    path.push(node);
    let stepNo = 0;
    while (node.children && node.children.length > 0) {
      node = select(node);
      if (firstColor[node.move] === 0) {
        firstColor[node.move] = node.color;
        firstStep[node.move] = stepNo;
      }
      stepNo++;
      board.play(node.move);
      path.push(node);
      if (node.children === null && node.v >= EXPAND_VISITS)
        expand(node, board, cfg, null, NODE_READS);
    }
    const score = heavyPlayout(
      board,
      komi,
      rng,
      empties,
      cand,
      firstColor,
      firstStep,
      stepNo,
    );
    board.addOwnership(ownAcc);
    // 이긴 쪽은 목표(덤 + 안전 여유 `shift`)로 가린다. 실제 승패는 따로 센다
    const winner: Color = score - (me === 1 ? shift : -shift) > 0 ? 1 : 2;
    const realWinner: Color = score > 0 ? 1 : 2;
    for (let d = 0; d < path.length; d++) {
      const p = path[d] as MNode;
      p.v++;
      if (p.color === winner) p.w++;
      if (p.color === realWinner) p.rw++;
      p.margin += p.color === 1 ? score : -score;
      if (!p.children) continue;
      for (const c of p.children) {
        if (firstColor[c.move] !== c.color || (firstStep[c.move] as number) < d)
          continue;
        c.av++;
        if (c.color === winner) c.aw++;
      }
    }
  }

  // 가장 많이 읽은 수. 승률이 거의 같고(2% 안) 충분히 읽은 수 가운데 평균 집 차이가 크면 그쪽
  let best = children[0] as MNode;
  for (const c of children) if (c.v > best.v) best = c;
  const rate = (c: MNode) => (c.v > 0 ? c.w / c.v : 0);
  const mean = (c: MNode) => (c.v > 0 ? c.margin / c.v : 0);
  let pick = best;
  for (const c of children)
    if (
      c !== best &&
      c.v >= best.v * 0.5 &&
      rate(c) >= rate(best) - 0.02 &&
      mean(c) > mean(pick) + 0.5
    )
      pick = c;
  const ownership = new Float32Array(n);
  for (let i = 0; i < n; i++) ownership[i] = (ownAcc[i] as number) / playouts;
  const real = (c: MNode) => (c.v > 0 ? c.rw / c.v : 0);
  return {
    move: pick.move,
    winRate: real(pick),
    margin: mean(pick),
    mode: purpose ? judge(children).mode : "even",
    shift,
    stats: children.map((c) => ({
      move: c.move,
      visits: c.v,
      winRate: real(c),
      margin: mean(c),
    })),
    ownership,
  };
}

/** 판세: 가장 많이 읽은 수의 실제 승률과 평균 집 차이(둔 쪽)로 가린다 */
function judge(children: readonly MNode[]): { mode: MasterMode; lead: number } {
  let best = children[0] as MNode;
  for (const c of children) if (c.v > best.v) best = c;
  if (best.v === 0) return { mode: "even", lead: 0 };
  const rate = best.rw / best.v;
  const lead = best.margin / best.v;
  if (rate >= AHEAD && lead > 0) return { mode: "ahead", lead };
  if (rate <= BEHIND && lead < 0) return { mode: "behind", lead };
  return { mode: "even", lead };
}

/**
 * 판세에 맞춰 맨 위 수에 사전 점수를 더 얹는다. 흔들리는 무리(돌 셋 이상, 끝에 누구 것이 될지 반반에 가까운 무리)를 본다.
 * - 이기고 있으면: 내 흔들리는 무리의 활로(살리기)
 * - 지고 있으면: 상대 흔들리는 무리의 활로(잡으러 가기)와 아직 굳지 않은 상대 땅(삭감·침입)
 * - 비슷하면: 양쪽 흔들리는 무리의 활로(급한 곳 먼저)
 */
function aimPriors(
  root: FastBoard,
  children: readonly MNode[],
  ownAcc: Int32Array,
  count: number,
  mode: MasterMode,
): void {
  const me = root.toPlay;
  const sign = me === 1 ? 1 : -1;
  const mine = (p: number) => ((ownAcc[p] as number) / count) * sign;
  const bonus = new Float32Array(root.n);
  const seen = new Uint8Array(root.n);
  for (let i = 0; i < root.n; i++) {
    const color = root.cells[i];
    if (color === 0 || seen[i]) continue;
    root.scanGroup(i);
    let sum = 0;
    for (let j = 0; j < root.groupSize; j++) {
      const s = root.groupStones[j] as number;
      seen[s] = 1;
      sum += mine(s);
    }
    if (root.groupSize < 3) continue;
    // 이 무리 편에서 본 몫
    const own = (sum / root.groupSize) * (color === me ? 1 : -1);
    if (own > 0.6 || own < -0.5) continue;
    const ours = color === me;
    const weight =
      mode === "even"
        ? PRIOR_AIM / 2
        : (mode === "ahead") === ours
          ? PRIOR_AIM
          : 0;
    if (weight === 0) continue;
    for (let j = 0; j < root.libCount; j++) {
      const l = root.groupLibs[j] as number;
      bonus[l] = Math.max(bonus[l] as number, weight);
    }
  }
  if (mode === "behind")
    for (let p = 0; p < root.n; p++) {
      const o = mine(p);
      if (
        root.cells[p] === 0 &&
        o < -0.3 &&
        o > -0.8 &&
        lineOf(root.size, p) >= 2
      )
        bonus[p] = Math.max(bonus[p] as number, PRIOR_AIM / 2);
    }
  for (const c of children) {
    const b = bonus[c.move] as number;
    c.pv += b;
    c.pw += b;
  }
}
