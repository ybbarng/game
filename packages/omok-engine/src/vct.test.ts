import { describe, expect, it } from "vitest";

import { pointAt, pointName } from "./board";
import { createOmokScenario } from "./scenario";
import {
  makesThreeThreat,
  threatReplies,
  threatWinFirstMoves,
  threatWinLength,
  winsByThreats,
} from "./vct";

const boardOf = (black: string[], white: string[]) =>
  createOmokScenario({ black, white }).board as (0 | 1 | 2)[];
const names = (ps: number[]) => ps.map(pointName).sort();

// 흑 H8·I8(가로 둘)과 J9·J10(세로 둘). J8은 가로·세로 열린 셋이 한 번에 생기는 자리(3·3)
const CROSS = boardOf(["H8", "I8", "J9", "J10"], ["A1", "O1", "A15", "O15"]);

describe("열린 셋 몰아붙이기 읽기", () => {
  it("금지가 없으면 3·3 자리에서 세 수 만에 이긴다", () => {
    expect(threatWinLength(CROSS, 1, "free", 5)).toBe(3);
    expect(names(threatWinFirstMoves(CROSS, 1, "free", 3))).toContain("J8");
  });

  it("백이 넷을 만들 수 있으면 그 넷으로 버티는 수까지 읽어 더 오래 걸린다", () => {
    // 같은 흑 모양에 백 A1·A3·A5(A2·A4에 두면 넷): 백이 넷 둘로 버티고 흑이 막느라 두 수가 늘어난다
    const board = boardOf(["H8", "I8", "J9", "J10"], ["A1", "A3", "A5", "O15"]);
    expect(threatWinLength(board, 1, "free", 5)).toBe(5);
    const after = [...board];
    after[pointAt("J8")] = 1;
    expect(names(threatReplies(after, 1, "free"))).toEqual(["A2", "A4"]);
  });

  it("렌주에서 흑은 3·3 자리에 둘 수 없어 그 길로는 이기지 못한다", () => {
    expect(threatWinFirstMoves(CROSS, 1, "renju", 3)).toEqual([]);
    expect(winsByThreats(CROSS, 1, "renju", 3)).toBe(false);
  });

  it("넷만으로 되는 길은 넷 읽기와 같은 수에 찾는다", () => {
    // 가로 넷 자리 하나 + 세로 열린 셋 = 4·3(K8이 가로 넷, 세로 K9·K10과 열린 셋)
    const board = boardOf(
      ["H8", "I8", "J8", "K9", "K10"],
      ["G8", "A1", "O1", "A15", "O15"],
    );
    expect(threatWinLength(board, 1, "renju", 5)).toBe(3);
    expect(threatWinFirstMoves(board, 1, "renju", 3)).toContain(pointAt("K8"));
  });

  it("양쪽이 두 칸씩 빈 열린 셋은 바로 옆 두 끝만 막는 수다(한 칸 바깥을 막으면 반대쪽으로 열린 넷)", () => {
    const board = boardOf(["H8", "I8", "J8"], ["A1", "O1", "O15"]);
    expect(names(threatReplies(board, 1, "renju"))).toEqual(["G8", "K8"]);
  });

  it("둘에 하나를 이으면 셋 위협이고, 넷을 만드는 수는 셋 위협이 아니다", () => {
    const two = boardOf(["H8", "I8"], ["A1", "O15"]);
    expect(makesThreeThreat(two, pointAt("J8"), 1, "renju")).toBe(true);
    const three = boardOf(["H8", "I8", "J8"], ["A1", "O1", "O15"]);
    expect(makesThreeThreat(three, pointAt("K8"), 1, "renju")).toBe(false);
  });

  it("셋 하나로는 백이 막으면 끝이라 이기지 못한다", () => {
    const board = boardOf(["H8", "I8"], ["A1", "O15"]);
    expect(threatWinLength(board, 1, "renju", 5)).toBeNull();
  });
});
