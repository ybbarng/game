// 수 배우기 글의 말투: 해설·안내·설명 문장은 해요체 + 마침표(docs/standing-rules.md 3절, study/tone.ts)
import { describe, expect, it } from "vitest";

import { lessonTexts, lineTexts, toneProblems } from "@/study/tone";

import { BADUK_FUSEKI, BADUK_FUSEKI_SET } from "./fuseki";
import { BADUK_JOSEKI, BADUK_JOSEKI_SET } from "./joseki";
import { BADUK_PUZZLE_SETS } from "./puzzles";
import { explainSolved, puzzleState, solutionOf } from "./study";
import {
  BADUK_STUDY_LESSON_SUMMARY,
  BADUK_STUDY_LESSONS,
} from "./study-lessons";
import { BADUK_LESSONS } from "./tutorial";

describe("바둑 수 배우기 글 말투", () => {
  it("문제 묶음·단원 읽기·따라 두기 소개는 해요체 문장이다", () => {
    expect(
      toneProblems([
        ...BADUK_PUZZLE_SETS.map((s) => s.summary),
        BADUK_STUDY_LESSON_SUMMARY,
        BADUK_JOSEKI_SET.summary,
        BADUK_FUSEKI_SET.summary,
      ]),
    ).toEqual([]);
  });

  it("모든 문제의 해설 문장이 해요체 + 마침표다", () => {
    const lines = BADUK_PUZZLE_SETS.flatMap((s) =>
      s.puzzles.flatMap((p) =>
        explainSolved(
          p,
          puzzleState(p).board,
          solutionOf(p),
          p.kind === "capture" ? p.within : 1,
        ),
      ),
    );
    expect(toneProblems(lines)).toEqual([]);
  });

  it("정석·포석 수순 소개와 수마다 설명이 해요체 + 마침표다", () => {
    expect(toneProblems(lineTexts([...BADUK_JOSEKI, ...BADUK_FUSEKI]))).toEqual(
      [],
    );
  });

  it("규칙 배우기·수 배우기 단원 글이 해요체 + 마침표다", () => {
    expect(
      toneProblems(lessonTexts([...BADUK_LESSONS, ...BADUK_STUDY_LESSONS])),
    ).toEqual([]);
  });
});
