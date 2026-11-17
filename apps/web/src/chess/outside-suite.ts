import {
  pawnEndingMoves,
  pawnPuzzleCandidate,
  promotionDigest,
  toPawnEnding,
} from "@game/chess-ai";
import { OUTSIDE_PAWN_PROOFS } from "@game/chess-ai/outside-pawn-proofs";
import { legalMoves, parseFen, sanToMove } from "@game/chess-engine";
import { describe, expect, it } from "vitest";

import { CHESS_PUZZLE_SETS } from "./puzzles";
import { explainOutside, outsidePawnOf } from "./study";

/*
 * 바깥 패스 폰 문제가 「정답 수만 이기고, 다른 수는 모두 이기지 못한다」는 증명과 어긋나지 않는지 본다(docs/26 6절).
 * 증명은 두 단계다(@game/chess-ai `queen-ending.ts`). 킹과 폰 판을 끝까지 읽는 후보 증명(폰이 퀸이 된 판만 어림)을
 * 여기서 다시 세우고, 그 증명의 승급 판 묶음이 bench(`outside-pawn.strength.ts`)가 퀸이 된 뒤까지 끝까지 읽어
 * 모두 확인한 기록(`outside-pawn-proofs.json`)과 같은지 본다. 같으면 어림 없이 끝까지 읽은 증명이다.
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
      it("일곱 문제가 있고, 문제마다 확인한 증명 기록이 하나씩 있다", () => {
        expect(puzzles).toHaveLength(7);
        expect(puzzles.map((p) => `${p.fen} ${p.solution}`).sort()).toEqual(
          OUTSIDE_PAWN_PROOFS.map((r) => `${r.fen} ${r.answer}`).sort(),
        );
      });

    it.each(rows)(
      "%s: 정답 수만 이기고 다른 수는 모두 이기지 못한다는 증명이 끝까지 확인한 기록과 같다",
      (_id, puzzle) => {
        const pos = parseFen(puzzle.fen);
        const s = toPawnEnding(pos.board, pos.turn, pos.ep);
        if (!s) throw new Error("킹과 폰만 있는 판이 아니다");
        const answer = sanToMove(pos, puzzle.solution);
        if (!answer) throw new Error("정답 수를 둘 수 없다");
        // 판정기의 수와 엔진의 수가 같다(승급 수는 없는 판이다)
        expect(
          pawnEndingMoves(s)
            .map((m) => [m.from, m.to])
            .sort(),
        ).toEqual(
          legalMoves(pos)
            .map((m) => [m.from, m.to])
            .sort(),
        );
        const record = OUTSIDE_PAWN_PROOFS.find(
          (r) => r.fen === puzzle.fen && r.answer === puzzle.solution,
        );
        if (!record) throw new Error("확인한 증명 기록이 없다");
        const cand = pawnPuzzleCandidate(
          s,
          answer,
          PLIES - 1,
          new Set(record.refuted),
        );
        expect(cand.unproved).toBeNull();
        expect({
          leaves: cand.leaves.length,
          digest: promotionDigest(cand.leaves.map((l) => l.key)),
        }).toEqual({ leaves: record.leaves, digest: record.digest });
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
          expect(lines.slice(-2)).toEqual([
            "흑이 어떻게 받아도 백이 체크메이트까지 갈 수 있어요.",
            "다른 수는 모두 비기거나 져요.",
          ]);
        },
      );
  });
}
