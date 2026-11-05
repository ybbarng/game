/*
 * 카드 연출 공통 부품(docs/05 4.12). 마이티·하트·원카드·고스톱·민화투·나이롱뽕이 함께 쓴다. 카드 모양과 그림은
 * 카드 종류(`CardKind`: 트럼프 `PLAYING_CARD`, 화투 `HWATU_CARD`) 하나로 받고, 크기는 너비 하나로 받는다.
 * - 카드 종류: `kind.ts`(모양·`cardHeight`, 배치 계산도 쓴다), `kinds.tsx`(그림까지 갖춘 종류)
 * - 섞기·나눠 주기: `DealAnimation`, 멘탈 포커 섞는 동안 `ShuffleLoop`·`DeckShuffle`
 * - 나눠 주기 앞뒤: 받은 패 펼치기 `useHandSpread`·`spreadDelay`, 나눠 주는 동안 컴퓨터 기다리기 `afterDeal`
 * - 한 장이 날아가기(바탕): `CardSprite`, `spriteStyle`·`useArrival`(PlayingCard가 쓴다)
 * - 날아가는 카드 줄(겉그림): `useCardFlights`·`FlightLayer`. 걸음은 게임이 사건으로 짜거나(원카드) 장면이 바뀔
 *   때 `data-flip` 자리를 재어 짠다(`useCardFlip`, 화투). 도착 카드는 그 프레임에 바로 그리고, 가릴 카드는
 *   `isHidden`·`FlightScope`/`useFlightHidden`
 * - 걷어 가기: `collectTo`, `COLLECT_MS`
 * 손패 고르기(훑기·들어 올리기·끌어 내기·키보드)는 `components/hand-controls.ts`의 `useHandControls`
 */
export {
  DEALT_SCALE,
  DealAnimation,
  ShuffleLoop,
} from "./DealAnimation";
export {
  afterDeal,
  dealHoldLeft,
  SPREAD_MS,
  spreadDelay,
  useHandSpread,
} from "./deal";
export {
  FLIP_STEP_MS,
  type FlightStep,
  type FlipMove,
  type FlipSpot,
  type FlipSpots,
  fxStart,
  type Spot,
  sceneFlights,
  spotOfRect,
} from "./flight-plan";
export {
  type CardFlights,
  DeckShuffle,
  type Flight,
  FlightLayer,
  FlightScope,
  useCardFlights,
  useFlightHidden,
} from "./flights";
export { type CardFlipOptions, flipMs, useCardFlip } from "./flip";
export {
  type CardKind,
  type CardShape,
  cardHeight,
  cardSize,
  cardWidth,
  HWATU_SHAPE,
  PLAYING_SHAPE,
} from "./kind";
export { HWATU_CARD, PLAYING_CARD } from "./kinds";
export {
  CARD_MOVE_MS,
  type CardPosition,
  CardSprite,
  COLLECT_MS,
  collectTo,
  spriteStyle,
  spriteTransform,
  useArrival,
} from "./sprite";
