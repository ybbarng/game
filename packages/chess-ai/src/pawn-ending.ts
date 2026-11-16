/*
 * 킹과 폰만 남은 판(퀸·룩·마이너 없음, 편마다 폰 셋 이하)을 끝까지 읽어 승패를 "증명"하는 판정.
 * 바깥 패스 폰 문제(docs/26 6절)가 "이기는 수가 하나뿐"인지 확인하는 데 쓴다.
 *
 * 두 가지 물음에 답한다(`PawnEndingSolver`). 둘 다 정해진 걸음(반수) 안에서 끝나는 증명만 참으로 낸다.
 * - `wins`·`winsAfter`: 백이 이긴다고 증명되나(흑이 무엇을 두든 백이 이기는 끝에 닿는다)
 * - `holds`·`holdsAfter`: 백이 이기지 못한다고 증명되나(흑이 비김이나 흑 승리로 끌고 갈 수 있다)
 * 둘 다 거짓이면 "모른다"이고, 그런 판은 문제로 쓰지 않는다. 걸음이 모자라 증명을 못 해도 거짓이 될 뿐 틀린 참은 내지 않는다.
 * 반복(같은 판 세 번)과 50수 규칙은 보지 않는다. 걸음 안에서 끝나는 증명은 같은 판을 되풀이하지 않고도 세울 수 있다.
 *
 * 끝(증명이 닫히는 곳):
 * - 백 폰이 없으면 백은 이길 수 없다
 * - 흑 폰이 없고 백 폰이 하나면 킹+폰 대 킹 승패표(`kpk.ts`)
 * - 둘 수가 없으면 체크일 때 짐(메이트), 아니면 비김(스테일메이트)
 * - 폰이 퀸이 되면 "퀸을 얻은 쪽이 이긴다"로 바로 정하지 않는다(퀸 대 7번째 줄 폰은 비기기도 한다).
 *   상대의 다음 한 수를 모두 본다: 새 퀸을 잡으면 킹과 폰 판으로 돌아가 계속 읽고,
 *   잡지 못하면 상대 폰이 없을 때(퀸+킹 대 킹, 퀸 쪽 차례면 늘 이긴다)나
 *   상대 폰이 둘 이하이고 모두 자기 4번째 줄 이하(퀸이 될 때까지 네 수 이상 남음)일 때만 퀸 쪽 승리로 본다.
 *   뒤의 것은 끝까지 읽은 증명이 아니라 널리 알려진 끝내기 지식에 기댄 보수적인 판정이다(퀸이 비기는 판은
 *   상대 폰이 7번째 줄, 드물게 6번째 줄까지 올라와 킹이 돕는 경우다). 그 밖은 모른다. 퀸 말고 다른 기물로 바꾸는 수는 백에게 더 나을 수 있으므로, 백이 이기지 못한다는 증명에는
 *   "흑이 새 기물을 바로 잡는다"만 쓴다(어떤 기물로 바꿔도 같은 칸에서 잡힌다)
 * 같은 판은 기억해 다시 읽지 않는다(증명된 것은 늘, 증명 못 한 것은 읽은 걸음 수와 함께).
 * 칸 번호는 엔진과 같다(y*8+x, a8=0·h1=63). 백 폰은 y가 줄어드는 쪽(끝줄 y=0), 흑 폰은 늘어나는 쪽(끝줄 y=7)으로 간다.
 */

import type { Board } from "@game/chess-engine";

import { kpkWins } from "./kpk";

/** 킹과 폰만 남은 판. stm 0은 백 차례. ep는 앙파상으로 잡을 칸(없으면 -1) */
export interface PawnEnding {
  wk: number;
  bk: number;
  wp: readonly number[];
  bp: readonly number[];
  stm: 0 | 1;
  ep: number;
}

/** 한 수 둔 뒤: 보통 판, 또는 폰이 끝줄에 닿아 퀸이 된 판(`queen`은 그 칸, `after`는 폰을 뺀 판·상대 차례) */
export type PawnEndingNext =
  | { kind: "pos"; pos: PawnEnding; from: number; to: number }
  | {
      kind: "promote";
      side: 0 | 1;
      queen: number;
      after: PawnEnding;
      from: number;
      to: number;
    };

const MAX_PAWNS = 3;

const X = (i: number) => i & 7;
const Y = (i: number) => i >> 3;
const near = (a: number, b: number) =>
  Math.max(Math.abs(X(a) - X(b)), Math.abs(Y(a) - Y(b))) <= 1;

const KING_STEPS: number[][] = Array.from({ length: 64 }, (_, i) => {
  const out: number[] = [];
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const x = X(i) + dx;
      const y = Y(i) + dy;
      if (x >= 0 && x < 8 && y >= 0 && y < 8) out.push(y * 8 + x);
    }
  return out;
});

/** 이 편 폰들이 칸 t를 노리나. 백 폰은 y-1 쪽 대각선, 흑 폰은 y+1 쪽 */
function pawnsAttack(
  pawns: readonly number[],
  side: 0 | 1,
  t: number,
): boolean {
  for (const p of pawns) {
    if (Math.abs(X(p) - X(t)) !== 1) continue;
    if (side === 0 ? Y(t) === Y(p) - 1 : Y(t) === Y(p) + 1) return true;
  }
  return false;
}

/** 퀸(q)이 칸 t를 노리나. occupied는 막는 칸(퀸 자신 제외) */
function queenAttacks(
  q: number,
  t: number,
  occupied: (i: number) => boolean,
): boolean {
  if (q === t) return false;
  const dx = Math.sign(X(t) - X(q));
  const dy = Math.sign(Y(t) - Y(q));
  const ax = Math.abs(X(t) - X(q));
  const ay = Math.abs(Y(t) - Y(q));
  if (!(ax === 0 || ay === 0 || ax === ay)) return false;
  let x = X(q) + dx;
  let y = Y(q) + dy;
  while (x !== X(t) || y !== Y(t)) {
    if (occupied(y * 8 + x)) return false;
    x += dx;
    y += dy;
  }
  return true;
}

const without = (list: readonly number[], v: number) =>
  list.filter((p) => p !== v);
const replaced = (list: readonly number[], from: number, to: number) =>
  list.map((p) => (p === from ? to : p)).sort((a, b) => a - b);

/** 둘 차례인 편의 킹이 상대 폰에게 체크를 받고 있나 */
function inCheck(s: PawnEnding): boolean {
  return s.stm === 0 ? pawnsAttack(s.bp, 1, s.wk) : pawnsAttack(s.wp, 0, s.bk);
}

/** 두 칸 나간 폰 옆에 잡을 상대 폰이 있을 때만 앙파상 칸을 둔다(같은 판이 같은 열쇠가 되게) */
function epAfter(from: number, to: number, enemy: readonly number[]): number {
  if (Math.abs(to - from) !== 16) return -1;
  const beside = enemy.some(
    (p) => Y(p) === Y(to) && Math.abs(X(p) - X(to)) === 1,
  );
  return beside ? (from + to) / 2 : -1;
}

/** 둘 수 있는 모든 수. 끝줄에 닿는 폰은 퀸이 되는 수 하나로 센다 */
export function pawnEndingMoves(s: PawnEnding): PawnEndingNext[] {
  const white = s.stm === 0;
  const me = white ? s.wk : s.bk;
  const foe = white ? s.bk : s.wk;
  const mine = white ? s.wp : s.bp;
  const theirs = white ? s.bp : s.wp;
  const side = s.stm;
  const foeSide = (1 - side) as 0 | 1;
  const step = white ? -8 : 8;
  const lastRank = white ? 0 : 7;
  const startRank = white ? 6 : 1;
  const out: PawnEndingNext[] = [];
  const make = (
    k: number,
    my: readonly number[],
    their: readonly number[],
    ep: number,
  ): PawnEnding =>
    white
      ? { wk: k, bk: foe, wp: my, bp: their, stm: 1, ep }
      : { wk: foe, bk: k, wp: their, bp: my, stm: 0, ep };
  const occupied = (i: number) =>
    i === me || i === foe || mine.includes(i) || theirs.includes(i);

  for (const to of KING_STEPS[me] ?? []) {
    if (mine.includes(to) || near(to, foe)) continue;
    const their = theirs.includes(to) ? without(theirs, to) : theirs;
    if (pawnsAttack(their, foeSide, to)) continue;
    out.push({ kind: "pos", pos: make(to, mine, their, -1), from: me, to });
  }
  const checked = pawnsAttack(theirs, foeSide, me);
  for (const p of mine) {
    const tryMove = (to: number, their: readonly number[]) => {
      // 폰 수 뒤 내 킹이 상대 폰에게 체크를 받으면 안 된다(킹과 폰만 있어 가려진 공격은 없다)
      if (checked && pawnsAttack(their, foeSide, me)) return;
      if (Y(to) === lastRank) {
        out.push({
          kind: "promote",
          side,
          queen: to,
          after: make(me, without(mine, p), their, -1),
          from: p,
          to,
        });
        return;
      }
      const my = replaced(mine, p, to);
      out.push({
        kind: "pos",
        pos: make(me, my, their, epAfter(p, to, their)),
        from: p,
        to,
      });
    };
    const one = p + step;
    if (!occupied(one)) {
      tryMove(one, theirs);
      const two = p + 2 * step;
      if (Y(p) === startRank && !occupied(two)) tryMove(two, theirs);
    }
    for (const dx of [-1, 1]) {
      if (X(p) + dx < 0 || X(p) + dx > 7) continue;
      const to = one + dx;
      if (theirs.includes(to)) tryMove(to, without(theirs, to));
      else if (to === s.ep) tryMove(to, without(theirs, to - step));
    }
  }
  return out;
}

/** 판 열쇠(숫자 하나). 폰은 편마다 셋까지 */
function keyOf(s: PawnEnding): number {
  let k = s.stm * 9 + (s.ep < 0 ? 0 : X(s.ep) + 1);
  k = (k * 64 + s.wk) * 64 + s.bk;
  for (let i = 0; i < MAX_PAWNS; i++) k = k * 65 + ((s.wp[i] ?? -1) + 1);
  for (let i = 0; i < MAX_PAWNS; i++) k = k * 65 + ((s.bp[i] ?? -1) + 1);
  return k;
}

/** 폰이 둘 이하이고 모두 자기 4번째 줄 이하인가(퀸이 될 때까지 네 수 이상 남음) */
const allFar = (pawns: readonly number[], side: 0 | 1) =>
  pawns.length <= 2 && pawns.every((p) => (side === 0 ? Y(p) >= 4 : Y(p) <= 3));

/**
 * 퀸이 된 직후 상대 차례. 상대가 둘 수 있는 수를 모두 센다(퀸의 길은 킹·폰이 막는다)
 * 돌려주는 것: 새 퀸을 잡는 수는 그 뒤 킹과 폰 판, 아닌 수는 그 뒤 상대 폰 목록과 상대가 퀸이 되었는지
 */
function repliesToQueen(
  after: PawnEnding,
  queen: number,
):
  | {
      capture: PawnEnding | null;
      others: { pawns: readonly number[]; promotes: boolean }[];
    }
  | "mate"
  | "stalemate" {
  // after.stm이 받는 편(상대). 퀸은 반대편 것
  const white = after.stm === 0;
  const me = white ? after.wk : after.bk;
  const foeKing = white ? after.bk : after.wk;
  const mine = white ? after.wp : after.bp;
  const theirs = white ? after.bp : after.wp;
  const side = after.stm;
  const foeSide = (1 - side) as 0 | 1;
  const step = white ? -8 : 8;
  const lastRank = white ? 0 : 7;
  const startRank = white ? 6 : 1;
  /** 내 킹이 칸 k에 있고 내 폰이 my일 때 공격받나(퀸이 잡혔으면 퀸 빼고) */
  const attackedAt = (
    k: number,
    my: readonly number[],
    their: readonly number[],
    queenAlive: boolean,
  ) => {
    if (near(k, foeKing)) return true;
    if (pawnsAttack(their, foeSide, k)) return true;
    if (!queenAlive) return false;
    const occ = (i: number) =>
      i === k || i === foeKing || my.includes(i) || their.includes(i);
    return queenAttacks(queen, k, occ);
  };
  let capture: PawnEnding | null = null;
  const others: { pawns: readonly number[]; promotes: boolean }[] = [];
  for (const to of KING_STEPS[me] ?? []) {
    if (mine.includes(to) || to === foeKing) continue;
    const their = theirs.includes(to) ? without(theirs, to) : theirs;
    const takesQueen = to === queen;
    if (attackedAt(to, mine, their, !takesQueen)) continue;
    if (takesQueen)
      capture = white
        ? { wk: to, bk: foeKing, wp: mine, bp: their, stm: 1, ep: -1 }
        : { wk: foeKing, bk: to, wp: their, bp: mine, stm: 0, ep: -1 };
    else others.push({ pawns: mine, promotes: false });
  }
  const occupied = (i: number) =>
    i === me ||
    i === foeKing ||
    i === queen ||
    mine.includes(i) ||
    theirs.includes(i);
  for (const p of mine) {
    const tryMove = (to: number, their: readonly number[]) => {
      const my = replaced(mine, p, to);
      if (attackedAt(me, my, their, true)) return;
      others.push({
        pawns: Y(to) === lastRank ? without(mine, p) : my,
        promotes: Y(to) === lastRank,
      });
    };
    const one = p + step;
    if (!occupied(one)) {
      tryMove(one, theirs);
      const two = p + 2 * step;
      if (Y(p) === startRank && !occupied(two)) tryMove(two, theirs);
    }
    for (const dx of [-1, 1]) {
      if (X(p) + dx < 0 || X(p) + dx > 7) continue;
      const to = one + dx;
      // 폰이 퀸을 잡는 일은 없다(퀸은 상대 끝줄, 폰은 그쪽으로 잡지 못한다)
      if (theirs.includes(to)) tryMove(to, without(theirs, to));
    }
  }
  if (!capture && others.length === 0)
    return attackedAt(me, mine, theirs, true) ? "mate" : "stalemate";
  return { capture, others };
}

/** 퀸이 된 칸을 상대 킹이 바로 잡을 수 있나(어떤 기물로 바꿔도 같다). 잡을 수 있으면 그 뒤 판 */
function captureOfPromoted(
  after: PawnEnding,
  queen: number,
): PawnEnding | null {
  const white = after.stm === 0;
  const me = white ? after.wk : after.bk;
  const foeKing = white ? after.bk : after.wk;
  const theirs = white ? after.bp : after.wp;
  if (!near(me, queen) || near(queen, foeKing)) return null;
  if (pawnsAttack(theirs, (1 - after.stm) as 0 | 1, queen)) return null;
  return white
    ? { ...after, wk: queen, stm: 1, ep: -1 }
    : { ...after, bk: queen, stm: 0, ep: -1 };
}

export class PawnEndingSolver {
  private winYes = new Set<number>();
  private winNo = new Map<number, number>();
  private holdYes = new Set<number>();
  private holdNo = new Map<number, number>();
  /** 읽은 판 수(시험·조사용) */
  nodes = 0;
  /** 흑 폰이 없고 백 폰이 하나일 때 승패표로 끝낼까(시험에서 끄고 읽은 결과를 표와 맞춰 본다) */
  private useKpk: boolean;
  /** 퀸이 된 뒤 상대 폰이 모두 멀면 퀸 쪽 승리로 볼까(끄면 상대 폰이 없을 때만 퀸 쪽 승리) */
  private farRule: boolean;

  constructor(options: { kpk?: boolean; farRule?: boolean } = {}) {
    this.useKpk = options.kpk ?? true;
    this.farRule = options.farRule ?? true;
  }

  /** 백이 이긴다고 plies 걸음 안에 증명되나 */
  wins(s: PawnEnding, plies: number): boolean {
    if (s.wp.length === 0) return false;
    if (this.useKpk && s.bp.length === 0 && s.wp.length === 1)
      return kpkWins(s.stm, s.wk, s.bk, s.wp[0] as number);
    if (plies <= 0) return false;
    const key = keyOf(s);
    if (this.winYes.has(key)) return true;
    if ((this.winNo.get(key) ?? -1) >= plies) return false;
    this.nodes++;
    const moves = order(pawnEndingMoves(s), s);
    let result: boolean;
    if (s.stm === 0) result = moves.some((m) => this.winsAfter(m, plies - 1));
    else if (moves.length === 0) result = inCheck(s);
    else result = moves.every((m) => this.winsAfter(m, plies - 1));
    if (result) this.winYes.add(key);
    else this.winNo.set(key, plies);
    return result;
  }

  /** 백이 이기지 못한다고 plies 걸음 안에 증명되나(비김이나 백이 짐) */
  holds(s: PawnEnding, plies: number): boolean {
    if (s.wp.length === 0) return true;
    if (this.useKpk && s.bp.length === 0 && s.wp.length === 1)
      return !kpkWins(s.stm, s.wk, s.bk, s.wp[0] as number);
    if (plies <= 0) return false;
    const key = keyOf(s);
    if (this.holdYes.has(key)) return true;
    if ((this.holdNo.get(key) ?? -1) >= plies) return false;
    this.nodes++;
    const moves = order(pawnEndingMoves(s), s);
    let result: boolean;
    if (s.stm === 0) result = moves.every((m) => this.holdsAfter(m, plies - 1));
    else if (moves.length === 0) result = !inCheck(s);
    else result = moves.some((m) => this.holdsAfter(m, plies - 1));
    if (result) this.holdYes.add(key);
    else this.holdNo.set(key, plies);
    return result;
  }

  /** 이 수를 둔 뒤 백이 이긴다고 증명되나 */
  winsAfter(m: PawnEndingNext, plies: number): boolean {
    if (m.kind === "pos") return this.wins(m.pos, plies);
    if (m.side === 1) {
      // 흑이 퀸이 됐다: 백이 바로 잡는 길만 믿는다
      const cap = captureOfPromoted(m.after, m.queen);
      return cap !== null && this.wins(cap, plies - 1);
    }
    const replies = repliesToQueen(m.after, m.queen);
    if (replies === "mate") return true;
    if (replies === "stalemate") return false;
    if (replies.capture && !this.wins(replies.capture, plies - 1)) return false;
    return replies.others.every(
      (o) =>
        !o.promotes &&
        (o.pawns.length === 0 || (this.farRule && allFar(o.pawns, 1))),
    );
  }

  /** 이 수를 둔 뒤 백이 이기지 못한다고 증명되나 */
  holdsAfter(m: PawnEndingNext, plies: number): boolean {
    if (m.kind === "pos") return this.holds(m.pos, plies);
    if (m.side === 0) {
      // 백이 퀸(이나 다른 기물)이 됐다: 흑이 바로 잡는 길만 믿는다
      const cap = captureOfPromoted(m.after, m.queen);
      return cap !== null && this.holds(cap, plies - 1);
    }
    const replies = repliesToQueen(m.after, m.queen);
    if (replies === "mate" || replies === "stalemate") return true;
    if (replies.capture && !this.holds(replies.capture, plies - 1))
      return false;
    return replies.others.every(
      (o) =>
        !o.promotes &&
        (o.pawns.length === 0 || (this.farRule && allFar(o.pawns, 0))),
    );
  }
}

/** 이 편 폰 p가 패스 폰인가(앞쪽 같은·옆 세로줄에 상대 폰이 없다) */
function passed(p: number, side: 0 | 1, enemy: readonly number[]): boolean {
  return enemy.every(
    (e) =>
      Math.abs(X(e) - X(p)) > 1 || (side === 0 ? Y(e) >= Y(p) : Y(e) <= Y(p)),
  );
}

/**
 * 먼저 볼 수: 퀸 되기, 폰 잡기, 패스 폰 밀기, 상대 폰에 가까워지는 킹 수, 다른 폰 밀기.
 * 차례는 증명이 참인지 거짓인지를 바꾸지 않고 빨리 찾게만 한다
 */
function order(moves: PawnEndingNext[], s: PawnEnding): PawnEndingNext[] {
  const pawns = s.wp.length + s.bp.length;
  const king = s.stm === 0 ? s.wk : s.bk;
  const targets = s.stm === 0 ? s.bp : s.wp;
  const rank = (m: PawnEndingNext) => {
    if (m.kind === "promote") return 0;
    if (m.pos.wp.length + m.pos.bp.length < pawns) return 1;
    if (m.from !== king) return passed(m.from, s.stm, targets) ? 2 : 4;
    // 킹 수는 상대 폰에 가까워지는 것부터
    let d = 8;
    for (const p of targets)
      d = Math.min(
        d,
        Math.max(Math.abs(X(p) - X(m.to)), Math.abs(Y(p) - Y(m.to))),
      );
    return 3 + d / 10;
  };
  // 수가 열 개 안팎이라 점수를 한 번씩만 세고 끼워 넣기로 늘어놓는다
  const keys = moves.map(rank);
  for (let i = 1; i < moves.length; i++) {
    const m = moves[i] as PawnEndingNext;
    const k = keys[i] as number;
    let j = i - 1;
    while (j >= 0 && (keys[j] as number) > k) {
      moves[j + 1] = moves[j] as PawnEndingNext;
      keys[j + 1] = keys[j] as number;
      j--;
    }
    moves[j + 1] = m;
    keys[j + 1] = k;
  }
  return moves;
}

/** 엔진 판(Board)을 킹과 폰 판으로. 킹·폰 말고 다른 기물이 있거나 폰이 편마다 셋을 넘으면 null */
export function toPawnEnding(
  board: Board,
  turn: "w" | "b",
  ep: number | null,
): PawnEnding | null {
  let wk = -1;
  let bk = -1;
  const wp: number[] = [];
  const bp: number[] = [];
  for (let i = 0; i < 64; i++) {
    const c = board[i];
    if (!c) continue;
    if (c === "wK") wk = i;
    else if (c === "bK") bk = i;
    else if (c === "wP") wp.push(i);
    else if (c === "bP") bp.push(i);
    else return null;
  }
  if (wk < 0 || bk < 0 || wp.length > MAX_PAWNS || bp.length > MAX_PAWNS)
    return null;
  const s: PawnEnding = { wk, bk, wp, bp, stm: turn === "w" ? 0 : 1, ep: -1 };
  if (ep !== null) {
    // 엔진은 잡을 폰이 없어도 앙파상 칸을 둔다. 잡을 수 있을 때만 남긴다
    const pawnAt = turn === "w" ? ep + 8 : ep - 8;
    const enemy = turn === "w" ? wp : bp;
    if (
      enemy.some((p) => Y(p) === Y(pawnAt) && Math.abs(X(p) - X(pawnAt)) === 1)
    )
      s.ep = ep;
  }
  return s;
}
