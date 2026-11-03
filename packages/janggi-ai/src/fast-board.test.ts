import {
  applyMove,
  baseBoard,
  CELLS,
  type Cell,
  legalMoves,
  type Move,
  other,
  placeSetup,
  pseudoTargets,
  SETUPS,
  type Side,
} from "@game/janggi-engine";
import { createRng, nextInt } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";

import {
  attacked,
  cellOf,
  codeOf,
  generate,
  moveFrom,
  moveTo,
  sideIndex,
  toFast,
} from "./fast-board";

/** 무작위로 둔 판들(상차림도 무작위) */
function randomBoards(games: number, plies: number): Cell[][] {
  const rng = createRng(11);
  const out: Cell[][] = [];
  for (let g = 0; g < games; g++) {
    let board = baseBoard();
    for (const side of ["c", "h"] as const)
      placeSetup(
        board,
        side,
        SETUPS[nextInt(rng, SETUPS.length)]?.value ?? "NENE",
      );
    let side: Side = "c";
    for (let i = 0; i < plies; i++) {
      const moves = legalMoves(board, side);
      if (moves.length === 0) break;
      // 잡는 수를 자주 골라 기물이 적은 판도 나오게 한다.
      const captures = moves.filter((m) => board[m.to] !== "");
      const pool = captures.length && nextInt(rng, 2) ? captures : moves;
      board = applyMove(board, pool[nextInt(rng, pool.length)] as Move);
      out.push(board);
      side = other(side);
    }
  }
  return out;
}

const BOARDS = randomBoards(3, 70);

describe("빠른 판", () => {
  it("기물 부호를 오간다", () => {
    for (const cell of ["", "cK", "hR", "cC", "hP", "cE"] as Cell[])
      expect(cellOf(codeOf(cell))).toBe(cell);
  });

  it("수 만들기가 엔진의 pseudoTargets와 같다", () => {
    const buf = new Int32Array(256);
    for (const board of BOARDS) {
      const fast = toFast(board);
      for (const side of ["c", "h"] as const) {
        const expected: string[] = [];
        for (let from = 0; from < CELLS; from++)
          if (board[from]?.[0] === side)
            for (const to of pseudoTargets(board, from))
              expected.push(`${from}-${to}`);
        const n = generate(fast, sideIndex(side), buf, 0, false);
        const got = [...buf.subarray(0, n)].map(
          (m) => `${moveFrom(m)}-${moveTo(m)}`,
        );
        expect(got.sort()).toEqual(expected.sort());
        const caps = generate(fast, sideIndex(side), buf, 0, true);
        expect(caps).toBe(
          expected.filter((m) => board[Number(m.split("-")[1])] !== "").length,
        );
      }
    }
  });

  it("공격 판정이 엔진과 같다", () => {
    for (const board of BOARDS) {
      const fast = toFast(board);
      for (const by of ["c", "h"] as const) {
        const hits = new Set<number>();
        for (let from = 0; from < CELLS; from++)
          if (board[from]?.[0] === by)
            for (const to of pseudoTargets(board, from)) hits.add(to);
        for (let sq = 0; sq < CELLS; sq++) {
          if (board[sq]?.[0] === by) continue;
          // 빈칸에서는 포가 "갈 수 있는 곳"과 "잡을 수 있는 곳"이 같다.
          expect(attacked(fast, sq, sideIndex(by)), `${sq} ${by}`).toBe(
            hits.has(sq),
          );
        }
      }
    }
  });
});
