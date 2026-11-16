import {
  applyMove,
  type ChessState,
  forcesMateAfter,
  legalMoves,
  type Move,
  mateInOneMoves,
  mateInThreeMoves,
  mateInTwoMoves,
  moveToSan,
  step,
} from "@game/chess-engine";
import { describe, expect, it } from "vitest";

import { CHESS_PUZZLE_SETS, type ChessPuzzle } from "./puzzles";
import { defenseFor, judgeMove, puzzleState, solutionMove } from "./study";

/*
 * 세 수 메이트 문제 확인(docs/23). 읽는 수가 많아 study.test.ts와 나누고, 문제를 둘로 갈라
 * mate3-a·mate3-b 두 파일이 동시에 돈다(파일 하나 2초 안쪽).
 */

const three = CHESS_PUZZLE_SETS.flatMap((s) => s.puzzles).filter(
  (p) => p.kind === "mate" && p.mateIn === 3,
);

/** 흑이 받은 수를 두고 다음 판을 낸다 */
function blackReplies(state: ChessState): ChessState {
  const reply = defenseFor(state);
  const next = step(state, 1, reply);
  if (!next.ok) throw new Error(next.error);
  return next.state;
}

/** 문제 가운데 차례가 짝수(0)나 홀수(1)인 절반을 확인한다 */
export function mateInThreeSuite(half: 0 | 1) {
  const rows = three
    .filter((_p, i) => i % 2 === half)
    .map((p) => [p.id, p] as const);
  describe("세 수 메이트 문제", () => {
    it.each(rows)(
      "%s: 한 수·두 수 메이트는 없고, 흑의 모든 응수에 세 수 안 메이트가 되는 첫 수는 정답 하나뿐이다",
      (_id, p) => {
        const { position } = puzzleState(p);
        expect(mateInOneMoves(position)).toEqual([]);
        expect(mateInTwoMoves(position)).toEqual([]);
        const found = mateInThreeMoves(position).map((m) =>
          moveToSan(position, m),
        );
        expect(found).toEqual([p.solution]);
      },
    );

    it.each(rows)(
      "%s: 고수가 받아도 화면 판정대로 두면 셋째 수에 메이트가 된다",
      (_id, p) => {
        let state = puzzleState(p);
        expect(judgeMove(p, state, solutionMove(p), 0)).toBe("next");
        const first = step(state, 0, { type: "move", ...solutionMove(p) });
        if (!first.ok) throw new Error(first.error);
        state = blackReplies(first.state);
        // 가운데 수: 바로 메이트가 되면 그것으로 끝, 아니면 판정이 「다음」이라고 하는 첫 수
        const quick = mateInOneMoves(state.position)[0];
        if (quick) {
          expect(judgeMove(p, state, quick, 1)).toBe("solved");
          return;
        }
        const middle = legalMoves(state.position).find(
          (m) => judgeMove(p, state, m, 1) === "next",
        ) as Move;
        expect(middle).toBeDefined();
        const second = step(state, 0, { type: "move", ...middle });
        if (!second.ok) throw new Error(second.error);
        state = blackReplies(second.state);
        const mate = mateInOneMoves(state.position)[0] as Move;
        expect(mate).toBeDefined();
        expect(judgeMove(p, state, mate, 2)).toBe("solved");
      },
    );

    it.each(rows)(
      "%s: 가운데 수가 메이트로 이어지지 않으면 틀린 수다",
      (_id, p) => {
        const first = step(puzzleState(p), 0, {
          type: "move",
          ...solutionMove(p),
        });
        if (!first.ok) throw new Error(first.error);
        const state = blackReplies(first.state);
        const wrong = legalMoves(state.position).find(
          (m) => !forcesMateAfter(applyMove(state.position, m), 1),
        ) as Move;
        expect(wrong).toBeDefined();
        expect(judgeMove(p, state, wrong, 1)).toBe("wrong");
      },
    );
  });
  if (half === 1) return;
  it("세 수 메이트는 열 개 넘고, 장면이 서로 다르다", () => {
    expect(three.length).toBeGreaterThanOrEqual(10);
    const fens = three.map((p: ChessPuzzle) => p.fen.split(" ")[0]);
    expect(new Set(fens).size).toBe(fens.length);
  });
}
