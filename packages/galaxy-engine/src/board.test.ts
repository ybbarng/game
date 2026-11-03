import { describe, expect, it } from "vitest";

import { baseValue, buildBoard, NOTICES, STAR_SQUARES } from "./board";
import { activeCards, factSquares } from "./cards";
import {
  TEST_CONSTELLATIONS,
  TEST_PAIR_CONSTELLATIONS,
  TEST_PAIR_SKY,
  TEST_SKY,
} from "./test-sky";

const BOARD = buildBoard(TEST_SKY, TEST_CONSTELLATIONS);
const PAIR_BOARD = buildBoard(TEST_PAIR_SKY, TEST_PAIR_CONSTELLATIONS);

describe("판 만들기", () => {
  it("모퉁이·공문·별 칸 배치(2-1)", () => {
    expect(BOARD.squares[0]?.kind).toBe("base");
    expect(BOARD.squares[8]?.kind).toBe("asteroid");
    expect(BOARD.squares[16]?.kind).toBe("observatory");
    expect(BOARD.squares[24]?.kind).toBe("comet");
    for (const n of NOTICES) expect(BOARD.squares[n]?.kind).toBe("notice");
    expect(STAR_SQUARES).toHaveLength(24);
    expect(BOARD.squares.filter((s) => s.kind === "star")).toHaveLength(24);
    expect(BOARD.squares[14]?.star?.star.id).toBe("Sirius");
    expect(BOARD.squares[1]?.star?.star.id).toBe("Markab");
    expect(BOARD.squares[31]?.star?.star.id).toBe("Alshain");
    expect(BOARD.squares[9]?.side).toBe(1);
    expect(BOARD.squares[8]?.side).toBeNull();
  });

  it("값은 합친 밝기 순위로 60~200, 가장 밝은 별 +20, 판 합 3,280(2-2 표)", () => {
    const byId = Object.fromEntries(BOARD.groups.map((g) => [g.id, g]));
    expect(byId.CMa?.base).toBe(200);
    expect(byId.Ori?.base).toBe(180);
    expect(byId.Boo?.base).toBe(160);
    expect(byId.Lyr?.base).toBe(140);
    expect(byId.Aql?.base).toBe(120);
    expect(byId.Leo?.base).toBe(100);
    expect(byId.And?.base).toBe(80);
    expect(byId.Peg?.base).toBe(60);
    expect(byId.CMa?.levelCost).toBe(100);
    expect(byId.Peg?.levelCost).toBe(30);
    expect(BOARD.squares[14]?.star?.value).toBe(220);
    expect(BOARD.squares[14]?.star?.brightest).toBe(true);
    expect(BOARD.squares[13]?.star?.value).toBe(200);
    expect(BOARD.squares[2]?.star?.value).toBe(80);
    expect(BOARD.total).toBe(3280);
  });

  it("별자리 2개짜리 하늘(12 × 2)도 판이 된다", () => {
    expect(PAIR_BOARD.groups).toHaveLength(12);
    expect(PAIR_BOARD.groups.every((g) => g.squares.length === 2)).toBe(true);
    const bases = PAIR_BOARD.groups.map((g) => g.base).sort((a, b) => a - b);
    expect(bases[0]).toBe(60);
    expect(bases.at(-1)).toBe(200);
    expect(PAIR_BOARD.groups[0]?.squares).toEqual([1, 2]);
    expect(PAIR_BOARD.groups[1]?.squares).toEqual([3, 5]);
    expect(baseValue(1, 12)).toBe(190);
  });

  it("별 수가 맞지 않거나 자료가 없으면 만들지 않는다", () => {
    expect(() =>
      buildBoard(
        { ...TEST_SKY, constellations: ["Peg", "And"] },
        TEST_CONSTELLATIONS,
      ),
    ).toThrow();
    expect(() =>
      buildBoard(
        {
          ...TEST_SKY,
          constellations: [...TEST_SKY.constellations.slice(0, 7), "Cyg"],
        },
        TEST_CONSTELLATIONS,
      ),
    ).toThrow();
  });
});

describe("공문 더미", () => {
  it("별 사실 공문은 판 위 실제 별로 센다", () => {
    expect(factSquares(BOARD, "firstMagnitude")).toEqual([
      9, 10, 14, 18, 22, 26, 30,
    ]);
    expect(factSquares(BOARD, "red")).toEqual([2, 6, 9]);
    expect(factSquares(BOARD, "far")).toEqual([9, 10, 15, 25, 27]);
    expect(activeCards(BOARD)).toHaveLength(16);
  });

  it("해당 별이 하나도 없는 별 사실 공문은 더미에서 뺀다", () => {
    const noRed = TEST_CONSTELLATIONS.map((c) => ({
      ...c,
      stars: c.stars.map((s) => ({ ...s, k: Math.max(s.k, 5000), ly: 10 })),
    }));
    const board = buildBoard(TEST_SKY, noRed);
    const cards = activeCards(board);
    expect(cards).not.toContain(8);
    expect(cards).not.toContain(4);
    expect(cards).toContain(2);
    expect(cards).toHaveLength(14);
  });
});
