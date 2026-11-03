/*
 * 고수 전용 탐색과 평가.
 * search.ts의 evaluate·negamax·quiesce는 중수·다시 보기 해설·문제 시험이 기대어 있어 그대로 두고,
 * 고수만 쓰는 더 깊은 탐색을 여기 따로 둔다(docs/26 3절).
 *
 * - 판 열쇠: 칸마다 정해 둔 난수를 XOR한 32비트 두 개(Zobrist). 난수는 고정 씨앗에서 만들어 늘 같다
 * - 치환표: 같은 판을 다시 만나면 앞서 읽은 값·가장 좋은 수를 쓴다. 한 수를 고를 때마다 비운다
 *   (앞 판의 기억이 남으면 같은 판·같은 시드에서 다른 수를 둘 수 있다)
 * - PVS(영 창), 늦은 조용한 수 줄여 읽기, 널 무브 가지치기, 킬러 수·역사 점수로 수 순서
 * - 탐색 안에서 같은 판이 다시 나오면 0점(비김)
 * - 평가: evaluate + 비숍 쌍·폰 모양(겹친·외톨이·통과한 폰)·열린 줄의 룩·킹 앞 폰 방패·끝내기 몰기 강화
 */
import {
  applyMove,
  type Board,
  capturedBy,
  inCheck,
  insufficientMaterial,
  type Kind,
  type Move,
  type Position,
  type Promotion,
  pseudoMoves,
  type Side,
  squareAt,
} from "@game/chess-engine";

import { evaluate, MATE, material, VALUE } from "./search";
import { see } from "./see";

// ── 판 열쇠(Zobrist) ──────────────────────────────────────────

const PIECE_INDEX: Record<string, number> = {
  wP: 0,
  wN: 1,
  wB: 2,
  wR: 3,
  wQ: 4,
  wK: 5,
  bP: 6,
  bN: 7,
  bB: 8,
  bR: 9,
  bQ: 10,
  bK: 11,
};

/** 고정 씨앗의 xorshift32. 같은 난수표가 늘 나온다(Math.random 쓰지 않음) */
function makeTable(size: number, seed: number): Int32Array {
  const out = new Int32Array(size);
  let s = seed | 0;
  for (let i = 0; i < size; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    out[i] = s;
  }
  return out;
}

// 기물 12 × 칸 64, 그 뒤에 흑 차례 1, 캐슬링 4, 앙파상 줄 8
const Z_TURN = 12 * 64;
const Z_CASTLE = Z_TURN + 1;
const Z_EP = Z_CASTLE + 4;
const Z_SIZE = Z_EP + 8;
const ZHI = makeTable(Z_SIZE, 0x2545f491);
const ZLO = makeTable(Z_SIZE, 0x6c8e9cf5);
const CASTLE_CHARS = "KQkq";

/** 판 열쇠 두 쪽. 앙파상은 실제로 잡을 수 있을 때만 넣는다(positionKey와 같은 뜻) */
interface Hash {
  hi: number;
  lo: number;
}

function hashParts(
  cells: readonly string[],
  turn: Side,
  castling: string,
  epFile: number,
): Hash {
  let hi = 0;
  let lo = 0;
  for (let at = 0; at < 64; at++) {
    const cell = cells[at];
    if (!cell) continue;
    const z = (PIECE_INDEX[cell] as number) * 64 + at;
    hi ^= ZHI[z] as number;
    lo ^= ZLO[z] as number;
  }
  if (turn === "b") {
    hi ^= ZHI[Z_TURN] as number;
    lo ^= ZLO[Z_TURN] as number;
  }
  for (let i = 0; i < 4; i++)
    if (castling.includes(CASTLE_CHARS[i] as string)) {
      hi ^= ZHI[Z_CASTLE + i] as number;
      lo ^= ZLO[Z_CASTLE + i] as number;
    }
  if (epFile >= 0) {
    hi ^= ZHI[Z_EP + epFile] as number;
    lo ^= ZLO[Z_EP + epFile] as number;
  }
  return { hi, lo };
}

/** 앙파상으로 실제로 잡을 수 있으면 그 줄(0~7), 아니면 -1 */
function epFileOf(pos: Position): number {
  if (pos.ep === null) return -1;
  const x = pos.ep % 8;
  const y = pos.ep >> 3;
  const pawnY = pos.turn === "w" ? y + 1 : y - 1;
  if (pawnY < 0 || pawnY > 7) return -1;
  const pawn = `${pos.turn}P`;
  if (x > 0 && pos.board[pawnY * 8 + x - 1] === pawn) return x;
  if (x < 7 && pos.board[pawnY * 8 + x + 1] === pawn) return x;
  return -1;
}

export function hashOf(pos: Position): Hash {
  return hashParts(pos.board, pos.turn, pos.castling, epFileOf(pos));
}

/** `positionKey` 글자에서 같은 판 열쇠를 만든다(게임 기록의 같은 판을 탐색에서 알아보려고) */
export function hashOfKey(key: string): Hash {
  const [cellsPart = "", turn = "w", castling = "", ep = "-"] = key.split("|");
  const cells: string[] = [];
  for (let i = 0; i < cellsPart.length && cells.length < 64; ) {
    if (cellsPart[i] === ".") {
      cells.push("");
      i += 1;
    } else {
      cells.push(cellsPart.slice(i, i + 2));
      i += 2;
    }
  }
  const epFile = ep === "-" ? -1 : squareAt(ep) % 8;
  return hashParts(cells, turn as Side, castling, epFile);
}

// ── 평가 ──────────────────────────────────────────────────

/** 통과한 폰의 덤. 나간 줄 수(0 처음 자리 ~ 6 승급 바로 앞)로 */
const PASSED = [0, 10, 15, 25, 45, 75, 120];
/** 가운데에서 먼 정도(0~6). 끝내기에서 진 쪽 킹을 구석으로 몬다 */
function centerDistance(at: number): number {
  const x = at % 8;
  const y = at >> 3;
  return Math.max(3 - x, x - 4) + Math.max(3 - y, y - 4);
}

const PAWNS_W = new Int8Array(8);
const PAWNS_B = new Int8Array(8);
const W_MOST_BACK = new Int8Array(8);
const B_MOST_BACK = new Int8Array(8);

/**
 * 고수가 보는 판 값(`side` 쪽에서, 폰 100). `evaluate`에 고수만 쓰는 항목을 더한다.
 * 기동력(둘 수 있는 수의 수)은 셈이 비싸 넣지 않았다
 */
export function evaluateExpert(board: Board, side: Side): number {
  const base = evaluate(board, side);
  // 줄마다 폰 수, 폰이 있는 가장 앞·뒤 가로줄(통과한 폰을 가리려고)
  // 판마다 새로 만들지 않고 비워서 다시 쓴다(평가는 한 수에 수십만 번 불린다)
  const pawns = { w: PAWNS_W.fill(0), b: PAWNS_B.fill(0) };
  // 백 폰이 막을 수 있는 가장 위 y(작을수록 앞), 흑은 가장 아래 y
  const wMostBack = W_MOST_BACK.fill(-1); // 줄마다 백 폰 가운데 가장 큰 y
  const bMostBack = B_MOST_BACK.fill(8); // 줄마다 흑 폰 가운데 가장 작은 y
  let wBishops = 0;
  let bBishops = 0;
  let wk = -1;
  let bk = -1;
  let wOfficers = 0;
  let bOfficers = 0;
  let wPawnCount = 0;
  let bPawnCount = 0;
  for (let at = 0; at < 64; at++) {
    const cell = board[at];
    if (!cell) continue;
    const s = cell[0];
    const k = cell[1];
    const x = at % 8;
    const y = at >> 3;
    if (k === "P") {
      if (s === "w") {
        pawns.w[x] = (pawns.w[x] as number) + 1;
        if (y > (wMostBack[x] as number)) wMostBack[x] = y;
        wPawnCount++;
      } else {
        pawns.b[x] = (pawns.b[x] as number) + 1;
        if (y < (bMostBack[x] as number)) bMostBack[x] = y;
        bPawnCount++;
      }
    } else if (k === "K") {
      if (s === "w") wk = at;
      else bk = at;
    } else {
      const v = VALUE[k as Kind];
      if (s === "w") wOfficers += v;
      else bOfficers += v;
      if (k === "B") {
        if (s === "w") wBishops++;
        else bBishops++;
      }
    }
  }
  const endgame = wOfficers + bOfficers <= 1300;
  let w = 0; // 백 쪽에서 본 덤
  if (wBishops >= 2) w += 30;
  if (bBishops >= 2) w -= 30;

  for (let at = 0; at < 64; at++) {
    const cell = board[at];
    if (!cell) continue;
    const s = cell[0];
    const k = cell[1];
    const x = at % 8;
    const y = at >> 3;
    if (k === "P") {
      const mine = s === "w" ? pawns.w : pawns.b;
      const left = x > 0 ? (mine[x - 1] as number) : 0;
      const right = x < 7 ? (mine[x + 1] as number) : 0;
      let v = 0;
      if (left === 0 && right === 0) v -= 15; // 외톨이
      // 통과한 폰: 앞쪽(같은 줄과 옆 줄)에 상대 폰이 없다
      let passed = true;
      for (let dx = -1; dx <= 1 && passed; dx++) {
        const fx = x + dx;
        if (fx < 0 || fx > 7) continue;
        if (s === "w") {
          if ((bMostBack[fx] as number) < y) passed = false;
        } else if ((wMostBack[fx] as number) > y) passed = false;
      }
      if (passed) {
        const advanced = s === "w" ? 6 - y : y - 1;
        const bonus = PASSED[Math.max(0, Math.min(6, advanced))] as number;
        v += endgame ? bonus : bonus >> 1;
      }
      w += s === "w" ? v : -v;
    } else if (k === "R") {
      const mine = s === "w" ? pawns.w : pawns.b;
      const theirs = s === "w" ? pawns.b : pawns.w;
      let v = 0;
      if (mine[x] === 0) v += theirs[x] === 0 ? 20 : 10;
      w += s === "w" ? v : -v;
    }
  }
  // 겹친 폰
  for (let x = 0; x < 8; x++) {
    const a = pawns.w[x] as number;
    const b = pawns.b[x] as number;
    if (a > 1) w -= 15 * (a - 1);
    if (b > 1) w += 15 * (b - 1);
  }
  // 킹 앞 폰 방패(중반, 킹이 날개 쪽 뒤 두 줄에 있을 때)
  if (!endgame) {
    w += shield(board, wk, "w");
    w -= shield(board, bk, "b");
  }
  // 끝내기 몰기 강화: 진 쪽에 폰이 없고 기물이 크게 모자라면 그 킹을 구석으로, 이긴 킹을 붙인다.
  // evaluate의 몰기보다 크게 두어 같은 판을 맴돌지 않고 좁혀 간다.
  if (endgame && wk >= 0 && bk >= 0) {
    const lead = material(board, "w");
    const winner: Side | null =
      lead >= 300 && bPawnCount === 0
        ? "w"
        : lead <= -300 && wPawnCount === 0
          ? "b"
          : null;
    if (winner) {
      const loserKing = winner === "w" ? bk : wk;
      const winnerKing = winner === "w" ? wk : bk;
      const dist =
        Math.abs((loserKing % 8) - (winnerKing % 8)) +
        Math.abs((loserKing >> 3) - (winnerKing >> 3));
      const mop = centerDistance(loserKing) * 30 + (14 - dist) * 12;
      w += winner === "w" ? mop : -mop;
    }
  }
  return base + (side === "w" ? w : -w);
}

function shield(board: Board, king: number, side: Side): number {
  if (king < 0) return 0;
  const x = king % 8;
  const y = king >> 3;
  const home = side === "w" ? 7 : 0;
  if (Math.abs(y - home) > 1 || (x > 2 && x < 5)) return 0;
  const f = side === "w" ? -1 : 1;
  const pawn = `${side}P`;
  let v = 0;
  for (let dx = -1; dx <= 1; dx++) {
    const fx = x + dx;
    if (fx < 0 || fx > 7) continue;
    const y1 = y + f;
    const y2 = y + 2 * f;
    if (y1 >= 0 && y1 < 8 && board[y1 * 8 + fx] === pawn) v += 12;
    else if (y2 >= 0 && y2 < 8 && board[y2 * 8 + fx] === pawn) v += 6;
    else v -= 10;
  }
  return v;
}

// ── 치환표 ─────────────────────────────────────────────────

const TT_BITS = 17;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const ttHi = new Int32Array(TT_SIZE);
const ttLo = new Int32Array(TT_SIZE);
const ttScore = new Int32Array(TT_SIZE);
const ttMove = new Int32Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
/** 0 빈칸, 1 정확한 값, 2 아래 한계(이 값 이상), 3 위 한계(이 값 이하) */
const ttFlag = new Uint8Array(TT_SIZE);
const EXACT = 1;
const LOWER = 2;
const UPPER = 3;

const PROMO_CODE: Record<Promotion, number> = { Q: 1, R: 2, B: 3, N: 4 };
function encode(m: Move): number {
  return (
    m.from | (m.to << 6) | ((m.promotion ? PROMO_CODE[m.promotion] : 0) << 12)
  );
}

// ── 탐색 ──────────────────────────────────────────────────

/**
 * 탐색에서 단계마다 달리 쓰는 것. 고수는 `EXPERT_TUNING`(예전 그대로), 초고수는 master.ts가 정한다
 */
export interface SearchTuning {
  /** 판 값(`side` 쪽에서 본 값) */
  evaluate: (board: Board, side: Side) => number;
  /** 잡기만 보는 탐색에서 주고받으면 손해인 잡기(SEE < 0)를 건너뛴다 */
  pruneLosingCaptures: boolean;
  /**
   * 얕은 깊이에서 가망 없는 가지를 일찍 자른다.
   * 판 값이 beta보다 넉넉히 높으면 바로 돌려주고(거꾸로 가지치기), alpha에 한참 못 미치면 조용한 수를 건너뛴다
   */
  futility: boolean;
  /** 아주 늦게 나온 조용한 수는 두 수 덜 읽는다 */
  deepReduce: boolean;
  /** 끝내기 표: 값을 알면 둘 차례 편에서 본 값, 모르면 null */
  probe: ((pos: Position) => number | null) | null;
}

export const EXPERT_TUNING: SearchTuning = {
  evaluate: evaluateExpert,
  pruneLosingCaptures: false,
  futility: false,
  deepReduce: false,
  probe: null,
};

/** 고수 탐색 한 번의 셈 */
export interface ExpertContext {
  nodes: number;
  budget: number;
  aborted: boolean;
  tuning: SearchTuning;
  /** 깊이(ply)마다 잘라 낸 조용한 수 둘 */
  killers: Int32Array;
  /** 조용한 수(출발·도착 칸)가 잘라 낸 횟수의 점수 */
  history: Int32Array;
  /** 지나온 판 열쇠(게임 기록 + 탐색 길). 같은 판 되풀이를 알아본다 */
  stackHi: Int32Array;
  stackLo: Int32Array;
  depth: number;
}

const MAX_PLY = 128;
/** 남은 깊이(0·1·2)마다 조용한 수가 판 값을 끌어올릴 수 있다고 보는 여유 */
const FUTILITY_MARGIN = [100, 150, 300] as const;
const STACK = 1024;

export function newExpertContext(
  budget: number,
  history: readonly string[] = [],
  tuning: SearchTuning = EXPERT_TUNING,
): ExpertContext {
  ttFlag.fill(0);
  const ctx: ExpertContext = {
    nodes: 0,
    budget,
    aborted: false,
    tuning,
    killers: new Int32Array(MAX_PLY * 2).fill(-1),
    history: new Int32Array(64 * 64),
    stackHi: new Int32Array(STACK + MAX_PLY),
    stackLo: new Int32Array(STACK + MAX_PLY),
    depth: 0,
  };
  for (const key of history.slice(-STACK)) {
    const h = hashOfKey(key);
    push(ctx, h);
  }
  return ctx;
}

function push(ctx: ExpertContext, h: Hash): void {
  ctx.stackHi[ctx.depth] = h.hi;
  ctx.stackLo[ctx.depth] = h.lo;
  ctx.depth += 1;
}

/** 지금 판이 지나온 길에 이미 있었나(되돌릴 수 있는 수만 이어진 동안만 본다) */
function repeated(ctx: ExpertContext, h: Hash, halfmove: number): boolean {
  for (let k = 2; k <= halfmove && ctx.depth - k >= 0; k += 2) {
    const i = ctx.depth - k;
    if (ctx.stackHi[i] === h.hi && ctx.stackLo[i] === h.lo) return true;
  }
  return false;
}

function hasOfficers(board: Board, side: Side): boolean {
  for (const cell of board)
    if (cell !== "" && cell[0] === side && cell[1] !== "P" && cell[1] !== "K")
      return true;
  return false;
}

/** 수 순서 점수: 치환표 수 > 잡기(MVV-LVA)·승급 > 킬러 수 > 역사 점수 */
function scoreMoves(
  ctx: ExpertContext,
  pos: Position,
  moves: Move[],
  first: number,
  ply: number,
): Int32Array {
  const scores = new Int32Array(moves.length);
  const k0 = ctx.killers[ply * 2];
  const k1 = ctx.killers[ply * 2 + 1];
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i] as Move;
    const code = encode(m);
    if (code === first) {
      scores[i] = 100_000_000;
      continue;
    }
    const victim = capturedBy(pos, m);
    let s = 0;
    if (victim !== "") {
      const attacker = pos.board[m.from] ?? "";
      s =
        10_000_000 +
        VALUE[victim[1] as Kind] * 10 -
        VALUE[attacker[1] as Kind] / 10;
    }
    if (m.promotion) s += 9_000_000 + VALUE[m.promotion];
    if (s === 0) {
      if (code === k0) s = 8_000_000;
      else if (code === k1) s = 7_000_000;
      else s = Math.min(ctx.history[m.from * 64 + m.to] as number, 6_000_000);
    }
    scores[i] = s;
  }
  return scores;
}

/** 아직 안 본 수 가운데 점수가 가장 큰 것을 i 자리로 옮긴다(차례로 고르기) */
function pickNext(moves: Move[], scores: Int32Array, i: number): void {
  let best = i;
  for (let j = i + 1; j < moves.length; j++)
    if ((scores[j] as number) > (scores[best] as number)) best = j;
  if (best !== i) {
    const m = moves[i] as Move;
    moves[i] = moves[best] as Move;
    moves[best] = m;
    const s = scores[i] as number;
    scores[i] = scores[best] as number;
    scores[best] = s;
  }
}

export function quiesceExpert(
  pos: Position,
  alpha: number,
  beta: number,
  ctx: ExpertContext,
  depth = 8,
): number {
  ctx.nodes += 1;
  const standPat = ctx.tuning.evaluate(pos.board, pos.turn);
  if (standPat >= beta || depth === 0) return standPat;
  let a = Math.max(alpha, standPat);
  const moves = pseudoMoves(pos, true);
  const scores = scoreMoves(ctx, pos, moves, -1, 0);
  const prune = ctx.tuning.pruneLosingCaptures;
  for (let i = 0; i < moves.length; i++) {
    pickNext(moves, scores, i);
    const move = moves[i] as Move;
    // 잡는 기물이 잡히는 기물보다 비쌀 때만 주고받기를 따져 본다(싸거나 같으면 손해가 아니다).
    if (prune && !move.promotion) {
      const attacker = pos.board[move.from] ?? "";
      const victim = pos.board[move.to] ?? "";
      if (
        victim !== "" &&
        VALUE[attacker[1] as Kind] > VALUE[victim[1] as Kind] &&
        see(pos.board, move) < 0
      )
        continue;
    }
    const next = applyMove(pos, move);
    if (inCheck(next.board, pos.turn)) continue;
    const score = -quiesceExpert(next, -beta, -a, ctx, depth - 1);
    if (score >= beta) return score;
    if (score > a) a = score;
  }
  return a;
}

function toTT(score: number, ply: number): number {
  if (score > MATE / 2) return score + ply;
  if (score < -MATE / 2) return score - ply;
  return score;
}
function fromTT(score: number, ply: number): number {
  if (score > MATE / 2) return score - ply;
  if (score < -MATE / 2) return score + ply;
  return score;
}

/**
 * 고수의 알파베타(negamax, fail-soft). 둘 차례 편에서 본 값.
 * `h`는 이 판의 열쇠, `checked`는 둘 차례 편이 체크를 받는지(부모가 이미 셈했다)
 */
export function searchExpert(
  pos: Position,
  h: Hash,
  depth: number,
  alpha: number,
  beta: number,
  ctx: ExpertContext,
  ply: number,
  checked: boolean,
  canNull = true,
): number {
  if (ctx.nodes >= ctx.budget) {
    ctx.aborted = true;
    return 0;
  }
  if (pos.halfmove >= 100 || insufficientMaterial(pos.board)) return 0;
  if (repeated(ctx, h, pos.halfmove)) return 0;
  const tuning = ctx.tuning;
  if (tuning.probe) {
    const known = tuning.probe(pos);
    if (known !== null) {
      ctx.nodes += 1;
      return known;
    }
  }
  if ((depth <= 0 && (!checked || depth < -2)) || ply >= MAX_PLY - 2)
    return quiesceExpert(pos, alpha, beta, ctx);
  ctx.nodes += 1;
  const d = Math.max(depth, 0);

  const slot = h.lo & TT_MASK;
  let first = -1;
  if (ttFlag[slot] !== 0 && ttHi[slot] === h.hi && ttLo[slot] === h.lo) {
    first = ttMove[slot] as number;
    if ((ttDepth[slot] as number) >= d) {
      const s = fromTT(ttScore[slot] as number, ply);
      const flag = ttFlag[slot];
      if (
        flag === EXACT ||
        (flag === LOWER && s >= beta) ||
        (flag === UPPER && s <= alpha)
      )
        return s;
    }
  }

  // 얕은 깊이의 가지치기(초고수만): 판 값을 한 번만 셈해 둔다.
  const shallow =
    tuning.futility &&
    !checked &&
    depth <= 3 &&
    beta < MATE / 2 &&
    alpha > -MATE / 2;
  const staticEval = shallow ? tuning.evaluate(pos.board, pos.turn) : 0;
  // 한 수 덜 읽어도 될 만큼 판 값이 beta보다 높으면(깊이마다 120) 더 보지 않는다.
  if (shallow && beta - alpha === 1 && staticEval - 120 * d >= beta)
    return staticEval;
  /** 이 깊이에서 조용한 수를 건너뛸 선(판 값 + 여유가 alpha에 못 미치면) */
  const margin = d <= 2 ? (FUTILITY_MARGIN[d] as number) : 0;
  const futile =
    shallow && d <= 2 && staticEval + margin <= alpha
      ? staticEval + margin
      : null;

  // 널 무브: 한 수 쉬어도 beta를 넘으면 더 볼 것 없이 자른다(폰만 남은 판은 추크츠방이 잦아 하지 않는다).
  if (
    canNull &&
    !checked &&
    depth >= 3 &&
    beta < MATE / 2 &&
    beta > -MATE / 2 &&
    hasOfficers(pos.board, pos.turn) &&
    tuning.evaluate(pos.board, pos.turn) >= beta
  ) {
    const nullPos: Position = {
      ...pos,
      turn: pos.turn === "w" ? "b" : "w",
      ep: null,
      halfmove: 0,
    };
    const nh = hashOf(nullPos);
    push(ctx, h);
    const score = -searchExpert(
      nullPos,
      nh,
      depth - 3,
      -beta,
      -beta + 1,
      ctx,
      ply + 1,
      false,
      false,
    );
    ctx.depth -= 1;
    if (ctx.aborted) return 0;
    if (score >= beta) return score >= MATE / 2 ? beta : score;
  }

  const moves = pseudoMoves(pos);
  const scores = scoreMoves(ctx, pos, moves, first, ply);
  const enemy: Side = pos.turn === "w" ? "b" : "w";
  let best = Number.NEGATIVE_INFINITY;
  let bestMove = -1;
  let a = alpha;
  let played = 0;
  push(ctx, h);
  for (let i = 0; i < moves.length; i++) {
    pickNext(moves, scores, i);
    const move = moves[i] as Move;
    const next = applyMove(pos, move);
    if (inCheck(next.board, pos.turn)) continue;
    played += 1;
    const gives = inCheck(next.board, enemy);
    const nh = hashOf(next);
    // 잡기·승급·치환표 수·킬러 수가 아닌 수
    const quiet = (scores[i] as number) < 7_000_000;
    // 가망 없는 조용한 수는 읽지 않고, 값은 판 값 + 여유(넘을 수 없는 위 한계)로 친다.
    if (futile !== null && played > 1 && quiet && !gives) {
      if (futile > best) best = futile;
      continue;
    }
    let score: number;
    if (played === 1) {
      score = -searchExpert(
        next,
        nh,
        depth - 1,
        -beta,
        -a,
        ctx,
        ply + 1,
        gives,
      );
    } else {
      // 늦게 나온 조용한 수는 한 수 덜 읽어 보고, 좋아 보이면 제대로 다시 읽는다.
      const reduce =
        depth >= 3 && played > 3 && quiet && !checked && !gives
          ? tuning.deepReduce && depth >= 6 && played > 8
            ? 2
            : 1
          : 0;
      score = -searchExpert(
        next,
        nh,
        depth - 1 - reduce,
        -a - 1,
        -a,
        ctx,
        ply + 1,
        gives,
      );
      if (!ctx.aborted && score > a && reduce > 0)
        score = -searchExpert(
          next,
          nh,
          depth - 1,
          -a - 1,
          -a,
          ctx,
          ply + 1,
          gives,
        );
      if (!ctx.aborted && score > a && score < beta)
        score = -searchExpert(
          next,
          nh,
          depth - 1,
          -beta,
          -a,
          ctx,
          ply + 1,
          gives,
        );
    }
    if (ctx.aborted) {
      ctx.depth -= 1;
      return 0;
    }
    if (score > best) {
      best = score;
      bestMove = encode(move);
    }
    if (score > a) a = score;
    if (a >= beta) {
      if (capturedBy(pos, move) === "" && !move.promotion) {
        const code = encode(move);
        if (ctx.killers[ply * 2] !== code) {
          ctx.killers[ply * 2 + 1] = ctx.killers[ply * 2] as number;
          ctx.killers[ply * 2] = code;
        }
        ctx.history[move.from * 64 + move.to] =
          (ctx.history[move.from * 64 + move.to] as number) + d * d;
      }
      break;
    }
  }
  ctx.depth -= 1;
  if (played === 0) return checked ? -MATE + ply : 0;

  if (
    ttFlag[slot] === 0 ||
    ttHi[slot] !== h.hi ||
    ttLo[slot] !== h.lo ||
    (ttDepth[slot] as number) <= d
  ) {
    ttHi[slot] = h.hi;
    ttLo[slot] = h.lo;
    ttScore[slot] = toTT(best, ply);
    ttMove[slot] = bestMove;
    ttDepth[slot] = Math.min(d, 127);
    ttFlag[slot] = best <= alpha ? UPPER : best >= beta ? LOWER : EXACT;
  }
  return best;
}
