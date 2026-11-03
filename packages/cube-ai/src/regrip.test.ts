import {
  applyMoves,
  isSolved,
  parseMoves,
  randomCubeState,
} from "@game/cube-engine";
import {
  type ReductionSolution,
  ReductionStuckError,
  solveReductionState,
} from "@game/cube-reduction";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";
import { REGRIPS, reduceWithRegrip } from "./big";

/**
 * 축소법이 막혔을 때 돌려 쥐고 다시 푸는 길. 지금 아는 상태로는 축소법이 막히지 않아서
 * 앞의 몇 번을 일부러 막는 해법을 넣어 본다.
 */

const n = 4;
const start = randomCubeState(n, 3);

/** 처음 `stuck`번은 막히고 그 뒤로는 진짜 축소법으로 푼다. 받은 상태를 적어 둔다 */
function stuckFor(stuck: number) {
  const seen: PuzzleState[] = [];
  const solve = (size: number, state: PuzzleState): ReductionSolution => {
    seen.push(state);
    if (seen.length <= stuck) {
      throw new ReductionStuckError("edges", "no-progress", "시험");
    }
    return solveReductionState(size, state);
  };
  return { solve, seen };
}

describe("reduceWithRegrip", () => {
  it("막히지 않으면 쥔 그대로 한 번만 푼다", () => {
    const { solve, seen } = stuckFor(0);
    const red = reduceWithRegrip(n, start, solve);
    expect(seen).toHaveLength(1);
    expect(red).toEqual(solveReductionState(n, start));
  });

  it("막히면 돌려 쥔 수를 첫 단계 앞에 붙여 다시 풀고, 원래 상태에서 맞춰진다", () => {
    const { solve, seen } = stuckFor(1);
    const red = reduceWithRegrip(n, start, solve);
    expect(seen).toHaveLength(2);
    const list = red.moves.split(" ");
    expect(list[0]).toBe(REGRIPS[1]);
    // 단계가 0부터 빈틈없이 이어지고, 돌려 쥔 수는 첫 단계에 들어간다
    expect(red.stages[0]?.from).toBe(0);
    for (let i = 1; i < red.stages.length; i++) {
      expect(red.stages[i]?.from).toBe(red.stages[i - 1]?.to);
    }
    expect(red.stages.at(-1)?.to).toBe(list.length);
    const end = applyMoves(n, start, parseMoves(n, red.moves));
    expect(isSolved(n, end)).toBe(true);
  });

  it("같은 상태면 늘 같은 차례로 돌려 쥔다", () => {
    const a = stuckFor(2);
    const b = stuckFor(2);
    expect(reduceWithRegrip(n, start, a.solve).moves).toBe(
      reduceWithRegrip(n, start, b.solve).moves,
    );
    expect(a.seen).toEqual(b.seen);
  });

  it("모두 막히면 이름 있는 오류를 그대로 던진다", () => {
    const { solve, seen } = stuckFor(Number.POSITIVE_INFINITY);
    let error: unknown;
    try {
      reduceWithRegrip(n, start, solve);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ReductionStuckError);
    expect((error as ReductionStuckError).stage).toBe("edges");
    expect(seen).toHaveLength(REGRIPS.length);
  });

  it("막힘이 아닌 오류는 다시 해 보지 않고 바로 던진다", () => {
    let calls = 0;
    const solve = (): ReductionSolution => {
      calls++;
      throw new RangeError("다른 오류");
    };
    expect(() => reduceWithRegrip(n, start, solve)).toThrow(RangeError);
    expect(calls).toBe(1);
  });
});
