import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import { ManualClock } from "@game/fair-play";
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
    expect(shortSolution(5, solvedCube(5))).toBeNull();
  });
});

describe("결과 상자의 짧은 풀이(시간 상한)", () => {
  // 대회 섞기(20수): 12수보다 멀다
  const FAR = "D2 F2 U' B2 R2 D' L2 U' R2 U2 F' L' D B' R' U' R2 F U' L";

  it("시간 안이면 12수 안쪽은 정확한 값", () => {
    const clock = new ManualClock();
    expect(shortSolution(3, after(3, "R U"), { clock })).toEqual({
      moves: 2,
      exact: true,
    });
    expect(
      shortSolution(3, after(3, "R U F' D2 L B R2 U' F2"), { clock }),
    ).toEqual({ moves: 9, exact: true });
  });

  it("시간이 넘으면 정확한 값을 그만 찾고 첫 해를 넓혀 가며 낸다", () => {
    // 시계가 흐르지 않아도 상한 0이면 첫 멈춤 확인에서 멈춘다(마디 수로 정해져 늘 같은 결과)
    const clock = new ManualClock();
    const far = shortSolution(3, after(3, FAR), { clock, stepMs: 0 });
    expect(far?.exact).toBe(false);
    expect(far?.moves).toBeGreaterThan(12);
    expect(far?.moves).toBeLessThanOrEqual(24);
  });

  it("12수 안에 없고 시간 안이면 첫 해는 21수 안쪽", () => {
    // 정확한 값 찾기를 8수까지만 해 시험을 짧게 둔다(시계는 흐르지 않아 멈추지 않는다)
    const clock = new ManualClock();
    const far = shortSolution(3, after(3, FAR), { clock, exactLimit: 8 });
    expect(far?.exact).toBe(false);
    expect(far?.moves).toBeLessThanOrEqual(21);
  });
});
