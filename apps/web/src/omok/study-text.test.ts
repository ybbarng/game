// 배우기·문제 글의 말투(「~요」, 마침표)와 해설이 짚는 자리 표시를 본다.
import { CELLS, pointAt } from "@game/omok-engine";
import { describe, expect, it } from "vitest";

import { lessonTexts, toneProblems } from "@/study/tone";

import { OMOK_PUZZLE_SETS } from "./puzzles";
import { explainMarks, explainSolved, withJosa } from "./study";
import { OMOK_LESSONS } from "./tutorial";

describe("글 말투", () => {
  it("단원 요약·설명·퀴즈 풀이·미션 글은 「~요.」(또는 ! ?)로 끝난다", () => {
    expect(toneProblems(lessonTexts(OMOK_LESSONS))).toEqual([]);
  });

  it("문제 묶음 설명·목표·도움말과 문제마다 목표는 「~요.」로 끝난다", () => {
    const texts = OMOK_PUZZLE_SETS.flatMap((s) => [
      s.summary,
      s.prompt,
      s.hint,
      ...s.puzzles.map((p) => p.goal),
    ]).filter((t): t is string => t !== undefined);
    expect(toneProblems(texts)).toEqual([]);
  });

  it("모든 문제의 해설 문장이 「~요.」(또는 「다섯!」)로 끝난다", () => {
    const lines = OMOK_PUZZLE_SETS.flatMap((s) =>
      s.puzzles.flatMap((p) => explainSolved(p)),
    );
    expect(toneProblems(lines)).toEqual([]);
  });

  it("자리 이름 뒤 조사는 읽는 소리의 받침으로 고른다", () => {
    expect(withJosa("K8", "을", "를")).toBe("K8을");
    expect(withJosa("H9", "을", "를")).toBe("H9를");
    expect(withJosa("A10", "은", "는")).toBe("A10은");
    expect(withJosa("B12", "은", "는")).toBe("B12는");
    expect(withJosa("C3", "을", "를")).toBe("C3을");
  });
});

describe("해설이 짚는 자리", () => {
  const all = OMOK_PUZZLE_SETS.flatMap((s) => s.puzzles);

  it.each(all.map((p) => [p.id, p] as const))(
    "%s: 정답 자리를 진하게 짚고, 모든 표시가 판 안이다",
    (_id, p) => {
      const marks = explainMarks(p);
      const answers =
        p.kind === "attack" ? [p.solution] : p.answers.map((a) => a);
      expect(marks.main).toEqual(answers.map(pointAt));
      for (const at of [...marks.main, ...marks.other]) {
        expect(at).toBeGreaterThanOrEqual(0);
        expect(at).toBeLessThan(CELLS);
      }
    },
  );
});
