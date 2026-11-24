// 장기 수 배우기 목록을 배우는 차례(JANGGI_STUDY_ORDER)대로 이어 읽어, 전술·끝내기 이름을 뜻을 알린 뒤에 쓰는지 본다
// (tutorial/term-order.ts, docs/standing-rules.md 1절). 규칙 배우기 단원을 앞에 이어 읽고, 묶음마다 소개 문장 → 문제 해설 차례다.
// 묶음 제목(「양수겸장」)은 목록의 이름표라 보지 않는다.
import { describe, expect, it } from "vitest";

import {
  earlyUses,
  lessonPlaces,
  type OrderedTerm,
  splitSentences,
  type TextPlace,
} from "@/tutorial/term-order";

import { JANGGI_PUZZLE_SETS } from "./puzzles";
import { explainSolved, parseMove, puzzleState } from "./study";
import { JANGGI_STUDY_ORDER, ORDERED_JANGGI_SETS } from "./study-order";
import { JANGGI_LESSONS } from "./tutorial";

const TERMS: OrderedTerm[] = [
  {
    term: "양수겸장",
    use: /양수겸장/,
    define: /양수겸장이라고 해요|함께 궁을 노려요\(양수겸장\)/,
  },
  { term: "묶인 기물", use: /묶인|묶여|묶어/, define: /묶인 기물이라고 해요/ },
  {
    term: "비켜 부르는 장군",
    use: /비켜 (부르는 )?장군/,
    define: /비켜 부르는 장군이라고 해요/,
  },
  // 「빅장으로 끝내기」(판을 끝내는 일)는 다른 뜻이라 뺀다.
  { term: "끝내기", use: /(?<!으로 )끝내기/, define: /끝내기라고 해요/ },
];

/** 전술 묶음마다 소개가 알려야 하는 이름 */
const NAMED: Record<string, string> = {
  fork: "양수겸장",
  pin: "묶인 기물",
  discover: "비켜 부르는 장군",
  rooks: "끝내기",
};

function placesOf(group: number): TextPlace[] {
  return ORDERED_JANGGI_SETS.flatMap((set) => [
    ...splitSentences(set.summary).map((text, i) => ({
      where: `${set.title} 소개 ${i + 1}째 문장`,
      group,
      text,
    })),
    ...set.puzzles.flatMap((p) =>
      explainSolved(p, puzzleState(p).board, parseMove(p.solution)).map(
        (text, i) => ({ where: `${p.id} 해설 ${i + 1}줄`, group, text }),
      ),
    ),
  ]);
}

describe("장기 수 배우기 목록 차례", () => {
  it("목록에는 모든 문제 묶음이 하나씩 빠짐없이 있다", () => {
    expect([...JANGGI_STUDY_ORDER].sort()).toEqual(
      JANGGI_PUZZLE_SETS.map((s) => s.id).sort(),
    );
  });

  it("끝내기 「차 둘로 외통」은 외통 묶음(한 수·두 수·세 수) 뒤에 온다", () => {
    const at = (id: string) => JANGGI_STUDY_ORDER.indexOf(id);
    expect(
      ["mate1", "mate2", "mate3"].map((id) => at(id) < at("rooks")),
    ).toEqual([true, true, true]);
  });

  it("배우는 차례로 이어 읽으면 전술·끝내기 이름을 뜻을 알린 뒤에 쓴다", () => {
    const places = [
      ...lessonPlaces(JANGGI_LESSONS),
      ...placesOf(JANGGI_LESSONS.length),
    ];
    expect(earlyUses(places, TERMS)).toEqual([]);
  });

  it("전술 묶음마다 소개가 그 이름을 「○○이라고 해요」로 알린다", () => {
    for (const [id, word] of Object.entries(NAMED)) {
      const set = JANGGI_PUZZLE_SETS.find((s) => s.id === id);
      expect(set?.summary).toMatch(new RegExp(`${word}(이)?라고 해요`));
    }
  });
});
