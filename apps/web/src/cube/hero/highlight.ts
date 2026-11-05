/**
 * 첫 화면 큐브의 조각 강조 선택지(docs/47 0절 2026-11-05). 설정 화면이 엔진 없이 읽게 따로 둔다.
 * - 끄기: 빛내지 않는다(찾는 돌리기는 그대로)
 * - 잠깐(기본): 넣기 전에 넣을 곳·찾은 조각을, 넣은 뒤에 맞춘 조각을 잠깐 빛낸다
 * - 계속: 잠깐과 같고, 맞춘 조각은 판이 끝날 때까지 표시한 채 둔다
 */
export type HeroHighlight = "off" | "brief" | "keep";
export const HERO_HIGHLIGHTS: readonly HeroHighlight[] = [
  "off",
  "brief",
  "keep",
];
export const DEFAULT_HERO_HIGHLIGHT: HeroHighlight = "brief";
export const HERO_HIGHLIGHT_LABEL: Record<HeroHighlight, string> = {
  off: "끄기",
  brief: "잠깐",
  keep: "계속",
};
