// 바깥 패스 폰 묶음이 용어의 뜻을 먼저 알리고 쓰는지 본다(tutorial/term-order.ts, docs/standing-rules.md 1절).
// 수 배우기는 규칙 배우기 다음에 오므로 규칙 배우기 단원을 앞에 이어 읽는다(세로줄은 거기서 배운다).
import { describe, expect, it } from "vitest";

import {
  earlyUses,
  lessonPlaces,
  type OrderedTerm,
  splitSentences,
  type TextPlace,
} from "@/tutorial/term-order";

import { CHESS_PUZZLE_SETS } from "./puzzles";
import { explainOutside, puzzleState, solutionMove } from "./study";
import { CHESS_LESSONS } from "./tutorial";

const TERMS: OrderedTerm[] = [
  { term: "세로줄", use: /세로줄/, define: /세로줄은 왼쪽부터 a~h/ },
  {
    term: "패스 폰",
    use: /(?<!바깥 )패스 폰/,
    define: /패스 폰이라고 해요/,
  },
  {
    term: "바깥 패스 폰",
    use: /바깥 패스 폰/,
    define: /바깥 패스 폰이라고 해요/,
  },
  { term: "a폰처럼 부르기", use: /[a-h]폰/, define: /a폰·b폰처럼 불러요/ },
];

describe("바깥 패스 폰 용어 순서", () => {
  const set = CHESS_PUZZLE_SETS.find((s) => s.id === "outside-pawn");
  const group = CHESS_LESSONS.length;
  const places: TextPlace[] = [
    ...lessonPlaces(CHESS_LESSONS),
    ...splitSentences(set?.summary ?? "").map((text, i) => ({
      where: `묶음 소개 ${i + 1}째 문장`,
      group,
      text,
    })),
    ...(set?.puzzles ?? []).flatMap((p) =>
      explainOutside(puzzleState(p).position, solutionMove(p)).map(
        (text, i) => ({ where: `${p.id} 해설 ${i + 1}줄`, group, text }),
      ),
    ),
  ];

  it("뜻을 알리기 전에 쓴 용어가 없다", () => {
    expect(earlyUses(places, TERMS)).toEqual([]);
  });
});
