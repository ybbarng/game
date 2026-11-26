import { describe, expect, it } from "vitest";

import { COURSES } from "./index";

import {
  averageMs,
  LEARN_KEY,
  LESSON_RENAMES,
  loadLearn,
  loadTrain,
  markLessonDone,
  markLessonOpened,
  markStepActed,
  markStepSeen,
  markTryPassed,
  RECENT_TIMES,
  recordFail,
  recordSolve,
  resumeStep,
  STEP_REMAPS,
  TRAIN_KEY,
  weakCases,
} from "./progress";

function memory() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
    raw: m,
  };
}

describe("배우기 진도", () => {
  it("해보기 통과·단원 끝냄이 저장되고 다시 읽힌다", () => {
    const s = memory();
    markTryPassed("333-notation", 8, s);
    markTryPassed("333-notation", 3, s);
    markTryPassed("333-notation", 8, s);
    markLessonDone("333-notation", s);
    markLessonOpened("333-white-cross", s);
    const p = loadLearn(s);
    expect(p.lessons["333-notation"]).toEqual({ passed: [3, 8], done: true });
    // 쪽 차례를 다시 짠 단원은 지금 판(v)을 함께 적는다
    expect(p.lessons["333-white-cross"]).toEqual({
      passed: [],
      done: false,
      v: STEP_REMAPS["333-white-cross"]?.v,
    });
    expect(p.last).toBe("333-white-cross");
  });

  it("마지막으로 본 단계를 남기고 다시 열 때 그 단계로 연다(옛 기록·틀린 값은 0부터)", () => {
    const s = memory();
    markTryPassed("333-white-cross", 4, s);
    markStepSeen("333-white-cross", 7, s);
    const p = loadLearn(s);
    expect(p.lessons["333-white-cross"]).toEqual({
      passed: [4],
      done: false,
      step: 7,
      v: 2,
    });
    expect(resumeStep(p, "333-white-cross", 20)).toBe(7);
    // 단원이 짧아져 그 단계가 없으면 처음부터
    expect(resumeStep(p, "333-white-cross", 5)).toBe(0);
    // 단계 번호가 없는 옛 기록과 모양이 틀린 값
    s.setItem(
      LEARN_KEY,
      JSON.stringify({
        lessons: {
          "333-notation": { passed: [1, "x", 2.5], done: true },
          "333-pieces": { passed: [], done: false, step: -1 },
          "333-start": { passed: [], done: false, step: "3" },
          "333-bad": null,
        },
      }),
    );
    const old = loadLearn(s);
    expect(old.lessons["333-notation"]).toEqual({ passed: [1], done: true });
    expect(resumeStep(old, "333-notation", 10)).toBe(0);
    expect(old.lessons["333-pieces"]).toEqual({ passed: [], done: false });
    expect(resumeStep(old, "333-start", 10)).toBe(0);
    expect(old.lessons["333-bad"]).toBeUndefined();
    // 해 보기 통과를 더해도 본 단계는 그대로 남는다
    markStepSeen("333-notation", 2, s);
    markTryPassed("333-notation", 5, s);
    expect(loadLearn(s).lessons["333-notation"]?.step).toBe(2);
  });

  it("해 보기 밖의 마친 단계도 남는다(옛 기록은 빈 목록, 틀린 값은 버림)", () => {
    const s = memory();
    markStepActed("333-notation", 3, s);
    markStepActed("333-notation", 1, s);
    markStepActed("333-notation", 3, s);
    markStepSeen("333-notation", 4, s);
    expect(loadLearn(s).lessons["333-notation"]).toEqual({
      passed: [],
      done: false,
      step: 4,
      acted: [1, 3],
    });
    s.setItem(
      LEARN_KEY,
      JSON.stringify({
        lessons: {
          "333-notation": { passed: [], done: false, acted: [2, "x", -1] },
          "333-start": { passed: [], done: false, acted: "1" },
        },
      }),
    );
    const p = loadLearn(s);
    expect(p.lessons["333-notation"]?.acted).toEqual([2]);
    expect(p.lessons["333-start"]).toEqual({ passed: [], done: false });
  });

  it("새로 짠 단원(2026-11-04)은 옛 단원의 끝냄만 옮기고, 해 보기 번호와 이미 있는 새 진도는 건드리지 않는다", () => {
    const s = memory();
    s.setItem(
      LEARN_KEY,
      JSON.stringify({
        lessons: {
          "333-yellow-face": { passed: [3, 4], done: true },
          "333-yellow-corners": { passed: [3], done: false },
          "333-first-corners": { passed: [1], done: true },
          "333-first-corners-up": { passed: [7], done: false, v: 2 },
        },
        last: "333-yellow-edges",
      }),
    );
    const p = loadLearn(s);
    expect(p.lessons["333-ll-edges"]).toEqual({ passed: [], done: true });
    expect(p.lessons["333-ll-corner-place"]).toEqual({
      passed: [],
      done: false,
    });
    expect(p.lessons["333-first-corners-up"]).toEqual({
      passed: [7],
      done: false,
      v: 2,
    });
    expect(p.last).toBe("333-ll-corner-twist");
    // 옮긴 새 id는 모두 지금 과정에 있다
    const ids = new Set(COURSES.flatMap((c) => c.lessons.map((l) => l.id)));
    for (const to of Object.values(LESSON_RENAMES))
      expect(ids.has(to), to).toBe(true);
  });

  it("쪽 차례를 다시 짠 3×3 처음 맞추기(2026-11-26)는 옛 쪽 번호를 같은 활동의 새 번호로 옮기고, 없어진 쪽은 버린다", () => {
    const s = memory();
    s.setItem(
      LEARN_KEY,
      JSON.stringify({
        lessons: {
          // 옛 흰 십자: 5번(0부터) 해 보기 「흰-빨강 아래 층」, 17번 해 보기는 없어졌다, 본 쪽 9번 시연 「F D F'」
          "333-white-cross": {
            passed: [5, 17],
            done: true,
            step: 9,
            acted: [0, 11],
          },
          // 옛 둘째 층 8번(뒤집힌 엣지 해 보기)은 시연으로 바뀌어 버린다
          "333-second-layer": { passed: [4, 8], done: false, step: 8 },
        },
      }),
    );
    const p = loadLearn(s);
    expect(p.lessons["333-white-cross"]).toEqual({
      passed: [7],
      done: true,
      step: 13,
      acted: [0],
      v: 2,
    });
    expect(p.lessons["333-second-layer"]).toEqual({
      passed: [6],
      done: false,
      v: 2,
    });
  });

  it("옮긴 쪽 번호는 같은 종류·상황·공식의 쪽을 가리킨다(해 보기는 해 보기로)", () => {
    for (const [id, remap] of Object.entries(STEP_REMAPS)) {
      const lesson = COURSES.flatMap((c) => c.lessons).find((l) => l.id === id);
      expect(lesson, id).toBeDefined();
      const to = Object.values(remap.from);
      expect(new Set(to).size, `${id} 겹침`).toBe(to.length);
      for (const i of to)
        expect(i, `${id} ${i}`).toBeLessThan(lesson?.steps.length ?? 0);
    }
    // 대표: 옛 흰 십자 5번 해 보기(흰-빨강 아래 층 R2 D2) → 새 7번
    const cross = COURSES.flatMap((c) => c.lessons).find(
      (l) => l.id === "333-white-cross",
    );
    expect(cross?.steps[7]).toMatchObject({
      kind: "try",
      setup: { alg: "R2 D2" },
    });
  });

  it("깨진 값이나 막힌 저장소에서도 빈 진도로 돈다", () => {
    const s = memory();
    s.raw.set(LEARN_KEY, "{깨짐");
    expect(loadLearn(s)).toEqual({ lessons: {} });
    expect(loadLearn(null)).toEqual({ lessons: {} });
    expect(markTryPassed("x", 1, null).lessons.x?.passed).toEqual([1]);
  });
});

describe("훈련 기록", () => {
  it("맞춤·포기가 쌓이고 최고·평균을 낸다", () => {
    const s = memory();
    recordSolve("pll-t", 3_000, 14, s);
    recordSolve("pll-t", 2_000, 15, s);
    recordFail("pll-t", s);
    const t = loadTrain(s)["pll-t"];
    expect(t).toMatchObject({
      solves: 2,
      fails: 1,
      best: 2_000,
      times: [2_000, 3_000],
      moves: [15, 14],
    });
    expect(averageMs(t)).toBe(2_500);
    expect(averageMs(undefined)).toBeNull();
  });

  it("최근 시간은 정해진 수만 남긴다", () => {
    const s = memory();
    for (let i = 0; i < RECENT_TIMES + 3; i++) recordSolve("a", 1000 + i, 5, s);
    expect(loadTrain(s).a?.times).toHaveLength(RECENT_TIMES);
    expect(loadTrain(s).a?.best).toBe(1000);
  });

  it("깨진 값이면 빈 기록", () => {
    const s = memory();
    s.raw.set(TRAIN_KEY, "[1,2]");
    expect(loadTrain(s)).toEqual({});
  });

  it("약한 상황: 안 해 본 것, 포기 잦은 것, 느린 것 먼저", () => {
    const s = memory();
    recordSolve("fast", 1_000, 5, s);
    recordSolve("slow", 5_000, 5, s);
    recordSolve("failed", 2_000, 5, s);
    recordFail("failed", s);
    recordFail("failed", s);
    const ids = ["fast", "slow", "failed", "new"];
    expect(weakCases(ids, loadTrain(s))).toEqual(["new", "failed"]);
    expect(weakCases(["fast"], loadTrain(s))).toEqual(["fast"]);
  });
});
