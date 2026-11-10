import { type CubeMove, parseMoves } from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import { algTokens } from "../learn/notation";
import { withFail, withSolve } from "../learn/progress";
import { drawRound, familiar } from "./deck";
import { FollowJudge } from "./follow";
import type { Problem } from "./problem";
import { PracticeRound } from "./round";
import {
  loadPractice,
  recordFollow,
  recordRound,
  rememberStage,
  suggestSee,
} from "./store";

const mv = (t: string): CubeMove => parseMoves(3, t)[0] as CubeMove;
const tokens = (p: Problem) => algTokens(p.alg);
const problem = (caseId: string, alg: string): Problem => ({
  caseId,
  alg,
  preAuf: "",
});

describe("따라 치기 판정", () => {
  it("맞는 수는 차례대로 나아가고 끝나면 done", () => {
    const j = new FollowJudge(3, ["R", "U", "R'"]);
    expect(j.feed(mv("R"))).toEqual({ kind: "hit", index: 0 });
    expect(j.feed(mv("U"))).toEqual({ kind: "hit", index: 1 });
    expect(j.feed(mv("R'"))).toEqual({ kind: "done" });
    expect(j.done).toBe(true);
    expect(j.feed(mv("R"))).toBeNull();
  });

  it("틀린 수는 그 자리에 머물고 큐브에 넣을 것이 없다", () => {
    const j = new FollowJudge(3, ["R", "U"]);
    expect(j.feed(mv("L"))).toEqual({ kind: "miss", index: 0, undo: [] });
    expect(j.index).toBe(0);
    expect(j.expected).toBe("R");
    expect(j.misses).toBe(1);
  });

  it("R2는 R R·R' R'로 나눠 쳐도 맞는다", () => {
    for (const half of ["R", "R'"]) {
      const j = new FollowJudge(3, ["R2", "U"]);
      expect(j.feed(mv(half))).toEqual({ kind: "partial", index: 0 });
      expect(j.feed(mv(half))).toEqual({ kind: "hit", index: 0 });
      expect(j.index).toBe(1);
    }
  });

  it("반쪽을 친 뒤 틀리면 그 반쪽을 되돌릴 수를 준다", () => {
    const j = new FollowJudge(3, ["R2"]);
    j.feed(mv("R"));
    const step = j.feed(mv("U"));
    expect(step).toEqual({ kind: "miss", index: 0, undo: [mv("R'")] });
    // 되돌린 뒤 처음부터 다시 친다
    expect(j.feed(mv("R2"))).toEqual({ kind: "done" });
  });
});

describe("한 판: 콤보와 결과", () => {
  it("따라 치기 콤보는 틀림 없이 이어 맞춘 공식 수, 틀리면 바로 0", () => {
    const clock = new ManualClock();
    const ps = [
      problem("a", "R U"),
      problem("b", "R2"),
      problem("c", "U'"),
      problem("d", "F"),
    ];
    const round = new PracticeRound(ps, "follow", tokens);
    const type = (t: string) => {
      clock.advance(500);
      return round.feedFollow(mv(t), clock.now());
    };
    // a: 깨끗하게
    type("R");
    expect(type("U")?.result?.ms).toBe(500);
    expect(round.combo.current).toBe(1);
    round.next();
    // b: 반쪽 둘
    type("R");
    expect(type("R")?.result).toMatchObject({ caseId: "b", misses: 0 });
    expect(round.combo.current).toBe(2);
    round.next();
    // c: 하나 틀림 → 콤보 0
    expect(type("U")?.step.kind).toBe("miss");
    expect(round.combo.current).toBe(0);
    expect(type("U'")?.result).toMatchObject({ misses: 1 });
    expect(round.combo.current).toBe(0);
    round.next();
    type("F");
    expect(round.combo.current).toBe(1);
    expect(round.next()).toBe(false);
    expect(round.over).toBe(true);

    const s = round.summary();
    expect(s.bestCombo).toBe(2);
    // 맞은 수 5(R U, R2, U', F) / 친 수 6
    expect(s.accuracy).toBeCloseTo(5 / 6);
    // 시간은 첫 키(틀린 수 포함)부터: a 500, b 500, c 500, d는 첫 키가 끝 수라 0
    expect(round.results.map((r) => r.ms)).toEqual([500, 500, 500, 0]);
    expect(s.avgMs).toBe(375);
    // 수 5, 시간 1.5초 → 1분에 200수
    expect(s.perMinute).toBe(200);
    // 수 하나에 걸린 시간: b 500, c 500, a 250
    expect(s.slow.map((x) => x.caseId)).toEqual(["b", "c", "a"]);
  });

  it("보고 치기 콤보는 공식을 펼쳐 보지 않고 이어 맞춘 수", () => {
    const clock = new ManualClock();
    const round = new PracticeRound(
      [problem("a", "R"), problem("b", "U"), problem("c", "F")],
      "see",
      tokens,
    );
    expect(round.follow).toBeNull();
    round.typedSee(clock.now());
    clock.advance(1200);
    round.typedSee(clock.now());
    expect(round.solvedSee(clock.now())).toMatchObject({ ms: 1200, moves: 2 });
    expect(round.combo.current).toBe(1);
    round.next();
    round.peek();
    expect(round.combo.current).toBe(0);
    round.typedSee(clock.now());
    expect(round.solvedSee(clock.now())?.peeked).toBe(true);
    round.next();
    round.typedSee(clock.now());
    round.solvedSee(clock.now());
    round.next();
    const s = round.summary();
    expect(s.accuracy).toBeCloseTo(2 / 3);
    expect(s.bestCombo).toBe(1);
  });
});

describe("출제", () => {
  const ids = ["a", "b", "c", "d", "e"];
  const algOf = (id: string) => `R U ${id === "a" ? "R'" : "U'"}`;

  it("씨앗이 같으면 같은 10문제를 같은 차례로", () => {
    const one = drawRound(ids, { seed: 42, algOf });
    expect(one).toHaveLength(10);
    expect(drawRound(ids, { seed: 42, algOf })).toEqual(one);
    expect(drawRound(ids, { seed: 43, algOf })).not.toEqual(one);
  });

  it("바로 앞과 같은 상황은 잇달아 내지 않는다", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = drawRound(ids, { seed, algOf });
      for (let i = 1; i < r.length; i++)
        expect(r[i]?.caseId).not.toBe(r[i - 1]?.caseId);
    }
    expect(drawRound(["a"], { seed: 1, algOf, count: 3 })).toHaveLength(3);
  });

  it("늘 틀리는 상황이 더 자주 나온다", () => {
    let book = {};
    for (const id of ids)
      for (let k = 0; k < 6; k++) book = withSolve(book, id, 1000, 3);
    for (let k = 0; k < 18; k++) book = withFail(book, "c");
    let c = 0;
    let other = 0;
    for (let seed = 1; seed <= 50; seed++)
      for (const p of drawRound(ids, { seed, algOf, book }))
        if (p.caseId === "c") c++;
        else other++;
    expect(c).toBeGreaterThan(other / 4);
  });

  it("익숙해진 상황만 윗면을 돌려 둔 채 낸다", () => {
    let book = {};
    for (let k = 0; k < 5; k++) book = withSolve(book, "a", 800, 3);
    expect(familiar((book as Record<string, never>).a)).toBe(true);
    const all = Array.from({ length: 30 }, (_, seed) =>
      drawRound(ids, { seed, algOf, book, auf: true }),
    ).flat();
    expect(
      all.filter((p) => p.caseId !== "a").every((p) => p.preAuf === ""),
    ).toBe(true);
    const turned = all.filter((p) => p.caseId === "a" && p.preAuf !== "");
    expect(turned.length).toBeGreaterThan(0);
    expect(turned[0]?.alg.startsWith(`${turned[0]?.preAuf} R U`)).toBe(true);
    // 단계가 윗면 돌리기를 쓰지 않으면 붙이지 않는다
    expect(
      drawRound(ids, { seed: 1, algOf, book }).every((p) => p.preAuf === ""),
    ).toBe(true);
  });
});

describe("연습 기록", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
  };

  it("따라 치기 문제·판 수·마지막 단계를 남기고, 세 판 뒤 외워서 쳐 보기를 권한다", () => {
    const s = memory();
    recordFollow("pll-t", 3000, 14, 0, s);
    recordFollow("pll-t", 2000, 14, 2, s);
    expect(loadPractice(s).follow["pll-t"]).toMatchObject({
      solves: 2,
      fails: 1,
      best: 2000,
    });
    rememberStage("pll", s);
    for (let k = 0; k < 2; k++) recordRound("pll", "follow", s);
    expect(suggestSee(loadPractice(s), "pll")).toBe(false);
    recordRound("pll", "follow", s);
    const rec = loadPractice(s);
    expect(suggestSee(rec, "pll")).toBe(true);
    expect(rec.last).toBe("pll");
    expect(rec.rounds.pll).toEqual({ follow: 3, see: 0 });
  });

  it("깨진 기록은 빈 기록으로 읽는다", () => {
    const s = memory();
    s.setItem("cube.practice.v1", "{broken");
    expect(loadPractice(s)).toEqual({ follow: {}, rounds: {} });
    s.setItem(
      "cube.practice.v1",
      JSON.stringify({ follow: { x: 1 }, rounds: [] }),
    );
    expect(loadPractice(s)).toEqual({ follow: {}, rounds: {} });
  });
});
