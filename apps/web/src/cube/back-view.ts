import type { BackView } from "./settings";

/**
 * 뒷면 보기(docs/47 5절, 2026-11-04): 설정 「거울 / 펼친 그림 / 끔」과 놓인 자리에서 실제로 무엇을 보일지 정한다.
 * 화면 틀(React)을 모르는 순수 함수라 시험한다. 자리 재기는 `components/StageWithNet.tsx`의 `useBackView`.
 */

/**
 * 거울 판을 보일 가장 좁은 자리(CSS px). 판은 큐브보다 작아서(칸 간격 0.6) 이보다 좁으면 판 칸이 손가락으로
 * 누르기 어려울 만큼 작아진다. 그때는 펼친 그림으로 넘어간다(배우기 곁 그림 220px 등)
 */
export const MIRROR_MIN_WIDTH = 300;

/**
 * 지금 보일 뒷면 보기. 3D를 못 그리면 늘 펼친 그림, 거울인데 자리가 좁으면 펼친 그림.
 * `width`가 아직 재지 않은 값(null)이면 설정대로
 */
export function backViewFor(
  setting: BackView,
  width: number | null,
  can3d: boolean,
): BackView {
  if (!can3d) return "net";
  if (setting === "mirror" && width !== null && width < MIRROR_MIN_WIDTH)
    return "net";
  return setting;
}

/**
 * 배우기 글에서 뒤쪽 칸을 고르라고 펼친 그림을 가리키는 말을 거울로 바꾼다(「뒤쪽은 펼친 그림에서」 →
 * 「뒤쪽은 거울에서」). 거울일 때만 바꾸고, 펼친 그림을 읽는 법 자체를 말하는 글(블라인드 글자 붙이기
 * 「펼친 그림에서 면을 바로 보고」)은 그대로 둔다
 */
export function backViewText(text: string, mode: BackView): string {
  if (mode !== "mirror") return text;
  return text.replace(/펼친 그림에서(?=도 돼요| 눌러|\))/g, "거울에서");
}
