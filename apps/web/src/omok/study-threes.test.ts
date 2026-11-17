// 셋 위협 문제(「3·3 함정 피하기」)를 본다. 읽기가 무거워 study.test.ts와 나눠 동시에 돈다.
import {
  fivePoints,
  makesThreeThreat,
  pointAt,
  pointName,
  threatReplies,
  threatWinFirstMoves,
  winningFirstMoves,
} from "@game/omok-engine";
import { describe, expect, it } from "vitest";

import { OMOK_PUZZLE_SETS, type OmokPuzzle } from "./puzzles";
import {
  explainSolved,
  judgeMove,
  mainLine,
  puzzleState,
  replyFor,
  trapsOf,
  variantOf,
} from "./study";

type Attack = Extract<OmokPuzzle, { kind: "attack" }>;

const threeAttacks = OMOK_PUZZLE_SETS.flatMap((s) => s.puzzles).filter(
  (p): p is Attack => p.kind === "attack" && p.threes === true,
);
const rows = (ps: Attack[]) => ps.map((p) => [p.id, p] as const);
const names = (ps: number[]) => ps.map(pointName);

describe("셋 위협 문제(3·3 함정 피하기)", () => {
  it("묶음에 여섯 문제가 있다", () => {
    expect(threeAttacks).toHaveLength(6);
  });

  it.each(rows(threeAttacks))(
    "%s: 셋 위협까지 쓰면 정해진 수 안에 이기는 첫 수는 정답 하나뿐이고, 더 빨리는 못 이긴다",
    (_id, p) => {
      const { board } = puzzleState(p);
      const v = variantOf(p);
      expect(names(threatWinFirstMoves(board, 1, v, p.moves))).toEqual([
        p.solution,
      ]);
      expect(threatWinFirstMoves(board, 1, v, p.moves - 1)).toEqual([]);
    },
  );

  it.each(rows(threeAttacks))(
    "%s: 넷만으로는 이기지 못하고, 정답은 넷이 아닌 셋 위협이다",
    (_id, p) => {
      const { board } = puzzleState(p);
      const v = variantOf(p);
      expect(winningFirstMoves(board, 1, v, p.moves + 2)).toEqual([]);
      expect(makesThreeThreat(board, pointAt(p.solution), 1, v)).toBe(true);
    },
  );

  it.each(rows(threeAttacks))(
    "%s: 금지가 없다면 이겼을 흑 3·3 자리(함정)가 있고, 그 자리는 정답이 아니다",
    (_id, p) => {
      const traps = trapsOf(p);
      expect(traps.length).toBeGreaterThan(0);
      expect(traps.every((t) => t.reason === "3·3")).toBe(true);
      expect(names(traps.map((t) => t.at))).not.toContain(p.solution);
    },
  );

  it.each(rows(threeAttacks))(
    "%s: 정답 뒤 백의 모든 응수에도 흑은 남은 수 안에 이기고, 백이 받는 수는 넷이 아닌 막는 수다",
    (_id, p) => {
      const v = variantOf(p);
      const board = [...puzzleState(p).board];
      board[pointAt(p.solution)] = 1;
      const replies = threatReplies(board, 1, v);
      expect(replies.length).toBeGreaterThan(0);
      for (const r of replies) {
        const after = [...board];
        after[r] = 2;
        expect(threatWinFirstMoves(after, 1, v, p.moves - 1)).not.toEqual([]);
      }
      const reply = replyFor(p, board) as number;
      expect(replies).toContain(reply);
      const after = [...board];
      after[reply] = 2;
      expect(fivePoints(after, 2, v)).toEqual([]);
    },
  );

  it.each(rows(threeAttacks))(
    "%s: 바른 수순을 따라 두면 다섯으로 끝나고, 해설이 흑 수마다와 함정마다 있다",
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
          expect(replyFor(p, board)).toBe(move);
          board[move] = 2;
        }
      });
      expect(explainSolved(p)).toHaveLength(p.moves + trapsOf(p).length);
    },
  );

  it.each(rows(threeAttacks))(
    "%s: 정답과 백의 응수 뒤 위협이 아닌 수(판 구석)는 틀렸다고 한다",
    (_id, p) => {
      const board = [...puzzleState(p).board];
      board[pointAt(p.solution)] = 1;
      board[replyFor(p, board) as number] = 2;
      const corner = [pointAt("A1"), pointAt("O1"), pointAt("A15")].find(
        (at) => board[at] === 0,
      ) as number;
      expect(judgeMove(p, board, corner, 1)).toBe("wrong");
    },
  );
});
