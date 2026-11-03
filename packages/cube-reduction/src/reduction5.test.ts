import {
  applyMoves,
  faceColors,
  isSolved,
  parseMoves,
  randomCubeState,
} from "@game/cube-engine";
import { describe, expect, test } from "vitest";
import { wingParity } from "./geometry";
import { solveReductionState } from "./solve";
import { after, checkStages } from "./test-util";

const n = 5;

// 씨앗 1은 마지막 두 모서리에서 모서리 패리티를, 2는 더 긴 준비 수를 쓴다
const SEEDS = [1, 2, 8];
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

describe.each(SEEDS)("5×5 무작위 상태 %i", (seed) => {
  const { state, sol } = caseOf(seed);

  test("풀린다", () => {
    expect(isSolved(n, applyMoves(n, state, parseMoves(n, sol.moves)))).toBe(
      true,
    );
  });

  test("단계가 끝날 때마다 그 단계의 조각이 맞아 있다", () => {
    // 5×5는 OLL·PLL 패리티가 없다(짝 지은 모서리와 꼭짓점이 늘 보통 3×3이다)
    expect(sol.stages.map((s) => s.id)).toEqual([
      "centers-ud",
      "centers-rest",
      "edges",
      "last-edges",
      "three",
    ]);
    checkStages(n, state, sol);
  });

  test("수 길이가 사람 축소법 정도다", () => {
    const len = parseMoves(n, sol.moves).length;
    expect(len).toBeGreaterThan(80);
    expect(len).toBeLessThan(400);
  });
});

test("날개 순열이 홀이면 마지막 두 모서리에서 모서리 패리티로 고친다", () => {
  const { state, sol } = caseOf(1);
  const end = (id: string) => sol.stages.find((s) => s.id === id)?.to as number;
  const parityAt = (count: number) =>
    wingParity(n, faceColors(n, after(n, state, sol, count)));
  expect(parityAt(end("edges"))).toBe(1);
  expect(parityAt(end("last-edges"))).toBe(0);
});
