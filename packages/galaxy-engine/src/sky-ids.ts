/**
 * 하늘 id 목록(가져오는 것이 없는 작은 파일). 규칙 문자열 읽기(`rules.ts`)가 판 자료(`skies.ts`)를
 * 불러오지 않고도 모르는 하늘을 거절하게 따로 둔다. `skies.ts`가 자료 파일과 이 목록이 맞는지 시험한다.
 */

/** 자료가 있는 하늘(`src/sky/*.json`, 후보 목록 빼고) */
export const SKY_IDS: readonly string[] = [
  "seasons",
  "zodiac",
  "south",
  "summer",
  "autumn",
  "winter",
];

/** 처음 여는 하늘(F7: 나머지는 bench로 하늘마다 확인한 뒤 연다). 온라인 규칙 문자열은 이 하늘만 받는다 */
export const OPEN_SKIES: readonly string[] = ["seasons"];
