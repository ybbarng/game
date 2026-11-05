import type { ReactNode } from "react";

/*
 * 카드 종류(docs/05 4.12). 카드 게임 화면과 연출(card-fx)·배치(computeLayout)가 카드 모양을 여기서만 얻는다.
 * 모양(`CardShape`)은 순수한 값이라 배치 계산(node 시험)도 그대로 쓰고, 그림까지 갖춘 종류(`CardKind`)는
 * `kinds.tsx`(트럼프 `PLAYING_CARD`, 화투 `HWATU_CARD`)에 있다. 새 카드 게임은 이 둘 중 하나를 쓰거나 같은 꼴로
 * 하나를 더 둔다. 카드 크기는 늘 너비 하나로 주고 높이는 `cardHeight`로 얻는다(비율을 숫자로 적지 않는다)
 */

/** 카드 모양: 그림 상자 크기와 높이/폭 비율 */
export interface CardShape {
  /** 그림(SVG viewBox) 폭·높이 */
  art: { w: number; h: number };
  /** 높이/폭 */
  ratio: number;
}

function shape(w: number, h: number): CardShape {
  return { art: { w, h }, ratio: h / w };
}

/** 트럼프(마이티·하트·원카드): 그림 250×350(5:7) */
export const PLAYING_SHAPE: CardShape = shape(250, 350);

/** 화투(고스톱·민화투·나이롱뽕): 그림 60×96(5:8) */
export const HWATU_SHAPE: CardShape = shape(60, 96);

/** 너비 `w`인 카드의 높이 */
export function cardHeight(kind: CardShape, w: number): number {
  return w * kind.ratio;
}

/** 높이 `h`인 카드의 너비 */
export function cardWidth(kind: CardShape, h: number): number {
  return h / kind.ratio;
}

/** 너비 `w`인 카드의 크기 */
export function cardSize(kind: CardShape, w: number): { w: number; h: number } {
  return { w, h: cardHeight(kind, w) };
}

/**
 * 카드 종류: 모양과 그림. 연출(나눠 주기·섞기·날아가는 겉그림)이 이것만 받아 카드를 그린다.
 * 그림은 누름·화면 읽기·화면 시험(`data-card`)에 잡히지 않는 겉그림이다
 */
export interface CardKind<C extends string = string> extends CardShape {
  /** 앞면 한 장(너비 `w`) */
  renderFace(card: C, w: number): ReactNode;
  /** 뒷면 한 장(너비 `w`) */
  renderBack(w: number): ReactNode;
}
