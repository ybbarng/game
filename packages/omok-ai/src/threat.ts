/*
 * 위협으로 몰아 이기는 길 읽기(초고수, docs/20 9절).
 * 공격하는 쪽이 둘 때마다 사(다음에 다섯)나 열린 삼(다음에 막을 수 없는 사)을 만들면,
 * 막는 쪽은 그 위협을 끊는 몇 자리나 자기 사로 버티는 수밖에 없다. 그래서 응수가 좁아져 깊이 읽을 수 있다.
 * - 사만 쓰면 VCF(사 몰아붙이기), 열린 삼까지 쓰면 VCT라 부른다.
 * - 판정은 "판에 남은 위협"으로 한다: 막는 쪽이 사로 버텨 공격하는 쪽이 막은 뒤에도 앞서 만든 삼이 살아 있으면 계속 위협이다.
 * - 읽는 양은 노드 수로 끊는다(기기 속도와 상관없이 같은 판에서 늘 같은 답). 끊기면 "못 찾음"으로 본다.
 */
import {
  CELLS,
  type Cell,
  needsExactFive,
  other,
  SIZE,
  type Stone,
  type Variant,
} from "@game/omok-engine";

import { allowed } from "./common";
import { placeGain } from "./shape";

const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;

/** 판 크기(가져온 값을 지역 값으로 두어 시험 실행기에서도 빠르게 읽는다) */
const N = SIZE;
const ALL = CELLS;
const REACH = 5;
const SPAN = 2 * REACH + 1;

/** 자리마다 방향(0~3)·거리(-5~5)로 간 자리. 판 밖이면 -1 */
const STEP = (() => {
  const table = new Int16Array(ALL * 4 * SPAN);
  for (let at = 0; at < ALL; at++)
    for (let d = 0; d < 4; d++) {
      const [dx, dy] = DIRS[d] as readonly [number, number];
      for (let k = -REACH; k <= REACH; k++) {
        const x = (at % N) + k * dx;
        const y = Math.floor(at / N) + k * dy;
        table[(at * 4 + d) * SPAN + k + REACH] =
          x < 0 || x >= N || y < 0 || y >= N ? -1 : y * N + x;
      }
    }
  return table;
})();

/** `at`에서 방향 `d`로 `k`칸 간 자리. 판 밖이면 -1 */
function step(at: number, d: number, k: number): number {
  return STEP[(at * 4 + d) * SPAN + k + REACH] as number;
}

/** 빈칸 `q`에 `s`를 두면 (dx, dy) 줄에서 다섯이 되나 */
function fiveInDir(
  b: Cell[],
  q: number,
  d: number,
  s: Stone,
  exact: boolean,
): boolean {
  let len = 1;
  for (let k = 1; k <= REACH; k++) {
    const n = step(q, d, k);
    if (n < 0 || b[n] !== s) break;
    len++;
  }
  for (let k = 1; k <= REACH; k++) {
    const n = step(q, d, -k);
    if (n < 0 || b[n] !== s) break;
    len++;
  }
  return exact ? len === 5 : len >= 5;
}

function makesFive(b: Cell[], q: number, s: Stone, exact: boolean): boolean {
  for (let d = 0; d < 4; d++) if (fiveInDir(b, q, d, s, exact)) return true;
  return false;
}

/** 금지가 아니면 둘 수 있다 */
export function canPlay(
  b: Cell[],
  at: number,
  s: Stone,
  variant: Variant,
): boolean {
  return b[at] === 0 && allowed(b, at, s, variant);
}

/** `at`을 지나는 (dx, dy) 줄에서 네 칸 안 `s` 돌 수(상대 돌을 넘지 않는다) */
function nearCount(b: Cell[], at: number, d: number, s: Stone) {
  let count = 0;
  for (let sign = -1; sign <= 1; sign += 2)
    for (let k = 1; k <= 4; k++) {
      const n = step(at, d, sign * k);
      if (n < 0) break;
      const v = b[n];
      if (v === s) count++;
      else if (v !== 0) break;
    }
  return count;
}

/** `s`가 두면 바로 다섯이 되는 빈칸(다섯은 금지가 아니다) */
export function fivePoints(b: Cell[], s: Stone, variant: Variant): number[] {
  const exact = needsExactFive(variant, s);
  const found: number[] = [];
  for (let q = 0; q < ALL; q++)
    if (b[q] === 0 && makesFive(b, q, s, exact)) found.push(q);
  return found;
}

/** 빈칸 `e`에 `s`를 두면 `e`를 지나는 줄에 생기는 다섯 자리 수(서로 다른 칸) */
function newFives(b: Cell[], e: number, s: Stone, exact: boolean): number {
  b[e] = s;
  const seen: number[] = [];
  for (let d = 0; d < 4; d++)
    for (let k = -4; k <= 4; k++) {
      if (k === 0) continue;
      const q = step(e, d, k);
      if (q < 0 || b[q] !== 0 || seen.includes(q)) continue;
      if (fiveInDir(b, q, d, s, exact)) seen.push(q);
    }
  b[e] = 0;
  return seen.length;
}

/** 두면 다섯 자리가 둘 이상 생기는(막을 수 없는) 빈칸들. 열린 사·사사 자리. 금지 자리는 뺀다 */
export function winPoints(b: Cell[], s: Stone, variant: Variant): number[] {
  const exact = needsExactFive(variant, s);
  const found: number[] = [];
  for (let e = 0; e < ALL; e++) {
    if (b[e] !== 0) continue;
    let hopeful = false;
    for (let d = 0; d < 4; d++)
      if (nearCount(b, e, d, s) >= 3) {
        hopeful = true;
        break;
      }
    if (!hopeful || newFives(b, e, s, exact) < 2) continue;
    if (canPlay(b, e, s, variant)) found.push(e);
  }
  return found;
}

/** 두면 사가 되는(다섯 자리가 생기는) 빈칸들. 금지 자리는 뺀다 */
export function fourPoints(b: Cell[], s: Stone, variant: Variant): number[] {
  const exact = needsExactFive(variant, s);
  const found: number[] = [];
  for (let e = 0; e < ALL; e++) {
    if (b[e] !== 0) continue;
    let hopeful = false;
    for (let d = 0; d < 4; d++)
      if (nearCount(b, e, d, s) >= 3) {
        hopeful = true;
        break;
      }
    if (!hopeful || newFives(b, e, s, exact) < 1) continue;
    if (canPlay(b, e, s, variant)) found.push(e);
  }
  return found;
}

/** 두면 열린 삼이 되는(다음에 막을 수 없는 사를 둘 자리가 생기는) 빈칸들. 사 자리는 뺀다 */
export function threePoints(b: Cell[], s: Stone, variant: Variant): number[] {
  const exact = needsExactFive(variant, s);
  const found: number[] = [];
  for (let e = 0; e < ALL; e++) {
    if (b[e] !== 0) continue;
    let three = false;
    b[e] = s;
    for (let d = 0; d < 4; d++) {
      if (nearCount(b, e, d, s) < 2) continue;
      for (let k = -4; k <= 4 && !three; k++) {
        const w = step(e, d, k);
        if (k === 0 || w < 0 || b[w] !== 0) continue;
        b[w] = s;
        let fives = 0;
        for (let j = -4; j <= 4; j++) {
          const q = step(w, d, j);
          if (j !== 0 && q >= 0 && b[q] === 0 && fiveInDir(b, q, d, s, exact))
            fives++;
        }
        b[w] = 0;
        if (fives >= 2) three = true;
      }
      if (three) break;
    }
    b[e] = 0;
    if (three && newFives(b, e, s, exact) === 0 && canPlay(b, e, s, variant))
      found.push(e);
  }
  return found;
}

export interface ThreatBudget {
  /** 읽을 수 있는 노드 수 */
  limit: number;
  nodes: number;
}

interface Ctx {
  b: Cell[];
  variant: Variant;
  a: Stone;
  d: Stone;
  /** 열린 삼도 쓰나(아니면 사만) */
  threes: boolean;
  budget: ThreatBudget;
}

function spent(ctx: Ctx): boolean {
  return ++ctx.budget.nodes > ctx.budget.limit;
}

/** 공격 수 순서: 사 먼저, 그다음 열린 삼. 같은 무리 안에서는 모양 점수 높은 순 */
function attackMoves(ctx: Ctx, n: number): number[] {
  const { b, a, d, variant } = ctx;
  const order = (list: number[]) =>
    list
      .map((at) => ({
        at,
        score: placeGain(b, at, a) + placeGain(b, at, d),
      }))
      .sort((p, q) => q.score - p.score || p.at - q.at)
      .map((m) => m.at);
  const fours = order(fourPoints(b, a, variant));
  if (!ctx.threes || n < 3) return fours;
  return [...fours, ...order(threePoints(b, a, variant))];
}

/** 공격하는 쪽 차례. `n`수(공격하는 쪽 수, 마지막 다섯 포함) 안에 이기나 */
function attack(ctx: Ctx, n: number): boolean {
  if (spent(ctx)) return false;
  const { b, a, d, variant } = ctx;
  if (fivePoints(b, a, variant).length > 0) return true;
  if (n <= 1) return false;
  const theirs = fivePoints(b, d, variant);
  if (theirs.length >= 2) return false;
  const moves =
    theirs.length === 1
      ? theirs.filter((at) => canPlay(b, at, a, variant))
      : attackMoves(ctx, n);
  for (const m of moves) if (afterAttack(ctx, m, n)) return true;
  return false;
}

/** 공격하는 쪽이 `m`에 둔 뒤, 막는 쪽의 모든 응수에도 남은 수 안에 이기나 */
function afterAttack(ctx: Ctx, m: number, n: number): boolean {
  const { b, a, d, variant } = ctx;
  const exactA = needsExactFive(variant, a);
  b[m] = a;
  try {
    if (makesFiveAt(b, m, a, exactA)) return true;
    if (fivePoints(b, d, variant).length > 0) return false;
    const mine = fivePoints(b, a, variant);
    if (mine.length >= 2) return true;
    let replies: number[];
    if (mine.length === 1) {
      const block = mine[0] as number;
      if (!canPlay(b, block, d, variant)) return true;
      replies = [block];
    } else {
      if (!ctx.threes || n < 3) return false;
      const wins = winPoints(b, a, variant);
      if (wins.length === 0) return false;
      replies = defenses(ctx, wins);
      if (replies.length === 0) return true;
    }
    const exactD = needsExactFive(variant, d);
    for (const r of replies) {
      b[r] = d;
      const ok = !makesFiveAt(b, r, d, exactD) && attack(ctx, n - 1);
      b[r] = 0;
      if (!ok) return false;
    }
    return true;
  } finally {
    b[m] = 0;
  }
}

/** 방금 `at`에 둔 돌이 다섯을 이뤘나 */
function makesFiveAt(b: Cell[], at: number, s: Stone, exact: boolean) {
  b[at] = 0;
  const five = makesFive(b, at, s, exact);
  b[at] = s;
  return five;
}

/**
 * 막는 쪽의 응수: 막을 수 없는 사 자리(`wins`)를 모두 없애는 자리 + 자기 사로 버티는 자리.
 * 없애는 자리는 그 자리들을 지나는 줄의 네 칸 안에서 찾는다
 */
function defenses(ctx: Ctx, wins: number[]): number[] {
  const { b, a, d, variant } = ctx;
  const exactA = needsExactFive(variant, a);
  const near = new Set<number>();
  for (const w of wins) {
    near.add(w);
    for (let d = 0; d < 4; d++)
      for (let k = -4; k <= 4; k++) {
        const c = step(w, d, k);
        if (c >= 0 && b[c] === 0) near.add(c);
      }
  }
  const found: number[] = [];
  for (const c of [...near].sort((p, q) => p - q)) {
    b[c] = d;
    const killed = wins.every(
      (w) => b[w] !== 0 || newFives(b, w, a, exactA) < 2,
    );
    b[c] = 0;
    if (killed && canPlay(b, c, d, variant)) found.push(c);
  }
  for (const f of fourPoints(b, d, variant))
    if (!found.includes(f)) found.push(f);
  return found;
}

/**
 * `a`가 둘 차례에 위협으로 몰아 이기는 첫 수. 없으면(또는 노드가 다하면) null.
 * 짧은 길부터 찾는다(`maxMoves`: 공격하는 쪽 수, 마지막 다섯 포함)
 */
export function threatWin(
  board: readonly Cell[],
  a: Stone,
  variant: Variant,
  maxMoves: number,
  threes: boolean,
  budget: ThreatBudget,
): number | null {
  const ctx: Ctx = {
    b: [...board],
    variant,
    a,
    d: other(a),
    threes,
    budget,
  };
  const b = ctx.b;
  const five = fivePoints(b, a, variant)[0];
  if (five !== undefined) return five;
  const theirs = fivePoints(b, ctx.d, variant);
  if (theirs.length >= 2) return null;
  for (let n = 2; n <= maxMoves; n++) {
    const moves =
      theirs.length === 1
        ? theirs.filter((at) => canPlay(b, at, a, variant))
        : attackMoves(ctx, n);
    for (const m of moves) {
      if (budget.nodes > budget.limit) return null;
      if (afterAttack(ctx, m, n)) return m;
    }
  }
  return null;
}

/** `a`가 둘 차례에 위협으로 몰아 이기는 길이 있나 */
export function hasThreatWin(
  board: readonly Cell[],
  a: Stone,
  variant: Variant,
  maxMoves: number,
  threes: boolean,
  budget: ThreatBudget,
): boolean {
  return threatWin(board, a, variant, maxMoves, threes, budget) !== null;
}
