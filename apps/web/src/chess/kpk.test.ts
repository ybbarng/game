// @vitest-environment node
import { parseFen, sanToMove, squareAt } from "@game/chess-engine";
import { describe, expect, it } from "vitest";

import { kpkWinningMoves, kpkWins } from "./kpk";
import { CHESS_PUZZLE_SETS } from "./puzzles";
import { explainEndgame } from "./study";

const sq = squareAt;
const W = 0 as const;
const B = 1 as const;

describe("킹+폰 대 킹 승패표(잘 알려진 판)", () => {
  it("백 킹이 폰 앞 6번째 줄에 서면 누가 두든 이긴다(Ke6·e5 대 Ke8)", () => {
    expect(kpkWins(W, sq("e6"), sq("e8"), sq("e5"))).toBe(true);
    expect(kpkWins(B, sq("e6"), sq("e8"), sq("e5"))).toBe(true);
  });

  it("맞서기(옵포지션): Ke5·e4 대 Ke7은 흑 차례면 이기고 백 차례면 비긴다", () => {
    expect(kpkWins(B, sq("e5"), sq("e7"), sq("e4"))).toBe(true);
    expect(kpkWins(W, sq("e5"), sq("e7"), sq("e4"))).toBe(false);
  });

  it("스테일메이트: Ke6·e7 대 Ke8 흑 차례는 비긴다", () => {
    expect(kpkWins(B, sq("e6"), sq("e8"), sq("e7"))).toBe(false);
  });

  it("가장자리 폰은 흑 킹이 구석에 있으면 비긴다(Kh6·h5 대 Kh8)", () => {
    expect(kpkWins(W, sq("h6"), sq("h8"), sq("h5"))).toBe(false);
    expect(kpkWins(B, sq("h6"), sq("h8"), sq("h5"))).toBe(false);
  });

  it("흑 킹이 폰을 따라잡지 못하면 폰만 밀어도 이긴다(사각형 밖)", () => {
    // 폰 a4, 흑 킹 h4: 흑 차례라도 폰의 사각형(a4~e8)에 들어가지 못한다
    expect(kpkWins(B, sq("e1"), sq("h4"), sq("a4"))).toBe(true);
    expect(kpkWinningMoves(sq("e1"), sq("h5"), sq("a4"))).toContainEqual({
      from: sq("a4"),
      to: sq("a5"),
    });
  });
});

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
