// 장기 끝내기 기초 「차 둘로 외통」: 방법(rook-ladder.ts)대로만 두면 범위 안 모든 판에서 외통이 되는지 본다(docs/23).
import {
  applyMove,
  type Board,
  type Cell,
  inCheck,
  indexOf,
  isCheckmate,
  kingsFacing,
  legalMoves,
  type Move,
  pointAt,
  pointName,
  step,
} from "@game/janggi-engine";
import { describe, expect, it } from "vitest";

import { JANGGI_PUZZLE_SETS } from "./puzzles";
import { inLadderRange, ladderMoves } from "./rook-ladder";
import { defenseFor, judgeMove, parseMove, puzzleState } from "./study";

/** 방법대로 두면 외통까지 걸리는 초의 수 상한(시험이 범위 안 판 모두에서 확인한다) */
const LIMIT = 3;

const ROOK_COLUMNS = [0, 1, 2, 6, 7, 8];
const HAN_PALACE = [3, 4, 5].flatMap((x) =>
  [0, 1, 2].map((y) => indexOf(x, y)),
);

/** 범위 안 시작 판 전부: 차 둘(궁성 밖 서로 다른 세로줄, 어느 가로줄이든), 한 궁은 궁성 어디든, 한이 장군을 받지 않은 판 */
function rangeBoards(): Board[] {
  const out: Board[] = [];
  for (let a = 0; a < ROOK_COLUMNS.length; a++)
    for (let b = a + 1; b < ROOK_COLUMNS.length; b++)
      for (let ya = 0; ya < 10; ya++)
        for (let yb = 0; yb < 10; yb++)
          for (const king of HAN_PALACE) {
            const board = new Array<Cell>(90).fill("");
            board[pointAt("95")] = "cK";
            board[pointAt("85")] = "cA";
            board[king] = "hK";
            board[indexOf(ROOK_COLUMNS[a] as number, ya)] = "cR";
            board[indexOf(ROOK_COLUMNS[b] as number, yb)] = "cR";
            if (!inCheck(board, "h")) out.push(board);
          }
  return out;
}

/** 한의 받는 수: 둘 수 있는 수와(장군이 아니면) 쉬기 */
function replies(board: Board): Board[] {
  const next: Board[] = legalMoves(board, "h").map((m) => applyMove(board, m));
  if (!inCheck(board, "h")) next.push(board);
  return next;
}

/**
 * 초가 둘 차례인 이 판에서, 방법이 고르는 어느 수를 두고 한이 어떻게 받아도 `left`수 안에 외통이 되나.
 * 실패하면 까닭을 돌려준다. 같은 판은 한 번만 센다
 */
function closes(
  board: Board,
  left: number,
  memo: Map<string, number>,
): string | null {
  const key = board.join(",");
  if ((memo.get(key) ?? -1) >= left) return null;
  if (left === 0) return `수를 다 씀: ${show(board)}`;
  const { moves } = ladderMoves(board);
  if (moves.length === 0) return `방법이 수를 못 고름: ${show(board)}`;
  for (const move of moves) {
    if (!legalMoves(board, "c").some((m) => same(m, move)))
      return `둘 수 없는 수 ${name(move)}: ${show(board)}`;
    const after = applyMove(board, move);
    if (kingsFacing(after)) return `빅장: ${show(after)}`;
    if (isCheckmate(after, "h")) continue;
    for (const reply of replies(after)) {
      if (reply.filter((c) => c === "cR").length !== 2)
        return `차를 잃음: ${show(reply)}`;
      if (kingsFacing(reply)) return `빅장: ${show(reply)}`;
      const why = closes(reply, left - 1, memo);
      if (why) return why;
    }
  }
  memo.set(key, left);
  return null;
}

const same = (a: Move, b: Move) => a.from === b.from && a.to === b.to;
const name = (m: Move) => `${pointName(m.from)}-${pointName(m.to)}`;
const show = (board: Board) =>
  board
    .flatMap((c, at) => (c === "" ? [] : [`${pointName(at)}${c}`]))
    .join(" ");

describe("차 둘로 외통: 방법", () => {
  it("범위 안 모든 판에서, 방법이 고르는 어느 수든 한이 어떻게 받아도 3수 안에 외통이 된다", () => {
    const boards = rangeBoards();
    // 세로줄 짝 15 × 가로줄 100 × 궁 자리 9 = 13,500판에서 한이 장군을 받는 2,565판을 뺀다.
    expect(boards.length).toBe(10_935);
    const memo = new Map<string, number>();
    const failures = boards
      .map((b) => closes(b, LIMIT, memo))
      .filter((why) => why !== null);
    expect(failures).toEqual([]);
  });

  it("2수로는 닫히지 않는 판이 있다(상한 3이 꼭 맞다)", () => {
    const memo = new Map<string, number>();
    expect(rangeBoards().some((b) => closes(b, LIMIT - 1, memo) !== null)).toBe(
      true,
    );
  });

  it("방법의 수는 늘 궁성 밖 차를 세로로만 옮긴다", () => {
    for (const board of rangeBoards().slice(0, 2000)) {
      for (const m of ladderMoves(board).moves) {
        expect(board[m.from]).toBe("cR");
        expect(m.from % 9).toBe(m.to % 9);
      }
    }
  });

  it("「막기」 없이 장군만 부르면 외통이 안 되는 판이 있다(단계 2가 꼭 필요하다)", () => {
    // 한 궁 15, 차 둘이 아래쪽에 있으면 장군만으로는 궁이 2번 가로줄로 내려온다.
    const board = puzzleState({
      id: "probe",
      kind: "rooks",
      pieces: { "15": "hK", "61": "cR", "79": "cR", "95": "cK", "85": "cA" },
      solution: "61-21",
    }).board;
    expect(ladderMoves(board).step).toBe(2);
    expect(isCheckmate(applyMove(board, parseMove("61-11")), "h")).toBe(false);
  });
});

const rookPuzzles = JANGGI_PUZZLE_SETS.flatMap((s) => s.puzzles).filter(
  (p) => p.kind === "rooks",
);

describe("차 둘로 외통: 연습", () => {
  it.each(rookPuzzles.map((p) => [p.id, p] as const))(
    "%s: 범위 안 판이고, 정답 수는 방법이 고르는 수이며, 방법대로 두면 고수가 받아도 외통으로 이긴다",
    (_id, p) => {
      let state = puzzleState(p);
      expect(inLadderRange(state.board)).toBe(true);
      expect(inCheck(state.board, "h")).toBe(false);
      expect(ladderMoves(state.board).moves.map(name)).toContain(p.solution);
      for (let i = 0; i < LIMIT; i++) {
        const move =
          i === 0
            ? parseMove(p.solution)
            : (ladderMoves(state.board).moves[0] as Move);
        const verdict = judgeMove(p, state, move, i);
        const mine = step(state, 0, { type: "move", ...move });
        if (!mine.ok) throw new Error(mine.error);
        state = mine.state;
        if (state.phase !== "play") {
          expect(verdict).toBe("solved");
          break;
        }
        expect(verdict).toBe("next");
        const theirs = step(state, 1, defenseFor(state));
        if (!theirs.ok) throw new Error(theirs.error);
        state = theirs.state;
      }
      expect(state.result).toEqual({ kind: "checkmate", seat: 0 });
    },
  );

  it("방법이 고르지 않는 수는 틀린 것이다", () => {
    const p = rookPuzzles[0];
    if (!p) throw new Error("문제 없음");
    const state = puzzleState(p);
    const allowed = ladderMoves(state.board).moves.map(name);
    const other = legalMoves(state.board, "c").find(
      (m) => !allowed.includes(name(m)),
    );
    if (!other) throw new Error("다른 수 없음");
    expect(judgeMove(p, state, other, 0)).toBe("wrong");
  });
});
