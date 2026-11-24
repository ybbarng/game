// 전술 문제 묶음이 전술 이름의 뜻을 먼저 알리고 쓰는지 본다(tutorial/term-order.ts, docs/standing-rules.md 1절).
// 묶음 목록 차례대로 소개 문장 → 그 묶음 문제들의 해설을 읽는다(규칙 배우기 단원을 앞에 이어 읽는다).
// 묶음 제목(「포크」)은 목록의 이름표라 보지 않는다. 메이트 문제의 해설은 두 수 문제 받는 수가 고수 계산이라
// 주제 묶음(puzzle-themes.test.ts)에서 따로 본다.
import { describe, expect, it } from "vitest";

import {
  earlyUses,
  lessonPlaces,
  type OrderedTerm,
  splitSentences,
  type TextPlace,
} from "@/tutorial/term-order";

import { CHESS_PUZZLE_SETS } from "./puzzles";
import { puzzleState, solutionMove } from "./study";
import { explainTactic } from "./tactics";
import { CHESS_LESSONS } from "./tutorial";

const TERMS: OrderedTerm[] = [
  { term: "포크", use: /포크/, define: /포크라고 해요/ },
  { term: "핀", use: /핀/, define: /핀이라고 해요/ },
  { term: "스큐어", use: /스큐어/, define: /스큐어라고 해요/ },
  { term: "발견 공격", use: /발견 공격/, define: /발견 공격이라고 해요/ },
  { term: "뒷줄 메이트", use: /뒷줄 메이트/, define: /뒷줄 메이트라고 해요/ },
  {
    term: "빗나가게 하기",
    use: /빗나가게 하기/,
    define: /빗나가게 하기라고 해요/,
  },
];

describe("전술 문제 묶음 용어 순서", () => {
  const group = CHESS_LESSONS.length;
  const places: TextPlace[] = [
    ...lessonPlaces(CHESS_LESSONS),
    ...CHESS_PUZZLE_SETS.flatMap((set) => [
      ...splitSentences(set.summary).map((text, i) => ({
        where: `${set.title} 소개 ${i + 1}째 문장`,
        group,
        text,
      })),
      ...set.puzzles.flatMap((p) =>
        p.kind === "tactic"
          ? explainTactic(
              puzzleState(p).position,
              solutionMove(p),
              p.tactic,
            ).map((text, i) => ({
              where: `${p.id} 해설 ${i + 1}줄`,
              group,
              text,
            }))
          : [],
      ),
    ]),
  ];

  it("전술 이름은 묶음 소개에서 뜻을 알린 뒤에 쓴다", () => {
    expect(earlyUses(places, TERMS)).toEqual([]);
  });

  it("전술 묶음마다 소개가 그 전술 이름을 알린다", () => {
    for (const title of [
      "포크",
      "핀",
      "스큐어",
      "발견 공격",
      "뒷줄 메이트",
      "빗나가게 하기",
    ]) {
      const set = CHESS_PUZZLE_SETS.find((s) => s.title === title);
      expect(set?.summary).toMatch(new RegExp(`${title}(이)?라고 해요`));
    }
  });
});
