import type { BackView } from "./settings";

/**
 * 뒷면 보기(docs/47 5절, 2026-11-04): 설정 「거울 / 끔」과 놓인 자리에서 실제로 무엇을 보일지 정한다.
 * 화면 틀(React)을 모르는 순수 함수라 시험한다. 자리 재기는 `components/StageBox.tsx`의 `useBackView`.
 * 펼친 그림(전개도)은 없앴다(2026-11-05 사용자 「전개도는 쓰지 말고」).
 */

/**
 * 거울 판을 보일 가장 좁은 자리(CSS px). 판은 큐브보다 작아서(칸 간격 0.6) 이보다 좁으면 판 칸이 손가락으로
 * 누르기 어려울 만큼 작아진다. 그때는 거울 없이 큐브만 보인다(배우기 곁 그림 220px 등, 끌어서 둘러본다)
 */
export const MIRROR_MIN_WIDTH = 300;

/**
 * 지금 보일 뒷면 보기. 3D를 못 그리면 끔(큐브 그림 둘이 여섯 면을 다 보인다), 거울인데 자리가 좁으면 끔.
 * `width`가 아직 재지 않은 값(null)이면 설정대로
 */
export function backViewFor(
  setting: BackView,
  width: number | null,
  can3d: boolean,
): BackView {
  if (!can3d) return "off";
  if (setting === "mirror" && width !== null && width < MIRROR_MIN_WIDTH)
    return "off";
  return setting;
}

/**
 * 배우기 글은 뒤쪽 칸을 거울에서 고르라고 쓴다(「뒤쪽은 끌어서 둘러보거나 거울에서 눌러요」). 뒷면 보기를 껐으면
 * 거울을 가리키는 말을 둘러보기로 바꾼다
 */
export function backViewText(text: string, mode: BackView): string {
  if (mode === "mirror") return text;
  return text
    .replace(/끌어서 둘러보거나 거울에서 눌러요/g, "끌어서 둘러보고 눌러요")
    .replace(/\(거울에서도 돼요\)/g, "(끌어서 둘러봐도 돼요)")
    .replace(/\(뒤쪽은 거울에서\)/g, "(뒤쪽은 끌어서 둘러보고)");
}
