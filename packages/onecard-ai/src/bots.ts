/*
 * 입문·중수의 차례 행동(docs/42 13절). 자기 화면만 본다.
 */
import { nextFloat, nextInt, type RngState } from "@game/mighty-engine";
import {
  type Action,
  attackValue,
  finishBlocked,
  isAttackCard,
  isJoker,
  type OnecardCard,
  type OnecardView,
  RANKS,
  rankOf,
  SUITS,
  type Suit,
  suitOf,
} from "@game/onecard-engine";

import {
  activeCount,
  type PlayAction,
  playMoves,
  seatAfter,
  suitCounts,
} from "./table";

/** 원카드 컴퓨터. 자기 자리 화면만 본다(웹 워커 등록부의 `KitBot`과 같은 모양) */
export interface OnecardBot {
  readonly name: string;
  decide(view: OnecardView, rng: RngState): Action;
}

function noDecision(): never {
  throw new Error("원카드 컴퓨터: 내 차례가 아닌 화면이다");
}

function rankIndex(card: OnecardCard): number {
  const rank = rankOf(card);
  return rank === null ? RANKS.length : RANKS.indexOf(rank);
}

/** 손에 가장 많은 무늬(같으면 S·D·H·C 순서) */
export function richestSuit(cards: readonly OnecardCard[]): Suit {
  const counts = suitCounts(cards);
  let best: Suit = SUITS[0];
  for (const suit of SUITS)
    if ((counts.get(suit) ?? 0) > (counts.get(best) ?? 0)) best = suit;
  return best;
}

/** 7은 무늬마다 행동이 하나씩 있다. 같은 7의 다른 무늬 행동은 하나로 모은다 */
function distinctCards(moves: readonly PlayAction[]): OnecardCard[] {
  return [...new Set(moves.map((m) => m.card))];
}

function playOf(card: OnecardCard, suit: Suit): PlayAction {
  return rankOf(card) === "7"
    ? { type: "play", card, suit }
    : { type: "play", card };
}

/**
 * 입문: 낼 수 있으면 늘 낸다. 절반은 가장 낮은 카드, 절반은 아무 카드나.
 * 공격을 아끼지 않고, 7의 무늬는 손에 많은 무늬
 */
export const onecardBeginnerBot: OnecardBot = {
  name: "onecard-beginner",
  decide(view, rng) {
    if (view.moves.length === 0) noDecision();
    const cards = distinctCards(playMoves(view));
    if (cards.length === 0) return { type: "draw" };
    const sorted = [...cards].sort((a, b) => rankIndex(a) - rankIndex(b));
    const card =
      nextFloat(rng) < 0.5
        ? (sorted[0] as OnecardCard)
        : (sorted[nextInt(rng, sorted.length)] as OnecardCard);
    return playOf(card, richestSuit(view.hand.filter((c) => c !== card)));
  },
};

/** 중수·고수가 수를 따질 때 쓰는 남의 사정(고수는 기억에서 채운다) */
export interface PlayContext {
  /** 자리별 없다고 짐작한 무늬 */
  voids?: readonly (readonly Suit[])[];
}

/** 이 카드를 낸 뒤 맞출 무늬로 무엇을 고르나: 손에 많은 무늬, 같으면 다음 사람이 없는 무늬·남이 적게 낸 무늬 */
export function chooseSuit(
  view: OnecardView,
  rest: readonly OnecardCard[],
  ctx: PlayContext = {},
): Suit {
  const counts = suitCounts(rest);
  const played = suitCounts(view.pile);
  const next = seatAfter(view, view.mySeat);
  const nextVoids = ctx.voids?.[next] ?? [];
  let best: Suit = SUITS[0];
  let bestScore = -Infinity;
  for (const suit of SUITS) {
    const score =
      (counts.get(suit) ?? 0) * 10 +
      (nextVoids.includes(suit) ? 6 : 0) -
      (played.get(suit) ?? 0) * 0.1;
    if (score > bestScore) {
      best = suit;
      bestScore = score;
    }
  }
  return best;
}

/** 남은 손패가 모두 끝낼 수 없는 카드인가(마지막 카드 제한) */
function allBlocked(view: OnecardView, rest: readonly OnecardCard[]): boolean {
  return rest.length > 0 && rest.every((c) => finishBlocked(view.rules, c));
}

/** 바뀐 맞출 무늬로 낼 수 있는 카드가 손에 남나 */
function canFollowAfter(
  rest: readonly OnecardCard[],
  suit: Suit,
  card: OnecardCard,
): boolean {
  const rank = rankOf(card);
  return rest.some(
    (c) =>
      isJoker(c) || suitOf(c) === suit || (rank !== null && rankOf(c) === rank),
  );
}

/**
 * 중수의 수 점수. 높을수록 좋다.
 * - 공격을 받으면 받아친다(조커는 아끼고 가장 싼 카드로)
 * - 공격·J·Q는 다음 사람이 두 장 이하일 때 쓰고, 아니면 받아치기·막기용으로 아낀다
 * - K는 이어서 낼 카드가 있을 때, 7은 다른 카드가 마땅치 않을 때
 * - 낸 뒤 맞출 무늬가 손에 많은 쪽, 끝낼 수 없는 카드만 남기지 않는 쪽
 */
export function scorePlay(
  view: OnecardView,
  move: PlayAction,
  ctx: PlayContext = {},
): number {
  const card = move.card;
  const rest = view.hand.filter((c) => c !== card);
  if (rest.length === 0) return 1000;
  const rank = rankOf(card);
  const suit = rank === "7" ? (move.suit as Suit) : suitOf(card);
  const next = seatAfter(view, view.mySeat);
  const nextCount = view.handCounts[next] ?? 99;
  const danger = nextCount <= 2;
  const two = activeCount(view) <= 2;
  let score = 0;

  if (view.attack > 0) {
    score += 10 + attackValue(card, view.rules) * 0.2;
    if (isJoker(card)) score -= 3;
  } else if (isAttackCard(card)) {
    score += danger ? 6 + attackValue(card, view.rules) * 0.3 : -3;
    if (isJoker(card) && !danger) score -= 2;
  } else if (rank === "J") {
    score += two ? 2 : danger ? 5 : -1;
  } else if (rank === "Q") {
    if (two) score += 2;
    else {
      const prev = seatAfter(
        view,
        view.mySeat,
        1,
        view.direction === 1 ? -1 : 1,
      );
      const prevCount = view.handCounts[prev] ?? 99;
      score += danger && prevCount > nextCount ? 4 : -1;
    }
  } else if (rank === "K") {
    score += suit && canFollowAfter(rest, suit, card) ? 3 : -0.5;
  } else if (rank === "7") {
    score -= 2;
  } else score += 2;

  // 낸 뒤 맞출 무늬
  if (suit) {
    score += (suitCounts(rest).get(suit) ?? 0) * 0.6;
    if ((ctx.voids?.[next] ?? []).includes(suit)) score += 2;
  }
  // 마지막 카드 제한: 끝낼 수 없는 카드만 남으면 크게 손해
  if (allBlocked(view, rest)) score -= rest.length <= 1 ? 9 : 4;
  // 같은 점수면 높은 숫자부터 내 손을 가볍게(낮은 숫자는 숫자 맞추기용으로)
  score += rankIndex(card) * 0.01;
  return score;
}

/** 중수 수 고르기(고수의 후보 순서와 가상 판에서도 쓴다). 결정적이다 */
export function intermediateMove(
  view: OnecardView,
  ctx: PlayContext = {},
): Action {
  const cards = distinctCards(playMoves(view));
  if (cards.length === 0) return { type: "draw" };
  let best: PlayAction | null = null;
  let bestScore = -Infinity;
  for (const card of cards) {
    const rest = view.hand.filter((c) => c !== card);
    const move = playOf(card, chooseSuit(view, rest, ctx));
    const score = scorePlay(view, move, ctx);
    if (score > bestScore) {
      best = move;
      bestScore = score;
    }
  }
  return best as PlayAction;
}

export const onecardIntermediateBot: OnecardBot = {
  name: "onecard-intermediate",
  decide(view) {
    if (view.moves.length === 0) noDecision();
    return intermediateMove(view);
  },
};
