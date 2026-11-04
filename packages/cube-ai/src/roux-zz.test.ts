import {
  applyMoves,
  isSolved,
  parseMoves,
  randomCubeState,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";
import { solveRoux, solveZZ } from "./methods-roux-zz";
import type { HumanSolve, StageName } from "./solve";

/** 루·ZZ 사람 흉내 해법: 무작위 섞기 몇 개를 엔진으로 두어 맞춰지는지, 단계가 차례대로 있는지 */

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 100);

interface Case {
  name: string;
  solve: (s: PuzzleState) => HumanSolve;
  stages: StageName[];
  /** 이 단계들 안에서는 이 수만 쓴다 */
  limited: StageName[];
  allowed: RegExp;
}

const CASES: Case[] = [
  {
    name: "루",
    solve: solveRoux,
    stages: ["fb", "sb", "cmll", "lse-eo", "lse-ulur", "lse-ep"],
    limited: ["lse-eo", "lse-ulur", "lse-ep"],
    allowed: /^[MU]['2]?$/,
  },
  {
    name: "ZZ",
    solve: solveZZ,
    stages: ["eoline", "zz-left", "zz-right", "oll", "pll"],
    limited: ["zz-left", "zz-right"],
    allowed: /^[RUL]['2]?$/,
  },
];

describe.each(CASES)("3×3 $name", ({ solve, stages, limited, allowed }) => {
  it.each(SEEDS)("씨앗 %i: 엔진으로 두면 맞춰진다", (seed) => {
    const start = randomCubeState(3, seed);
    const r = solve(start);
    const end = applyMoves(3, start, parseMoves(3, r.moves.join(" ")));
    expect(isSolved(3, end)).toBe(true);
    expect(r.stages.map((s) => s.name)).toEqual(stages);
    expect(r.stages.at(-1)?.end).toBe(r.moves.length);
    expect(r.moves.length).toBeLessThan(90);
    for (const st of r.stages.filter((x) => limited.includes(x.name)))
      for (const m of r.moves.slice(st.start, st.end))
        expect(m, `${st.name} ${m}`).toMatch(allowed);
  });
});

describe("루 둘째 블록", () => {
  it("R·r·M·U만 쓴다(첫 블록을 건드리지 않는다)", () => {
    const r = solveRoux(randomCubeState(3, 21));
    const sb = r.stages.find((s) => s.name === "sb");
    if (!sb) throw new Error("둘째 블록 없음");
    for (const m of r.moves.slice(sb.start, sb.end))
      expect(m).toMatch(/^(R|Rw|M|U)['2]?$/);
  });
});
