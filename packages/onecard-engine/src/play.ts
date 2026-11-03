/*
 * 낼 수 있는 카드 판정(docs/42 2-1). 상태의 일부만 보는 순수 함수라 컴퓨터·화면도 그대로 쓴다.
 */
import {
  BLACK_JOKER,
  isAttackCard,
  isBlackSuit,
  isJoker,
  isSpecialCard,
  type OnecardCard,
  rankOf,
  type Suit,
  suitOf,
} from "./cards";
import type { OnecardRules } from "./rules";

/** 판정에 쓰는 판 모양 */
export interface TableFace {
  rules: OnecardRules;
  /** 버린 더미 맨 위 */
  top: OnecardCard;
  /** 지금 맞출 무늬. null이면 아무 카드나(조커 뒤) */
  suit: Suit | null;
  /** 쌓인 공격 장 수 */
  attack: number;
}

/** 조커를 지금 낼 수 있나. 색 제한(`jokerColor`)이면 흑백 조커는 흑색 뒤, 컬러 조커는 적색 뒤에만 */
function jokerAllowed(face: TableFace, card: OnecardCard): boolean {
  if (!face.rules.jokerColor || face.suit === null) return true;
  return card === BLACK_JOKER
    ? isBlackSuit(face.suit)
    : !isBlackSuit(face.suit);
}

/**
 * 공격을 받았을 때 받아칠 수 있나.
 * 2 위: 아무 2, 같은 무늬 A, 조커 / A 위: 아무 A, 조커 / 조커 위: 조커
 */
export function canCounter(face: TableFace, card: OnecardCard): boolean {
  const top = rankOf(face.top);
  if (isJoker(card)) return jokerAllowed(face, card);
  const rank = rankOf(card);
  if (top === null) return false;
  if (top === "A") return rank === "A";
  if (top === "2")
    return rank === "2" || (rank === "A" && suitOf(card) === face.suit);
  return false;
}

/** 공격이 없을 때 낼 수 있나: 같은 무늬 또는 같은 숫자, 조커는 아무 때나(색 제한 옵션) */
export function canFollow(face: TableFace, card: OnecardCard): boolean {
  if (isJoker(card)) return jokerAllowed(face, card);
  if (face.suit === null) return true;
  if (suitOf(card) === face.suit) return true;
  const top = rankOf(face.top);
  return top !== null && top === rankOf(card);
}

/** 이 카드로 끝낼 수 없나(마지막 카드 제한) */
export function finishBlocked(rules: OnecardRules, card: OnecardCard): boolean {
  if (rules.finish === "attack") return isAttackCard(card);
  if (rules.finish === "special") return isSpecialCard(card);
  return false;
}

/** 손패 `hand`에서 `card`를 지금 낼 수 있나. 안 되면 까닭 */
export function playProblem(
  face: TableFace,
  hand: readonly OnecardCard[],
  card: OnecardCard,
): string | null {
  if (!hand.includes(card)) return "손에 없는 카드다";
  if (face.attack > 0) {
    if (!canCounter(face, card))
      return "공격을 받았다. 받아칠 카드가 아니면 먹어야 한다";
  } else if (!canFollow(face, card)) return "무늬나 숫자가 맞지 않는다";
  if (hand.length === 1 && finishBlocked(face.rules, card))
    return "이 카드로는 끝낼 수 없다";
  return null;
}
