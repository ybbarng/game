/*
 * 원카드 카드(docs/42). 트럼프 52장 + 조커 2장.
 * 표기는 마이티 `Card`와 같다("SA", "D10", "JK"). 마이티에는 조커가 하나("JK")뿐이라
 * 원카드는 "JK"를 흑백 조커로 두고 컬러 조커 "JC"를 새로 둔다(마이티 쪽 표기는 바꾸지 않는다).
 * 멘탈 포커 카드 번호표(`CARD_CODES`)에도 컬러 조커가 "JC"로 뒤에 붙는다.
 */
import {
  createRng,
  RANKS,
  type Rank,
  SUITS,
  type Suit,
  shuffleInPlace,
} from "@game/mighty-engine";

export type { Rank, Suit };
export { RANKS, SUITS };

/** 흑백 조커(마이티 조커와 같은 표기) */
export const BLACK_JOKER = "JK";
/** 컬러 조커 */
export const COLOR_JOKER = "JC";

export type OnecardCard =
  | `${Suit}${Rank}`
  | typeof BLACK_JOKER
  | typeof COLOR_JOKER;

/** 원카드 덱 54장. 순서: 무늬(S·D·H·C)마다 2~A, 그 뒤 흑백 조커, 컬러 조커 */
export const ONECARD_DECK: readonly OnecardCard[] = [
  ...SUITS.flatMap((suit) =>
    RANKS.map((rank) => `${suit}${rank}` as OnecardCard),
  ),
  BLACK_JOKER,
  COLOR_JOKER,
];

const DECK_SET: ReadonlySet<string> = new Set(ONECARD_DECK);

export function isOnecardCard(card: unknown): card is OnecardCard {
  return typeof card === "string" && DECK_SET.has(card);
}

export function isJoker(card: OnecardCard): boolean {
  return card === BLACK_JOKER || card === COLOR_JOKER;
}

/** 무늬. 조커는 null */
export function suitOf(card: OnecardCard): Suit | null {
  return isJoker(card) ? null : (card[0] as Suit);
}

/** 숫자·글자. 조커는 null */
export function rankOf(card: OnecardCard): Rank | null {
  return isJoker(card) ? null : (card.slice(1) as Rank);
}

/** 흑색 무늬(♠·♣) */
export function isBlackSuit(suit: Suit): boolean {
  return suit === "S" || suit === "C";
}

/** 공격 카드: 2, A, 조커 */
export function isAttackCard(card: OnecardCard): boolean {
  const rank = rankOf(card);
  return rank === null || rank === "2" || rank === "A";
}

/** 특수 카드: 공격 카드 + 7(무늬 바꾸기)·J(건너뛰기)·Q(방향 바꾸기)·K(한 번 더) */
export function isSpecialCard(card: OnecardCard): boolean {
  const rank = rankOf(card);
  return (
    isAttackCard(card) ||
    rank === "7" ||
    rank === "J" ||
    rank === "Q" ||
    rank === "K"
  );
}

/** 카드 정렬(무늬 S·D·H·C, 숫자 2~A, 조커는 끝). 손패·다시 섞을 카드 목록을 늘 같은 순서로 */
export function sortOnecards(cards: readonly OnecardCard[]): OnecardCard[] {
  const order = new Map(ONECARD_DECK.map((c, i) => [c, i]));
  return [...cards].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

/** 씨앗으로 섞는다(일반방·혼자 하기). 멘탈 포커 판은 섞인 순서를 바깥에서 받는다 */
export function shuffleOnecards(
  cards: readonly OnecardCard[],
  seed: number,
): OnecardCard[] {
  return shuffleInPlace(createRng(seed), [...cards]);
}

/** 씨앗으로 섞은 54장 덱 */
export function shuffledOnecardDeck(seed: number): OnecardCard[] {
  return shuffleOnecards(ONECARD_DECK, seed);
}
