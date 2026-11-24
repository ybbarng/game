// 장기 수 배우기 목록의 차례(배우는 차례). 화면(JanggiApp)과 용어 순서·말투 시험(study-order.test.ts)이 함께 쓴다.

import { JANGGI_PUZZLE_SETS, type JanggiPuzzleSet } from "./puzzles";

/**
 * 목록 차례: 지키기(장군 풀기·잡힐 기물 지키기) → 한 수 외통 → 기물을 얻는 전술(양수겸장·잡을까 말까·포 길 열기·멱 막기·
 * 궁성 공격·묶인 기물·비켜 부르는 장군) → 두 수·세 수 외통 → 끝내기 기초(차 둘로 외통).
 * 끝내기는 「지금까지는 판 가운데에서 외통 수를 찾았어요」로 외통 묶음을 잇는다.
 */
export const JANGGI_STUDY_ORDER: readonly string[] = [
  "escape",
  "defend",
  "mate1",
  "fork",
  "trade",
  "cannon",
  "block",
  "palace",
  "pin",
  "discover",
  "mate2",
  "mate3",
  "rooks",
];

/** 배우는 차례대로 늘어놓은 문제 묶음 */
export const ORDERED_JANGGI_SETS: readonly JanggiPuzzleSet[] =
  JANGGI_STUDY_ORDER.map((id) => {
    const set = JANGGI_PUZZLE_SETS.find((s) => s.id === id);
    if (!set) throw new Error(`수 배우기 목록에 없는 묶음: ${id}`);
    return set;
  });
