// ZZ 마지막 층의 경우별 정해진 길(zz-path.ts nextZzLl, docs/47 16-17)과, ZZ 단원 규칙만으로 섞인 3×3을 끝까지
// 푸는지(EO라인 → 블록 → 마지막 층), 「ZZ 한눈에」 시연·마지막 층 단원 모범 답이 규칙이 낸 수와 같은지 엔진으로 본다.
import { solvedCube } from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { TWO_LOOK_OLL, TWO_LOOK_PLL } from "./algs-2look";
import { goalMet, stateForRule, stepStart } from "./judge";
import {
  ZZ,
  ZZ_DEMO_21,
  ZZ_LL_START_7,
  ZZ_LL_START_21,
  ZZ_OLL_7,
  ZZ_PLL_7,
  ZZ_PLL_21,
} from "./lessons-zz";
import type { Lesson, LessonStep } from "./types";
import { play3, runZzLl, solveZzByRules, stepMovesLl } from "./zz-path";

/** 씨앗마다 다른 섞기 글(결정적, 같은 면을 잇달아 돌리지 않음) */
function scrambleText(seed: number): string {
  let x = seed * 2654435761;
  const next = () => {
    x = (x * 1103515245 + 12345) >>> 0;
    return x;
  };
  const out: string[] = [];
  let last = "";
  while (out.length < 22) {
    const f = "URFDLB"[next() % 6] as string;
    if (f === last) continue;
    last = f;
    out.push(f + (["", "'", "2"][next() % 3] as string));
  }
  return out.join(" ");
}

describe("ZZ 마지막 층(nextZzLl)", () => {
  it("노란 십자가 있는 무작위 마지막 층 200개를 규칙만으로 끝내고, 경우 열넷(코너 일곱·PLL 코너 둘·U 맞추기·PLL 엣지 넷)을 모두 만난다", () => {
    const seen = new Set<string>();
    const order = ["oll", "pll-corners", "align", "pll-edges"];
    for (let seed = 1; seed <= 200; seed++) {
      const r = runZzLl(stateForRule("yellow-cross-solved", seed));
      expect(goalMet(3, r.state, "solved"), `${seed}`).toBe(true);
      // 윗면 → PLL 코너 → U → PLL 엣지, 단계마다 많아야 한 걸음
      const idx = r.steps.map((st) => order.indexOf(st.stage));
      expect(idx).toEqual([...new Set(idx)].sort((a, b) => a - b));
      for (const st of r.steps) seen.add(st.caseId);
    }
    expect([...seen].sort()).toEqual(
      [
        ...[21, 22, 23, 24, 25, 26, 27].map((k) => `2look-oll-${k}`),
        "2look-pll-headlights",
        "2look-pll-diagonal",
        "align",
        "2look-pll-ua",
        "2look-pll-ub",
        "2look-pll-h",
        "2look-pll-z",
      ].sort(),
    );
  });

  it("공식은 CFOP 2단계 공식 그대로이고, 쥐는 수는 U(윗면·PLL 코너)·y(PLL 엣지)뿐이다", () => {
    for (let seed = 1; seed <= 60; seed++)
      for (const st of runZzLl(stateForRule("yellow-cross-solved", seed))
        .steps) {
        if (st.stage === "align") {
          expect(["U", "U'", "U2"]).toContain(st.alg);
          continue;
        }
        const two = [...TWO_LOOK_OLL, ...TWO_LOOK_PLL].find(
          (c) => c.id === st.caseId,
        );
        const base =
          st.caseId === "2look-pll-z" ? `${two?.algs[0]} U'` : two?.algs[0];
        expect(st.alg).toBe(base);
        if (st.stage === "pll-edges")
          expect(["", "y", "y'", "y2"]).toContain(st.hold);
        else expect(["", "U", "U'", "U2"]).toContain(st.hold);
      }
  });

  it("섞인 3×3 40개를 ZZ 단원 규칙(EO라인 → 블록 → 마지막 층)만으로 끝낸다", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const sc = scrambleText(seed);
      const z = solveZzByRules(sc);
      const end = play3(
        solvedCube(3),
        [sc, z.eoline, z.left, z.right, z.ll].join(" "),
      );
      expect(goalMet(3, end, "solved"), `${seed}`).toBe(true);
    }
  });
});

describe("ZZ 단원이 규칙과 같다", () => {
  const lesson = (id: string) => ZZ.lessons.find((l) => l.id === id) as Lesson;

  it("「ZZ 한눈에」 전체 시연 = 단원 규칙이 그 섞기를 푼 수", () => {
    const demo = lesson("zz-intro").steps.find(
      (s) => s.kind === "demo",
    ) as LessonStep;
    const sc = demo.setup && "alg" in demo.setup ? demo.setup.alg : "";
    const z = solveZzByRules(sc);
    expect(demo.alg).toBe([z.eoline, z.left, z.right, z.ll].join(" "));
    expect(demo.alg).toBe(ZZ_DEMO_21);
  });

  it("마지막 층 단원의 시연·해 보기 모범 답 = 규칙이 그 상황에서 낸 수, 글이 말하는 경우", () => {
    const ll = lesson("zz-ll");
    const withAlg = ll.steps.filter((s) => s.alg);
    expect(withAlg.map((s) => s.alg)).toEqual([ZZ_OLL_7, ZZ_PLL_21, ZZ_PLL_7]);
    const [oll7, pll21, pll7] = withAlg as LessonStep[];
    const rule = (st: LessonStep) =>
      runZzLl(stepStart(ll, st, 1)).steps.map(stepMovesLl);
    expect(rule(oll7 as LessonStep)[0]).toBe(ZZ_OLL_7);
    expect(rule(pll21 as LessonStep).join(" ")).toBe(ZZ_PLL_21);
    expect(rule(pll7 as LessonStep).join(" ")).toBe(ZZ_PLL_7);
    // 씨앗 7은 U' 뒤 안티수네 → U → y 뒤 Ua퍼뮤, 씨앗 21은 U' 뒤 안티수네 → Y퍼뮤 → y' 뒤 Ua퍼뮤
    const ids = (start: string) =>
      runZzLl(play3(solvedCube(3), start)).steps.map(
        (x) => `${x.caseId}:${x.hold}`,
      );
    expect(ids(ZZ_LL_START_7)).toEqual([
      "2look-oll-26:U'",
      "align:",
      "2look-pll-ua:y",
    ]);
    expect(ids(ZZ_LL_START_21)).toEqual([
      "2look-oll-26:U'",
      "2look-pll-diagonal:",
      "2look-pll-ua:y'",
    ]);
    // 첫 문제: 위를 보는 노란 코너 블럭이 하나
    const s7 = play3(solvedCube(3), ZZ_LL_START_7);
    const q = ll.steps[0] as LessonStep;
    expect(q.quiz?.choices[q.quiz.answer]).toBe("1개");
    expect(goalMet(3, s7, "f2l")).toBe(true);
  });
});
