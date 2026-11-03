import { describe, expect, it } from "vitest";
import type { CubeMove } from "./move";
import { formatMoves, NotationError, parseMoves } from "./notation";

describe("표기 읽기", () => {
  it("3×3 기본", () => {
    expect(parseMoves(3, "R U2 F' L D' B2")).toEqual<CubeMove[]>([
      { axis: "x", from: 1, to: 1, turns: 1 },
      { axis: "y", from: 1, to: 1, turns: 2 },
      { axis: "z", from: 1, to: 1, turns: 3 },
      { axis: "x", from: 3, to: 3, turns: 3 },
      { axis: "y", from: 3, to: 3, turns: 1 },
      { axis: "z", from: 3, to: 3, turns: 2 },
    ]);
  });

  it("가운데 층·큐브 돌리기·소문자·괄호", () => {
    expect(parseMoves(3, "M E' S2 x y' z2 (r u’)")).toEqual<CubeMove[]>([
      { axis: "x", from: 2, to: 2, turns: 3 },
      { axis: "y", from: 2, to: 2, turns: 1 },
      { axis: "z", from: 2, to: 2, turns: 2 },
      { axis: "x", from: 1, to: 3, turns: 1 },
      { axis: "y", from: 1, to: 3, turns: 3 },
      { axis: "z", from: 1, to: 3, turns: 2 },
      { axis: "x", from: 1, to: 2, turns: 1 },
      { axis: "y", from: 1, to: 2, turns: 3 },
    ]);
  });

  it("큰 큐브: 넓게·안쪽 층·여러 안쪽 층", () => {
    expect(parseMoves(5, "Rw 3Rw2 2R 3L' Lw 2-3Uw M")).toEqual<CubeMove[]>([
      { axis: "x", from: 1, to: 2, turns: 1 },
      { axis: "x", from: 1, to: 3, turns: 2 },
      { axis: "x", from: 2, to: 2, turns: 1 },
      { axis: "x", from: 3, to: 3, turns: 1 },
      { axis: "x", from: 4, to: 5, turns: 3 },
      { axis: "y", from: 2, to: 3, turns: 1 },
      { axis: "x", from: 3, to: 3, turns: 3 },
    ]);
  });

  it("잘못된 표기는 위치를 담은 오류", () => {
    const err = (n: number, text: string) => {
      try {
        parseMoves(n, text);
      } catch (e) {
        return e;
      }
      return null;
    };
    const e = err(3, "R U Q2");
    expect(e).toBeInstanceOf(NotationError);
    expect((e as NotationError).index).toBe(4);
    expect((e as NotationError).token).toBe("Q2");
    expect((err(4, "R M") as NotationError).index).toBe(2); // 짝수 크기에 M 없음
    expect((err(3, "4R") as NotationError).index).toBe(0); // 없는 층
    expect(err(3, "rw")).toBeInstanceOf(NotationError);
    expect(err(3, "x2w")).toBeInstanceOf(NotationError);
    expect(err(3, "2x")).toBeInstanceOf(NotationError);
    expect(err(3, "R4")).toBeInstanceOf(NotationError);
  });
});

describe("표기 쓰기", () => {
  it.each([
    [3, "R U2 F' L D' B2 M E' S2 x y' z2 Rw Lw'"],
    [2, "R U F' x2 y"],
    [4, "R 2R 2L' Rw 3Rw2 Lw' 3Lw x"],
    [5, "2R M' 2L 2-3Rw 2-3Lw' 3Lw Bw2 M S E"],
    [7, "M' 2-3Rw 3-4Fw' 3Uw"],
  ] as const)("%i 크기 「%s」 읽고 쓰면 그대로", (n, text) => {
    expect(formatMoves(n, parseMoves(n, text))).toBe(text);
  });

  it("같은 수의 다른 표기는 WCA 표기로 쓴다", () => {
    expect(formatMoves(3, parseMoves(3, "r u' 1R 2R"))).toBe("Rw Uw' R M'");
    expect(formatMoves(2, parseMoves(2, "Rw"))).toBe("x");
    expect(formatMoves(4, parseMoves(4, "3L 4R"))).toBe("2R' L'");
  });

  it("모든 수가 읽기·쓰기 왕복된다", () => {
    for (const n of [2, 3, 4, 5, 6]) {
      for (const axis of ["x", "y", "z"] as const) {
        for (let from = 1; from <= n; from++) {
          for (let to = from; to <= n; to++) {
            for (const turns of [1, 2, 3] as const) {
              const m: CubeMove = { axis, from, to, turns };
              expect(parseMoves(n, formatMoves(n, [m]))).toEqual([m]);
            }
          }
        }
      }
    }
  });
});
