// 체스 수 배우기 목록을 배우는 차례(CHESS_STUDY_ORDER)대로 이어 읽어, 폰 끝내기 용어를 뜻을 알린 뒤에 쓰는지 본다
// (tutorial/term-order.ts, docs/standing-rules.md 1절). 규칙 배우기 단원을 앞에 이어 읽는다.
// 「킹과 폰」·「바깥 패스 폰」 문제는 끝내기 단원 「폰을 퀸으로 만들기」에서 배우는 마주 보기·폰의 사각형·이기는 칸을 쓴다.
// 메이트 문제 해설은 고수 계산이라 무겁고 이 용어를 쓰지 않아 읽지 않는다(puzzle-themes.test.ts가 따로 본다).
import { describe, expect, it } from "vitest";

import {
  earlyUses,
  lessonPlaces,
  type OrderedTerm,
  splitSentences,
  type TextPlace,
} from "@/tutorial/term-order";

import { ENDGAME_SETS, endgamePages } from "./endgame";
import { CHESS_OPENING_SET } from "./openings";
import { CHESS_PUZZLE_SETS } from "./puzzles";
import {
  explainEndgame,
  explainOutside,
  puzzleState,
  solutionMove,
} from "./study";
import { CHESS_STUDY_ORDER, PAWN_PUZZLE_SET_IDS } from "./study-order";
import { explainTactic } from "./tactics";
import { CHESS_LESSONS } from "./tutorial";

const TERMS: OrderedTerm[] = [
  {
    term: "마주 보기",
    use: /마주 (보|봐|볼|섰|서)/,
    define: /마주 보게\*\*\(한 칸 띄우고|\*\*마주 보기\*\*/,
  },
  { term: "폰의 사각형", use: /사각형/, define: /\*\*폰의 사각형\*\*/ },
  { term: "이기는 칸", use: /이기는 칸/, define: /\*\*이기는 칸\*\*/ },
];

/** 묶음 하나의 글: 소개 문장들과 문제 해설(문제 묶음), 또는 단원 쪽(끝내기 단원) */
function placesOf(id: string, group: number): TextPlace[] {
  if (id === CHESS_OPENING_SET.id)
    return splitSentences(CHESS_OPENING_SET.summary).map((text, i) => ({
      where: `오프닝 소개 ${i + 1}째 문장`,
      group,
      text,
    }));
  const end = ENDGAME_SETS.find((s) => s.id === id);
  if (end)
    return endgamePages(end.piece).map((page, i) => ({
      where: `${end.title} ${i + 1}쪽(${page.title})`,
      group,
      text: [page.title, ...page.body].join("\n"),
    }));
  const set = CHESS_PUZZLE_SETS.find((s) => s.id === id);
  if (!set) throw new Error(`목록에 없는 묶음: ${id}`);
  return [
    ...splitSentences(set.summary).map((text, i) => ({
      where: `${set.title} 소개 ${i + 1}째 문장`,
      group,
      text,
    })),
    ...set.puzzles.flatMap((p) => {
      const pos = puzzleState(p).position;
      const lines =
        p.kind === "endgame"
          ? explainEndgame(pos, solutionMove(p))
          : p.kind === "outside"
            ? explainOutside(pos, solutionMove(p))
            : p.kind === "tactic"
              ? explainTactic(pos, solutionMove(p), p.tactic)
              : [];
      return lines.map((text, i) => ({
        where: `${p.id} 해설 ${i + 1}줄`,
        group,
        text,
      }));
    }),
  ];
}

describe("체스 수 배우기 목록 차례", () => {
  it("폰 끝내기 문제 묶음은 끝내기 단원 「폰을 퀸으로 만들기」 뒤에 온다", () => {
    const pawnUnit = CHESS_STUDY_ORDER.indexOf("end-pawn");
    expect(
      PAWN_PUZZLE_SET_IDS.map((id) => CHESS_STUDY_ORDER.indexOf(id) > pawnUnit),
    ).toEqual(PAWN_PUZZLE_SET_IDS.map(() => true));
  });

  it("목록에는 문제 묶음·끝내기 단원·오프닝이 하나씩 빠짐없이 있다", () => {
    const all = [
      CHESS_OPENING_SET.id,
      ...CHESS_PUZZLE_SETS.map((s) => s.id),
      ...ENDGAME_SETS.map((s) => s.id),
    ];
    expect([...CHESS_STUDY_ORDER].sort()).toEqual([...all].sort());
  });

  it("배우는 차례로 이어 읽으면 폰 끝내기 용어를 뜻을 알린 뒤에 쓴다", () => {
    const group = CHESS_LESSONS.length;
    const places = [
      ...lessonPlaces(CHESS_LESSONS),
      ...CHESS_STUDY_ORDER.flatMap((id) => placesOf(id, group)),
    ];
    expect(earlyUses(places, TERMS)).toEqual([]);
  });
});
