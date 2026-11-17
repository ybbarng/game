/*
 * 넷과 열린 셋으로 몰아붙이기 읽기(수 배우기 「열린 셋으로 몰아붙이기」 문제의 확인용, docs/20 7절).
 * `threats.ts`는 넷만 읽는다. 여기서는 공격하는 쪽이 둘 때마다 "위협"을 만들면 된다:
 * - 넷: 다음에 다섯 자리가 생긴다. 막는 쪽은 그 자리를 막아야 한다.
 * - 셋 위협: 다음에 막을 수 없는 자리(다섯 자리가 둘 이상 생기거나, 막는 쪽에게 금지라 못 막는 다섯 자리가 생기는 자리,
 *   열린 넷·4·4·4·3을 두는 곳)가 생긴다. 열린 셋이 대표이고, 막힌 셋 둘이 한 점에서 만나는 모양도 같다.
 * 막는 쪽의 응수는 빠짐없이 본다: 다섯 자리 막기, 막을 수 없는 자리를 모두 없애는 자리, 자기 넷으로 버티기.
 * 그 밖의 응수는 다음 수에 바로 지므로 볼 필요가 없다. 그래서 "위협만으로 n수 안에 이기나"를 정확히 답한다.
 * 위협은 판에 남은 것으로 판정한다(막는 쪽이 넷으로 버텨 공격하는 쪽이 막은 뒤에도 앞서 만든 셋이 살아 있으면 계속 위협이다).
 * 컴퓨터의 읽기(`omok-ai/threat.ts`)는 노드 수로 끊어 "못 찾음"으로 넘기지만, 여기서는 상한을 넘으면 오류를 낸다
 * (문제 확인이 조용히 틀리지 않게).
 */
import { forbiddenReason, needsExactFive, other, type Stone } from "./board";
import { CELLS, SIZE, type Variant } from "./rules";

type Work = (0 | 1 | 2)[];

const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;
const REACH = 5;
const SPAN = 2 * REACH + 1;

/** 자리마다 방향(0~3)·거리(-5~5)로 간 자리. 판 밖이면 -1 */
const STEP = (() => {
  const table = new Int16Array(CELLS * 4 * SPAN);
  for (let at = 0; at < CELLS; at++)
    for (let d = 0; d < 4; d++) {
      const [dx, dy] = DIRS[d] as readonly [number, number];
      for (let k = -REACH; k <= REACH; k++) {
        const x = (at % SIZE) + k * dx;
        const y = Math.floor(at / SIZE) + k * dy;
        table[(at * 4 + d) * SPAN + k + REACH] =
          x < 0 || x >= SIZE || y < 0 || y >= SIZE ? -1 : y * SIZE + x;
      }
    }
  return table;
})();

function step(at: number, d: number, k: number): number {
  return STEP[(at * 4 + d) * SPAN + k + REACH] as number;
}

/** 읽기가 너무 길어 끝까지 못 읽었다(문제 장면이 이 읽기에 맞지 않는다) */
export class ThreatReadLimit extends Error {
  constructor() {
    super("열린 셋 몰아붙이기 읽기가 상한을 넘었어요.");
  }
}

/** 한 번 읽을 때 볼 수 있는 판 수. 문제 장면은 이보다 훨씬 적게 쓴다 */
const NODE_LIMIT = 400_000;

/** 빈칸 `q`에 `s`를 두면 방향 `d` 줄에서 다섯이 되나 */
function fiveInDir(
  b: Work,
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

/** `at`을 지나는 방향 `d` 줄에서 네 칸 안 `s` 돌 수(상대 돌을 넘지 않는다) */
function nearCount(b: Work, at: number, d: number, s: Stone): number {
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

function busyLine(b: Work, at: number, s: Stone, least: number): boolean {
  for (let d = 0; d < 4; d++) if (nearCount(b, at, d, s) >= least) return true;
  return false;
}

/**
 * 금지 수일 수도 있나. 3·3·4·4·장목은 두 줄에 내 돌이 둘 이상씩 있거나 한 줄에 넷 이상 있어야 생긴다.
 * 엔진 금지 판정이 무거워 거짓이면 건너뛴다(답은 같다)
 */
function mayBeForbidden(b: Work, at: number, s: Stone): boolean {
  let busy = 0;
  for (let d = 0; d < 4; d++) {
    let count = 0;
    for (let sign = -1; sign <= 1; sign += 2)
      for (let k = 1; k <= 5; k++) {
        const n = step(at, d, sign * k);
        if (n < 0) break;
        const v = b[n];
        if (v === s) count++;
        else if (v !== 0) break;
      }
    if (count >= 4) return true;
    if (count >= 2 && ++busy >= 2) return true;
  }
  return false;
}

function canPlay(b: Work, at: number, s: Stone, v: Variant): boolean {
  return (
    b[at] === 0 &&
    (!mayBeForbidden(b, at, s) || forbiddenReason(b, at, s, v) === null)
  );
}

/** `s`가 두면 바로 다섯이 되는 빈칸(다섯은 금지가 아니다) */
function fives(b: Work, s: Stone, v: Variant): number[] {
  const exact = needsExactFive(v, s);
  const found: number[] = [];
  for (let q = 0; q < CELLS; q++) {
    if (b[q] !== 0 || !busyLine(b, q, s, 4)) continue;
    for (let d = 0; d < 4; d++)
      if (fiveInDir(b, q, d, s, exact)) {
        found.push(q);
        break;
      }
  }
  return found;
}

/** 방금 `e`에 둔 `s` 돌을 지나는 줄에 생긴 다섯 자리(서로 다른 칸) */
function fivesThrough(b: Work, e: number, s: Stone, exact: boolean): number[] {
  const seen: number[] = [];
  for (let d = 0; d < 4; d++)
    for (let k = -4; k <= 4; k++) {
      if (k === 0) continue;
      const q = step(e, d, k);
      if (q < 0 || b[q] !== 0 || seen.includes(q)) continue;
      if (fiveInDir(b, q, d, s, exact)) seen.push(q);
    }
  return seen;
}

interface Ctx {
  b: Work;
  v: Variant;
  a: Stone;
  d: Stone;
  exactA: boolean;
  exactD: boolean;
  nodes: number;
  memo: Map<string, boolean>;
}

function context(board: readonly (0 | 1 | 2)[], a: Stone, v: Variant): Ctx {
  return {
    b: [...board] as Work,
    v,
    a,
    d: other(a),
    exactA: needsExactFive(v, a),
    exactD: needsExactFive(v, other(a)),
    nodes: 0,
    memo: new Map(),
  };
}

/**
 * 공격하는 쪽에게 다섯 자리가 없을 때, `e`가 막을 수 없는 자리인가:
 * 두면 다섯 자리가 둘 이상 생기거나, 막는 쪽이 금지라 못 막는 다섯 자리가 생긴다(그리고 `e`가 금지가 아니다)
 */
function isWinPoint(ctx: Ctx, e: number): boolean {
  const { b, a, d, v } = ctx;
  if (b[e] !== 0 || !busyLine(b, e, a, 3)) return false;
  b[e] = a;
  const made = fivesThrough(b, e, a, ctx.exactA);
  const strong =
    made.length >= 2 ||
    (made.length === 1 && !canPlay(b, made[0] as number, d, v));
  b[e] = 0;
  return strong && canPlay(b, e, a, v);
}

function winPoints(ctx: Ctx): number[] {
  const found: number[] = [];
  for (let e = 0; e < CELLS; e++) if (isWinPoint(ctx, e)) found.push(e);
  return found;
}

/** 방금 둔 `e`를 지나는 줄(네 칸 안)에 막을 수 없는 자리가 생겼나 */
function winPointNear(ctx: Ctx, e: number): boolean {
  for (let d = 0; d < 4; d++)
    for (let k = -4; k <= 4; k++) {
      const w = step(e, d, k);
      if (k !== 0 && w >= 0 && isWinPoint(ctx, w)) return true;
    }
  return false;
}

/** 공격하는 쪽이 둘 위협 수: 넷 먼저, `threes`면 셋 위협도. 자리 번호 순 */
function attackMoves(ctx: Ctx, threes: boolean): number[] {
  const { b, a, v } = ctx;
  const fours: number[] = [];
  const three: number[] = [];
  for (let e = 0; e < CELLS; e++) {
    if (b[e] !== 0 || !busyLine(b, e, a, 2)) continue;
    b[e] = a;
    const four = fivesThrough(b, e, a, ctx.exactA).length > 0;
    const threat = !four && threes && winPointNear(ctx, e);
    b[e] = 0;
    if ((four || threat) && canPlay(b, e, a, v)) (four ? fours : three).push(e);
  }
  return [...fours, ...three];
}

/** 공격하는 쪽 차례. 위협만으로 `n`수(공격하는 쪽 수, 마지막 다섯 포함) 안에 이기나 */
function attack(ctx: Ctx, n: number): boolean {
  if (++ctx.nodes > NODE_LIMIT) throw new ThreatReadLimit();
  const { b, a, d, v } = ctx;
  if (fives(b, a, v).length > 0) return true;
  if (n <= 1) return false;
  const key = `${b.join("")}${n}`;
  const known = ctx.memo.get(key);
  if (known !== undefined) return known;
  const theirs = fives(b, d, v);
  let result = false;
  if (theirs.length < 2) {
    const moves =
      theirs.length === 1
        ? theirs.filter((at) => canPlay(b, at, a, v))
        : attackMoves(ctx, n >= 3);
    result = moves.some((m) => afterAttack(ctx, m, n));
  }
  ctx.memo.set(key, result);
  return result;
}

/** 공격하는 쪽이 `m`에 둔 뒤, 막는 쪽의 모든 응수에도 남은 수 안에 이기나 */
function afterAttack(ctx: Ctx, m: number, n: number): boolean {
  const { b, a } = ctx;
  b[m] = a;
  try {
    const replies = repliesNow(ctx, n, m);
    if (replies === "win") return true;
    if (replies === "lost") return false;
    for (const r of replies) {
      b[r] = ctx.d;
      const ok = attack(ctx, n - 1);
      b[r] = 0;
      if (!ok) return false;
    }
    return true;
  } finally {
    b[m] = 0;
  }
}

/**
 * 공격하는 쪽이 방금 둔 판에서 막는 쪽의 응수. `n`은 방금 둔 수를 포함한 남은 수.
 * "win": 막을 길이 없다(이미 다섯이거나 응수가 없다), "lost": 위협이 아니거나 막는 쪽이 먼저 다섯
 */
function repliesNow(
  ctx: Ctx,
  n: number,
  placed: number | null,
): number[] | "win" | "lost" {
  const { b, a, d, v } = ctx;
  if (placed !== null)
    for (let k = 0; k < 4; k++)
      if (lineLength(b, placed, k, a, ctx.exactA)) return "win";
  if (fives(b, d, v).length > 0) return "lost";
  const mine = fives(b, a, v);
  if (mine.length >= 2) return n >= 2 ? "win" : "lost";
  if (mine.length === 1) {
    const block = mine[0] as number;
    if (!canPlay(b, block, d, v)) return n >= 2 ? "win" : "lost";
    return n >= 2 ? [block] : "lost";
  }
  if (n < 3) return "lost";
  const wins = winPoints(ctx);
  if (wins.length === 0) return "lost";
  const replies = defenses(ctx, wins);
  return replies.length === 0 ? "win" : replies;
}

/** `q`의 `s` 돌을 지나는 방향 `k` 줄이 이긴 줄인가 */
function lineLength(
  b: Work,
  q: number,
  k: number,
  s: Stone,
  exact: boolean,
): boolean {
  let len = 1;
  for (let j = 1; j <= REACH; j++) {
    const n = step(q, k, j);
    if (n < 0 || b[n] !== s) break;
    len++;
  }
  for (let j = 1; j <= REACH; j++) {
    const n = step(q, k, -j);
    if (n < 0 || b[n] !== s) break;
    len++;
  }
  return exact ? len === 5 : len >= 5;
}

/**
 * 막는 쪽의 응수: 막을 수 없는 자리(`wins`)를 모두 없애는 자리 + 자기 넷으로 버티는 자리. 자리 번호 순.
 * 없애는 자리는 그 자리들을 지나는 줄의 네 칸 안에만 있다(그 밖의 돌은 그 자리의 다섯 자리 수를 바꾸지 못한다)
 */
function defenses(ctx: Ctx, wins: readonly number[]): number[] {
  const { b, d, v } = ctx;
  const near = new Set<number>();
  for (const w of wins)
    for (let dir = 0; dir < 4; dir++)
      for (let k = -4; k <= 4; k++) {
        const c = step(w, dir, k);
        if (c >= 0 && b[c] === 0) near.add(c);
      }
  const found = new Set<number>();
  for (const c of near) {
    if (!canPlay(b, c, d, v)) continue;
    b[c] = d;
    const killed = wins.every((w) => !isWinPoint(ctx, w));
    b[c] = 0;
    if (killed) found.add(c);
  }
  for (let c = 0; c < CELLS; c++) {
    if (found.has(c) || b[c] !== 0 || !busyLine(b, c, d, 3)) continue;
    b[c] = d;
    const four = fivesThrough(b, c, d, ctx.exactD).length > 0;
    b[c] = 0;
    if (four && canPlay(b, c, d, v)) found.add(c);
  }
  return [...found].sort((p, q) => p - q);
}

/** `stone`이 둘 차례에 넷과 셋 위협만으로 `moves`수(내 수, 마지막 다섯 포함) 안에 이기나 */
export function winsByThreats(
  board: readonly (0 | 1 | 2)[],
  stone: Stone,
  variant: Variant,
  moves: number,
): boolean {
  return attack(context(board, stone, variant), moves);
}

/** 위협만으로 `moves`수 안에 이기는 첫 수들(바로 다섯 포함). 자리 번호 순 */
export function threatWinFirstMoves(
  board: readonly (0 | 1 | 2)[],
  stone: Stone,
  variant: Variant,
  moves: number,
): number[] {
  const ctx = context(board, stone, variant);
  const { b, a, d, v } = ctx;
  const five = fives(b, a, v);
  if (five.length > 0 || moves <= 1) return five;
  const theirs = fives(b, d, v);
  if (theirs.length >= 2) return [];
  const tries =
    theirs.length === 1
      ? theirs.filter((at) => canPlay(b, at, a, v))
      : attackMoves(ctx, moves >= 3);
  return tries.filter((m) => afterAttack(ctx, m, moves)).sort((p, q) => p - q);
}

/** 위협만으로 이기는 가장 짧은 수(내 수). `max`수 안에 없으면 null */
export function threatWinLength(
  board: readonly (0 | 1 | 2)[],
  stone: Stone,
  variant: Variant,
  max: number,
): number | null {
  const ctx = context(board, stone, variant);
  for (let n = 1; n <= max; n++) if (attack(ctx, n)) return n;
  return null;
}

/**
 * `attacker`가 방금 둔 판에서 막는 쪽이 둘 수 있는 응수(다섯 자리 막기, 막을 수 없는 자리를 없애는 자리, 자기 넷).
 * 위협이 아니면 빈 배열
 */
export function threatReplies(
  board: readonly (0 | 1 | 2)[],
  attacker: Stone,
  variant: Variant,
): number[] {
  const ctx = context(board, attacker, variant);
  const replies = repliesNow(ctx, 3, null);
  return Array.isArray(replies) ? replies : [];
}

/** `stone`이 지금 두면 셋 위협이 되는가(넷은 아니고, 다음에 막을 수 없는 자리가 생긴다) */
export function makesThreeThreat(
  board: readonly (0 | 1 | 2)[],
  at: number,
  stone: Stone,
  variant: Variant,
): boolean {
  const ctx = context(board, stone, variant);
  const { b } = ctx;
  if (b[at] !== 0) return false;
  b[at] = stone;
  const four = fivesThrough(b, at, stone, ctx.exactA).length > 0;
  const threat = !four && winPointNear(ctx, at);
  b[at] = 0;
  return threat;
}

/** 셋 위협이 만든 막을 수 없는 자리들(공격하는 쪽이 방금 둔 판, 다섯 자리가 없을 때) */
export function winPointsOf(
  board: readonly (0 | 1 | 2)[],
  attacker: Stone,
  variant: Variant,
): number[] {
  const ctx = context(board, attacker, variant);
  if (fives(ctx.b, attacker, variant).length > 0) return [];
  return winPoints(ctx);
}
