// 마지막 층 두 길(ll-compare.ts): 같은 섞기를 초보자 네 단계와 2단계 OLL·PLL로 맞춰, 단원 글이 쓰는 숫자를 다시 잰다.
import { parseMoves } from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { TWO_LOOK_OLL, TWO_LOOK_PLL } from "./algs-2look";
import { OLL_CASES } from "./algs-oll";
import { PLL_CASES } from "./algs-pll";
import { play, TWIST } from "./beginner-path";
import { goalMet, stateForRule } from "./judge";
import {
  LL_COMPARE,
  solveBeginnerLl,
  solveTwoLook,
  turnCount,
} from "./ll-compare";

const SEEDS = Array.from({ length: LL_COMPARE.seeds }, (_, i) => i + 1);
const starts = SEEDS.map((seed) => stateForRule("f2l-solved", seed));
const mean = (xs: number[]) =>
  Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

describe("마지막 층 두 길", () => {
  const beginner = starts.map(solveBeginnerLl);
  const twoLook = starts.map((s) => solveTwoLook(s).run);

  it("같은 섞기 50개를 두 길 모두 끝까지 맞춘다", () => {
    for (const [i, r] of [...beginner, ...twoLook].entries())
      expect(goalMet(3, r.state, "solved"), `${i}`).toBe(true);
  });

  it("단원 글의 평균 수·공식 횟수는 지금 자료로 잰 값이다", () => {
    expect({
      seeds: SEEDS.length,
      beginnerTurns: mean(beginner.map((r) => turnCount(r.steps))),
      twoLookTurns: mean(twoLook.map((r) => turnCount(r.steps))),
      beginnerFormulas: mean(beginner.map((r) => r.formulas)),
      twoLookFormulas: mean(twoLook.map((r) => r.formulas)),
    }).toEqual(LL_COMPARE);
  });

  it("2단계는 공식이 끝날 때마다 아래 두 층이 맞고, 초보자 코너 돌리기 한 번은 아래 두 층을 흐트러뜨린다", () => {
    for (const s of starts.slice(0, 10)) {
      let t = s;
      for (const step of solveTwoLook(s).run.steps) {
        t = play(t, step);
        expect(goalMet(3, t, "f2l")).toBe(true);
      }
    }
    expect(goalMet(3, play(starts[0] as never, TWIST), "f2l")).toBe(false);
  });

  it("2단계 코너 단계 일곱·PLL 여섯은 전체 OLL·PLL에 같은 공식으로 든다", () => {
    const full = [...OLL_CASES, ...PLL_CASES].flatMap((c) => c.algs);
    const twoLook = [
      ...TWO_LOOK_OLL.filter((c) => c.group === "corners"),
      ...TWO_LOOK_PLL,
    ].map((c) => c.algs[0] as string);
    expect(twoLook).toHaveLength(13);
    expect(twoLook.filter((a) => !full.includes(a))).toEqual([]);
  });

  it("노란 면 걸음 공식 7개 가운데 R과 U만 쓰는 것은 4개다(단원 글 「7개 가운데 4개는 R과 U만」)", () => {
    const onlyRU = TWO_LOOK_OLL.filter((c) => c.group === "corners").filter(
      (c) =>
        parseMoves(3, c.algs[0] as string).length > 0 &&
        (c.algs[0] as string).split(" ").every((m) => /^[RU]['2]?$/.test(m)),
    );
    expect(onlyRU.map((c) => c.id).sort()).toEqual([
      "2look-oll-21",
      "2look-oll-22",
      "2look-oll-26",
      "2look-oll-27",
    ]);
  });
});
