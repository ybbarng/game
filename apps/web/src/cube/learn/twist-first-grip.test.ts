// 신광사 해법 쥐기 문제(2026-11-27 사용자, docs/47 16-33): 같은 큐브를 여러 방향으로 쥔 그림 가운데 맞는 쥐기만
// 그 경우의 공식 한 번으로 그 단계를 끝내는지 엔진으로 본다.
import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { lookMet } from "./interact";
import { GRIP_QUESTION, TWIST_FIRST_333 } from "./lessons-twist-first";
import {
  gripPieces,
  gripReady,
  nextTwistFirstStep,
  type TwistFirstStageId,
  twistFirstCase,
} from "./twist-first-path";
import type { LookGoal } from "./types";

const Y4 = ["", "y", "y2", "y'"];

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

    it(`${lesson.title}: 쥐기 문제 바로 뒤 쥐어 보기는 틀린 쥐기에서 시작해, 맞는 쥐기로 돌렸을 때만 통과한다`, () => {
      for (const q of quizzes) {
        const look = lesson.steps[lesson.steps.indexOf(q) + 1];
        if (!look) throw new Error("쥐기 문제 뒤 쪽이 없다");
        expect(look.kind).toBe("look");
        expect(look.look).toEqual({ grip: stage });
        const start = play(solvedCube(3), (look.setup as { alg: string }).alg);
        // 고리는 쥐는 기준 조각이 돌려 놓인 자리
        expect(look.focus).toEqual(gripPieces(stage, start));
        const goal = look.look as LookGoal;
        // 넷 가운데 하나(쥐기 문제의 맞는 그림과 같은 쥐기)만 통과
        const passed = Y4.filter((y) => lookMet(3, play(start, y), goal));
        expect(passed).toHaveLength(1);
        const quizStart = play(solvedCube(3), (q.setup as { alg: string }).alg);
        expect(play(start, passed[0] as string).perm).toEqual(quizStart.perm);
        // 흰 면을 뒤집어 쥐면(x2) 맞는 쥐기가 아니다
        expect(lookMet(3, play(quizStart, "x2"), goal)).toBe(false);
      }
    });
  }

  it("흰 십자·첫 층 코너의 쥐어 보기는 넣을 자리가 기준 위치에 오면 쥔 것이다(블럭을 자리 밑으로 데려오는 아랫면 돌리기는 쥔 뒤의 일)", () => {
    // 흰-초록 엣지 블럭이 아래-오른쪽: 들어갈 자리(위-앞)는 이미 앞이라 쥔 것, y'로 돌리면 아니다
    const cross = play(solvedCube(3), "F2 D'");
    expect(nextTwistFirstStep("cross", cross)?.hold).toBe("D");
    expect(gripReady("cross", cross)).toBe(true);
    expect(gripReady("cross", play(cross, "y'"))).toBe(false);
    // 코너 블럭이 아래-앞-왼쪽: 들어갈 자리(앞-오른쪽 위)는 이미 앞-오른쪽이라 쥔 것
    const corner = play(solvedCube(3), "R F' R' F D'");
    expect(gripReady("corners", corner)).toBe(true);
    expect(gripReady("corners", play(corner, "y"))).toBe(false);
  });
});
