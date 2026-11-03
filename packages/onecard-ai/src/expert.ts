/*
 * 고수(docs/42 13절): 중수의 셈에 셋을 더한다.
 * - 버린 카드 세기: 내 손패와 버린 더미를 뺀 카드만 남의 손패·더미에 있을 수 있다
 * - 없는 무늬 기억: 공격 없이 먹은 자리는 그때 무늬가 없다고 보고, 짐작 판에서 그 무늬를 덜 준다(`OnecardMemory`)
 * - 짧은 탐색: 보이지 않는 카드를 씨앗 난수로 여러 번 나눠 보고(남의 손패 짐작 판), 후보마다
 *   모두가 중수처럼 몇 차례 더 둬 본 뒤 손패 장 수로 판을 매긴다. 방향·건너뛰기·공격으로
 *   위험한 사람(1~2장)을 막는 순서도 이 굴려 보기에서 드러난다
 * 남의 패는 보지 않는다(짐작 표본만 쓴다).
 */
import { nextInt, type RngState } from "@game/mighty-engine";
import {
  type Action,
  legalActions,
  ONECARD_DECK,
  type OnecardCard,
  type OnecardState,
  type OnecardView,
  rankOf,
  type Suit,
  seededReshuffle,
  step,
  suitOf,
} from "@game/onecard-engine";

import {
  intermediateMove,
  type OnecardBot,
  type PlayContext,
  scorePlay,
} from "./bots";
import type { OnecardMemory } from "./memory";
import { playMoves } from "./table";

/**
 * 고수 셈의 크기(docs/42 13절에서 골랐다). 굴려 보기를 길게(48차례) 하면 판 끝 운이 섞여 오히려 약해지고,
 * 먹기를 후보에 넣으면 잡음에 끌려 괜히 먹는 일이 생겨 약해졌다
 */
export interface ExpertOptions {
  /** 짐작 판 수 */
  samples: number;
  /** 굴려 보는 차례 행동 수 */
  plies: number;
  /** 중수 점수로 고른 후보 수(나머지는 굴려 보지 않는다) */
  candidates: number;
  /** 공격이 없을 때 먹기도 후보로 본다 */
  draw: boolean;
}

export const EXPERT_OPTIONS: ExpertOptions = {
  samples: 24,
  plies: 24,
  candidates: 5,
  draw: false,
};

/** 내가 볼 수 없는 카드(남의 손패 + 더미) = 전체 − 내 손패 − 버린 더미 */
export function unseenCards(view: OnecardView): OnecardCard[] {
  const seen = new Set<OnecardCard>([...view.hand, ...view.pile]);
  return ONECARD_DECK.filter((c) => !seen.has(c));
}

function allowedFor(
  card: OnecardCard,
  voids: readonly Suit[],
  noJoker: boolean,
): boolean {
  const suit = suitOf(card);
  if (suit === null) return !noJoker;
  return !voids.includes(suit);
}

/**
 * 짐작 하나: 보이지 않는 카드를 섞어 남의 손패와 더미를 채운 엔진 상태.
 * 기억이 있으면 없는 무늬를 피해 나눈다(짐작한 뒤 새로 받은 장 수만큼은 아무 카드나)
 */
export function determinize(
  view: OnecardView,
  rng: RngState,
  memory?: OnecardMemory,
): OnecardState {
  const pool = unseenCards(view);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = nextInt(rng, i + 1);
    [pool[i], pool[j]] = [pool[j] as OnecardCard, pool[i] as OnecardCard];
  }
  const n = view.rules.players;
  const hands: OnecardCard[][] = Array.from({ length: n }, () => []);
  hands[view.mySeat] = [...view.hand];
  const used = new Set<OnecardCard>();
  // 짐작이 있는 자리부터: 제한된 몫을 먼저 고른다
  const order = view.handCounts
    .map((_, s) => s)
    .filter((s) => s !== view.mySeat)
    .sort(
      (a, b) =>
        (memory?.voids[b]?.length ?? 0) - (memory?.voids[a]?.length ?? 0),
    );
  for (const seat of order) {
    const count = view.handCounts[seat] ?? 0;
    const voids = memory?.voids[seat] ?? [];
    const noJoker = memory?.noJoker[seat] ?? false;
    const limited = Math.max(0, count - (memory?.fresh[seat] ?? count));
    const hand = hands[seat] as OnecardCard[];
    for (const card of pool) {
      if (hand.length >= limited) break;
      if (!used.has(card) && allowedFor(card, voids, noJoker)) {
        hand.push(card);
        used.add(card);
      }
    }
  }
  for (const seat of order) {
    const count = view.handCounts[seat] ?? 0;
    const hand = hands[seat] as OnecardCard[];
    for (const card of pool) {
      if (hand.length >= count) break;
      if (!used.has(card)) {
        hand.push(card);
        used.add(card);
      }
    }
  }
  const deck = pool.filter((c) => !used.has(c));
  return {
    rules: view.rules,
    version: view.version,
    turnNo: view.turnNo,
    phase: view.phase,
    turn: view.turn,
    direction: view.direction,
    deck,
    pile: [...view.pile],
    hands,
    suit: view.suit,
    attack: view.attack,
    preCalled: new Array<boolean>(n).fill(false),
    // 가상 판에서는 외침을 따지지 않는다(창을 열지 않게 모두 외친 것으로)
    called: new Array<boolean>(n).fill(true),
    windows: [],
    nextWindowId: 1,
    queue: [],
    endTurnAfterQueue: false,
    finished: [...view.finished],
    bankrupt: [...view.bankrupt],
    bankruptCounts: new Array<number>(n).fill(0),
    recent: [{ turnNo: view.turnNo, exposed: [] }],
    result: null,
  };
}

/** 가상 판이 끝난 뒤 내 쪽에서 본 값. 높을수록 좋다 */
function judge(state: OnecardState, me: number, before: number): number {
  const place = state.finished.indexOf(me);
  if (place >= 0) return 60 - 10 * place;
  if (state.bankrupt.includes(me)) return -60;
  let others = 0;
  let count = 0;
  state.hands.forEach((h, s) => {
    if (s === me || state.finished.includes(s) || state.bankrupt.includes(s))
      return;
    others += h.length;
    count++;
  });
  const mine = (state.hands[me] as OnecardCard[]).length;
  const passed = state.finished.length - before;
  return -2 * mine + (count > 0 ? others / count : 0) - 12 * passed;
}

/**
 * 가상 판 안에서 중수가 볼 화면. `viewOf`와 같은 내용이지만 복사·정렬을 건너뛴다(가상 판에서만 쓴다).
 * 가상 판은 모든 패를 아는 짐작 상태라, 남의 패를 보는 것이 아니다
 */
function quickView(state: OnecardState, seat: number): OnecardView {
  return {
    rules: state.rules,
    mySeat: seat,
    version: state.version,
    turnNo: state.turnNo,
    phase: state.phase,
    turn: state.turn,
    direction: state.direction,
    hand: state.hands[seat] as OnecardCard[],
    handCounts: state.hands.map((h) => h.length),
    deckCount: state.deck.length,
    pile: state.pile,
    suit: state.suit,
    attack: state.attack,
    finished: state.finished,
    bankrupt: state.bankrupt,
    moves: legalActions(state, seat),
    decision: state.phase === "play" && state.turn === seat ? "turn" : null,
    result: state.result,
  };
}

/** 모두가 중수처럼 `plies`번 차례 행동을 해 본다 */
function rollout(
  start: OnecardState,
  plies: number,
  rng: RngState,
): OnecardState {
  let state = start;
  for (let k = 0; k < plies && state.phase !== "over"; ) {
    if (state.phase === "reshuffle") {
      const action = seededReshuffle(state, nextInt(rng, 2 ** 31)) as Action;
      const r = step(state, state.turn, action);
      if (!r.ok) return state;
      state = r.state;
      continue;
    }
    const seat = state.turn;
    const r = step(state, seat, intermediateMove(quickView(state, seat)));
    if (!r.ok) return state;
    state = r.state;
    k++;
  }
  return state;
}

/** 굴려 볼 후보: 중수 점수가 높은 카드 몇 장(7은 무늬 둘), 공격이 없으면 먹기도 */
export function expertCandidates(
  view: OnecardView,
  ctx: PlayContext,
  options: ExpertOptions = EXPERT_OPTIONS,
): Action[] {
  const plays = playMoves(view);
  const scored = plays
    .map((m) => ({ m, s: scorePlay(view, m, ctx) }))
    .sort((a, b) => b.s - a.s);
  const out: Action[] = [];
  const sevens = new Map<OnecardCard, number>();
  for (const { m } of scored) {
    if (out.length >= options.candidates) break;
    if (rankOf(m.card) === "7") {
      const used = sevens.get(m.card) ?? 0;
      if (used >= 2) continue;
      sevens.set(m.card, used + 1);
    }
    out.push(m);
  }
  if ((options.draw && view.attack === 0) || out.length === 0)
    out.push({ type: "draw" });
  return out;
}

/** 고수 수 고르기. 기억이 없으면(웹 워커처럼 화면만 받을 때) 없는 무늬 짐작 없이 센다 */
export function expertMove(
  view: OnecardView,
  rng: RngState,
  memory?: OnecardMemory,
  options: ExpertOptions = EXPERT_OPTIONS,
): Action {
  const ctx: PlayContext = memory ? { voids: memory.voids } : {};
  const plays = playMoves(view);
  if (plays.length === 0) return { type: "draw" };
  // 바로 끝낼 수 있으면 끝낸다
  const finish = plays.find(
    (m) => view.hand.length === 1 && m.card === view.hand[0],
  );
  if (finish) return finish;
  const candidates = expertCandidates(view, ctx, options);
  if (candidates.length === 1) return candidates[0] as Action;
  const plies = options.plies;
  const before = view.finished.length;
  const totals = new Array<number>(candidates.length).fill(0);
  for (let i = 0; i < options.samples; i++) {
    const world = determinize(view, rng, memory);
    const seed = nextInt(rng, 2 ** 31);
    candidates.forEach((action, c) => {
      const r = step(world, view.mySeat, action);
      if (!r.ok) {
        totals[c] = -Infinity;
        return;
      }
      // 후보끼리 같은 난수(다시 섞기)를 써서 운의 차이를 줄인다
      const end = rollout(r.state, plies, { seed });
      totals[c] = (totals[c] as number) + judge(end, view.mySeat, before);
    });
  }
  // 같으면 중수가 고른 수(후보 순서)
  let best = 0;
  for (let c = 1; c < candidates.length; c++)
    if ((totals[c] as number) > (totals[best] as number) + 1e-9) best = c;
  return candidates[best] as Action;
}

export const onecardExpertBot: OnecardBot = {
  name: "onecard-expert",
  decide(view, rng) {
    if (view.moves.length === 0)
      throw new Error("원카드 컴퓨터: 내 차례가 아닌 화면이다");
    return expertMove(view, rng);
  },
};
