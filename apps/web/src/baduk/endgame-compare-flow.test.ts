// 끝내기 역끝내기냐 큰 후수냐(docs/23 바둑): 화면 판정 흐름대로 풀리는지 본다(판 모양·셈·수순은 endgame-compare.test.ts).
import {
  type BadukState,
  pointName,
  solveEndgame,
  step,
} from "@game/baduk-engine";
import { describe, expect, it } from "vitest";
import { BADUK_PUZZLE_SETS, type BadukPuzzle } from "./puzzles";
import {
  defenseFor,
  endgameArea,
  judgeMove,
  PUZZLE_SIZE,
  puzzleState,
  solutionOf,
  spotMoveOf,
  spotsOf,
} from "./study";

type Endgame = Extract<BadukPuzzle, { kind: "endgame" }>;

const set = (BADUK_PUZZLE_SETS.find((s) => s.id === "endgame-compare")
  ?.puzzles ?? []) as Endgame[];
const rows = set.map((p) => [p.id, p] as const);

function play(state: BadukState, at: number): BadukState {
  const seat = state.toPlay === 1 ? 0 : 1;
  const result = step(state, seat, { type: "place", at });
  if (!result.ok)
    throw new Error(`${pointName(at, PUZZLE_SIZE)}: ${result.error}`);
  return result.state;
}

describe("역끝내기냐 큰 후수냐: 화면 흐름", () => {
  it.each(rows)(
    "%s: 다른 곳부터 두면 틀리고, 정답 → 백 → 흑의 가장 좋은 수로 푼다",
    (_id, p) => {
      const state = puzzleState(p);
      for (const spot of spotsOf(p)) {
        const m = spotMoveOf(state.board, spot);
        if (m !== solutionOf(p))
          expect(judgeMove(p, state, m, 0)).toBe("wrong");
      }
      expect(judgeMove(p, state, solutionOf(p), 0)).toBe("next");
      const after = play(state, solutionOf(p));
      const reply = defenseFor(p, after, 0);
      if (reply.type !== "place") throw new Error("백이 두지 않았다");
      const answered = play(after, reply.at);
      const best = solveEndgame(answered.board, endgameArea(p), 1).best;
      const last = best.find((m) => m !== null) as number;
      expect(judgeMove(p, answered, last, 1)).toBe("solved");
    },
  );
});
