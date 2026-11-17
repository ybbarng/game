// 축이 막히면 장문(docs/23 바둑): 두 쪽 축이 정말 축머리에 막히고, 축머리를 치우면 그쪽 축이 되는지 엔진으로 본다.
// 장문 하나로만 잡히는지(정답이 하나뿐, 더 빨리는 못 잡음)는 study.test.ts가 다른 잡기 문제와 함께 본다.
import { type Cell, groupOf, ladderMoves, pointAt } from "@game/baduk-engine";
import { describe, expect, it } from "vitest";

import { shapeKey } from "./puzzle-shape";
import { BADUK_PUZZLE_SETS, type BadukPuzzle } from "./puzzles";
import { PUZZLE_SIZE, puzzleState, targetOf } from "./study";

type Capture = Extract<BadukPuzzle, { kind: "capture" }>;

const nets = (BADUK_PUZZLE_SETS.find((s) => s.id === "blocked-net")?.puzzles ??
  []) as Capture[];
const rows = nets.map((p) => [p.id, p] as const);

/** 이 판에서 단수가 축이 되는 활로들 */
function ladderSides(board: readonly Cell[], target: number): number[] {
  return groupOf(board, target).liberties.filter(
    (l) => ladderMoves(board, 1, target, l) !== null,
  );
}

describe("축이 막히면 장문", () => {
  it("묶음에 문제가 다섯 개 이상이다", () => {
    expect(nets.length).toBeGreaterThanOrEqual(5);
  });

  it("백 돌 둘레 모양이 서로 다른 것이 넷 이상이다(판 대칭으로 돌린 같은 모양은 하나로 센다)", () => {
    const keys = nets.map((p) =>
      shapeKey(puzzleState(p).board, PUZZLE_SIZE, targetOf(p)),
    );
    expect(new Set(keys).size).toBeGreaterThanOrEqual(4);
  });

  it.each(rows)(
    "%s: 백 한 점은 활로가 둘이고, 두 쪽 단수 모두 축이 안 된다",
    (_id, p) => {
      const { board } = puzzleState(p);
      const target = targetOf(p);
      expect(groupOf(board, target).stones).toHaveLength(1);
      expect(groupOf(board, target).liberties).toHaveLength(2);
      expect(ladderSides(board, target)).toEqual([]);
    },
  );

  it.each(rows)(
    "%s: 축머리는 백 돌 둘이고, 하나씩 치우면 서로 다른 쪽 단수가 축이 된다",
    (_id, p) => {
      const { board } = puzzleState(p);
      const target = targetOf(p);
      const breakers = (p.breakers ?? []).map((n) => pointAt(n, PUZZLE_SIZE));
      expect(breakers).toHaveLength(2);
      const opened = breakers.map((b) => {
        expect(board[b]).toBe(2);
        const without = [...board];
        without[b] = 0;
        return ladderSides(without, target);
      });
      expect(opened[0]).toHaveLength(1);
      expect(opened[1]).toHaveLength(1);
      expect(opened[0]?.[0]).not.toBe(opened[1]?.[0]);
    },
  );
});
