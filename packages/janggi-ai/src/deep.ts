import {
  CELLS,
  type JanggiView,
  MOVE_LIMIT,
  type Move,
  sideOfSeat,
  WIDTH,
} from "@game/janggi-engine";
import { nextInt, type RngState } from "@game/mighty-engine";

import {
  A,
  attacked as attackedFn,
  C,
  codeOf,
  E,
  encodeMove,
  generate as generateFn,
  K,
  N,
  P,
  PALACE_STEP,
  R,
  sideIndex,
  toFast,
} from "./fast-board";
import { type PlanWeights, planFor } from "./plan";

// 자주 부르는 함수는 이 파일의 상수로 묶는다(시험 환경의 모듈 연결을 거치지 않게).
const attacked = attackedFn;
const generate = generateFn;
const moveFrom = (m: number) => m >> 7;
const moveTo = (m: number) => m & 127;

/*
 * 고수의 탐색(docs/22 3절).
 * 점점 깊이 읽기(1수, 2수, …)를 노드 예산 안에서 한다. 시간으로 끊지 않는 까닭: 온라인 판 끝 검증에서
 * 참가자가 같은 컴퓨터·같은 난수로 컴퓨터 수를 다시 계산해 기록과 맞춘다. 노드 수로 끊으면 어떤 기기에서도
 * 같은 입력이면 같은 수가 나온다. 그래서 이 파일은 정수 계산만 하고, 호출 사이에 남는 상태가 없다
 * (치환표·킬러·히스토리 표는 부를 때마다 비운다).
 */

/** 이긴 판의 값. 몇 수 만에 이기는지를 빼서 빨리 이기는 외통을 고른다 */
const MATE = 1_000_000;
const MATE_BOUND = MATE - 1000;
/**
 * 점수로 판이 끝났을 때(빅장·같은 판 세 번·수 한도)의 값. 차 둘쯤으로 둔다.
 * 아주 크게 두면 조금만 앞서도 빅장으로 판을 끝내 버린다. 크게 앞섰으면 외통을 노리게 한다
 */
const DECIDED = 2500;
const INF = 2_000_000;
/** 지난 판과 같은 판이 되는 수의 감점·가산(졸 반 개쯤) */
const REPEAT_ADJUST = 80;

const MAX_PLY = 64;
const MAX_MOVES = 160;
/** 잡는 수만 이어 보는 깊이 */
const Q_DEPTH = 6;

/** 종류별 기물 값(점수 ×100). 궁은 0 */
const VALUE = [0, 0, 300, 1300, 700, 500, 300, 200];
/** 궁에 가까이 간 공격 기물에 주는 값(가까움 한 칸마다) */
const ATTACK = [0, 0, 0, 4, 3, 5, 0, 2];
/** 판에 남은 기물(궁 빼고)이 하나 줄 때마다 포 값이 줄어드는 정도. 넘을 기물이 적어진다 */
const CANNON_FADE = 8;
const START_PIECES = 30;
/** 한의 덤(1.5점) */
const HAN_BONUS = 150;

// --- 미리 계산하는 표 -------------------------------------------------------

/** [부호*90 + 칸] 기물 값 + 자리 값(옛 고수 `evaluate`의 자리 값과 같다) */
const PST = new Int32Array(16 * CELLS);
/** [칸*90 + 궁 자리] 가까움(7 - 맨해튼 거리, 0 아래는 0) */
const CLOSE = new Int8Array(CELLS * CELLS);
/** [칸*90 + 궁 자리] 같은 줄이거나 가로세로 3칸 안이면 1 */
const LINKED = new Uint8Array(CELLS * CELLS);

for (let code = 1; code < 16; code++) {
  const kind = code & 7;
  if (kind === 0) continue;
  const side = code >> 3;
  for (let at = 0; at < CELLS; at++) {
    const x = at % WIDTH;
    const y = Math.floor(at / WIDTH);
    const advance = side === 0 ? 6 - y : y - 3;
    const center = 4 - Math.abs(x - 4);
    let bonus = 0;
    if (kind === P)
      bonus = Math.max(0, advance) * 12 + (advance >= 4 ? center * 6 : 0);
    else if (kind === N) bonus = center * 6 + Math.max(0, advance) * 4;
    else if (kind === R || kind === C)
      bonus = center * 3 + Math.max(0, advance) * 3;
    PST[code * CELLS + at] = (VALUE[kind] as number) + bonus;
  }
}
for (let a = 0; a < CELLS; a++)
  for (let k = 0; k < CELLS; k++) {
    const d =
      Math.abs((a % WIDTH) - (k % WIDTH)) +
      Math.abs(Math.floor(a / WIDTH) - Math.floor(k / WIDTH));
    CLOSE[a * CELLS + k] = Math.max(0, 7 - d);
    const dx = Math.abs((a % WIDTH) - (k % WIDTH));
    const dy = Math.abs(Math.floor(a / WIDTH) - Math.floor(k / WIDTH));
    LINKED[a * CELLS + k] =
      dx === 0 || dy === 0 || (dx <= 3 && dy <= 3) ? 1 : 0;
  }

/**
 * 이 칸의 기물이 움직여 궁이 장군을 받거나 풀릴 수 있나(같은 줄이거나 가로세로 3칸 안).
 * 차·포는 줄로, 마·상의 다리와 졸·궁성 대각선은 3칸 안에서만 궁에 닿는다.
 * 출발·도착 칸이 둘 다 아니면 장군 판정을 건너뛴다
 */
function linked(m: number, king: number): boolean {
  return (
    LINKED[moveFrom(m) * CELLS + king] === 1 ||
    LINKED[moveTo(m) * CELLS + king] === 1
  );
}

/**
 * [편*90 + 칸] 그 편이 노리는 상대 궁성 둘레(궁성 세 줄 + 그 앞 한 줄, 가로는 궁성 양옆 한 줄까지)
 */
const ZONE = new Uint8Array(2 * CELLS);
/** [편*90 + 칸] 상대 궁성의 대각선 점(모서리 넷과 가운데) */
const PDIAG = new Uint8Array(2 * CELLS);
for (let at = 0; at < CELLS; at++) {
  const x = at % WIDTH;
  const y = Math.floor(at / WIDTH);
  // 초(0)는 위쪽 한 궁성(y 0~2)을, 한(1)은 아래쪽 초 궁성(y 7~9)을 노린다.
  if (x >= 2 && x <= 6 && y <= 3) ZONE[at] = 1;
  if (x >= 2 && x <= 6 && y >= 6) ZONE[CELLS + at] = 1;
  const corner =
    (x === 3 || x === 5) && (y === 0 || y === 2 || y === 7 || y === 9);
  const center = x === 4 && (y === 1 || y === 8);
  if (corner || center) PDIAG[(y <= 2 ? 0 : 1) * CELLS + at] = 1;
}

// --- 계획(plan.ts가 정하고 탐색 내내 그대로 쓴다) ---------------------------
const PLAN_NONE = 0;
const PLAN_DEVELOP = 1;
const PLAN_ATTACK = 2;
const PLAN_SIMPLIFY = 3;
const PLAN_MATE = 4;
const PLAN_DEFEND = 5;
let plan = PLAN_NONE;
let planSide = 0;
let planWingX = 4;
let planBackRow = 9;
let planPalaceCenter = 76;
/** 계획을 세운 편이 기물 점수로 앞섰나(같은 판 되풀이를 피할지 반길지) */
let planAhead = false;

function setPlan(weights: PlanWeights | null): void {
  if (!weights) {
    plan = PLAN_NONE;
    return;
  }
  const id = weights.id;
  plan =
    id === "develop"
      ? PLAN_DEVELOP
      : id === "simplify"
        ? PLAN_SIMPLIFY
        : id === "mate"
          ? PLAN_MATE
          : id === "defend"
            ? PLAN_DEFEND
            : PLAN_ATTACK;
  planSide = weights.side;
  planWingX = weights.wingX;
  planBackRow = weights.side === 0 ? 9 : 0;
  planPalaceCenter = weights.side === 0 ? 76 : 13;
  planAhead = weights.lead > 0;
}

/** 판 기억 열쇠(Zobrist). 늘 같은 씨앗으로 만든다 */
const Z_LO = new Int32Array(16 * CELLS);
const Z_HI = new Int32Array(16 * CELLS);
let zSeed = 0x9e3779b9 | 0;
function zNext(): number {
  zSeed ^= zSeed << 13;
  zSeed ^= zSeed >>> 17;
  zSeed ^= zSeed << 5;
  return zSeed | 0;
}
for (let i = 0; i < 16 * CELLS; i++) {
  Z_LO[i] = zNext();
  Z_HI[i] = zNext();
}
const SIDE_LO = zNext();
const SIDE_HI = zNext();

// --- 치환표(본 판 기억) ------------------------------------------------------

const TT_BITS = 17;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const EXACT = 1;
const LOWER = 2;
const UPPER = 3;
const ttLo = new Int32Array(TT_SIZE);
const ttHi = new Int32Array(TT_SIZE);
const ttScore = new Int32Array(TT_SIZE);
const ttMove = new Int32Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttFlag = new Uint8Array(TT_SIZE);

// --- 탐색 중 상태(부를 때마다 처음부터 채운다) ------------------------------

const moves = new Int32Array(MAX_PLY * MAX_MOVES);
const order = new Int32Array(MAX_PLY * MAX_MOVES);
const killers = new Int32Array(MAX_PLY * 2);
const history = new Int32Array(CELLS * CELLS);
const pathLo = new Int32Array(MAX_PLY + 2);
const pathHi = new Int32Array(MAX_PLY + 2);
const kings = new Int32Array(2);

let b: Int8Array = new Int8Array(CELLS);
let lo = 0;
let hi = 0;
let nodes = 0;
let hardLimit = 0;
let aborted = false;
let bikjangScore = true;
let rootPlayed = 0;
/** 장군 연장은 이 깊이(수)까지만. 장군이 끝없이 이어지는 길에서 예산을 다 쓰지 않게 */
let extendUntil = 0;
let seen = new Map<number, number>();
/** 지난 판 모양이 있을 수도 있는 칸(열쇠 아래 10비트). 없으면 Map을 찾지 않는다 */
const seenBits = new Uint8Array(1024);

const keyOf = (l: number, h: number) => (h & 0x1fffff) * 4294967296 + (l >>> 0);

function hashBoard(board: Int8Array, side: number): [number, number] {
  let l = side ? SIDE_LO : 0;
  let h = side ? SIDE_HI : 0;
  for (let at = 0; at < CELLS; at++) {
    const code = board[at] as number;
    if (code === 0) continue;
    l ^= Z_LO[code * CELLS + at] as number;
    h ^= Z_HI[code * CELLS + at] as number;
  }
  return [l, h];
}

function make(m: number): number {
  const from = moveFrom(m);
  const to = moveTo(m);
  const code = b[from] as number;
  const cap = b[to] as number;
  b[to] = code;
  b[from] = 0;
  lo ^=
    (Z_LO[code * CELLS + from] as number) ^
    (Z_LO[code * CELLS + to] as number) ^
    SIDE_LO;
  hi ^=
    (Z_HI[code * CELLS + from] as number) ^
    (Z_HI[code * CELLS + to] as number) ^
    SIDE_HI;
  if (cap !== 0) {
    lo ^= Z_LO[cap * CELLS + to] as number;
    hi ^= Z_HI[cap * CELLS + to] as number;
  }
  if ((code & 7) === K) kings[code >> 3] = to;
  return cap;
}

function unmake(m: number, cap: number): void {
  const from = moveFrom(m);
  const to = moveTo(m);
  const code = b[to] as number;
  b[from] = code;
  b[to] = cap;
  lo ^=
    (Z_LO[code * CELLS + from] as number) ^
    (Z_LO[code * CELLS + to] as number) ^
    SIDE_LO;
  hi ^=
    (Z_HI[code * CELLS + from] as number) ^
    (Z_HI[code * CELLS + to] as number) ^
    SIDE_HI;
  if (cap !== 0) {
    lo ^= Z_LO[cap * CELLS + to] as number;
    hi ^= Z_HI[cap * CELLS + to] as number;
  }
  if ((code & 7) === K) kings[code >> 3] = from;
}

/** 두 궁이 사이에 기물 없이 마주 보나(빅장). 한 궁이 늘 위쪽이다 */
function facing(): boolean {
  const c = kings[0] as number;
  const h = kings[1] as number;
  if (c % WIDTH !== h % WIDTH) return false;
  for (let at = h + WIDTH; at < c; at += WIDTH) if (b[at] !== 0) return false;
  return true;
}

/** 점수로 끝난 판의 값(`side`에서 본). 한의 덤이 0.5점 단위라 비기지 않는다 */
function decided(side: number): number {
  let diff = -HAN_BONUS;
  for (let at = 0; at < CELLS; at++) {
    const code = b[at] as number;
    if (code === 0) continue;
    const v = VALUE[code & 7] as number;
    diff += code >> 3 ? -v : v;
  }
  if (side === 1) diff = -diff;
  return diff > 0 ? DECIDED : -DECIDED;
}

/**
 * `side`가 방금 둬서 빅장이 됐을 때의 값. 엔진처럼 외통을 먼저 따진다:
 * 상대가 장군을 받고 피할 수가 없으면 외통, 아니면 점수로 끝난다. `ply`는 상대 차례의 깊이
 */
function bikjangEnd(side: number, ply: number): number {
  const opp = 1 - side;
  const king = kings[opp] as number;
  if (!attacked(b, king, side)) return decided(side);
  const start = (MAX_PLY - 1) * MAX_MOVES;
  const end = generate(b, opp, moves, start, false);
  for (let i = start; i < end; i++) {
    const m = moves[i] as number;
    const cap = make(m);
    const safe = !attacked(b, kings[opp] as number, side);
    unmake(m, cap);
    if (safe) return decided(side);
  }
  return MATE - ply;
}

/** 이 판이 세 번째로 나왔나(그러면 점수로 끝난다). `ply`는 이 판의 깊이 */
function thirdTime(ply: number): boolean {
  let count = seenBits[lo & 1023] ? (seen.get(keyOf(lo, hi)) ?? 0) : 0;
  for (let p = ply - 2; p >= 1; p -= 2)
    if (pathLo[p] === lo && pathHi[p] === hi) count++;
  return count >= 2;
}

/** 그 편의 큰 기물(차·포·마) 수 */
function majors(side: number): number {
  let n = 0;
  for (let at = 0; at < CELLS; at++) {
    const code = b[at] as number;
    if (code === 0 || code >> 3 !== side) continue;
    const kind = code & 7;
    if (kind === R || kind === C || kind === N) n++;
  }
  return n;
}

/** 계획을 세운 편의 기물 하나에 주는 계획 가산점 */
function planBonus(kind: number, at: number, enemyKing: number): number {
  switch (plan) {
    case PLAN_DEVELOP:
      // 차·마·상이 첫 줄을 떠나면 더하고, 궁은 궁성 가운데에 둔다.
      if (kind === R || kind === N || kind === E)
        return Math.floor(at / WIDTH) === planBackRow ? 0 : 15;
      if (kind === K) return at === planPalaceCenter ? 0 : -20;
      return 0;
    case PLAN_ATTACK: {
      if (kind !== R && kind !== C && kind !== N && kind !== P) return 0;
      let v = 0;
      if (ZONE[planSide * CELLS + at] === 1) {
        v += 12;
        if (Math.abs((at % WIDTH) - planWingX) <= 1) v += 10;
      }
      // 궁성 대각선 점에 선 차·포·졸은 궁을 곧바로 노린다.
      if (kind !== N && PDIAG[planSide * CELLS + at] === 1) v += 12;
      return v;
    }
    case PLAN_MATE: {
      const w = ATTACK[kind] as number;
      return w * (CLOSE[at * CELLS + enemyKing] as number);
    }
    case PLAN_DEFEND: {
      const king = kings[planSide] as number;
      if (kind === A || kind === E)
        return (CLOSE[at * CELLS + king] as number) >= 5 ? 15 : 0;
      if (kind === R || kind === C || kind === N)
        return ZONE[(1 - planSide) * CELLS + at] === 1 ? 8 : 0;
      return 0;
    }
    default:
      return 0;
  }
}

/** 외통 몰기: 상대 궁이 갈 수 있는 궁성 칸 가운데 막힌 칸(제 기물·내가 노리는 칸)마다 */
function kingBox(): number {
  const enemy = 1 - planSide;
  const king = kings[enemy] as number;
  let boxed = 0;
  for (const to of PALACE_STEP[enemy * CELLS + king] as number[]) {
    const code = b[to] as number;
    if ((code !== 0 && code >> 3 === enemy) || attacked(b, to, planSide))
      boxed++;
  }
  return boxed * 25;
}

/** `side`(0 초, 1 한)에서 본 판 값(점수 ×100). 계획을 세운 편에는 계획 가산점을 더한다 */
function evaluate(side: number): number {
  let score = -HAN_BONUS;
  let pieces = 0;
  let cannons = 0;
  let material = -HAN_BONUS;
  const kc = kings[0] as number;
  const kh = kings[1] as number;
  for (let at = 0; at < CELLS; at++) {
    const code = b[at] as number;
    if (code === 0) continue;
    const kind = code & 7;
    const han = code >> 3;
    let v = PST[code * CELLS + at] as number;
    const enemyKing = han ? kc : kh;
    const w = ATTACK[kind] as number;
    if (w !== 0) v += w * (CLOSE[at * CELLS + enemyKing] as number);
    if (han === planSide && plan !== PLAN_NONE)
      v += planBonus(kind, at, enemyKing);
    if (kind !== K) pieces++;
    if (kind === C) cannons += han ? -1 : 1;
    score += han ? -v : v;
    material += han ? -(VALUE[kind] as number) : (VALUE[kind] as number);
  }
  score -= cannons * (START_PIECES - pieces) * CANNON_FADE;
  if (plan === PLAN_SIMPLIFY || plan === PLAN_MATE) {
    // 앞선 편은 기물이 줄수록 값이 오른다(맞바꿔 이득을 굳힌다).
    const lead = planSide === 0 ? material : -material;
    if (lead > 0) {
      const extra = Math.floor((lead * (START_PIECES - pieces)) / 40);
      score += planSide === 0 ? extra : -extra;
    }
  }
  if (plan === PLAN_MATE) {
    const box = kingBox();
    score += planSide === 0 ? box : -box;
  }
  return side === 0 ? score : -score;
}

function quiesce(
  alpha: number,
  beta: number,
  ply: number,
  side: number,
  depth: number,
  inCheck: boolean,
): number {
  if (++nodes >= hardLimit) {
    aborted = true;
    return 0;
  }
  const stand = evaluate(side);
  if (stand >= beta || depth === 0 || ply >= MAX_PLY - 1) return stand;
  let a = stand > alpha ? stand : alpha;
  const start = ply * MAX_MOVES;
  const end = generate(b, side, moves, start, true);
  for (let i = start; i < end; i++) {
    const m = moves[i] as number;
    order[i] =
      (VALUE[(b[moveTo(m)] as number) & 7] as number) * 16 -
      ((VALUE[(b[moveFrom(m)] as number) & 7] as number) >> 4);
  }
  const opp = 1 - side;
  for (let i = start; i < end; i++) {
    pickNext(i, end);
    const m = moves[i] as number;
    // 잡아도 따라잡지 못할 만큼 모자라면 읽지 않는다.
    if (stand + (VALUE[(b[moveTo(m)] as number) & 7] as number) + 200 < a)
      continue;
    const cap = make(m);
    if (
      (inCheck || linked(m, kings[side] as number)) &&
      attacked(b, kings[side] as number, opp)
    ) {
      unmake(m, cap);
      continue;
    }
    let score: number;
    if (facing()) {
      if (!bikjangScore) {
        unmake(m, cap);
        continue;
      }
      score = bikjangEnd(side, ply + 1);
    } else {
      const check =
        linked(m, kings[opp] as number) &&
        attacked(b, kings[opp] as number, side);
      score = -quiesce(-beta, -a, ply + 1, opp, depth - 1, check);
    }
    unmake(m, cap);
    if (aborted) return 0;
    if (score >= beta) return score;
    if (score > a) a = score;
  }
  return a;
}

/** `order` 값이 가장 큰 수를 `i` 자리로 옮긴다(남은 수 가운데) */
function pickNext(i: number, end: number): void {
  let best = i;
  for (let j = i + 1; j < end; j++)
    if ((order[j] as number) > (order[best] as number)) best = j;
  if (best !== i) {
    const m = moves[i] as number;
    moves[i] = moves[best] as number;
    moves[best] = m;
    const o = order[i] as number;
    order[i] = order[best] as number;
    order[best] = o;
  }
}

function search(
  depthIn: number,
  alphaIn: number,
  beta: number,
  ply: number,
  side: number,
  inCheck: boolean,
  prevPass: boolean,
): number {
  if (rootPlayed + ply >= MOVE_LIMIT) return decided(side);
  let depth = depthIn;
  // 장군을 받으면 한 수 더 읽는다(외통을 끝까지 따라간다).
  if (inCheck && ply < extendUntil) depth++;
  if (depth <= 0) return quiesce(alphaIn, beta, ply, side, Q_DEPTH, inCheck);
  if (++nodes >= hardLimit) {
    aborted = true;
    return 0;
  }
  if (ply >= MAX_PLY - 1) return evaluate(side);
  let alpha = alphaIn;
  // 이미 더 빨리 이기는 길이 있으면 더 읽지 않는다.
  const mateHere = MATE - ply;
  if (alpha < -mateHere) alpha = -mateHere;
  if (beta > mateHere - 1) beta = mateHere - 1;
  if (alpha >= beta) return alpha;

  const slot = lo & TT_MASK;
  let ttm = 0;
  if (ttFlag[slot] !== 0 && ttLo[slot] === lo && ttHi[slot] === hi) {
    ttm = ttMove[slot] as number;
    if ((ttDepth[slot] as number) >= depth) {
      let s = ttScore[slot] as number;
      if (s > MATE_BOUND) s -= ply;
      else if (s < -MATE_BOUND) s += ply;
      const flag = ttFlag[slot];
      if (
        flag === EXACT ||
        (flag === LOWER && s >= beta) ||
        (flag === UPPER && s <= alpha)
      )
        return s;
    }
  }

  const opp = 1 - side;
  // 쉬어 봐도 이기면 더 읽지 않는다. 장기는 장군이 아닐 때 쉬기가 늘 되는 수라 이 어림이 맞다.
  // 다만 큰 기물이 적은 쪽(궁만 남은 쪽 등)은 얕게 읽은 쉬기로 외통을 놓치므로 하지 않는다.
  if (!inCheck && !prevPass && depth >= 3 && beta < MATE_BOUND) {
    if (majors(side) >= 2 && evaluate(side) >= beta) {
      lo ^= SIDE_LO;
      hi ^= SIDE_HI;
      const r = depth >= 6 ? 3 : 2;
      const s = -search(
        depth - 1 - r,
        -beta,
        -beta + 1,
        ply + 1,
        opp,
        false,
        true,
      );
      lo ^= SIDE_LO;
      hi ^= SIDE_HI;
      if (aborted) return 0;
      if (s >= beta) return s >= MATE_BOUND ? beta : s;
    }
  }

  const start = ply * MAX_MOVES;
  const end = generate(b, side, moves, start, false);
  const k1 = killers[ply * 2] as number;
  const k2 = killers[ply * 2 + 1] as number;
  const enemyKing = kings[opp] as number;
  for (let i = start; i < end; i++) {
    const m = moves[i] as number;
    const to = moveTo(m);
    const victim = (b[to] as number) & 7;
    if (m === ttm) order[i] = 1 << 30;
    else if (victim !== 0) {
      const value = VALUE[victim] as number;
      const attacker = VALUE[(b[moveFrom(m)] as number) & 7] as number;
      // 공짜 기물이나 더 싼 기물로 잡는 수를 먼저, 지켜진 기물을 비싼 기물로 잡는 수는 조용한 수 앞까지만.
      const bad = attacker > value && attacked(b, to, opp);
      order[i] = (bad ? 1 << 25 : 1 << 28) + value * 16 - (attacker >> 4);
    } else if (m === k1) order[i] = 1 << 27;
    else if (m === k2) order[i] = (1 << 27) - 1;
    else {
      order[i] = history[moveFrom(m) * CELLS + to] as number;
      // 장군 거는 조용한 수(포 다리 놓기·치우기로 생기는 장군 포함)는 킬러 다음에 본다.
      if (depth >= 2 && linked(m, enemyKing)) {
        const cap = make(m);
        if (attacked(b, kings[opp] as number, side))
          order[i] = (1 << 26) + (order[i] as number);
        unmake(m, cap);
      }
    }
  }

  const alphaStart = alpha;
  let best = -INF;
  let bestMove = 0;
  let searched = 0;
  for (let i = start; i < end; i++) {
    pickNext(i, end);
    const m = moves[i] as number;
    const cap = make(m);
    if (
      (inCheck || linked(m, kings[side] as number)) &&
      attacked(b, kings[side] as number, opp)
    ) {
      unmake(m, cap);
      continue;
    }
    let score: number;
    if (facing()) {
      if (!bikjangScore) {
        unmake(m, cap);
        continue;
      }
      score = bikjangEnd(side, ply + 1);
    } else {
      pathLo[ply + 1] = lo;
      pathHi[ply + 1] = hi;
      if (cap === 0 && thirdTime(ply + 1)) score = decided(side);
      else {
        const check =
          linked(m, kings[opp] as number) &&
          attacked(b, kings[opp] as number, side);
        if (searched === 0)
          score = -search(depth - 1, -beta, -alpha, ply + 1, opp, check, false);
        else {
          // 뒤에 오는 조용한 수는 얕게 먼저 본다. 좋아 보이면 제 깊이로 다시 읽는다.
          let reduce = 0;
          if (
            depth >= 3 &&
            searched >= 3 &&
            !inCheck &&
            !check &&
            cap === 0 &&
            m !== k1 &&
            m !== k2
          )
            reduce = searched >= 10 && depth >= 5 ? 2 : 1;
          score = -search(
            depth - 1 - reduce,
            -alpha - 1,
            -alpha,
            ply + 1,
            opp,
            check,
            false,
          );
          if (!aborted && reduce > 0 && score > alpha)
            score = -search(
              depth - 1,
              -alpha - 1,
              -alpha,
              ply + 1,
              opp,
              check,
              false,
            );
          if (!aborted && score > alpha && score < beta)
            score = -search(
              depth - 1,
              -beta,
              -alpha,
              ply + 1,
              opp,
              check,
              false,
            );
        }
      }
    }
    unmake(m, cap);
    if (aborted) return 0;
    searched++;
    if (score > best) {
      best = score;
      bestMove = m;
      if (score > alpha) {
        alpha = score;
        if (alpha >= beta) {
          if (cap === 0) {
            if (m !== k1) {
              killers[ply * 2 + 1] = k1;
              killers[ply * 2] = m;
            }
            const h = moveFrom(m) * CELLS + moveTo(m);
            history[h] = (history[h] as number) + depth * depth;
            if ((history[h] as number) > 1 << 24)
              for (let j = 0; j < history.length; j++)
                history[j] = (history[j] as number) >> 1;
          }
          break;
        }
      }
    }
  }

  if (searched === 0) {
    // 둘 수가 없다: 장군이면 외통, 아니면 쉰다(둘이 이어 쉬면 점수로 끝난다).
    if (inCheck) return -mateHere;
    if (prevPass) return decided(side);
    lo ^= SIDE_LO;
    hi ^= SIDE_HI;
    const s = -search(depth - 1, -beta, -alpha, ply + 1, opp, false, true);
    lo ^= SIDE_LO;
    hi ^= SIDE_HI;
    return aborted ? 0 : s;
  }

  ttLo[slot] = lo;
  ttHi[slot] = hi;
  ttDepth[slot] = depth;
  ttMove[slot] = bestMove;
  ttScore[slot] =
    best > MATE_BOUND ? best + ply : best < -MATE_BOUND ? best - ply : best;
  ttFlag[slot] = best >= beta ? LOWER : best > alphaStart ? EXACT : UPPER;
  return best;
}

export interface DeepOptions {
  /** 이 노드 수를 넘으면 읽던 깊이를 그만두고 앞 깊이까지의 결과를 쓴다 */
  nodes: number;
  /** 한 깊이를 다 읽었을 때 이 노드 수를 넘었으면 다음 깊이를 시작하지 않는다 */
  softNodes: number;
  maxDepth?: number;
  /** false면 계획 가산점 없이 읽는다(비교용). 기본은 계획을 세운다 */
  plan?: boolean;
}

export interface DeepResult {
  move: Move | null;
  /** 둔 편에서 본 값 */
  score: number;
  /** 끝까지 읽은 깊이 */
  depth: number;
  nodes: number;
}

/** 지금 둘 차례인 화면에서 가장 좋은 수를 찾는다. 같은 화면·같은 난수면 늘 같은 수 */
export function deepSearch(
  view: JanggiView,
  rng: RngState,
  options: DeepOptions,
): DeepResult {
  const legal = view.legal;
  if (legal.length === 0) return { move: null, score: 0, depth: 0, nodes: 0 };
  // 같은 값인 수끼리는 난수로 섞어 매번 같은 판이 되지 않게 한다.
  const root = legal.map((m) => encodeMove(m.from, m.to));
  for (let i = root.length - 1; i > 0; i--) {
    const j = nextInt(rng, i + 1);
    const t = root[i] as number;
    root[i] = root[j] as number;
    root[j] = t;
  }
  const decode = (m: number): Move => ({ from: moveFrom(m), to: moveTo(m) });
  if (root.length === 1)
    return { move: decode(root[0] as number), score: 0, depth: 0, nodes: 0 };

  const side = sideIndex(sideOfSeat(view, view.mySeat));
  const opp = 1 - side;
  b = toFast(view.board);
  kings[0] = b.indexOf(codeOf("cK"));
  kings[1] = b.indexOf(codeOf("hK"));
  [lo, hi] = hashBoard(b, side);
  ttFlag.fill(0);
  killers.fill(0);
  history.fill(0);
  nodes = 0;
  hardLimit = options.nodes;
  aborted = false;
  bikjangScore = view.rules.bikjang === "score";
  rootPlayed = view.played.length;
  seen = new Map();
  seenBits.fill(0);
  for (const key of view.positions) {
    const [cells = "", turn] = key.split("|");
    const board = new Int8Array(CELLS);
    cells.split(",").forEach((cell, at) => {
      board[at] = codeOf(cell as never);
    });
    const [l, h] = hashBoard(board, turn === "h" ? 1 : 0);
    const k = keyOf(l, h);
    seen.set(k, (seen.get(k) ?? 0) + 1);
    seenBits[l & 1023] = 1;
  }
  pathLo[0] = lo;
  pathHi[0] = hi;
  setPlan(options.plan === false ? null : planFor(b, side, rootPlayed));

  // 처음 줄: 큰 기물을 잡는 수부터(섞은 차례는 같은 값끼리 지킨다).
  const scores = root.map(
    (m) => (VALUE[(b[moveTo(m)] as number) & 7] as number) * 16,
  );
  sortRoot(root, scores);

  let bestMove = root[0] as number;
  let bestScore = 0;
  let reached = 0;
  const maxDepth = options.maxDepth ?? 30;
  for (let depth = 1; depth <= maxDepth; depth++) {
    extendUntil = Math.min(MAX_PLY / 2, depth * 2 + 2);
    let alpha = -INF;
    let iterBest = -1;
    for (let i = 0; i < root.length; i++) {
      const m = root[i] as number;
      const cap = make(m);
      let score: number;
      if (facing()) score = bikjangEnd(side, 1);
      else {
        pathLo[1] = lo;
        pathHi[1] = hi;
        if (cap === 0 && thirdTime(1)) score = decided(side);
        else {
          // 지난 판과 같은 판이 되는 수: 앞섰으면 감점(판을 앞으로 끌고 간다), 뒤졌으면 가산.
          const adj =
            cap === 0 && seenBits[lo & 1023] && seen.has(keyOf(lo, hi))
              ? planAhead
                ? -REPEAT_ADJUST
                : REPEAT_ADJUST
              : 0;
          const target = alpha === -INF ? -INF : alpha - adj;
          const check =
            linked(m, kings[opp] as number) &&
            attacked(b, kings[opp] as number, side);
          if (i === 0)
            score =
              adj - search(depth - 1, -INF, -target, 1, opp, check, false);
          else {
            score =
              adj -
              search(depth - 1, -target - 1, -target, 1, opp, check, false);
            if (!aborted && score > alpha)
              score =
                adj - search(depth - 1, -INF, -target, 1, opp, check, false);
          }
        }
      }
      unmake(m, cap);
      if (aborted) break;
      scores[i] = score;
      if (score > alpha) {
        alpha = score;
        iterBest = i;
      }
    }
    // 끝까지 못 읽은 깊이라도, 다 읽은 수 가운데 앞 깊이의 최선보다 나은 수가 나왔으면 그 수를 쓴다.
    if (iterBest >= 0) {
      bestMove = root[iterBest] as number;
      bestScore = alpha;
    }
    if (aborted) break;
    reached = depth;
    // 다음 깊이는 이번 최선 수부터, 나머지는 값 차례로 읽는다.
    scores[iterBest] = INF;
    sortRoot(root, scores);
    // 외통을 찾았고 그 길이가 이번 깊이 안이면 더 빠른 외통은 없다(더 긴 외통을 장군 연장으로 먼저 볼 수 있다).
    if (MATE - Math.abs(bestScore) <= depth) break;
    if (nodes >= options.softNodes) break;
  }
  return { move: decode(bestMove), score: bestScore, depth: reached, nodes };
}

/** 값이 큰 차례로(같은 값은 원래 차례를 지킨다) */
function sortRoot(root: number[], scores: number[]): void {
  for (let i = 1; i < root.length; i++) {
    const m = root[i] as number;
    const s = scores[i] as number;
    let j = i - 1;
    while (j >= 0 && (scores[j] as number) < s) {
      root[j + 1] = root[j] as number;
      scores[j + 1] = scores[j] as number;
      j--;
    }
    root[j + 1] = m;
    scores[j + 1] = s;
  }
}
