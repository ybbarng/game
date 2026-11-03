import {
  applyMoves,
  parseMoves,
  randomCubeState,
  solvedCube,
} from "@game/cube-engine";
import { EDGE_PARITY_TEXT, PLL_PARITY_TEXT } from "@game/cube-reduction";
import { describe, expect, it } from "vitest";
import {
  checkSolve,
  REDUCTION_STAGES,
  stageNames,
  THREE_STAGES,
  withoutParity,
} from "./big-test-util";
import { BOT_LEVELS, solveHuman } from "./methods";

/**
 * 4×4 사람 흉내: 축소법 단계 뒤 같은 단계의 3×3 해법. 패리티는 3×3 단계 도중에 고친다
 * (모서리 뒤집힘은 OLL 앞, 모서리 맞바뀜은 PLL 앞). 무작위 상태는 패리티가 생길지 운이라
 * 패리티는 일부러 만든 상태로 따로 본다.
 */

describe("4×4", () => {
  const starts = [21, 22].map((seed) => randomCubeState(4, seed));

  it.each(BOT_LEVELS)("%s: 엔진에서 맞춰지고 단계가 이어진다", (level) => {
    for (const start of starts) {
      const solve = solveHuman(level, 4, start);
      checkSolve(4, start, solve);
      expect(withoutParity(solve)).toEqual([
        ...REDUCTION_STAGES,
        ...THREE_STAGES[level],
      ]);
    }
  });
});

describe("4×4 패리티", () => {
  // 축소가 끝난 모양에 패리티 공식을 넣고 바깥층으로 섞으면 패리티가 꼭 남는다
  const scramble = "R U F' D2 L B' U2 R' F D'";
  const make = (parity: string) =>
    applyMoves(4, solvedCube(4), parseMoves(4, `${parity} ${scramble}`));

  it("모서리 하나가 뒤집혔으면 OLL 앞(F2L 뒤)에서 고친다", () => {
    const start = make(EDGE_PARITY_TEXT);
    for (const level of ["beginner", "advanced"] as const) {
      const solve = solveHuman(level, 4, start);
      checkSolve(4, start, solve);
      const list = stageNames(solve);
      const at = list.indexOf("oll-parity");
      expect(list[at - 1]).toBe(level === "beginner" ? "middle" : "f2l-4");
      expect(list[at + 1]).toBe(level === "beginner" ? "eo" : "oll");
      expect(list).not.toContain("pll-parity");
    }
  });

  it("두 모서리가 바뀌었으면 PLL 앞(OLL 뒤)에서 고친다", () => {
    const start = make(PLL_PARITY_TEXT);
    for (const level of ["intermediate", "advanced"] as const) {
      const solve = solveHuman(level, 4, start);
      checkSolve(4, start, solve);
      const list = stageNames(solve);
      const at = list.indexOf("pll-parity");
      expect(list[at - 1]).toBe(level === "intermediate" ? "co" : "oll");
      expect(list[at + 1]).toBe(level === "intermediate" ? "cp" : "pll");
      expect(list).not.toContain("oll-parity");
    }
  });

  it("초고수는 축소법 그대로 3×3 앞에서 고친다", () => {
    const start = make(EDGE_PARITY_TEXT);
    const list = stageNames(solveHuman("expert", 4, start));
    expect(list.indexOf("oll-parity")).toBe(list.indexOf("three") - 2);
  });
});
