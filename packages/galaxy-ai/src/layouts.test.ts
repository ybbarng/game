import { boardOfSky, sideOf } from "@game/galaxy-engine";
import { describe, expect, it } from "vitest";

import { layoutBoard } from "./layouts";

const board = boardOfSky("seasons");

describe("판 배치 섞기(bench용)", () => {
  it("별 24개가 모두 한 번씩 놓이고 값은 그대로다", () => {
    for (const kind of ["spread", "split"] as const) {
      const b = layoutBoard(board, kind);
      const ids = b.squares.flatMap((s) => (s.star ? [s.star.star.id] : []));
      expect(new Set(ids).size).toBe(24);
      expect(b.squares.reduce((t, s) => t + (s.star?.value ?? 0), 0)).toBe(
        board.total,
      );
      b.groups.forEach((g, i) => {
        for (const sq of g.squares) expect(b.squares[sq]?.star?.group).toBe(i);
      });
    }
  });

  it("완전히 섞기는 한 변에 같은 별자리가 둘 서지 않는다", () => {
    const b = layoutBoard(board, "spread");
    for (const g of b.groups) {
      const sides = g.squares.map((sq) => sideOf(sq));
      expect(new Set(sides).size).toBe(sides.length);
    }
  });

  it("반쯤 섞기는 둘이 제 변에 붙어 있고 하나가 맞은편 변에 있다", () => {
    const b = layoutBoard(board, "split");
    b.groups.forEach((g, i) => {
      const home = Math.floor(i / 2);
      const sides = g.squares.map((sq) => sideOf(sq));
      expect(sides.filter((s) => s === home)).toHaveLength(2);
      expect(sides.filter((s) => s === (home + 2) % 4)).toHaveLength(1);
    });
  });
});
