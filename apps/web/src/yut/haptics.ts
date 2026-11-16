import { useYutSettings } from "./settings";

/**
 * 윷놀이 진동(docs/37 14절). 안드로이드 Chrome처럼 `navigator.vibrate`가 있는 기기에서만, 옵션 「진동」이 켜져
 * 있을 때만 떤다(기본 켬). 아이폰처럼 함수가 없는 기기는 조용히 넘어간다. 움직임 줄이기와는 묶지 않는다
 * (진동은 움직임이 아니라 촉감이다, 별 따기와 같은 판단 docs/36 11-70).
 */

/** 이 기기가 진동 함수를 갖고 있는가(없으면 옵션 줄도 보이지 않는다) */
export function canVibrate(): boolean {
  try {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function"
    );
  } catch {
    return false;
  }
}

/** 무늬(ms): 가락 하나가 멈출 때 짧은 「톡」, 윷·모가 나오면 「톡톡」 */
export const YUT_BUZZ = { stick: 14, bonus: [24, 60, 24] } as const;

export function buzz(kind: keyof typeof YUT_BUZZ): boolean {
  if (!canVibrate() || !useYutSettings.getState().vibrate) return false;
  try {
    return navigator.vibrate(YUT_BUZZ[kind] as number | number[]) === true;
  } catch {
    return false;
  }
}
