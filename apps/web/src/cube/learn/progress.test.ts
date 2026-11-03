import { describe, expect, it } from "vitest";

import {
  averageMs,
  LEARN_KEY,
  loadLearn,
  loadTrain,
  markLessonDone,
  markLessonOpened,
  markTryPassed,
  RECENT_TIMES,
  recordFail,
  recordSolve,
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
    expect(p.lessons["333-white-cross"]).toEqual({ passed: [], done: false });
    expect(p.last).toBe("333-white-cross");
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
