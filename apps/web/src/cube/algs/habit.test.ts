import { describe, expect, it } from "vitest";

import { ALG_SETS } from "../learn";
import { candidatesOf } from "./candidates";
import { caseById } from "./check";
import {
  HABIT_KEY,
  HABIT_TIMES,
  habitAverage,
  habitWeight,
  KNOWN_STREAK,
  loadHabit,
  pickHabitCase,
  readyForKnown,
  recordHabitFail,
  recordHabitSolve,
} from "./habit";
import {
  ALGS_KEY,
  addMine,
  differsFromLesson,
  exportAlgBook,
  habitList,
  importAlgBook,
  knownAlg,
  loadAlgBook,
  removeMine,
  setHabit,
  setUsed,
  usedAlg,
} from "./store";

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
}

const T = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const sune = () => {
  const c = caseById("oll-27");
  if (!c) throw new Error("oll-27");
  return c;
};

describe("버릇 기록", () => {
  it("내 공식으로 풀면 연속이 늘고, 다른 공식·포기면 끊긴다", () => {
    const st = memory();
    recordHabitSolve("oll-27", { ms: 3000, mine: true, now: T }, st);
    let log = recordHabitSolve(
      "oll-27",
      { ms: 2000, mine: true, now: T + 1 },
      st,
    );
    expect(log["oll-27"]).toMatchObject({
      solves: 2,
      mine: 2,
      streak: 2,
      last: T + 1,
    });
    expect(habitAverage(log["oll-27"])).toBe(2500);
    log = recordHabitSolve("oll-27", { ms: 1000, mine: false, now: T + 2 }, st);
    expect(log["oll-27"]).toMatchObject({ solves: 3, mine: 2, streak: 0 });
    // 다른 공식으로 푼 시간은 남기지 않는다
    expect(log["oll-27"]?.times).toEqual([2000, 3000]);
    recordHabitSolve("oll-27", { ms: 1000, mine: true, now: T + 3 }, st);
    log = recordHabitFail("oll-27", T + 4, st);
    expect(log["oll-27"]).toMatchObject({ streak: 0, last: T + 4 });
  });

  it("최근 시간은 상한까지만 남는다", () => {
    const st = memory();
    for (let i = 0; i < HABIT_TIMES + 3; i++)
      recordHabitSolve("pll-t", { ms: i, mine: true, now: T }, st);
    expect(loadHabit(st)["pll-t"]?.times.length).toBe(HABIT_TIMES);
  });

  it("깨진 저장값은 겉모양을 맞춰 읽는다", () => {
    const st = memory();
    st.setItem(
      HABIT_KEY,
      JSON.stringify({
        a: { solves: "x", streak: -3, times: [1, "2", null, 5], last: 7 },
        b: 3,
      }),
    );
    expect(loadHabit(st)).toEqual({
      a: { solves: 0, mine: 0, streak: 0, times: [1, 5], last: 7 },
    });
    st.setItem(HABIT_KEY, "{");
    expect(loadHabit(st)).toEqual({});
  });

  it("익숙함 제안: 내 공식으로 5번 잇달아, 평균이 기준 안", () => {
    const fast = {
      solves: 5,
      mine: 5,
      streak: KNOWN_STREAK,
      times: [1000, 1000, 1000, 1000, 1000],
      last: T,
    };
    expect(readyForKnown(fast, "pll")).toBe(true);
    expect(readyForKnown({ ...fast, streak: 4 }, "pll")).toBe(false);
    expect(
      readyForKnown({ ...fast, times: Array(5).fill(60_000) }, "pll"),
    ).toBe(false);
    expect(readyForKnown(undefined, "pll")).toBe(false);
  });
});

describe("내 목록에서 고르기", () => {
  it("덜 익은 것·오래된 것이 비중이 크다", () => {
    const s = (streak: number, last: number) => ({
      solves: 1,
      mine: 1,
      streak,
      times: [],
      last,
    });
    expect(habitWeight("learning", undefined, T)).toBeGreaterThan(
      habitWeight("learning", s(0, T), T),
    );
    expect(habitWeight("learning", s(0, T), T)).toBeGreaterThan(
      habitWeight("learning", s(4, T), T),
    );
    expect(habitWeight("learning", s(2, T - 2 * DAY), T)).toBeGreaterThan(
      habitWeight("learning", s(2, T), T),
    );
    expect(habitWeight("learning", s(2, T), T)).toBeGreaterThan(
      habitWeight("known", s(2, T), T),
    );
  });

  it("비중대로 고르고, 바로 앞 상황은 피한다", () => {
    const list = [
      { id: "a", state: "learning" as const },
      { id: "b", state: "known" as const },
    ];
    const log = {
      b: { solves: 9, mine: 9, streak: 9, times: [], last: T },
    };
    // a(3) : b(0.025) — 앞쪽 거의 전부가 a
    expect(pickHabitCase(list, log, T, 0.5)).toBe("a");
    expect(pickHabitCase(list, log, T, 0.999)).toBe("b");
    expect(pickHabitCase(list, log, T, 0.1, "a")).toBe("b");
    expect(pickHabitCase([], log, T, 0.1)).toBeNull();
    expect(pickHabitCase([list[0] as (typeof list)[0]], log, T, 0.1, "a")).toBe(
      "a",
    );
  });
});

describe("내 공식 저장의 버릇 상태(옛 값과 맞음)", () => {
  it("옛 저장값(버릇 없음)은 그대로 읽히고 「안 정함」", () => {
    const st = memory();
    st.setItem(
      ALGS_KEY,
      JSON.stringify({ "oll-27": { mine: [], use: "R U R' U R U2 R'" } }),
    );
    const book = loadAlgBook(st);
    expect(book["oll-27"]?.habit).toBeUndefined();
    expect(habitList(book)).toEqual([]);
  });

  it("모르는 버릇 값은 버린다", () => {
    const st = memory();
    st.setItem(
      ALGS_KEY,
      JSON.stringify({ "oll-27": { mine: [], habit: "zzz" } }),
    );
    expect(loadAlgBook(st)["oll-27"]).toEqual({ mine: [] });
  });

  it("쓰기·지우기·넣기를 해도 버릇 상태가 남는다", () => {
    const c = sune();
    let book = setHabit({}, c, "learning");
    const r = addMine(book, c, "U L' U2 L U L' U L");
    expect(r.ok).toBe(true);
    book = r.book;
    book = setUsed(book, c, "U L' U2 L U L' U L");
    expect(book[c.id]?.habit).toBe("learning");
    book = removeMine(book, c, "U L' U2 L U L' U L");
    expect(book[c.id]?.habit).toBe("learning");
    expect(habitList(book).map((x) => x.c.id)).toEqual([c.id]);
    expect(setHabit(book, c, undefined)[c.id]?.habit).toBeUndefined();
  });

  it("후보 공식을 쓰는 공식으로 고를 수 있고, 배우기 공식과 다르다고 알린다", () => {
    const c = sune();
    const cand = candidatesOf(c)[0]?.alg as string;
    expect(knownAlg({}, c, cand)).toBe(true);
    const book = setUsed({}, c, cand);
    expect(usedAlg(book, c)).toBe(cand);
    expect(differsFromLesson(book, c)).toBe(true);
    expect(differsFromLesson({}, c)).toBe(false);
  });

  it("내보내기·가져오기로 버릇 상태와 후보 쓰는 공식이 옮겨진다", () => {
    const c = sune();
    const cand = candidatesOf(c)[0]?.alg as string;
    const book = setHabit(setUsed({}, c, cand), c, "known");
    const text = exportAlgBook(book);
    const back = importAlgBook({}, text).book;
    expect(back[c.id]).toEqual({ mine: [], use: cand, habit: "known" });
  });

  it("묶음 차례로 목록을 낸다", () => {
    const pll = ALG_SETS.find((s) => s.set === "pll")?.cases[0];
    const book = setHabit(
      setHabit({}, sune(), "learning"),
      pll as never,
      "known",
    );
    const ids = habitList(book).map((x) => x.c.id);
    expect(ids).toHaveLength(2);
  });
});
