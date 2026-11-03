import { describe, expect, it } from "vitest";

import { pointAt, pointName } from "./board";
import { createOmokScenario } from "./scenario";
import {
  blockFor,
  defenseCandidates,
  fivePoints,
  fourMoves,
  stopsOf,
  winningFirstMoves,
  winsByFours,
} from "./threats";

const V = "standard" as const;
const boardOf = (black: string[], white: string[]) =>
  createOmokScenario({ black, white }).board as (0 | 1 | 2)[];
const names = (ps: number[]) => ps.map(pointName).sort();

describe("다섯·사 자리", () => {
  it("한쪽이 막힌 넷은 다섯 자리가 하나, 열린 넷은 둘이다", () => {
    const closed = boardOf(["H8", "I8", "J8", "K8"], ["G8", "A1", "A3", "A5"]);
    expect(names(fivePoints(closed, 1, V))).toEqual(["L8"]);
    const open = boardOf(["H8", "I8", "J8", "K8"], ["A1", "A3", "A5", "A7"]);
    expect(names(fivePoints(open, 1, V))).toEqual(["G8", "L8"]);
  });

  it("일반 규칙에서 여섯이 되는 자리는 다섯 자리가 아니다", () => {
    const board = boardOf(
      ["G8", "H8", "I8", "K8", "L8"],
      ["A1", "A3", "A5", "A7", "A9"],
    );
    // J8을 채우면 여섯
    expect(fivePoints(board, 1, V)).toEqual([]);
  });

  it("이어진 삼은 양쪽으로 한 칸·두 칸 떨어진 자리에서 사가 된다", () => {
    const board = boardOf(["H8", "I8", "J8"], ["A1", "A3", "A5"]);
    expect(names(fourMoves(board, 1, V))).toEqual(["F8", "G8", "K8", "L8"]);
  });
});

describe("사로 몰아붙이기", () => {
  it("열린 삼은 열린 넷을 만들어 두 수 안에 이긴다(사로만 세면 한 수 안에는 못 이긴다)", () => {
    const board = boardOf(["H8", "I8", "J8"], ["A1", "A3", "A5"]);
    expect(winningFirstMoves(board, 1, V, 1)).toEqual([]);
    expect(names(winningFirstMoves(board, 1, V, 2))).toEqual(["G8", "K8"]);
  });

  it("한쪽이 막힌 삼은 두 수로 못 이긴다", () => {
    const board = boardOf(["H8", "I8", "J8"], ["G8", "A3", "A5"]);
    expect(winningFirstMoves(board, 1, V, 2)).toEqual([]);
    expect(winsByFours(board, 1, V, 2)).toBe(false);
  });

  it("사삼: 막힌 삼으로 사를 두며 열린 삼을 함께 만들면 세 수 안에 이긴다", () => {
    // 가로 H8·I8·J8(G8 막힘)과 세로 K9·K10. K8은 가로 사 + 세로 삼
    const board = boardOf(
      ["H8", "I8", "J8", "K9", "K10"],
      ["G8", "A1", "A3", "A5", "A7"],
    );
    expect(winningFirstMoves(board, 1, V, 3)).toContain(pointAt("K8"));
  });

  it("막는 수는 다섯 자리를 막는다. 다섯 자리가 없으면 null", () => {
    const board = boardOf(["H8", "I8", "J8", "K8"], ["G8", "A1", "A3", "A5"]);
    expect(blockFor(board, 1, V)).toBe(pointAt("L8"));
    expect(blockFor(boardOf(["H8"], []), 1, V)).toBeNull();
  });

  it("막는 쪽이 먼저 다섯을 만들 수 있으면 몰아붙이기가 끊긴다", () => {
    const board = boardOf(["H8", "I8", "J8", "A1"], ["B2", "B3", "B4", "B5"]);
    // 흑이 열린 넷을 만들어도 백이 B6·B1로 먼저 다섯
    expect(winsByFours(board, 1, V, 2)).toBe(false);
  });

  it("끊을 자리 후보는 상대 돌 줄 위 빈칸과 내가 사를 만드는 자리다", () => {
    const board = boardOf(["A1", "C1", "E1"], ["H8", "I8", "J8"]);
    const candidates = defenseCandidates(board, 2, V);
    expect(candidates).toContain(pointAt("G8"));
    expect(candidates).not.toContain(pointAt("O15"));
  });

  it("열린 삼의 몰아붙이기를 끊는 자리: 바로 양 끝, 그리고 흑이 사를 만들어 백이 먼저 막게 하는 자리", () => {
    const board = boardOf(["A1", "C1", "E1"], ["H8", "I8", "J8"]);
    // B1·D1은 흑 A1~E1 사가 되어 백이 그 자리를 먼저 막느라 두 수 안에 못 이긴다.
    expect(names(stopsOf(board, 2, V, 2) ?? [])).toEqual([
      "B1",
      "D1",
      "G8",
      "K8",
    ]);
    // 이길 길이 없으면 null
    expect(stopsOf(boardOf(["H8"], ["A1"]), 2, V, 2)).toBeNull();
  });

  it("길잡이를 줘도 결과는 같다", () => {
    const board = boardOf(["A1", "C1", "E1"], ["H8", "I8", "J8"]);
    const used = new Set<number>();
    expect(winsByFours(board, 2, V, 2, { used })).toBe(true);
    expect(used.size).toBeGreaterThan(0);
    board[pointAt("G8")] = 1;
    expect(winsByFours(board, 2, V, 2, { prefer: used })).toBe(
      winsByFours(board, 2, V, 2),
    );
  });
});
