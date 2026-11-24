// 체스 수 배우기 목록의 차례(배우는 차례). 화면(ChessApp)과 용어 순서 시험(study-order.test.ts)이 함께 쓴다.

import { ENDGAME_SETS } from "./endgame";
import { CHESS_OPENING_SET } from "./openings";
import { CHESS_PUZZLE_SETS } from "./puzzles";

/**
 * 폰 끝내기 문제 묶음. 기본 끝내기 단원 「폰을 퀸으로 만들기」에서 폰의 사각형·이기는 칸·마주 보기를 배운 뒤에 푼다
 * (「킹과 폰」은 이기는 칸으로 킹을 먼저 데려가는 판, 「바깥 패스 폰」은 흑 킹이 폰의 사각형에 붙잡히는 판).
 */
export const PAWN_PUZZLE_SET_IDS: readonly string[] = [
  "king-pawn",
  "outside-pawn",
];

/**
 * 목록 차례: 첫 수(오프닝) → 메이트·전술 문제 → 기본 끝내기 단원(퀸·룩·룩 둘·폰) → 폰 끝내기 문제.
 * 묶음 id를 늘어놓는다(문제 묶음·끝내기 단원·오프닝 id는 서로 겹치지 않는다).
 */
export const CHESS_STUDY_ORDER: readonly string[] = [
  CHESS_OPENING_SET.id,
  ...CHESS_PUZZLE_SETS.filter((s) => !PAWN_PUZZLE_SET_IDS.includes(s.id)).map(
    (s) => s.id,
  ),
  ...ENDGAME_SETS.map((s) => s.id),
  ...PAWN_PUZZLE_SET_IDS,
];
