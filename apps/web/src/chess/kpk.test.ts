// @vitest-environment node
// 킹과 폰 문제가 승패표(@game/chess-ai의 kpk.ts)와 어긋나지 않는지 본다
import { kpkWinningMoves, kpkWins } from "@game/chess-ai";
import { parseFen, sanToMove } from "@game/chess-engine";
import { describe, expect, it } from "vitest";

import { CHESS_PUZZLE_SETS } from "./puzzles";
import { explainEndgame } from "./study";

const W = 0 as const;
const B = 1 as const;

describe("킹과 폰 문제", () => {
  const set = CHESS_PUZZLE_SETS.find((s) => s.id === "king-pawn");
  const puzzles = set?.puzzles ?? [];

  it("여덟 문제가 있다", () => {
    expect(puzzles).toHaveLength(8);
  });

  it.each(puzzles.map((p) => [p.id, p] as const))(
    "%s: 백이 이기는 판이고, 이기는 수는 정답 하나뿐이며, 폰부터 밀면 비긴다",
    (_id, puzzle) => {
      const pos = parseFen(puzzle.fen);
      const wk = pos.board.indexOf("wK");
      const bk = pos.board.indexOf("bK");
      const p = pos.board.indexOf("wP");
      expect(pos.board.filter((c) => c !== "")).toHaveLength(3);
      expect(kpkWins(W, wk, bk, p)).toBe(true);
      const answer = sanToMove(pos, puzzle.solution);
      expect(kpkWinningMoves(wk, bk, p)).toEqual([
        { from: answer?.from, to: answer?.to },
      ]);
      expect(kpkWins(B, wk, bk, p - 8)).toBe(false);
      // 해설이 정답 수와 폰 밀기를 짚는다
      const lines = explainEndgame(pos, answer as never);
      expect(lines[0]).toContain(puzzle.solution);
      expect(lines.at(-1)).toContain("비긴다");
    },
  );
});

describe("킹과 폰 해설", () => {
  const set = CHESS_PUZZLE_SETS.find((s) => s.id === "king-pawn");
  const explain = (id: string) => {
    const puzzle = set?.puzzles.find((p) => p.id === id);
    if (!puzzle) throw new Error(id);
    const pos = parseFen(puzzle.fen);
    return explainEndgame(pos, sanToMove(pos, puzzle.solution) as never)[1];
  };

  it("맞서기·폰 앞 칸 차지·옆으로 돌아 나가기를 가려 말한다", () => {
    expect(explain("king-pawn-1")).toContain("맞서기");
    expect(explain("king-pawn-6")).toContain("앞 칸을 먼저 차지");
    expect(explain("king-pawn-7")).toContain("돌아 나간다");
    expect(explain("king-pawn-8")).toContain("돌아 나간다");
  });
});
