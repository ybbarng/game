/*
 * 킹과 폰 판에서 폰이 퀸이 된 뒤를 끝까지 읽어 승패를 "증명"하는 판정(docs/26 6절 바깥 패스 폰).
 * 킹과 폰 판 읽기(`pawn-ending.ts`)가 퀸이 생긴 판을 이것에 맡긴다(`PromotionJudge`).
 * 예전에는 「상대 폰이 멀면 퀸 쪽이 이긴다」는 널리 알려진 끝내기 지식에 기댔는데, 이제는 그 판도 실제로 읽는다.
 *
 * 물음은 킹과 폰 판 읽기와 같다. 정해진 걸음(반수) 안에서 끝나는 증명만 참으로 낸다.
 * - `wins`: 백이 이긴다고 증명되나(흑이 무엇을 두든 메이트나, 이긴다고 정해진 판에 닿는다)
 * - `holds`: 백이 이기지 못한다고 증명되나
 * 판은 엔진 판(`Position`)이고 수는 엔진이 만든다(`legalMoves`, 다른 기물로 바꾸는 승급 포함).
 * 이기려는 쪽은 퀸으로 바꾸는 수만 보아도 된다(고를 수 있는 수 가운데 일부만 보면 증명이 더 어려워질 뿐 틀리지 않는다).
 * 막으려는 쪽의 수는 퀸이 아닌 기물로 바꾸는 수까지 모두 본다.
 *
 * 끝(증명이 닫히는 곳). 모두 끝까지 계산해 둔 것이고 어림 규칙은 없다:
 * - 백에게 킹만 남았거나 어느 편도 메이트할 기물이 없으면 백은 이기지 못한다
 * - 킹+퀸(또는 룩) 대 킹이면 메이트 거리 표(`kxk.ts`)
 * - 퀸·룩·마이너가 모두 사라져 킹과 폰만 남으면 킹과 폰 판 읽기로 돌아간다(그 판정도 이것을 쓴다)
 * - 둘 수가 없으면 체크일 때 짐(메이트), 아니면 비김(스테일메이트)
 * 폰이 퀸이 될 때마다 퀸이 생긴 판을 `QUEEN_PLIES` 걸음 안에서 읽는다. 폰은 늘 줄어들므로 끝없이 되풀이되지 않는다.
 * 반복(같은 판 세 번)과 50수 규칙은 보지 않는다(걸음 안에서 끝나는 증명은 같은 판을 되풀이하지 않아도 선다).
 */

import {
  applyMove,
  attacked,
  type Cell,
  inCheck,
  insufficientMaterial,
  legalMoves,
  type Move,
  type Position,
  type Promotion,
  positionKey,
  toFen,
} from "@game/chess-engine";

import { type KxkPiece, kxkBlackDistance, kxkWhiteDistance } from "./kxk";
import {
  type PawnEnding,
  type PawnEndingNext,
  type PawnEndingPromotion,
  PawnEndingSolver,
  type PromotionJudge,
  pawnEndingMoves,
  toPawnEnding,
} from "./pawn-ending";

/** 퀸이 생긴 판을 읽는 걸음(반수). 바깥 패스 폰 일곱 문제에서 가장 긴 증명보다 넉넉하게 */
export const QUEEN_PLIES = 15;

/**
 * 고르는 쪽(이기려는 백, 막으려는 흑)이 보는 수의 수. 먼저 볼 수 차례(`ordered`)에서 앞의 몇 수만 본다.
 * 고를 수 있는 수 가운데 일부만 보아도 증명은 틀리지 않는다(못 찾을 수는 있다). 받는 쪽 수는 늘 모두 본다
 */
export const CHOOSER_WIDTH = 6;

const PROMOTION_PIECES: readonly Promotion[] = ["Q", "R", "B", "N"];

const VALUE: Record<string, number> = { Q: 9, R: 5, B: 3, N: 3, P: 1, K: 0 };

/** 판에서 정해진 결과: 이김·못 이김, 킹과 폰 판으로 돌아감, 아직 모름 */
type Known =
  | { kind: "win" }
  | { kind: "noWin" }
  | { kind: "pawns"; s: PawnEnding }
  | null;

const WIN: Known = { kind: "win" };
const NO_WIN: Known = { kind: "noWin" };

/** 승급한 수의 판을 엔진 판으로. `piece`는 바꿀 기물 */
export function promotedPosition(
  m: PawnEndingPromotion,
  piece: Promotion = "Q",
): Position {
  const a = m.after;
  const board: Cell[] = Array.from({ length: 64 }, () => "");
  board[a.wk] = "wK";
  board[a.bk] = "bK";
  for (const p of a.wp) board[p] = "wP";
  for (const p of a.bp) board[p] = "bP";
  board[m.queen] = `${m.side === 0 ? "w" : "b"}${piece}`;
  return {
    board,
    turn: a.stm === 0 ? "w" : "b",
    castling: "",
    ep: null,
    halfmove: 0,
    fullmove: 1,
  };
}

/** 판이 이미 정해졌나(표·킹과 폰 판·기물 부족) */
function known(pos: Position): Known {
  let wk = -1;
  let bk = -1;
  const white: { kind: string; at: number }[] = [];
  const black: { kind: string; at: number }[] = [];
  let pieces = 0;
  pos.board.forEach((c, at) => {
    if (c === "") return;
    if (c === "wK") wk = at;
    else if (c === "bK") bk = at;
    else {
      (c[0] === "w" ? white : black).push({ kind: c[1] as string, at });
      if (c[1] !== "P") pieces++;
    }
  });
  if (white.length === 0) return NO_WIN;
  if (insufficientMaterial(pos.board)) return NO_WIN;
  if (pieces === 0) {
    const s = toPawnEnding(pos.board, pos.turn, pos.ep);
    return s ? { kind: "pawns", s } : null;
  }
  const only = white[0];
  if (
    black.length === 0 &&
    white.length === 1 &&
    only &&
    (only.kind === "Q" || only.kind === "R")
  ) {
    const piece = only.kind as KxkPiece;
    const d =
      pos.turn === "w"
        ? kxkWhiteDistance(piece, wk, bk, only.at)
        : kxkBlackDistance(piece, wk, bk, only.at);
    return d === null ? NO_WIN : WIN;
  }
  return null;
}

/** 킹+퀸 대 킹 메이트는 가장 길어도 백 10수(20반수 안팎)다(`queen-ending.test.ts`가 표로 확인). 폰이 길을 막아 돌아가는 몫을 더해 넉넉하게 */
export const BARE_PLIES = 31;

/** 흑은 킹 하나, 백은 킹+퀸 하나+폰(하나 이상)인가 */
function bareKingWithQueen(pos: Position): boolean {
  let queens = 0;
  let pawns = 0;
  for (const c of pos.board) {
    if (c === "" || c[1] === "K") continue;
    if (c[0] === "b") return false;
    if (c === "wQ") queens++;
    else if (c === "wP") pawns++;
    else return false;
  }
  return queens === 1 && pawns > 0;
}

/**
 * 먼저 볼 수: 잡기(값이 큰 기물부터), 퀸 되기, 체크, 킹+퀸 대 킹에서는 표로 메이트가 가까운 수, 상대 폰에 다가가는 킹 수.
 * 차례는 증명이 참인지 거짓인지를 바꾸지 않고 빨리 찾게만 한다
 */
function ordered(pos: Position, moves: Move[]): { m: Move; next: Position }[] {
  const me = pos.turn;
  const foe = me === "w" ? "b" : "w";
  const rows = moves.map((m) => {
    const next = applyMove(pos, m);
    const taken = pos.board[m.to] ?? "";
    let score = 0;
    if (taken !== "") score += 1000 + 100 * (VALUE[taken[1] as string] ?? 0);
    if (m.promotion === "Q") score += 900;
    if (inCheck(next.board, foe)) score += 300;
    // 상대가 킹(과 내 폰)만이고 나는 퀸 하나: 폰을 빼고 본 메이트 거리가 짧은 수부터
    let myKing = -1;
    let foeKing = -1;
    let queen = -1;
    let otherPieces = 0;
    const foePawns: number[] = [];
    let foeOthers = 0;
    next.board.forEach((c, at) => {
      if (c === `${me}K`) myKing = at;
      else if (c === `${foe}K`) foeKing = at;
      else if (c === `${me}Q`) {
        if (queen < 0) queen = at;
        else otherPieces++;
      } else if (c !== "" && c[0] === me && c[1] !== "P") otherPieces++;
      else if (c === `${foe}P`) foePawns.push(at);
      else if (c !== "" && c[0] === foe) foeOthers++;
    });
    if (me === "w" && queen >= 0 && otherPieces === 0 && foeOthers === 0) {
      if (foePawns.length === 0) {
        const d = kxkBlackDistance("Q", myKing, foeKing, queen);
        if (d !== null) score += 200 - d;
      }
    }
    // 상대 폰을 노리는 수(앞으로 많이 나간 폰일수록 먼저). 지켜진 폰은 덜
    for (const p of foePawns)
      if (attacked(next.board, p, me)) {
        const advance = me === "w" ? p >> 3 : 7 - (p >> 3);
        score += (attacked(next.board, p, foe) ? 100 : 400) + 20 * advance;
      }
    // 킹은 상대 폰 쪽으로
    if (m.from === myKing || pos.board[m.from] === `${me}K`) {
      let near = 8;
      for (const p of foePawns)
        near = Math.min(
          near,
          Math.max(
            Math.abs((p & 7) - (m.to & 7)),
            Math.abs((p >> 3) - (m.to >> 3)),
          ),
        );
      score += 8 - near;
    }
    return { m, next, score };
  });
  rows.sort((a, b) => b.score - a.score);
  return rows;
}

export class EndingProver implements PromotionJudge {
  /** 퀸이 모두 사라진 판을 읽는 킹과 폰 판정(퀸이 되면 다시 이것에 맡긴다) */
  readonly pawn: PawnEndingSolver;
  private winYes = new Set<string>();
  private winNo = new Map<string, number>();
  private holdYes = new Set<string>();
  private holdNo = new Map<string, number>();
  private bareYes = new Set<string>();
  private bareNo = new Map<string, number>();
  /** 퀸이 있는 판을 읽은 수(시험·조사용) */
  nodes = 0;
  private queenPlies: number;
  private width: number;

  constructor(options: { queenPlies?: number; width?: number } = {}) {
    this.queenPlies = options.queenPlies ?? QUEEN_PLIES;
    this.width = options.width ?? CHOOSER_WIDTH;
    this.pawn = new PawnEndingSolver({ promotion: this });
  }

  /** 얕은 걸음부터 늘려 가며 읽는다(짧은 증명을 먼저 찾는다) */
  private deepening(read: (plies: number) => boolean): boolean {
    for (let d = 1; d < this.queenPlies; d += 2) if (read(d)) return true;
    return read(this.queenPlies);
  }

  /** 승급 뒤 백이 이기나. 흑의 승급이면 흑이 어떤 기물로 바꾸든 이겨야 한다 */
  wins(m: PawnEndingPromotion): boolean {
    const pieces = m.side === 1 ? PROMOTION_PIECES : (["Q"] as const);
    return pieces.every((p) => {
      const pos = promotedPosition(m, p);
      return this.deepening((d) => this.winsAt(pos, d));
    });
  }

  /** 승급 뒤 백이 못 이기나. 백의 승급이면 백이 어떤 기물로 바꾸든 못 이겨야 한다 */
  holds(m: PawnEndingPromotion): boolean {
    const pieces = m.side === 0 ? PROMOTION_PIECES : (["Q"] as const);
    return pieces.every((p) => {
      const pos = promotedPosition(m, p);
      return this.deepening((d) => this.holdsAt(pos, d));
    });
  }

  /**
   * 백 킹+퀸 하나+폰 대 흑 킹 하나. 백 폰이 남아 메이트 거리 표를 그대로 쓸 수 없다.
   * 백은 폰을 빼고 본 표에서 메이트가 가까워지는 수 가운데 앞의 셋만 두고(고르는 쪽은 일부만 보아도 된다.
   * 폰이 흑 킹의 칸을 막아 스테일메이트가 되는 수는 먼저 뺀다),
   * 흑의 수는 엔진이 만든 실제 수를 모두 본다. 폰이 퀸의 길을 막거나 흑 킹이 폰을 잡는 판도 그대로 읽으므로 증명이다.
   * 흑 킹이 폰을 잡으면 킹+퀸 대 킹 표로 끝난다
   */
  private bareKingWins(pos: Position, plies: number): boolean {
    const k = known(pos);
    if (k?.kind === "win") return true;
    if (k?.kind === "noWin") return false;
    // 흑 킹이 퀸을 잡았다: 킹과 폰 판
    if (k?.kind === "pawns") return this.pawn.wins(k.s, this.queenPlies);
    if (plies <= 0) return false;
    const key = positionKey(pos);
    if (this.bareYes.has(key)) return true;
    if ((this.bareNo.get(key) ?? -1) >= plies) return false;
    this.nodes++;
    const moves = legalMoves(pos);
    let result: boolean;
    if (moves.length === 0)
      result = pos.turn === "b" && inCheck(pos.board, "b");
    else if (pos.turn === "b")
      result = moves.every((m) =>
        this.bareKingWins(applyMove(pos, m), plies - 1),
      );
    else {
      const rows: { next: Position; d: number }[] = [];
      for (const m of moves) {
        if (pos.board[m.from] === "wP") continue;
        const next = applyMove(pos, m);
        const wk = next.board.indexOf("wK");
        const bk = next.board.indexOf("bK");
        const q = next.board.indexOf("wQ");
        const d = kxkBlackDistance("Q", wk, bk, q);
        if (d === null) continue;
        // 폰이 흑 킹의 칸을 막아 표에 없는 스테일메이트가 되는 수는 뺀다
        const stalemate =
          !inCheck(next.board, "b") && legalMoves(next).length === 0;
        if (!stalemate) rows.push({ next, d });
      }
      rows.sort((a, b) => a.d - b.d);
      result = rows
        .slice(0, 3)
        .some((r) => this.bareKingWins(r.next, plies - 1));
    }
    if (result) this.bareYes.add(key);
    else this.bareNo.set(key, plies);
    return result;
  }

  /** 이 판에서 백이 이긴다고 plies 걸음 안에 증명되나 */
  winsAt(pos: Position, plies: number): boolean {
    const k = known(pos);
    if (k?.kind === "win") return true;
    if (k?.kind === "noWin") return false;
    if (k?.kind === "pawns") return this.pawn.wins(k.s, plies);
    if (bareKingWithQueen(pos)) return this.bareKingWins(pos, BARE_PLIES);
    if (plies <= 0) return false;
    const key = positionKey(pos);
    if (this.winYes.has(key)) return true;
    if ((this.winNo.get(key) ?? -1) >= plies) return false;
    this.nodes++;
    const moves = legalMoves(pos);
    let result: boolean;
    if (moves.length === 0)
      result = pos.turn === "b" && inCheck(pos.board, "b");
    else if (pos.turn === "w")
      result = ordered(
        pos,
        moves.filter((m) => !m.promotion || m.promotion === "Q"),
      )
        .slice(0, this.width)
        .some((r) => this.winsAt(r.next, plies - 1));
    else
      result = ordered(pos, moves).every((r) => this.winsAt(r.next, plies - 1));
    if (result) this.winYes.add(key);
    else this.winNo.set(key, plies);
    return result;
  }

  /** 이 판에서 백이 이기지 못한다고 plies 걸음 안에 증명되나 */
  holdsAt(pos: Position, plies: number): boolean {
    const k = known(pos);
    if (k?.kind === "win") return false;
    if (k?.kind === "noWin") return true;
    if (k?.kind === "pawns") return this.pawn.holds(k.s, plies);
    if (plies <= 0) return false;
    const key = positionKey(pos);
    if (this.holdYes.has(key)) return true;
    if ((this.holdNo.get(key) ?? -1) >= plies) return false;
    this.nodes++;
    const moves = legalMoves(pos);
    let result: boolean;
    if (moves.length === 0)
      result = pos.turn === "w" || !inCheck(pos.board, "b");
    else if (pos.turn === "w")
      result = ordered(pos, moves).every((r) =>
        this.holdsAt(r.next, plies - 1),
      );
    else
      result = ordered(
        pos,
        moves.filter((m) => !m.promotion || m.promotion === "Q"),
      )
        .slice(0, this.width)
        .some((r) => this.holdsAt(r.next, plies - 1));
    if (result) this.holdYes.add(key);
    else this.holdNo.set(key, plies);
    return result;
  }
}

/* ---------- 문제 하나를 끝까지 증명하기 ---------- */

/**
 * 킹과 폰 문제("이기는 수는 정답 하나, 다른 수는 모두 이기지 못한다")의 증명은 두 단계로 세운다.
 * 1. 후보 증명: 킹과 폰 판을 끝까지 읽되, 폰이 퀸이 된 판은 어림(`guessFar`)으로 빨리 정한다(약 1초).
 *    이때 끝까지 읽어 아니라고 나온 승급 판(`refuted`)은 거짓으로 둔다.
 * 2. 확인: 후보 증명 나무의 승급 판(`proofPromotions`)을 하나씩 `EndingProver`로 끝까지 읽는다.
 *    모두 확인되면 증명 전체가 어림 없이 선다. 확인되지 않은 판이 있으면 그 판을 `refuted`에 더해 1부터 다시 한다.
 * 2는 수십 초가 걸려 bench(`outside-pawn.strength.ts`)가 맡고, 결과를 `PawnProofRecord`로 남긴다.
 * 단위 시험은 1만 다시 해서, 남긴 `refuted`로 같은 승급 판 묶음(`digest`)이 나오는지 본다.
 */

/** 확인한 증명 기록 */
export interface PawnProofRecord {
  /** 문제 판(FEN)과 정답 수(SAN) */
  fen: string;
  answer: string;
  /** 끝까지 읽어 증명하지 못한 승급 판(후보 증명에서 거짓으로 둔다) */
  refuted: readonly string[];
  /** 후보 증명 나무의 승급 판 수와 그 묶음의 지문 */
  leaves: number;
  digest: string;
}

/** 승급 판의 이름: 물음과 판(기물 자리·차례) */
export function promotionKey(
  m: PawnEndingPromotion,
  goal: "wins" | "holds",
): string {
  const fen = toFen(promotedPosition(m)).split(" ");
  return `${goal} ${fen[0]} ${fen[1]}`;
}

/** 이름 묶음의 지문(FNV-1a 32비트, 정렬한 이름을 줄바꿈으로 이어서) */
export function promotionDigest(keys: readonly string[]): string {
  let h = 0x811c9dc5;
  for (const ch of [...keys].sort().join("\n")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export interface PawnCandidate {
  /** 증명하지 못한 수(정답이면 이긴다, 아니면 못 이긴다를). 모두 증명되면 null */
  unproved: PawnEndingNext | null;
  /** 증명 나무의 승급 판(이름 순서, 같은 것은 하나) */
  leaves: { key: string; goal: "wins" | "holds"; m: PawnEndingPromotion }[];
}

/** 1단계 후보 증명. answer는 정답 수의 칸(from·to), plies는 수를 둔 뒤 읽는 걸음 */
export function pawnPuzzleCandidate(
  s: PawnEnding,
  answer: { from: number; to: number },
  plies: number,
  refuted: ReadonlySet<string>,
): PawnCandidate {
  const solver = new PawnEndingSolver({
    guessFar: true,
    known: (m, goal) => (refuted.has(promotionKey(m, goal)) ? false : null),
  });
  const leaves = new Map<
    string,
    { key: string; goal: "wins" | "holds"; m: PawnEndingPromotion }
  >();
  for (const m of pawnEndingMoves(s)) {
    const goal =
      m.from === answer.from && m.to === answer.to ? "wins" : "holds";
    const found = solver.proofPromotions(goal, m, plies);
    if (!found) return { unproved: m, leaves: [] };
    for (const l of found) {
      const key = promotionKey(l, goal);
      leaves.set(key, { key, goal, m: l });
    }
  }
  return {
    unproved: null,
    leaves: [...leaves.values()].sort((a, b) => (a.key < b.key ? -1 : 1)),
  };
}

/**
 * 2단계까지: 후보 증명의 승급 판이 모두 끝까지 읽혀 확인될 때까지 되풀이한다.
 * 증명이 서면 기록을, 어느 수를 증명하지 못하면 null을 낸다
 */
export function provePawnPuzzle(
  s: PawnEnding,
  answer: { from: number; to: number; san: string; fen: string },
  plies: number,
  prover: EndingProver = new EndingProver(),
): PawnProofRecord | null {
  const refuted = new Set<string>();
  const checked = new Map<string, boolean>();
  for (;;) {
    const cand = pawnPuzzleCandidate(s, answer, plies, refuted);
    if (cand.unproved) return null;
    let failed = false;
    for (const l of cand.leaves) {
      let ok = checked.get(l.key);
      if (ok === undefined) {
        ok = l.goal === "wins" ? prover.wins(l.m) : prover.holds(l.m);
        checked.set(l.key, ok);
      }
      if (!ok) {
        refuted.add(l.key);
        failed = true;
      }
    }
    if (!failed)
      return {
        fen: answer.fen,
        answer: answer.san,
        refuted: [...refuted].sort(),
        leaves: cand.leaves.length,
        digest: promotionDigest(cand.leaves.map((l) => l.key)),
      };
  }
}
