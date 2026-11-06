// @vitest-environment node
import { type Cell, pointAt } from "@game/janggi-engine";
import { describe, expect, it } from "vitest";

import { openingPieces } from "./opening-lessons";
import {
  moveText,
  parseMove,
  replayBoards,
  sideAt,
  tallyOf,
  tallyText,
} from "./replay";

const start = (() => {
  const board = new Array<Cell>(90).fill("");
  for (const [name, piece] of Object.entries(openingPieces("NENE", "NENE")))
    board[pointAt(name)] = piece;
  return board;
})();

describe("넘겨 보기 계산", () => {
  it("둔 편: 번갈아 또는 초 혼자", () => {
    expect([0, 1, 2].map((i) => sideAt(i))).toEqual(["c", "h", "c"]);
    expect([0, 1, 2].map((i) => sideAt(i, "cho"))).toEqual(["c", "c", "c"]);
  });

  it("수를 말로: 잡은 수는 잡음·잃음을 붙이고, 한 졸은 병", () => {
    const moves = ["79-78", "41-42", "09-49", "19-49"];
    const boards = replayBoards(start, moves);
    expect(boards).toHaveLength(5);
    expect(moveText(boards[1] ?? start, parseMove("41-42"))).toBe(
      "한 병 41→42",
    );
    expect(moveText(boards[2] ?? start, parseMove("09-49"))).toBe(
      "초 차 09→49 · 한 병 잡음",
    );
    expect(moveText(boards[3] ?? start, parseMove("19-49"))).toBe(
      "한 차 19→49 · 초 차 잃음",
    );
  });

  it("주고받은 점수: 잡기 전에는 없고, 잡은 차례대로 셈한다", () => {
    const moves = ["79-78", "41-42", "09-49", "19-49"];
    const boards = replayBoards(start, moves);
    expect(tallyText(tallyOf(boards, moves, 2))).toBeNull();
    expect(tallyText(tallyOf(boards, moves, 3))).toBe(
      "잡은 기물: 초 병(2) · 한 없음 → 초 2점 이득",
    );
    expect(tallyText(tallyOf(boards, moves, 4))).toBe(
      "잡은 기물: 초 병(2) · 한 차(13) → 초 11점 손해",
    );
  });
});
