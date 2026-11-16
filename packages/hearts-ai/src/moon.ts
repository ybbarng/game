import {
  type Action,
  isHeart,
  type PlayerView,
  QUEEN_OF_SPADES,
  trickWinner,
} from "@game/hearts-engine";
import { type Card, rankPower, type Suit, suitOf } from "@game/mighty-engine";

import { bySuit, type HeartsBot } from "./knowledge";
import { createHeartsRuleBot, HEARTS_NORMAL_BOOK } from "./rule-bot";

/*
 * 문 슛(하트 13장과 ♠Q를 모두 먹기) 계산에 쓰는 것들.
 * 고수는 "내가 문 슛을 노린다"·"저 사람이 문 슛을 노린다"를 시뮬레이션 안에서 이 봇으로 두어 본다.
 */

/** 점수 카드(하트·♠Q) */
function isPoint(card: Card): boolean {
  return isHeart(card) || card === QUEEN_OF_SPADES;
}

function wins(view: PlayerView, card: Card): boolean {
  const trick = view.trick;
  if (!trick || trick.plays.length === 0) return true;
  return (
    trickWinner({
      leader: trick.leader,
      plays: [...trick.plays, { seat: view.seat, card }],
    }) === view.seat
  );
}

const byPowerDesc = (a: Card, b: Card) => rankPower(b) - rankPower(a);

/**
 * 문 슛을 노리는 봇: 턴을 모두 먹으려 한다.
 * - 선: 가장 센 카드(같으면 긴 무늬)로 잡는다
 * - 따라 낼 때: 이길 수 있으면 가장 높은 카드, 못 이기면 가장 낮은 카드
 * - 무늬가 떨어지면: 점수 카드는 쥐고 가장 낮은 다른 카드를 버린다
 */
export const heartsMoonBot: HeartsBot = {
  name: "hearts-moon",
  decide(view): Action {
    const decision = view.decision;
    if (decision?.kind !== "play") return { type: "continue" };
    const cards = decision.cards;
    if (decision.leading) {
      const length = (c: Card) => bySuit(view.hand, suitOf(c) as Suit).length;
      const pick = [...cards].sort(
        (a, b) => byPowerDesc(a, b) || length(b) - length(a),
      )[0] as Card;
      return { type: "play", card: pick };
    }
    const lead = view.trick?.plays[0]?.card;
    const following =
      lead !== undefined && cards.every((c) => suitOf(c) === suitOf(lead));
    if (following) {
      const winners = cards.filter((c) => wins(view, c)).sort(byPowerDesc);
      if (winners.length > 0) return { type: "play", card: winners[0] as Card };
      return {
        type: "play",
        card: [...cards].sort(byPowerDesc).at(-1) as Card,
      };
    }
    const keep = cards.filter((c) => !isPoint(c));
    const pool = keep.length > 0 ? keep : cards;
    return { type: "play", card: [...pool].sort(byPowerDesc).at(-1) as Card };
  },
};

/** 문 슛을 막는 중수: 정석 + 한 사람이 점수를 독차지하면 하트 하나라도 먹는다 */
export const heartsGuardBot: HeartsBot = createHeartsRuleBot({
  name: "hearts-guard",
  book: [...HEARTS_NORMAL_BOOK, "moonGuard"],
});

/**
 * 문 슛을 노려 볼 만한 패인가. 계산을 아끼려는 문턱일 뿐이고, 실제로 노릴지는 시뮬레이션이 정한다.
 * 남이 점수를 하나라도 먹었으면 이미 늦었다. 높은 카드(Q 이상)가 손패의 40% 이상이어야 한다.
 */
export function moonHopeful(view: PlayerView): boolean {
  if (view.rules.moon === "off") return false;
  if (view.takenPoints.some((p, s) => s !== view.seat && p > 0)) return false;
  return handLooksMoony(view.hand);
}

export function handLooksMoony(hand: readonly Card[]): boolean {
  if (hand.length === 0) return false;
  const high = hand.filter((c) => rankPower(c) >= rankPower("SQ")).length;
  return high >= Math.ceil(hand.length * 0.4);
}
