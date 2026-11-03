import {
  applyMoves,
  isSolved,
  parseMoves,
  randomCubeState,
} from "@game/cube-engine";
import { cubieToFacelets, solvedCubie } from "@game/cube-solver";
import { describe, expect, it } from "vitest";
import { CPLL, OCLL_2X2 } from "./algs";
import { lowerSolved, matchAlg, topOriented } from "./ll";
import {
  solveAdvanced2,
  solveBeginner2,
  solveExpert2,
  solveIntermediate2,
} from "./methods";
import { type HumanSolve, Solve } from "./solve";

/** 2×2 사람 흉내 해법과 2×2 공식 표 */

const SEEDS = [1, 2, 3, 4, 5, 6];

const cases: [
  string,
  (s: ReturnType<typeof randomCubeState>) => HumanSolve,
  number,
  number,
][] = [
  ["입문", solveBeginner2, 30, 130],
  ["중수", solveIntermediate2, 25, 110],
  ["고수", solveAdvanced2, 10, 45],
  ["초고수", solveExpert2, 0, 11],
];

describe.each(cases)("2×2 %s", (_name, solve, lo, hi) => {
  it.each(SEEDS)("씨앗 %i: 엔진으로 두면 맞춰진다", (seed) => {
    const start = randomCubeState(2, seed);
    const r = solve(start);
    const end = applyMoves(2, start, parseMoves(2, r.moves.join(" ")));
    expect(isSolved(2, end)).toBe(true);
    expect(r.moves.length).toBeGreaterThanOrEqual(lo);
    expect(r.moves.length).toBeLessThanOrEqual(hi);
    expect(r.stages.at(-1)?.end).toBe(r.moves.length);
  });
});

function state2(co: number[], cp: number[] = [0, 1, 2, 3]): Solve {
  const cube = solvedCubie();
  for (let i = 0; i < 4; i++) {
    cube.co[i] = co[i] as number;
    cube.cp[i] = cp[i] as number;
  }
  return new Solve(2, cubieToFacelets(cube, 2));
}

describe("2×2 공식 표", () => {
  it("2×2 공식은 바깥 면 수만 쓴다(r·M은 2×2에서 뜻이 바뀐다)", () => {
    for (const alg of [...OCLL_2X2, ...CPLL]) {
      expect(alg).toMatch(/^[RUFLDB2' ]+$/);
    }
  });

  it("윗면 7개가 모든 꼭짓점 방향을 덮는다", () => {
    const goal = (s: Solve) =>
      lowerSolved(s.rel(), 2) && topOriented(s.rel(), 2);
    const used = new Set<number>();
    const missing: string[] = [];
    for (let c = 0; c < 81; c++) {
      const co = [
        c % 3,
        Math.floor(c / 3) % 3,
        Math.floor(c / 9) % 3,
        Math.floor(c / 27) % 3,
      ];
      if (co.reduce((a, b) => a + b, 0) % 3 !== 0) continue;
      const m = matchAlg(state2(co), OCLL_2X2, goal);
      if (!m) missing.push(co.join(""));
      else if (m.alg >= 0) used.add(m.alg);
    }
    expect(missing).toEqual([]);
    expect(used.size).toBe(7);
  });

  it("윗층 자리 2개가 모든 꼭짓점 자리를 맞춘다", () => {
    const perms: number[][] = [];
    const rec = (p: number[]) => {
      if (p.length === 4) perms.push(p);
      else for (let i = 0; i < 4; i++) if (!p.includes(i)) rec([...p, i]);
    };
    rec([]);
    const used = new Set<number>();
    for (const cp of perms) {
      const m = matchAlg(
        state2([0, 0, 0, 0], cp),
        CPLL,
        (s) => s.isSolved(),
        true,
      );
      expect(m).not.toBeNull();
      if (m && m.alg >= 0) used.add(m.alg);
    }
    expect(used.size).toBe(2);
  });
});
