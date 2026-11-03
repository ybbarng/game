import {
  applyMoves,
  faceColors,
  isSolved,
  parseMoves,
  randomCubeState,
} from "@game/cube-engine";
import { describe, expect, test } from "vitest";
import { FACE_LETTERS } from "./sim";
import {
  type ReductionStageId,
  solveReduction,
  solveReductionState,
} from "./solve";
import { checkStages } from "./test-util";

const n = 4;

// 씨앗은 패리티가 고루 나오게 골랐다: 1 OLL만, 2 OLL·PLL, 7 둘 다 없음, 8 PLL만
const SEEDS = [1, 2, 7, 8];
const cases = new Map(
  SEEDS.map((seed) => {
    const state = randomCubeState(n, seed);
    return [seed, { state, sol: solveReductionState(n, state) }] as const;
  }),
);

function caseOf(seed: number) {
  const c = cases.get(seed);
  if (!c) throw new Error(`없는 씨앗: ${seed}`);
  return c;
}

function stageLength(seed: number, id: ReductionStageId): number {
  const s = caseOf(seed).sol.stages.find((x) => x.id === id);
  return s ? s.to - s.from : -1;
}

describe.each(SEEDS)("4×4 무작위 상태 %i", (seed) => {
  const { state, sol } = caseOf(seed);

  test("풀린다", () => {
    expect(isSolved(n, applyMoves(n, state, parseMoves(n, sol.moves)))).toBe(
      true,
    );
  });

  test("단계가 끝날 때마다 그 단계의 조각이 맞아 있다", () => {
    expect(sol.stages.map((s) => s.id)).toEqual([
      "centers-ud",
      "centers-rest",
      "edges",
      "last-edges",
      "oll-parity",
      "pll-parity",
      "three",
    ]);
    expect(sol.stages.map((s) => s.name)).toEqual([
      "흰·노랑 가운데",
      "나머지 가운데",
      "모서리 짝",
      "마지막 두 모서리",
      "OLL 패리티",
      "PLL 패리티",
      "3×3",
    ]);
    checkStages(n, state, sol);
  });

  test("수 길이가 사람 축소법 정도다", () => {
    const len = parseMoves(n, sol.moves).length;
    expect(len).toBeGreaterThan(50);
    expect(len).toBeLessThan(300);
  });
});

test("패리티 단계는 필요할 때만 수를 쓴다", () => {
  expect(stageLength(1, "oll-parity")).toBeGreaterThan(0);
  expect(stageLength(1, "pll-parity")).toBe(0);
  expect(stageLength(2, "oll-parity")).toBeGreaterThan(0);
  expect(stageLength(2, "pll-parity")).toBeGreaterThan(0);
  expect(stageLength(7, "oll-parity")).toBe(0);
  expect(stageLength(7, "pll-parity")).toBe(0);
  expect(stageLength(8, "oll-parity")).toBe(0);
  expect(stageLength(8, "pll-parity")).toBeGreaterThan(0);
});

test("스티커 문자열로도 풀고, 같은 상태면 같은 해를 낸다", () => {
  const { state, sol } = caseOf(7);
  const facelets = [...faceColors(n, state)]
    .map((c) => FACE_LETTERS[c])
    .join("");
  expect(solveReduction(facelets)).toEqual(sol);
});

test("맞춘 큐브는 수 없이 끝난다", () => {
  const solved = solveReduction(
    FACE_LETTERS.map((f) => f.repeat(n * n)).join(""),
  );
  expect(solved.moves).toBe("");
  expect(solved.stages.every((s) => s.from === 0 && s.to === 0)).toBe(true);
});

test("4×4·5×5 밖의 크기는 받지 않는다", () => {
  for (const size of [2, 3, 6, 7]) {
    expect(() => solveReductionState(size, randomCubeState(size, 1))).toThrow(
      RangeError,
    );
  }
});
