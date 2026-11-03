import { cubieToFacelets, solvedCubie } from "@game/cube-solver";
import { describe, expect, it } from "vitest";
import { BEGINNER, CPLL, EO_2LOOK, EPLL, OCLL, OLL, PLL } from "./algs";
import {
  lowerSolved,
  matchAlg,
  topCornersPermuted,
  topEdgesOriented,
  topOriented,
} from "./ll";
import { Solve, uTurn } from "./solve";

/**
 * 공식 표 확인. "상황 만들기(공식 거꾸로) → 공식 → 맞춤"은 어떤 수열이든 늘 참이라,
 * 여기서는 더 강하게 본다:
 * 1. 공식마다 첫 두 층을 깨지 않는다(3×3).
 * 2. 윗층의 모든 방향 상태(216)·모든 자리 상태(288)를 만들어, 표의 공식 하나로
 *    (앞뒤 U 돌리기와 함께) 목표에 닿는지 본다. 그리고 표의 공식이 모두 한 번 이상 쓰인다
 *    = 공식마다 서로 다른 상황을 맡는다(57·21가지가 빠짐없이, 겹치지 않게).
 */

function solved3(): Solve {
  return new Solve(3, cubieToFacelets(solvedCubie(), 3));
}

/** 윗층 방향만 바뀐 3×3 상태들(꼭짓점 방향 합 0, 모서리 방향 합 0) */
function llOrientations(): Solve[] {
  const out: Solve[] = [];
  for (let c = 0; c < 81; c++) {
    const co = [
      c % 3,
      Math.floor(c / 3) % 3,
      Math.floor(c / 9) % 3,
      Math.floor(c / 27) % 3,
    ];
    if (co.reduce((a, b) => a + b, 0) % 3 !== 0) continue;
    for (let e = 0; e < 16; e++) {
      const eo = [e & 1, (e >> 1) & 1, (e >> 2) & 1, (e >> 3) & 1];
      if (eo.reduce((a, b) => a + b, 0) % 2 !== 0) continue;
      const cube = solvedCubie();
      for (let i = 0; i < 4; i++) {
        cube.co[i] = co[i] as number;
        cube.eo[i] = eo[i] as number;
      }
      out.push(new Solve(3, cubieToFacelets(cube, 3)));
    }
  }
  return out;
}

function permutations4(): number[][] {
  const out: number[][] = [];
  const rec = (p: number[]) => {
    if (p.length === 4) out.push(p);
    else for (let i = 0; i < 4; i++) if (!p.includes(i)) rec([...p, i]);
  };
  rec([]);
  return out;
}

function parity(p: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++)
    for (let j = i + 1; j < p.length; j++)
      if ((p[j] as number) < (p[i] as number)) s ^= 1;
  return s;
}

/** 윗층 자리만 바뀐 3×3 상태들(방향은 다 맞음) */
function llPermutations(): Solve[] {
  const out: Solve[] = [];
  for (const cp of permutations4()) {
    for (const ep of permutations4()) {
      if (parity(cp) !== parity(ep)) continue;
      const cube = solvedCubie();
      for (let i = 0; i < 4; i++) {
        cube.cp[i] = cp[i] as number;
        cube.ep[i] = ep[i] as number;
      }
      out.push(new Solve(3, cubieToFacelets(cube, 3)));
    }
  }
  return out;
}

const keepsF2L = (s: Solve) => lowerSolved(s.rel(), 3);

describe("공식이 첫 두 층을 깨지 않는다", () => {
  const all = [
    ...Object.values(BEGINNER).filter(
      (a) =>
        a !== BEGINNER.edgeRight &&
        a !== BEGINNER.edgeLeft &&
        a !== BEGINNER.cornerTrigger,
    ),
    ...EO_2LOOK,
    ...OCLL,
    ...CPLL,
    ...EPLL,
    ...OLL,
    ...PLL.map(([, a]) => a),
  ];
  it.each(all)("%s", (alg) => {
    expect(keepsF2L(solved3().apply(alg))).toBe(true);
  });
});

function coverage(
  states: Solve[],
  algs: readonly string[],
  goal: (s: Solve) => boolean,
  postAuf: boolean,
): { missing: number; used: Set<number> } {
  let missing = 0;
  const used = new Set<number>();
  for (const s of states) {
    const m = matchAlg(s, algs, goal, postAuf);
    if (!m) missing++;
    else if (m.alg >= 0) used.add(m.alg);
  }
  return { missing, used };
}

const oriented = (s: Solve) => keepsF2L(s) && topOriented(s.rel(), 3);
const solved = (s: Solve) => s.isSolved();

describe("OLL 57", () => {
  it("모든 방향 상태를 덮고, 공식 57개가 모두 서로 다른 상황을 맡는다", () => {
    const { missing, used } = coverage(llOrientations(), OLL, oriented, false);
    expect(missing).toBe(0);
    const unused = OLL.map((_, i) => i + 1).filter((i) => !used.has(i - 1));
    expect(unused).toEqual([]);
  });
});

describe("PLL 21", () => {
  it("모든 자리 상태를 덮고, 공식 21개가 모두 쓰인다", () => {
    const { missing, used } = coverage(
      llPermutations(),
      PLL.map(([, a]) => a),
      solved,
      true,
    );
    expect(missing).toBe(0);
    const unused = PLL.filter((_, i) => !used.has(i)).map(([n]) => n);
    expect(unused).toEqual([]);
  });
});

describe("2단계 공식", () => {
  it("노란 십자 3개가 모든 모서리 방향을 덮는다", () => {
    const goal = (s: Solve) => keepsF2L(s) && topEdgesOriented(s.rel());
    const { missing, used } = coverage(llOrientations(), EO_2LOOK, goal, false);
    expect(missing).toBe(0);
    expect(used.size).toBe(3);
  });

  it("꼭짓점 방향 7개가 모서리가 맞은 모든 상태를 덮는다", () => {
    const states = llOrientations().filter((s) => topEdgesOriented(s.rel()));
    const { missing, used } = coverage(states, OCLL, oriented, false);
    expect(missing).toBe(0);
    expect(used.size).toBe(7);
  });

  it("꼭짓점 자리 2개 + 모서리 자리 4개가 모든 자리 상태를 맞춘다", () => {
    const cornersDone = (s: Solve) =>
      keepsF2L(s) && topCornersPermuted(s.rel(), 3);
    let missing = 0;
    const usedC = new Set<number>();
    const usedE = new Set<number>();
    for (const s of llPermutations()) {
      const a = matchAlg(s, CPLL, cornersDone, false);
      if (!a) {
        missing++;
        continue;
      }
      if (a.alg >= 0) usedC.add(a.alg);
      const t = s.clone();
      if (a.alg >= 0) t.apply(uTurn(a.pre)).apply(CPLL[a.alg] as string);
      const b = matchAlg(t, EPLL, solved, true);
      if (!b) missing++;
      else if (b.alg >= 0) usedE.add(b.alg);
    }
    expect(missing).toBe(0);
    expect(usedC.size).toBe(2);
    expect(usedE.size).toBe(4);
  });
});
