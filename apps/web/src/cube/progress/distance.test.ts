import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { distanceToSolved, NEAR_LIMIT, shortSolution } from "./distance";

const after = (n: number, alg: string) =>
  applyMoves(n, solvedCube(n), parseMoves(n, alg));

describe("완성까지 거리", () => {
  it("3×3: 짧은 섞기는 그 수 그대로, 상쇄되는 수는 줄어든다, 8수보다 멀면 없다", () => {
    expect(distanceToSolved(3, solvedCube(3), NEAR_LIMIT)).toBe(0);
    expect(distanceToSolved(3, after(3, "R U F' D2 L B"), NEAR_LIMIT)).toBe(6);
    expect(distanceToSolved(3, after(3, "R L R'"), NEAR_LIMIT)).toBe(1);
    expect(
      distanceToSolved(3, after(3, "R U F' D2 L B R2 U' F2"), 8),
    ).toBeNull();
  });

  it("큐브를 통째로 돌려 쥐어도 같다", () => {
    expect(distanceToSolved(3, after(3, "R U F x y'"), NEAR_LIMIT)).toBe(3);
    expect(distanceToSolved(2, after(2, "R U F' z"), NEAR_LIMIT)).toBe(3);
  });

  it("2×2는 정확한 값, 큰 큐브는 셈하지 않는다", () => {
    expect(distanceToSolved(2, after(2, "R U2 R'"), NEAR_LIMIT)).toBe(3);
    expect(distanceToSolved(4, after(4, "R"), NEAR_LIMIT)).toBeNull();
    expect(shortSolution(2, after(2, "R U R' U'"))).toEqual({
      moves: 4,
      exact: true,
    });
    expect(shortSolution(3, after(3, "R U"))).toEqual({
      moves: 2,
      exact: true,
    });
    // 대회 섞기는 12수보다 멀어 2단계 해법의 첫 해(21수 안쪽)
    const far = shortSolution(
      3,
      after(3, "D2 F2 U' B2 R2 D' L2 U' R2 U2 F' L' D B' R' U' R2 F U' L"),
    );
    expect(far?.exact).toBe(false);
    expect(far?.moves).toBeLessThanOrEqual(21);
    expect(shortSolution(5, solvedCube(5))).toBeNull();
  });
});
