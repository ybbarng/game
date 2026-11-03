import {
  BLACK_JOKER,
  COLOR_JOKER,
  type OnecardCard,
  rankOf,
  type Suit,
  suitOf,
} from "@game/onecard-engine";

export const SUIT_NAMES: Record<Suit, string> = {
  S: "스페이드",
  D: "다이아몬드",
  H: "하트",
  C: "클로버",
};

export const SUIT_SYMBOLS: Record<Suit, string> = {
  S: "♠",
  D: "◆",
  H: "♥",
  C: "♣",
};

/** 빨간 무늬(◆·♥) */
export const isRedSuit = (suit: Suit) => suit === "D" || suit === "H";

/** 카드 이름(화면 읽기·복기) */
export function cardName(card: OnecardCard): string {
  if (card === BLACK_JOKER) return "흑백 조커";
  if (card === COLOR_JOKER) return "컬러 조커";
  const suit = suitOf(card) as Suit;
  return `${SUIT_NAMES[suit]} ${rankOf(card)}`;
}
