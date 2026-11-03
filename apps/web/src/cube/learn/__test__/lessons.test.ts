import { describe, expect, it } from "vitest";
import { ALL_ALG_CASES, COURSES } from "../index";
import { invertAlg } from "../notation";
import { GOALS, MASKS, SCRAMBLE_RULES } from "../types";
import { goalMet } from "./goals";
import { apply, invert, parseMove, solved, tokens } from "./sim";

const steps = COURSES.flatMap((c) =>
  c.lessons.flatMap((l) =>
    l.steps.map((s) => ({ course: c, lesson: l, step: s })),
  ),
);

describe("배우기 과정", () => {
  it("단원 id가 겹치지 않고, 단원 크기가 과정 크기와 같다", () => {
    const ids = COURSES.flatMap((c) => c.lessons.map((l) => l.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of COURSES)
      for (const l of c.lessons) expect(l.size, l.id).toBe(c.size);
  });

  it("단계 모양: 시연은 공식, 해보기는 상황과 목표가 있다", () => {
    for (const { lesson, step } of steps) {
      const where = `${lesson.id}: ${step.body.slice(0, 20)}`;
      expect(step.body.length, where).toBeGreaterThan(0);
      if (step.kind === "demo") expect(step.alg, where).toBeDefined();
      if (step.kind === "try") {
        expect(step.setup, where).toBeDefined();
        expect(step.goal, where).toBeDefined();
      }
      if (step.goal !== undefined) expect(step.goal in GOALS, where).toBe(true);
      if (step.mask !== undefined) expect(step.mask in MASKS, where).toBe(true);
      if (step.setup !== undefined && "rule" in step.setup)
        expect(step.setup.rule in SCRAMBLE_RULES, where).toBe(true);
    }
  });

  it("모든 공식이 그 크기 큐브에서 읽힌다", () => {
    for (const { lesson, step } of steps) {
      const algs = [
        step.alg,
        step.setup !== undefined && "alg" in step.setup
          ? step.setup.alg
          : undefined,
      ];
      for (const a of algs) {
        if (a === undefined) continue;
        for (const t of tokens(a))
          expect(
            () => parseMove(t, lesson.size),
            `${lesson.id}: ${t}`,
          ).not.toThrow();
      }
    }
  });

  // 2×2·3×3 해보기: 상황에서는 목표가 아직 안 됐고, 모범 답을 하면 된다
  const checkable = steps.filter(
    ({ lesson, step }) =>
      step.kind === "try" &&
      (lesson.size === 2 || lesson.size === 3) &&
      step.setup !== undefined &&
      "alg" in step.setup &&
      step.alg !== undefined,
  );

  it("2×2·3×3 해보기가 서른 개 넘게 있다", () => {
    expect(checkable.length).toBeGreaterThan(30);
  });

  it.each(
    checkable.map(({ lesson, step }) => ({
      id: lesson.id,
      size: lesson.size as 2 | 3,
      step,
    })),
  )("$id 해보기: 상황 → 모범 답 → 목표", ({ size, step }) => {
    const setup = (step.setup as { alg: string }).alg;
    const goal = step.goal as keyof typeof GOALS;
    const start = apply(solved(3), setup);
    expect(goalMet(goal, start, size), `처음부터 목표: ${step.body}`).toBe(
      false,
    );
    expect(
      goalMet(goal, apply(start, step.alg as string), size),
      step.body,
    ).toBe(true);
  });
});

describe("공식 문자열", () => {
  it("자료의 invertAlg는 시뮬레이터의 거꾸로와 같다", () => {
    for (const c of ALL_ALG_CASES)
      for (const a of c.algs) expect(invertAlg(a)).toBe(invert(a));
  });

  it("상황 id가 겹치지 않는다", () => {
    const ids = ALL_ALG_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
