import {
  applyMove,
  type Board,
  createChessScenario,
  parseFen,
  playSan,
  START_FEN,
  sanToMove,
  viewOf,
} from "@game/chess-engine";
import { createRng } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";

import { bookMoves, bookTable, OPENING_BOOK } from "./book";
import { chessBotFor, chessMasterBot, createChessMasterBot } from "./bots";
import { evaluateMaster, probeMaster } from "./master";
import { see } from "./see";

/** 흑백을 바꾸고 위아래로 뒤집은 판(같은 판을 흑 쪽에서 본 것) */
function mirror(board: Board): Board {
  const out = new Array<string>(64).fill("");
  for (let at = 0; at < 64; at++) {
    const cell = board[at];
    if (!cell) continue;
    const to = (7 - (at >> 3)) * 8 + (at % 8);
    out[to] = (cell[0] === "w" ? "b" : "w") + cell[1];
  }
  return out as Board;
}

function moveOf(fen: string, san: string) {
  const move = sanToMove(parseFen(fen), san);
  if (!move) throw new Error(san);
  return move;
}

describe("정적 교환 계산(SEE)", () => {
  it("지켜진 폰을 퀸으로 잡으면 손해, 지키지 않은 폰은 이득", () => {
    const guarded = "4k3/8/4p3/3p4/8/8/3Q4/4K3 w - - 0 1";
    expect(see(parseFen(guarded).board, moveOf(guarded, "Qxd5"))).toBe(-800);
    const free = "4k3/8/8/3p4/8/8/3Q4/4K3 w - - 0 1";
    expect(see(parseFen(free).board, moveOf(free, "Qxd5"))).toBe(100);
  });

  it("뒤에 줄지어 선 룩(엑스레이)까지 센다", () => {
    // d5 폰을 흑 룩 하나가 지키고, 백 룩 둘이 d줄에 겹쳐 노린다:
    // Rxd5 Rxd5 Rxd5로 폰 하나를 얻는다(뒤 룩을 못 보면 -400으로 잘못 센다)
    const fen = "3r2k1/8/8/3p4/8/8/3R4/3RK3 w - - 0 1";
    expect(see(parseFen(fen).board, moveOf(fen, "Rxd5"))).toBe(100);
    // 흑 룩도 둘이면 룩을 잃는다
    const two = "3r2k1/3r4/8/3p4/8/8/3R4/3RK3 w - - 0 1";
    expect(see(parseFen(two).board, moveOf(two, "Rxd5"))).toBe(-400);
  });
});

describe("초고수 평가", () => {
  it("처음 판은 0이고, 흑백을 바꾼 판은 같은 값이다", () => {
    expect(evaluateMaster(parseFen(START_FEN).board, "w")).toBe(0);
    for (const fen of [
      "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
      "8/5k2/8/3P4/8/8/2K5/8 w - - 0 1",
      "6k1/1R6/8/8/3N4/8/5PPP/6K1 w - - 0 1",
    ]) {
      const board = parseFen(fen).board;
      expect(evaluateMaster(board, "w")).toBe(
        evaluateMaster(mirror(board), "b"),
      );
    }
  });

  it("킹+폰 대 킹: 이기는 판은 덤을 받고, 비기는 판은 탐색이 0점으로 본다", () => {
    const win = parseFen("4k3/8/4K3/4P3/8/8/8/8 w - - 0 1"); // Ke6·e5 대 Ke8
    expect(probeMaster(win)).toBeNull();
    expect(evaluateMaster(win.board, "w")).toBeGreaterThan(400);
    const draw = parseFen("7k/8/7K/7P/8/8/8/8 w - - 0 1"); // 가장자리 폰
    expect(probeMaster(draw)).toBe(0);
    // 흑 폰도 뒤집어 본다
    expect(probeMaster(parseFen("8/8/8/8/7p/7k/8/7K b - - 0 1"))).toBe(0);
    // 기물이 더 있으면 모른다
    expect(probeMaster(parseFen(START_FEN))).toBeNull();
  });
});

describe("오프닝 책", () => {
  it("모든 수순을 처음부터 규칙대로 둘 수 있고 출처가 있다", () => {
    expect(bookTable().size).toBeGreaterThan(20);
    for (const line of OPENING_BOOK)
      expect(line.source).toMatch(/^https:\/\/en\.wikipedia\.org\/wiki\//);
  });

  it("처음 판에서는 e4·d4 가운데 하나를 시드로 고르고, 같은 시드면 같은 수", () => {
    expect(bookMoves(parseFen(START_FEN))).toHaveLength(2);
    const state = createChessScenario({ fen: START_FEN });
    const picks = new Set<string>();
    for (let seed = 1; seed <= 8; seed++) {
      const a = chessMasterBot.decide(viewOf(state, 0), createRng(seed));
      const b = chessMasterBot.decide(viewOf(state, 0), createRng(seed));
      expect(a).toEqual(b);
      if (a.type === "move") picks.add(`${a.from}-${a.to}`);
    }
    expect(picks.size).toBe(2);
  });

  it("책에 없는 판(1. e4 a5)에서는 책의 수가 없다", () => {
    expect(bookMoves(playSan(parseFen(START_FEN), ["e4", "a5"]))).toHaveLength(
      0,
    );
    // 갈래: 1. e4 e5 2. Nf3 Nc6 다음에는 Bc4·Bb5·d4가 모두 책에 있다
    expect(
      bookMoves(playSan(parseFen(START_FEN), ["e4", "e5", "Nf3", "Nc6"])),
    ).toHaveLength(3);
  });
});

describe("초고수 컴퓨터", () => {
  /** 판 수 상한을 줄인 초고수(규칙·끝내기 표처럼 상한과 상관없는 성질을 빨리 본다) */
  const quickMaster = createChessMasterBot(8_000);

  it("단계 3이 초고수다", () => {
    expect(chessBotFor(3)).toBe(chessMasterBot);
    expect(chessBotFor(9)).toBe(chessMasterBot);
  });

  it("킹+폰 대 킹에서 이기는 유일한 수를 둔다(맞서기)", () => {
    // 백 Ke5·e4 대 흑 Ke8: 폰부터 밀거나 킹을 잘못 옮기면 비긴다. 이기는 판으로 가는 수를 둔다
    const fen = "4k3/8/8/4K3/4P3/8/8/8 w - - 0 1";
    const state = createChessScenario({ fen });
    const action = quickMaster.decide(viewOf(state, 0), createRng(1));
    expect(action.type).toBe("move");
    if (action.type !== "move") return;
    const next = applyMove(state.position, action);
    expect(probeMaster(next)).toBeNull(); // 비기는 판으로 가지 않았다
  });

  it("공짜 퀸을 잡고 한 수 메이트를 둔다", () => {
    for (const [fen, san] of [
      ["4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1", "Rxd5"],
      ["6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", "Ra8#"],
    ] as const) {
      const state = createChessScenario({ fen });
      const action = quickMaster.decide(viewOf(state, 0), createRng(5));
      expect(action).toEqual({ type: "move", ...moveOf(fen, san) });
    }
  });
});
