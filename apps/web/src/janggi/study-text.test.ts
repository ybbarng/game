// 수 배우기 글의 말투: 해설·안내·설명 문장은 해요체 + 마침표(docs/standing-rules.md 3절, study/tone.ts)
import { describe, expect, it } from "vitest";

import { lessonTexts, toneProblems } from "@/study/tone";

import { OPENING_LINE_NOTES } from "./opening-line";
import { JANGGI_PUZZLE_SETS } from "./puzzles";
import { explainSolved, parseMove, puzzleState } from "./study";
import { JANGGI_LESSONS } from "./tutorial";

describe("장기 수 배우기 글 말투", () => {
  it("문제 묶음 소개는 해요체 문장이다", () => {
    expect(toneProblems(JANGGI_PUZZLE_SETS.map((s) => s.summary))).toEqual([]);
  });

  it("모든 문제의 해설 문장이 해요체 + 마침표다", () => {
    const lines = JANGGI_PUZZLE_SETS.flatMap((s) =>
      s.puzzles.flatMap((p) =>
        explainSolved(p, puzzleState(p).board, parseMove(p.solution)),
      ),
    );
    expect(toneProblems(lines)).toEqual([]);
  });

  it("배우기 단원 글과 포진 수순 설명이 해요체 + 마침표다", () => {
    expect(
      toneProblems([...lessonTexts(JANGGI_LESSONS), ...OPENING_LINE_NOTES]),
    ).toEqual([]);
  });
});
