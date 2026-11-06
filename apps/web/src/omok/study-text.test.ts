// 배우기·문제 글의 말투(「~요」, 마침표)와 해설이 짚는 자리 표시를 본다.
import { CELLS, pointAt } from "@game/omok-engine";
import { describe, expect, it } from "vitest";

import { OMOK_PUZZLE_SETS } from "./puzzles";
import { explainMarks, explainSolved, withJosa } from "./study";
import { OMOK_LESSONS } from "./tutorial";

/** 문장 끝: 「~요.」이거나 느낌표·물음표 */
const ENDS = /(요\.|!|\?)$/;
const plain = (s: string) => s.replace(/\*\*/g, "");

describe("글 말투", () => {
  it("단원 요약·설명·퀴즈 풀이·미션 글은 「~요.」(또는 ! ?)로 끝난다", () => {
    const texts: string[] = [];
    for (const lesson of OMOK_LESSONS) {
      texts.push(lesson.summary);
      for (const step of lesson.steps) {
        if (step.kind === "explain") texts.push(...step.body);
        if (step.kind === "quiz") texts.push(step.question, step.explain);
        if (step.kind === "mission")
          texts.push(step.objective, step.hint, step.success, step.fail);
      }
    }
    expect(texts.map(plain).filter((t) => !ENDS.test(t))).toEqual([]);
  });

  it("문제 묶음 설명·도움말은 「~요.」로 끝난다", () => {
    const texts = OMOK_PUZZLE_SETS.flatMap((s) => [s.summary, s.hint]);
    expect(texts.filter((t) => !ENDS.test(t))).toEqual([]);
  });

  it("모든 문제의 해설 문장이 「~요.」(또는 「다섯!」)로 끝난다", () => {
    const lines = OMOK_PUZZLE_SETS.flatMap((s) =>
      s.puzzles.flatMap((p) => explainSolved(p)),
    );
    expect(lines.filter((l) => !ENDS.test(l))).toEqual([]);
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
