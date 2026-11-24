import type { Card } from "@game/mighty-engine";

/*
 * 자리 표: 엔진 상태에 카드 대신 넣는 "?_12"(12번 자리의 카드). 마이티·하트·화투·원카드가 함께 쓴다.
 * 게임마다의 판 코드(blind.ts·hwatu-table.ts 등)를 끌어오지 않게 따로 둔다(원카드 판 묶음에 마이티 엔진·화투 판이
 * 실리지 않게, docs/13 13절).
 */

const PREFIX = "?_";

export function tokenOf(slot: number): Card {
  return `${PREFIX}${slot}` as Card;
}

/** 자리 표면 그 자리 번호, 진짜 카드면 null */
export function slotOfToken(card: string): number | null {
  if (!card.startsWith(PREFIX)) return null;
  const slot = Number(card.slice(PREFIX.length));
  return Number.isInteger(slot) && slot >= 0 ? slot : null;
}

export function isToken(card: string): boolean {
  return slotOfToken(card) !== null;
}

/** 값 안의 자리 표를 아는 카드로 바꾼다. 모르는 자리 표 수도 센다 */
export function swapTokens<T>(
  value: T,
  cards: ReadonlyMap<number, Card>,
): { value: T; missing: number } {
  let missing = 0;
  const text = JSON.stringify(value).replace(
    /"\?_(\d+)"/g,
    (whole, slot: string) => {
      const card = cards.get(Number(slot));
      if (card === undefined) {
        missing++;
        return whole;
      }
      return JSON.stringify(card);
    },
  );
  return { value: JSON.parse(text) as T, missing };
}
