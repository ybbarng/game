import {
  PawnEndingSolver,
  pawnEndingMoves,
  toPawnEnding,
} from "@game/chess-ai";
import { legalMoves, parseFen, sanToMove } from "@game/chess-engine";
import { describe, expect, it } from "vitest";

import { CHESS_PUZZLE_SETS } from "./puzzles";
import { explainOutside, outsidePawnOf } from "./study";

/*
 * 바깥 패스 폰 문제가 킹과 폰 끝까지 읽기(@game/chess-ai의 pawn-ending.ts)와 어긋나지 않는지 본다(docs/26 6절).
 * 읽는 판이 많아 문제를 둘로 갈라 outside-a·outside-b 두 파일이 동시에 돈다(파일 하나 2초 안쪽).
 */

/** 증명에 쓰는 걸음(반수). 가장 긴 증명(27)보다 하나 넉넉하게 */
const PLIES = 28;

const set = CHESS_PUZZLE_SETS.find((s) => s.id === "outside-pawn");
const puzzles = set?.puzzles ?? [];

/** 읽는 양이 비슷하게 나눈 앞 묶음(문제 차례 0부터) */
const FIRST_HALF = new Set([0, 2, 4, 5]);

/** 문제 절반을 확인한다. 문제 수와 해설은 앞 묶음(0)에서 본다 */
export function outsidePawnSuite(half: 0 | 1) {
  const rows = puzzles
    .filter((_p, i) => FIRST_HALF.has(i) === (half === 0))
    .map((p) => [p.id, p] as const);
  describe("바깥 패스 폰 문제", () => {
    if (half === 0)
      it("일곱 문제가 있다", () => {
        expect(puzzles).toHaveLength(7);
      });

    it.each(rows)(
      "%s: 정답 수만 이긴다고 증명되고, 다른 수는 모두 이기지 못한다고 증명된다",
      (_id, puzzle) => {
        const pos = parseFen(puzzle.fen);
        const s = toPawnEnding(pos.board, pos.turn, pos.ep);
        if (!s) throw new Error("킹과 폰만 있는 판이 아니다");
        // 문제마다 새 판정기(다른 문제에서 기억한 증명에 기대지 않게)
        const solver = new PawnEndingSolver();
        const answer = sanToMove(pos, puzzle.solution);
        const moves = pawnEndingMoves(s);
        // 판정기의 수와 엔진의 수가 같다(승급 수는 없는 판이다)
        expect(moves.map((m) => [m.from, m.to]).sort()).toEqual(
          legalMoves(pos)
            .map((m) => [m.from, m.to])
            .sort(),
        );
        for (const m of moves) {
          const isAnswer = m.from === answer?.from && m.to === answer.to;
          if (isAnswer) expect(solver.winsAfter(m, PLIES - 1)).toBe(true);
          else expect(solver.holdsAfter(m, PLIES - 1)).toBe(true);
        }
      },
    );

    if (half === 0)
      it.each(puzzles.map((p) => [p.id, p] as const))(
        "%s: a·b줄 폰이 바깥 패스 폰이고, 해설이 정답 수와 그 폰을 짚는다",
        (_id, puzzle) => {
          const pos = parseFen(puzzle.fen);
          const outside = outsidePawnOf(pos.board);
          expect(outside === null ? null : outside % 8).toBeLessThanOrEqual(1);
          const lines = explainOutside(
            pos,
            sanToMove(pos, puzzle.solution) as never,
          );
          expect(lines[0]).toContain(`(${puzzle.solution})`);
          expect(lines[1]).toMatch(/[ab]폰/);
          expect(lines.at(-1)).toBe("다른 수는 모두 비기거나 져요.");
        },
      );
  });
}
