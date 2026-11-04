import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import {
  applyAlgorithm,
  faceletsToCubie,
  solvedFacelets,
} from "@game/cube-solver";
import { describe, expect, it } from "vitest";

import {
  analyzeRound,
  CROSS_COLOR_SETS,
  type CrossDifficulty,
  crossCubie,
  cubieCrossKey,
  difficultyAvailable,
  HOLD_DOWN,
  makeCrossRound,
  roundStart,
} from "./scramble";
import { crossDone, crossTable, readCross } from "./solver";

const SEQS = [
  "R U F' L2 D B' R2 U' F",
  "F2 D' L B2 U R' D2 F' L'",
  "B U2 R' D F2 L' U B' R2 D'",
];

function minDepth(colors: readonly number[], c: ReturnType<typeof crossCubie>) {
  return Math.min(
    ...colors.map((x) => crossTable(x)[cubieCrossKey(c, x)] as number),
  );
}

describe("십자 섞기 거르기", () => {
  it("해법기 조각 표현과 엔진이 같은 십자를 읽는다", () => {
    for (const seq of SEQS) {
      const cubie = faceletsToCubie(applyAlgorithm(solvedFacelets(3), seq, 3));
      const state = applyMoves(3, solvedCube(3), parseMoves(3, seq));
      for (let x = 0; x < 6; x++)
        expect(cubieCrossKey(cubie, x)).toBe(readCross(state, x).key);
    }
  });

  it("고른 어려움의 상태만 나온다(색 묶음마다)", () => {
    const cases: [
      keyof typeof CROSS_COLOR_SETS,
      Exclude<CrossDifficulty, "random">,
    ][] = [
      ["white", "le4"],
      ["white", 5],
      ["white", 8],
      ["whiteYellow", 6],
      ["whiteYellow", 8],
      ["all", 7],
      ["all", "le4"],
    ];
    for (const [set, d] of cases) {
      const colors = CROSS_COLOR_SETS[set];
      for (let seed = 1; seed <= 3; seed++) {
        const min = minDepth(colors, crossCubie(colors, d, seed));
        if (d === "le4") {
          expect(min).toBeGreaterThanOrEqual(2);
          expect(min).toBeLessThanOrEqual(4);
        } else expect(min).toBe(d);
      }
    }
  });

  it("같은 씨앗이면 같은 상태", () => {
    const a = crossCubie([0], 7, 99);
    const b = crossCubie([0], 7, 99);
    expect(a).toEqual(b);
  });

  it("모든 색 8수는 고를 수 없다", () => {
    expect(difficultyAvailable("all", 8)).toBe(false);
    expect(difficultyAvailable("whiteYellow", 8)).toBe(true);
  });

  it("섞기 글로 만든 판이 고른 최적 수와 같고, 해를 두면 십자가 된다", () => {
    const round = makeCrossRound({
      colors: [0, 3],
      difficulty: 8,
      seed: 5,
      fromBottom: false,
    });
    expect(round.optimal).toBe(8);
    expect(round.scramble.split(" ").length).toBeLessThanOrEqual(21);
    const start = roundStart(round);
    for (const s of round.solutions) {
      expect(s.moves.split(" ").length).toBe(8);
      expect(
        crossDone(applyMoves(3, start, parseMoves(3, s.moves)), s.color),
      ).toBe(true);
    }
  });

  it("「아래에서」는 첫 색 센터를 아래로 쥐고, 해도 그 방향으로 적는다", () => {
    for (let c = 0; c < 6; c++) {
      const r = analyzeRound(SEQS[0] as string, [c], true);
      expect(r.hold).toBe(HOLD_DOWN[c]);
      const start = roundStart(r);
      expect(readCross(start, c).face).toBe(3);
      const s = r.solutions[0];
      expect(s).toBeDefined();
      expect(
        crossDone(applyMoves(3, start, parseMoves(3, s?.moves ?? "")), c),
      ).toBe(true);
    }
  });

  it("여러 색이면 가장 짧은 색을 알려 준다", () => {
    const r = analyzeRound(SEQS[1] as string, [0, 1, 2, 3, 4, 5], false);
    const values = Object.values(r.depths) as number[];
    expect(r.optimal).toBe(Math.min(...values));
    for (const c of r.best) expect(r.depths[c]).toBe(r.optimal);
    for (const s of r.solutions) expect(r.best).toContain(s.color);
  });
});
