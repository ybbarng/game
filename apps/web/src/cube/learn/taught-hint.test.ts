import { TAUGHT_STAGES } from "@game/cube-ai";
import { applyMoves, isSolved, parseMoves } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { courseById } from "./index";
import { goalMet, stepStart } from "./judge";
import {
  BEGINNER_FINALE_ID,
  BEGINNER_TAUGHT,
  beginnerStages,
  finaleHint,
  finaleReached,
  type HintPlan,
  makeHintPlan,
  nextHint,
  taughtHintKind,
} from "./taught-hint";
import type { Lesson, LessonStep } from "./types";

/**
 * 무작위 해 보기·마무리의 두 단계 힌트(taught-hint.ts). 여러 무작위 상황에서 힌트 수를 따라가면 그 단원 목표에
 * 이르고, 마무리는 끝까지 맞는다. 중간에 다른 수를 쳐도 지금 상태에서 다시 계산해 이어 간다.
 */

const course = courseById("333-beginner");
const lessonOf = (id: string) =>
  course?.lessons.find((l) => l.id === id) as Lesson;
/** 단원의 무작위 해 보기(모범 답 없음) */
const randomTry = (lesson: Lesson) =>
  lesson.steps.find((s) => taughtHintKind(lesson, s) !== null) as LessonStep;

const move = (s: PuzzleState, m: string) => applyMoves(3, s, parseMoves(3, m));

/** 힌트를 따라 친다. 다 되면 친 수, 힌트가 끊기면 null */
function follow(
  start: PuzzleState,
  done: (s: PuzzleState) => boolean,
  hint: (s: PuzzleState, prev: HintPlan | null) => ReturnType<typeof nextHint>,
  disturb?: (s: PuzzleState, i: number) => PuzzleState,
  /** 반 바퀴를 4분의 1씩 친다(「표기」 배치는 같은 키 두 번 = 반 바퀴, 사이마다 힌트를 다시 본다) */
  quarters = false,
): number | null {
  let s = start;
  let plan: HintPlan | null = null;
  for (let i = 0; i < 600; i++) {
    if (done(s)) return i;
    const h = hint(s, plan);
    if (!h) return null;
    plan = h.plan;
    s = move(s, quarters ? h.move.replace(/2$/, "") : h.move);
    if (disturb) s = disturb(s, i);
  }
  return null;
}

describe("3×3 초보자 무작위 해 보기 힌트", () => {
  const { stages } = beginnerStages();

  it("일곱 단계의 단원·목표가 배우는 방식 단계와 같은 차례다", () => {
    expect(stages.map((st) => st.title)).toHaveLength(TAUGHT_STAGES.length);
    // 화면이 처음 그릴 때 쓰는 가벼운 표가 cube-ai 차례와 같다
    expect(BEGINNER_TAUGHT).toEqual(TAUGHT_STAGES);
    stages.forEach((st, i) => {
      // 단계의 본 단원(마지막. 흰 십자 앞의 「안전한 회전」에는 무작위 해 보기가 없다)
      const lesson = lessonOf(st.lessons.at(-1) as string);
      expect(taughtHintKind(lesson, randomTry(lesson))).toBe(TAUGHT_STAGES[i]);
    });
    // 모범 답이 있는 해 보기는 그대로(이 힌트를 쓰지 않는다)
    const cross = lessonOf("333-white-cross");
    const fixed = cross.steps.find((s) => s.kind === "try" && s.alg);
    expect(fixed && taughtHintKind(cross, fixed)).toBeNull();
  });

  for (const [i, stage] of TAUGHT_STAGES.entries()) {
    const st = stages[i];
    it(`${st?.title}: 힌트 수를 따라가면 단원 목표에 이른다`, () => {
      const lesson = lessonOf(st?.lessons.at(-1) as string);
      const step = randomTry(lesson);
      for (let seed = 1; seed <= 6; seed++) {
        const start = stepStart(lesson, step, seed);
        const first = nextHint(stage, start, null);
        expect(first?.label, `${stage} ${seed}`).toBeTruthy();
        const used = follow(
          start,
          (s) => goalMet(3, s, step.goal ?? "solved"),
          (s, prev) => nextHint(stage, s, prev),
        );
        expect(used, `${stage} 씨앗 ${seed}`).not.toBeNull();
        // 반 바퀴를 키 두 번으로 쳐도(첫 4분의 1 뒤 같은 계획에서 나머지) 목표에 이른다
        const byQuarters = follow(
          start,
          (s) => goalMet(3, s, step.goal ?? "solved"),
          (s, prev) => nextHint(stage, s, prev),
          undefined,
          true,
        );
        expect(byQuarters, `${stage} 씨앗 ${seed} 4분의 1씩`).not.toBeNull();
      }
    });
  }

  it("힌트 1의 이름: 흰 십자는 엣지 색과 경우, 코너 방향은 노랑이 보는 쪽과 횟수", () => {
    const cross = lessonOf("333-white-cross");
    const h = nextHint("cross", stepStart(cross, randomTry(cross), 3), null);
    expect(h?.label).toMatch(/^흰-(빨강|초록|주황|파랑) 엣지: .+ 경우$/);
    const twist = lessonOf("333-ll-corner-twist");
    const t = nextHint(
      "ll-corner-twist",
      stepStart(twist, randomTry(twist), 2),
      null,
    );
    expect(t?.label).toMatch(/^코너 방향: 노랑이 (앞|오른쪽), [24]번$/);
  });

  it("코너 방향 도중 R' D' R D를 하다 말아도 나머지부터 이어 간다", () => {
    const twist = lessonOf("333-ll-corner-twist");
    const start = stepStart(twist, randomTry(twist), 4);
    const plan = makeHintPlan("ll-corner-twist", start);
    expect(plan).not.toBeNull();
    // 계획의 첫 R' D'까지만 치고 다시 계산
    const at = plan?.moves.indexOf("R'") ?? -1;
    const mid = move(start, plan?.moves.slice(0, at + 2).join(" ") ?? "");
    const again = makeHintPlan("ll-corner-twist", mid);
    expect(again?.moves.slice(0, 2)).toEqual(["R", "D"]);
    expect(again?.segments[0]?.label).toContain("마저");
    expect(finaleReached(mid)).toBe(TAUGHT_STAGES.length - 1);
  });
});

describe("3×3 초보자 마무리 힌트·진행", () => {
  const finale = lessonOf(BEGINNER_FINALE_ID);
  const step = randomTry(finale);

  it("마무리 해 보기는 「finale」 힌트를 쓴다", () => {
    expect(taughtHintKind(finale, step)).toBe("finale");
  });

  it("힌트를 따라가면 끝까지 맞고, 단계는 차례로 올라 7에 닿는다", () => {
    for (let seed = 1; seed <= 4; seed++) {
      let s = stepStart(finale, step, seed);
      expect(finaleReached(s)).toBe(0);
      let plan: HintPlan | null = null;
      let top = 0;
      for (let i = 0; i < 600 && !isSolved(3, s); i++) {
        const h = finaleHint(s, plan);
        expect(h, `씨앗 ${seed} ${i}`).not.toBeNull();
        if (!h) break;
        plan = h.plan;
        s = move(s, h.move);
        top = Math.max(top, finaleReached(s));
      }
      expect(isSolved(3, s), `씨앗 ${seed}`).toBe(true);
      expect(top).toBe(7);
      expect(finaleReached(s)).toBe(7);
    }
  });

  it("반 바퀴를 키 두 번으로 쳐도 끝까지 맞춘다", () => {
    for (let seed = 1; seed <= 4; seed++) {
      const used = follow(
        stepStart(finale, step, seed),
        (x) => isSolved(3, x),
        (x, prev) => finaleHint(x, prev),
        undefined,
        true,
      );
      expect(used, `씨앗 ${seed}`).not.toBeNull();
    }
  });

  it("중간에 다른 수를 쳐도 지금 상태에서 다시 계산해 끝까지 맞춘다", () => {
    const noise = ["U", "R", "F'", "D2", "L", "B'"];
    const s = stepStart(finale, step, 9);
    const used = follow(
      s,
      (x) => isSolved(3, x),
      (x, prev) => finaleHint(x, prev),
      (x, i) =>
        i % 37 === 36 && i < 300
          ? move(x, noise[Math.floor(i / 37) % noise.length] as string)
          : x,
    );
    expect(used).not.toBeNull();
  });
});
