// 끝내기 역끝내기·양선수(docs/23 바둑): 세 곳 안에서 끝까지 읽어, 정답이 하나뿐이고 선수·후수가 그 이름대로인지 엔진으로 본다.
import {
  areaOwners,
  type BadukState,
  type Board,
  groupOf,
  pointName,
  type Stone,
  solveEndgame,
  step,
  tryPlace,
} from "@game/baduk-engine";
import { describe, expect, it } from "vitest";
import { shapeKey } from "./puzzle-shape";
import { BADUK_PUZZLE_SETS, type BadukPuzzle } from "./puzzles";
import {
  defenseFor,
  endgameArea,
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
const reverse = setOf("endgame-reverse");
const double = setOf("endgame-double");
const rows = (ps: Endgame[]) => ps.map((p) => [p.id, p] as const);
const name = (at: number) => pointName(at, PUZZLE_SIZE);

function play(state: BadukState, at: number): BadukState {
  const seat = state.toPlay === 1 ? 0 : 1;
  const result = step(state, seat, { type: "place", at });
  if (!result.ok) throw new Error(`${name(at)}: ${result.error}`);
  return result.state;
}

/** `mover`가 `at`에 두면 새로 단수가 되는 상대 무리의 활로(받는 자리)들. 처음부터 단수였던 무리는 뺀다 */
function newAtariLiberties(board: Board, at: number, mover: Stone): number[] {
  const placed = tryPlace(board, at, mover);
  if (!placed.ok) return [];
  const enemy = mover === 1 ? 2 : 1;
  const out = new Set<number>();
  for (let q = 0; q < placed.board.length; q++) {
    if (placed.board[q] !== enemy) continue;
    const g = groupOf(placed.board, q);
    if (g.liberties.length === 1 && groupOf(board, q).liberties.length > 1)
      out.add(g.liberties[0] as number);
  }
  return [...out];
}

/** 한 곳에서 흑·백이 먼저 둘 가장 좋은 자리 */
const blackMove = (board: Board, spot: number[]) => spotMoveOf(board, spot);
function whiteMove(board: Board, spot: number[]): number {
  const m = solveEndgame(board, spot, 2).best.find((x) => x !== null);
  if (m === undefined || m === null) throw new Error("백이 둘 수가 없다");
  return m;
}

/** 정답 곳의 번호 */
const keyIndex = (p: Endgame) =>
  spotsOf(p).findIndex((s) => s.includes(solutionOf(p)));

describe.each([
  ["역끝내기", reverse],
  ["양선수", double],
] as const)("%s: 판 모양", (_title, set) => {
  it("묶음에 문제가 다섯 개 이상이다", () => {
    expect(set.length).toBeGreaterThanOrEqual(5);
  });

  it("정답 자리 둘레 모양이 서로 다른 것이 넷 이상이다(판 대칭으로 돌린 같은 모양은 하나로 센다)", () => {
    const keys = set.map((p) =>
      shapeKey(puzzleState(p).board, PUZZLE_SIZE, solutionOf(p)),
    );
    expect(new Set(keys).size).toBeGreaterThanOrEqual(4);
  });

  it.each(rows(set))(
    "%s: 누구 것도 아닌 빈 점은 세 곳에만 있고, 흑 땅·백 땅이 따로 있으며, 처음 판에 단수인 돌이 없다",
    (_id, p) => {
      const { board } = puzzleState(p);
      const owners = areaOwners(board);
      const neutral = board
        .map((c, i) => (c === 0 && owners[i] === 0 ? i : -1))
        .filter((i) => i >= 0);
      expect(spotsOf(p)).toHaveLength(3);
      expect(neutral).toEqual(
        spotsOf(p)
          .flat()
          .sort((a, b) => a - b),
      );
      expect(owners.filter((o) => o === 1).length).toBeGreaterThan(9);
      expect(owners.filter((o) => o === 2).length).toBeGreaterThan(9);
      const inAtari = board.flatMap((c, q) =>
        c && groupOf(board, q).liberties.length === 1 ? [name(q)] : [],
      );
      expect(inAtari).toEqual([]);
    },
  );

  it.each(rows(set))(
    "%s: 세 곳 안에서 끝까지 읽으면 흑의 가장 좋은 첫 수는 정답 하나뿐이고, 그림의 A·B·C 가운데 하나다",
    (_id, p) => {
      const state = puzzleState(p);
      const best = solveEndgame(state.board, endgameArea(p), 1).best;
      expect(best.map((m) => (m === null ? "쉬기" : name(m)))).toEqual([
        p.solution,
      ]);
      const marks = spotsOf(p).map((s) => blackMove(state.board, s));
      expect(marks).toContain(solutionOf(p));
    },
  );

  it.each(rows(set))(
    "%s: 정답이 아닌 두 곳은 누가 먼저 두어도 상대 돌이 새로 단수가 되지 않는 후수이고, 정답 곳보다 작지 않다",
    (_id, p) => {
      const { board } = puzzleState(p);
      const sizes = spotSizesOf(p);
      const key = keyIndex(p);
      spotsOf(p).forEach((spot, i) => {
        if (i === key) return;
        expect(newAtariLiberties(board, blackMove(board, spot), 1)).toEqual([]);
        expect(newAtariLiberties(board, whiteMove(board, spot), 2)).toEqual([]);
        expect(sizes[i]).toBeGreaterThanOrEqual(sizes[key] as number);
      });
    },
  );

  it.each(rows(set))(
    "%s: 정답 곳에 백이 두면 흑 돌이 새로 단수가 되고, 흑이 받지 않고 다른 곳에 두면 백이 그 돌을 따낸다(백의 선수)",
    (_id, p) => {
      const state = puzzleState(p);
      const key = spotsOf(p)[keyIndex(p)] as number[];
      const w = whiteMove(state.board, key);
      const libs = newAtariLiberties(state.board, w, 2);
      expect(libs.length).toBeGreaterThan(0);
      // 흑이 먼저 다른 곳에 두고 백이 정답 곳에 두었을 때, 흑의 가장 좋은 응수는 받는 자리다
      const other = spotsOf(p).find((_s, i) => i !== keyIndex(p)) as number[];
      const afterGote = play(state, blackMove(state.board, other));
      const whiteReply = solveEndgame(afterGote.board, endgameArea(p), 2).best;
      expect(whiteReply.some((m) => m !== null && key.includes(m))).toBe(true);
      const afterSente = play(afterGote, w);
      const answers = solveEndgame(afterSente.board, endgameArea(p), 1).best;
      expect(answers.length).toBeGreaterThan(0);
      for (const a of answers) expect(libs).toContain(a);
    },
  );
});

describe("역끝내기", () => {
  it.each(rows(reverse))(
    "%s: 흑이 정답 곳에 두면 백 돌이 새로 단수가 되지 않는다(흑에게는 후수)",
    (_id, p) => {
      const { board } = puzzleState(p);
      expect(newAtariLiberties(board, solutionOf(p), 1)).toEqual([]);
    },
  );

  it.each(rows(reverse))(
    "%s: 화면 흐름: 정답 → 백이 다른 곳 → 남은 곳으로 풀고, 다른 곳부터 두면 틀린 것이다",
    (_id, p) => {
      const state = puzzleState(p);
      for (const [i, spot] of spotsOf(p).entries())
        if (i !== keyIndex(p))
          expect(judgeMove(p, state, blackMove(state.board, spot), 0)).toBe(
            "wrong",
          );
      expect(judgeMove(p, state, solutionOf(p), 0)).toBe("next");
      const after = play(state, solutionOf(p));
      const reply = defenseFor(p, after, 0);
      if (reply.type !== "place") throw new Error("백이 두지 않았다");
      expect(spotsOf(p)[keyIndex(p)]).not.toContain(reply.at);
      const answered = play(after, reply.at);
      const last = solveEndgame(answered.board, endgameArea(p), 1).best.find(
        (m) => m !== null,
      ) as number;
      expect(judgeMove(p, answered, last, 1)).toBe("solved");
    },
  );
});

describe("양선수", () => {
  it.each(rows(double))(
    "%s: 흑이 정답 곳에 두면 백 돌이 새로 단수가 되고, 백은 그 돌을 이어 받는다(흑에게도 선수)",
    (_id, p) => {
      const state = puzzleState(p);
      const libs = newAtariLiberties(state.board, solutionOf(p), 1);
      expect(libs.length).toBeGreaterThan(0);
      const after = play(state, solutionOf(p));
      const answers = solveEndgame(after.board, endgameArea(p), 2).best;
      expect(answers.length).toBeGreaterThan(0);
      for (const a of answers) expect(libs).toContain(a);
    },
  );

  it.each(rows(double))(
    "%s: 화면 흐름: 양선수 → 백 받기 → 남은 곳으로 풀고, 다른 곳부터 두면 틀린 것이다",
    (_id, p) => {
      const state = puzzleState(p);
      for (const [i, spot] of spotsOf(p).entries())
        if (i !== keyIndex(p))
          expect(judgeMove(p, state, blackMove(state.board, spot), 0)).toBe(
            "wrong",
          );
      expect(judgeMove(p, state, solutionOf(p), 0)).toBe("next");
      const after = play(state, solutionOf(p));
      const reply = defenseFor(p, after, 0);
      if (reply.type !== "place") throw new Error("백이 받지 않았다");
      expect(newAtariLiberties(state.board, solutionOf(p), 1)).toContain(
        reply.at,
      );
      const answered = play(after, reply.at);
      const last = solveEndgame(answered.board, endgameArea(p), 1).best.find(
        (m) => m !== null,
      ) as number;
      expect(judgeMove(p, answered, last, 1)).toBe("solved");
    },
  );
});
