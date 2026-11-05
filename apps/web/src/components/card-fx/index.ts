/*
 * 카드 연출 공통 부품(docs/05 4.12). 마이티·하트·원카드·화투가 함께 쓴다. 카드 그림과 상관없다.
 * - 섞기·나눠 주기: `DealAnimation`, 멘탈 포커 섞는 동안 `ShuffleLoop`
 * - 한 장이 날아가기: `CardSprite`(그림은 children), `spriteStyle`·`useArrival`(PlayingCard가 쓴다)
 * - 걷어 가기: `collectTo`, `COLLECT_MS`
 * - 장면이 바뀔 때 카드가 앞 자리에서 새 자리로: `useCardFlip`(`data-flip`), 걸음 시간 `FLIP_STEP_MS`·`flipMs`
 * 손패 고르기(훑기·들어 올리기·끌어 내기·키보드)는 `components/hand-controls.ts`의 `useHandControls`
 */
export {
  DealAnimation,
  type RenderBack,
  ShuffleLoop,
} from "./DealAnimation";
export {
  type CardFlipOptions,
  FLIP_STEP_MS,
  type FlipMove,
  type FlipSpot,
  type FlipSpots,
  flipMs,
  useCardFlip,
} from "./flip";
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
