// 수 배우기 글의 말투: 해설·안내·설명 문장은 해요체 + 마침표(docs/standing-rules.md 3절, study/tone.ts)
import { describe, expect, it } from "vitest";

import { lessonTexts, lineTexts, toneProblems } from "@/study/tone";

import { ENDGAME_SETS, endgamePages, methodSteps } from "./endgame";
import { CHESS_OPENING_SET, CHESS_OPENINGS } from "./openings";
import { CHESS_PUZZLE_SETS } from "./puzzles";
import {
  explainEndgame,
  explainMate,
  explainOutside,
  puzzleState,
  solutionMove,
} from "./study";
import { explainTactic } from "./tactics";
import { CHESS_LESSONS } from "./tutorial";

describe("체스 수 배우기 글 말투", () => {
  it("문제 묶음·오프닝 소개는 해요체 문장이다", () => {
    expect(
      toneProblems([
        ...CHESS_PUZZLE_SETS.map((s) => s.summary),
        CHESS_OPENING_SET.summary,
      ]),
    ).toEqual([]);
  });

  it("모든 문제의 해설 문장이 해요체 + 마침표다", () => {
    const lines = CHESS_PUZZLE_SETS.flatMap((s) =>
      s.puzzles.flatMap((p) => {
        const pos = puzzleState(p).position;
        const move = solutionMove(p);
        if (p.kind === "tactic") return explainTactic(pos, move, p.tactic);
        if (p.kind === "endgame") return explainEndgame(pos, move);
        if (p.kind === "outside") return explainOutside(pos, move);
        return explainMate(pos, move);
      }),
    );
    expect(toneProblems(lines)).toEqual([]);
  });

  it("오프닝 수순 소개와 수마다 설명이 해요체 + 마침표다", () => {
    expect(toneProblems(lineTexts(CHESS_OPENINGS))).toEqual([]);
  });

  it("배우기 단원 글이 해요체 + 마침표다", () => {
    expect(toneProblems(lessonTexts(CHESS_LESSONS))).toEqual([]);
  });

  it("엔드게임 묶음 소개·단원 쪽 글·방법 단계 설명이 해요체 + 마침표다", () => {
    const pieces = ["Q", "R", "RR"] as const;
    expect(
      toneProblems([
        ...ENDGAME_SETS.map((s) => s.summary),
        ...pieces.flatMap((p) => endgamePages(p).flatMap((page) => page.body)),
        ...pieces.flatMap((p) => methodSteps(p).map((s) => s.text)),
      ]),
    ).toEqual([]);
  });
});
