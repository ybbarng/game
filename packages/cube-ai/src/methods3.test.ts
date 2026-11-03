import {
  applyMoves,
  isSolved,
  parseMoves,
  randomCubeState,
} from "@game/cube-engine";
import { describe, expect, it } from "vitest";
import {
  type BotLevel,
  solveBeginner3,
  solveCfop,
  solveExpert3,
  solveIntermediate3,
} from "./methods";
import type { HumanSolve } from "./solve";

/**
 * 3×3 사람 흉내 해법: 엔진의 무작위 상태에 해법 수를 엔진으로 두면 맞춰지는지,
 * 수 길이가 대략 사람 범위인지, 단계 경계가 이어지는지.
 */

const SEEDS = [1, 2, 3, 4, 5, 6];

function check(solve: HumanSolve, seed: number): void {
  const start = randomCubeState(3, seed);
  const end = applyMoves(3, start, parseMoves(3, solve.moves.join(" ")));
  expect(isSolved(3, end)).toBe(true);
  // 단계는 빈틈없이 이어진다
  let at = 0;
  for (const st of solve.stages) {
    expect(st.start).toBe(at);
    expect(st.end).toBeGreaterThanOrEqual(st.start);
    at = st.end;
  }
  expect(at).toBe(solve.moves.length);
}

const cases: [
  BotLevel,
  (s: ReturnType<typeof randomCubeState>) => HumanSolve,
  number,
  number,
  string[],
][] = [
  [
    "beginner",
    solveBeginner3,
    80,
    // 씨앗 40개에서 가장 길게 189수가 나왔다(2026-11-04). 초보자 방법은 첫 층 꼭짓점·둘째 층을
    // 같은 공식으로 되풀이해 운 나쁜 상태에서 길어지므로 20% 남짓 여유를 둔다.
    230,
    ["cross", "corners", "middle", "eo", "co", "cp", "ep"],
  ],
  [
    "intermediate",
    solveIntermediate3,
    50,
    130,
    ["cross", "corners", "middle", "eo", "co", "cp", "ep"],
  ],
  [
    "advanced",
    solveCfop,
    40,
    80,
    ["cross", "f2l-1", "f2l-2", "f2l-3", "f2l-4", "oll", "pll"],
  ],
];

describe.each(cases)("3×3 %s", (level, solve, lo, hi, stageNames) => {
  it.each(SEEDS)("씨앗 %i: 맞춰지고 길이가 사람 범위", (seed) => {
    const result = solve(randomCubeState(3, seed));
    check(result, seed);
    expect(result.stages.map((s) => s.name)).toEqual(stageNames);
    expect(result.moves.length).toBeGreaterThanOrEqual(lo);
    expect(result.moves.length).toBeLessThanOrEqual(hi);
    // 흰 면을 아래로 쥐고 시작한다(무작위 상태는 흰 가운데가 위)
    expect(result.moves[0]).toBe("z2");
    if (level === "advanced") {
      // 십자는 8수 안(z2 포함 9)
      const cross = result.stages[0];
      expect((cross?.end ?? 0) - (cross?.start ?? 0)).toBeLessThanOrEqual(9);
    }
  });
});

describe("3×3 expert", () => {
  // 2단계 해법은 큐브를 돌려 쥐지 않고 한 단계로 맞춘다(사람을 넘는 짧은 해)
  it.each(SEEDS)("씨앗 %i: 맞춰지고 한 단계, 21수 안", (seed) => {
    const result = solveExpert3(randomCubeState(3, seed));
    check(result, seed);
    expect(result.stages.map((s) => s.name)).toEqual(["solve"]);
    expect(result.moves.length).toBeLessThanOrEqual(21);
  });
});

describe("고수 CFOP", () => {
  it("같은 상태면 같은 수", () => {
    const s = randomCubeState(3, 1);
    expect(solveCfop(s)).toEqual(solveCfop(s));
  });
});
