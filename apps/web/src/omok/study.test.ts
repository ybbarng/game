import {
  fivePoints,
  pointAt,
  pointName,
  winningFirstMoves,
} from "@game/omok-engine";
import { describe, expect, it } from "vitest";

import { OMOK_PUZZLE_SETS, type OmokPuzzle } from "./puzzles";
import {
  defenseFor,
  explainSolved,
  judgeMove,
  mainLine,
  PUZZLE_RULES,
  puzzleState,
} from "./study";

type Attack = Extract<OmokPuzzle, { kind: "attack" }>;

const V = PUZZLE_RULES.variant;
const all = OMOK_PUZZLE_SETS.flatMap((s) => s.puzzles);
const attacks = all.filter((p): p is Attack => p.kind === "attack");
const rows = <T extends { id: string }>(ps: T[]) =>
  ps.map((p) => [p.id, p] as const);
const names = (ps: number[]) => ps.map(pointName);

describe("오목 문제 데이터", () => {
  it("문제 번호는 겹치지 않고, 묶음마다 다섯 개 이상이다", () => {
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
    for (const set of OMOK_PUZZLE_SETS)
      expect(set.puzzles.length).toBeGreaterThanOrEqual(5);
  });

  it.each(rows(all))(
    "%s: 흑이 둘 차례이고, 백은 바로 다섯을 만들 수 없다",
    (_id, p) => {
      const state = puzzleState(p);
      expect(state.blackSeat).toBe(0);
      expect(state.moves.length % 2).toBe(0);
      expect(fivePoints(state.board, 2, V)).toEqual([]);
    },
  );
});

describe("공격 문제(사로 몰아 이기기)", () => {
  it.each(rows(attacks))(
    "%s: 정해진 수 안에 이기는 첫 수는 정답 하나뿐이고, 더 빨리는 못 이긴다",
    (_id, p) => {
      const { board } = puzzleState(p);
      expect(names(winningFirstMoves(board, 1, V, p.moves))).toEqual([
        p.solution,
      ]);
      if (p.moves > 1)
        expect(winningFirstMoves(board, 1, V, p.moves - 1)).toEqual([]);
    },
  );

  it.each(rows(attacks))(
    "%s: 바른 수순을 따라 두면 다섯으로 끝나고, 해설이 수마다 있다",
    (_id, p) => {
      const line = mainLine(p);
      expect(line).toHaveLength(2 * p.moves - 1);
      const board = [...puzzleState(p).board];
      line.forEach((move, i) => {
        if (i % 2 === 0) {
          const verdict = judgeMove(p, board, move, i / 2);
          expect(verdict).toBe(i === line.length - 1 ? "solved" : "next");
          board[move] = 1;
        } else {
          expect(defenseFor(board)).toBe(move);
          board[move] = 2;
        }
      });
      expect(explainSolved(p)).toHaveLength(p.moves);
    },
  );

  it("정답이 아닌 첫 수는 틀렸다고 한다", () => {
    for (const p of attacks) {
      const { board } = puzzleState(p);
      const wrong = board.findIndex(
        (c, at) => c === 0 && at !== pointAt(p.solution),
      );
      expect(judgeMove(p, board, wrong, 0)).toBe("wrong");
    }
  });
});
