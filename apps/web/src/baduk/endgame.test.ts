// 끝내기 문제(큰 끝내기부터·선수 끝내기부터, docs/23 바둑): 두 곳 안에서 끝까지 읽어 정답·크기·선수가 맞는지 엔진으로 본다.
import {
  areaOwners,
  type BadukState,
  type Board,
  groupOf,
  pointName,
  solveEndgame,
  step,
  tryPlace,
} from "@game/baduk-engine";
import { describe, expect, it } from "vitest";

import { BADUK_PUZZLE_SETS, type BadukPuzzle } from "./puzzles";
import {
  defenseFor,
  endgameArea,
  explainSolved,
  judgeMove,
  PUZZLE_SIZE,
  puzzleState,
  solutionOf,
  spotMoveOf,
  spotSizesOf,
  spotsOf,
} from "./study";

type Endgame = Extract<BadukPuzzle, { kind: "endgame" }>;

const setOf = (id: string) =>
  (BADUK_PUZZLE_SETS.find((s) => s.id === id)?.puzzles ?? []) as Endgame[];
const bigger = setOf("endgame-bigger");
const sente = setOf("endgame-sente");
const rows = (ps: Endgame[]) => ps.map((p) => [p.id, p] as const);
const name = (at: number) => pointName(at, PUZZLE_SIZE);

function play(state: BadukState, at: number): BadukState {
  const seat = state.toPlay === 1 ? 0 : 1;
  const result = step(state, seat, { type: "place", at });
  if (!result.ok) throw new Error(`${name(at)}: ${result.error}`);
  return result.state;
}

/** 백 무리 가운데 단수인 돌 수 */
function whiteInAtari(board: Board): number {
  let n = 0;
  for (let p = 0; p < board.length; p++)
    if (board[p] === 2 && groupOf(board, p).liberties.length === 1) n++;
  return n;
}

/** 이 자리가 들어 있는 곳의 번호(0·1) */
const spotIndex = (p: Endgame, at: number) =>
  spotsOf(p)[0].includes(at) ? 0 : 1;

describe.each([
  ["큰 끝내기부터", bigger],
  ["선수 끝내기부터", sente],
] as const)("%s: 판 모양", (_title, set) => {
  it("묶음에 문제가 다섯 개 이상이다", () => {
    expect(set.length).toBeGreaterThanOrEqual(5);
  });

  it.each(rows(set))(
    "%s: 누구 것도 아닌 빈 점은 두 곳에만 있고, 흑 땅·백 땅이 따로 있으며, 단수인 돌은 그 활로가 두 곳 안에 있다",
    (_id, p) => {
      const { board } = puzzleState(p);
      const owners = areaOwners(board);
      const neutral = board
        .map((c, i) => (c === 0 && owners[i] === 0 ? i : -1))
        .filter((i) => i >= 0)
        .sort((a, b) => a - b);
      const [a, b] = spotsOf(p);
      expect(a.length).toBeGreaterThan(0);
      expect(b.length).toBeGreaterThan(0);
      expect(neutral).toEqual([...a, ...b].sort((x, y) => x - y));
      expect(owners.filter((o) => o === 1).length).toBeGreaterThan(9);
      expect(owners.filter((o) => o === 2).length).toBeGreaterThan(9);
      for (let q = 0; q < board.length; q++) {
        if (!board[q]) continue;
        const libs = groupOf(board, q).liberties;
        expect(libs.length).toBeGreaterThan(0);
        if (libs.length === 1) expect([...a, ...b]).toContain(libs[0]);
      }
    },
  );

  it.each(rows(set))(
    "%s: 두 곳 안에서 끝까지 읽으면 흑의 가장 좋은 첫 수는 정답 하나뿐이고, 그림의 A·B 가운데 하나다",
    (_id, p) => {
      const state = puzzleState(p);
      const best = solveEndgame(state.board, endgameArea(p, state), 1).best;
      expect(best.map((m) => (m === null ? "쉬기" : name(m)))).toEqual([
        p.solution,
      ]);
      const marks = spotsOf(p).map((s) => spotMoveOf(state.board, s));
      expect(marks).toContain(solutionOf(p));
    },
  );
});

describe("큰 끝내기부터", () => {
  it.each(rows(bigger))(
    "%s: 정답 곳이 더 크고, 두어도 백 돌이 새로 단수가 되지 않으며(후수), 작은 곳부터 두면 백이 큰 곳에 둔다",
    (_id, p) => {
      const state = puzzleState(p);
      const sizes = spotSizesOf(p);
      const mine = spotIndex(p, solutionOf(p));
      expect(sizes[mine]).toBeGreaterThan(sizes[1 - mine] as number);
      const after = play(state, solutionOf(p));
      expect(whiteInAtari(after.board)).toBeLessThanOrEqual(
        whiteInAtari(state.board),
      );
      const small = play(
        state,
        spotMoveOf(state.board, spotsOf(p)[1 - mine] as number[]),
      );
      const replies = solveEndgame(small.board, endgameArea(p, small), 2).best;
      expect(
        replies.some(
          (r) => r !== null && (spotsOf(p)[mine] as number[]).includes(r),
        ),
      ).toBe(true);
    },
  );

  it.each(rows(bigger))(
    "%s: 화면 흐름: 정답은 바로 푼 것이고, 작은 곳의 수는 틀린 것이다",
    (_id, p) => {
      const state = puzzleState(p);
      const mine = spotIndex(p, solutionOf(p));
      const small = spotMoveOf(state.board, spotsOf(p)[1 - mine] as number[]);
      expect(judgeMove(p, state, solutionOf(p), 0)).toBe("solved");
      expect(judgeMove(p, state, small, 0)).toBe("wrong");
      const lines = explainSolved(p, state.board, solutionOf(p), 1);
      expect(lines[0]).toBe(
        `A는 ${spotSizesOf(p)[0]}점짜리, B는 ${spotSizesOf(p)[1]}점짜리 후수 끝내기예요.`,
      );
    },
  );
});

describe("선수 끝내기부터", () => {
  it.each(rows(sente))(
    "%s: 선수 곳은 다른 곳보다 크지 않고, 두면 백 돌이 새로 단수가 되며, 백은 그 돌을 이어 받는다",
    (_id, p) => {
      const state = puzzleState(p);
      const sizes = spotSizesOf(p);
      const mine = spotIndex(p, solutionOf(p));
      expect(sizes[mine]).toBeLessThanOrEqual(sizes[1 - mine] as number);
      const after = play(state, solutionOf(p));
      expect(whiteInAtari(after.board)).toBeGreaterThan(
        whiteInAtari(state.board),
      );
      // 백은 새로 단수가 된 무리의 활로에 이어 받는다(다른 곳에 두지 않는다)
      const libs = new Set<number>();
      for (let q = 0; q < after.board.length; q++)
        if (
          after.board[q] === 2 &&
          groupOf(after.board, q).liberties.length === 1 &&
          groupOf(state.board, q).liberties.length > 1
        )
          libs.add(groupOf(after.board, q).liberties[0] as number);
      const answers = solveEndgame(after.board, endgameArea(p, after), 2).best;
      expect(answers.length).toBeGreaterThan(0);
      for (const a of answers) expect(libs.has(a as number)).toBe(true);
    },
  );

  it.each(rows(sente))(
    "%s: 백이 받지 않고 남은 곳에 두면 흑이 단수인 백 돌을 따낸다",
    (_id, p) => {
      const state = puzzleState(p);
      const mine = spotIndex(p, solutionOf(p));
      const after = play(state, solutionOf(p));
      const elsewhere = play(
        after,
        spotMoveOf(after.board, spotsOf(p)[1 - mine] as number[]),
      );
      const lib = (() => {
        for (let q = 0; q < elsewhere.board.length; q++)
          if (elsewhere.board[q] === 2) {
            const g = groupOf(elsewhere.board, q);
            if (g.liberties.length === 1) return g.liberties[0] as number;
          }
        return null;
      })();
      expect(lib).not.toBeNull();
      const taken = tryPlace(elsewhere.board, lib as number, 1);
      expect(taken.ok && taken.captured.length).toBeGreaterThan(0);
    },
  );

  it.each(rows(sente))(
    "%s: 후수 곳부터 두면 백이 선수 곳에 먼저 둔다",
    (_id, p) => {
      const state = puzzleState(p);
      const mine = spotIndex(p, solutionOf(p));
      const gote = spotMoveOf(state.board, spotsOf(p)[1 - mine] as number[]);
      const after = play(state, gote);
      const replies = solveEndgame(after.board, endgameArea(p, after), 2).best;
      expect(
        replies.some(
          (r) => r !== null && (spotsOf(p)[mine] as number[]).includes(r),
        ),
      ).toBe(true);
    },
  );

  it.each(rows(sente))(
    "%s: 화면 흐름: 선수 → 백 받기 → 남은 곳으로 풀고, 후수 곳부터 두면 틀린 것이다",
    (_id, p) => {
      const state = puzzleState(p);
      const mine = spotIndex(p, solutionOf(p));
      const gote = spotMoveOf(state.board, spotsOf(p)[1 - mine] as number[]);
      expect(judgeMove(p, state, gote, 0)).toBe("wrong");
      expect(judgeMove(p, state, solutionOf(p), 0)).toBe("next");
      const after = play(state, solutionOf(p));
      const reply = defenseFor(p, after, 0);
      if (reply.type !== "place") throw new Error("백이 받지 않았다");
      const answered = play(after, reply.at);
      expect(judgeMove(p, answered, gote, 1)).toBe("solved");
      const lines = explainSolved(p, answered.board, gote, 2);
      expect(lines).toHaveLength(3);
      // 새로 단수가 된 백 돌 수를 낱말로 센다(0이면 「백  점」이 된다)
      expect(lines[0]).toMatch(/백 (한|두|세|네) 점이 단수가 돼요\./);
    },
  );
});
