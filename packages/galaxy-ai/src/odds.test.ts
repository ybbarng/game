import { ASTEROID, BOARD_SIZE, boardOfSky } from "@game/galaxy-engine";
import { describe, expect, it } from "vitest";

import { landingOdds, landingRate } from "./odds";

describe("칸 밟힘 확률", () => {
  const board = boardOfSky("seasons");
  const odds = landingOdds(board);

  it("칸 32개이고 합이 1이다", () => {
    expect(odds).toHaveLength(BOARD_SIZE);
    expect(odds.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    for (const p of odds) expect(p).toBeGreaterThan(0);
  });

  it("소행성대는 평균보다 많이 밟힌다(공문 11·세 번째 같은 눈으로 오는 길이 더 있다)", () => {
    expect(odds[ASTEROID]).toBeGreaterThan(1 / BOARD_SIZE);
  });

  it("한 차례에 멈추는 칸은 하나보다 많다(같은 눈·혜성·공문 이동)", () => {
    const total = landingRate(board).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(1);
    expect(total).toBeLessThan(2);
  });

  it("같은 판이면 같은 표를 한 번만 계산한다", () => {
    expect(landingRate(board)).toBe(landingRate(board));
  });
});
