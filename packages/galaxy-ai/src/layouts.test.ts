import { boardOfSky, sideOf } from "@game/galaxy-engine";
import { describe, expect, it } from "vitest";

import { layoutBoard } from "./layouts";

const board = boardOfSky("seasons");

describe("판 배치(bench 견주기)", () => {
  it("별 24개가 모두 한 번씩 놓이고 값은 그대로다", () => {
    for (const kind of ["grouped", "spread", "split"] as const) {
      const b = layoutBoard("seasons", kind);
      const ids = b.squares.flatMap((s) => (s.star ? [s.star.star.id] : []));
      expect(new Set(ids).size).toBe(24);
      expect(b.total).toBe(board.total);
      b.groups.forEach((g, i) => {
        for (const sq of g.squares) expect(b.squares[sq]?.star?.group).toBe(i);
      });
    }
  });

  it("완전히 섞기는 한 변에 같은 별자리가 둘 서지 않는다", () => {
    const b = layoutBoard("seasons", "spread");
    for (const g of b.groups) {
      const sides = g.squares.map((sq) => sideOf(sq));
      expect(new Set(sides).size).toBe(sides.length);
    }
  });

  it("지금 판(g4)은 반쯤 섞기다", () => {
    expect(layoutBoard("seasons", "split").squares).toEqual(board.squares);
  });
});
