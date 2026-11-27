// 신광사 해법 쥐기 문제(2026-11-27 사용자, docs/47 16-33): 같은 큐브를 여러 방향으로 쥔 그림 가운데 맞는 쥐기만
// 그 경우의 공식 한 번으로 그 단계를 끝내는지 엔진으로 본다.
import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { GRIP_QUESTION, TWIST_FIRST_333 } from "./lessons-twist-first";
import {
  nextTwistFirstStep,
  type TwistFirstStageId,
  twistFirstCase,
} from "./twist-first-path";

const STAGE: Record<string, TwistFirstStageId> = {
  "333-tf-cross": "cross",
  "333-tf-corners": "corners",
  "333-tf-second": "second",
  "333-tf-eo": "eo",
  "333-tf-ep": "ep",
  "333-tf-twist": "twist",
  "333-tf-place": "place",
};
const play = (s: ReturnType<typeof solvedCube>, alg: string) =>
  alg.trim() ? applyMoves(3, s, parseMoves(3, alg)) : s;

describe("쥐기 문제", () => {
  for (const lesson of TWIST_FIRST_333.lessons) {
    const stage = STAGE[lesson.id] as TwistFirstStageId;
    const quizzes = lesson.steps.filter(
      (s) => s.quiz?.question === GRIP_QUESTION,
    );

    it(`${lesson.title}: 쥐기 문제가 있고, 그림 넷에 기준 조각 고리가 있다`, () => {
      expect(quizzes.length).toBeGreaterThanOrEqual(1);
      for (const q of quizzes) {
        expect(q.quiz?.pictures?.length).toBe(4);
        expect(q.focus?.length).toBeGreaterThan(0);
      }
    });

    it(`${lesson.title}: 맞는 쥐기만 공식 한 번으로 그 단계를 끝낸다`, () => {
      for (const q of quizzes) {
        const quiz = q.quiz as NonNullable<typeof q.quiz>;
        const start = play(solvedCube(3), (q.setup as { alg: string }).alg);
        const rule = nextTwistFirstStep(stage, start);
        if (!rule) throw new Error("이미 끝난 상태다");
        // 맞는 그림은 규칙도 더 돌려 쥐지 않는다
        const right = quiz.pictures?.[quiz.answer]?.alg ?? "";
        expect(nextTwistFirstStep(stage, play(start, right))?.hold).toBe("");
        const alg = twistFirstCase(stage, rule.caseId).alg;
        const done = (quiz.pictures ?? []).map(
          (p) =>
            nextTwistFirstStep(stage, play(play(start, p.alg), alg)) === null,
        );
        expect(done).toEqual(done.map((_, i) => i === quiz.answer));
      }
    });
  }
});
