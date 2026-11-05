import { describe, expect, it } from "vitest";
import { applyMoves } from "./move";
import { parseMoves } from "./notation";
import { shapeMatcher } from "./shape";
import { faceColors, isSolved, solvedCube } from "./state";

const SIZES = [2, 3, 4, 5] as const;
const GRIPS = ["", "x", "y'", "z2", "x y", "x2 z'", "y z x'"];

function run(n: number, text: string, from = solvedCube(n)) {
  return applyMoves(n, from, parseMoves(n, text));
}

/** 큐브 속 큐브: 돌려 보면 모양이 달라지는(대칭이 적은) 패턴 */
const CIC = "F L F U' R U F2 L2 U' L' B D' B' L2 U";

describe("모양 판정", () => {
  it.each(SIZES.map((n) => [n, n]))(
    "%i×%i 큐브를 통째로 돌려도 같은 모양",
    (n) => {
      const target = run(n, CIC);
      const m = shapeMatcher(n, target);
      for (const g of GRIPS) expect(m.matches(run(n, g, target))).toBe(true);
      expect(m.closeness(target)).toBe(1);
    },
  );

  it.each(SIZES.map((n) => [n, n]))(
    "%i×%i 다르게 쥔 채 같은 공식을 해도 같은 모양",
    (n) => {
      const m = shapeMatcher(n, run(n, CIC));
      for (const g of GRIPS) {
        const held = run(n, `${g} ${CIC}`.trim());
        expect(m.matches(held)).toBe(true);
      }
    },
  );

  it("맞춘 큐브를 목표로 두면 맞춤 판정과 같다", () => {
    for (const n of SIZES) {
      const m = shapeMatcher(n, solvedCube(n));
      for (const text of ["x U R U' R' x' R F R' F'", "R", "x y", "U2 D2"])
        expect(m.matches(run(n, text))).toBe(isSolved(n, run(n, text)));
    }
  });

  it("거울에 비친 모양과 아무렇게나 색을 바꾼 모양은 다르다", () => {
    const n = 3;
    // 거울: 왼쪽·오른쪽을 바꾼 공식(R↔L, 방향 반대). 큐브 속 큐브는 거울에 비춰도 같은 모양이라 한쪽으로 꼬인 모양으로 본다
    const m = shapeMatcher(n, run(n, "R U F"));
    expect(m.matches(run(n, "L' U' F'"))).toBe(false);
    expect(
      shapeMatcher(n, run(n, CIC)).matches(
        run(n, "F' R' F' U L' U' F2 R2 U R B' D B R2 U'"),
      ),
    ).toBe(true);
    // 흰색(0)과 초록(2)만 맞바꾼 그림: 맞은편 짝이 깨진다
    const target = run(n, "R2 L2 U2 D2 F2 B2");
    const colors = faceColors(n, target);
    const swapped = shapeMatcher(n, target);
    const fake = {
      perm: Uint16Array.from(target.perm, (p) => {
        const c = Math.floor(p / 9);
        const k = p % 9;
        return (c === 0 ? 2 : c === 2 ? 0 : c) * 9 + k;
      }),
      twist: target.twist,
    };
    expect(faceColors(n, fake)).not.toEqual(colors);
    expect(swapped.matches(fake)).toBe(false);
  });

  it("목표에 가까울수록 같은 칸이 많다", () => {
    const n = 3;
    const alg = "R2 L2 U2 D2 F2 B2";
    const m = shapeMatcher(n, run(n, alg));
    const half = m.closeness(run(n, "R2 L2 U2 D2"));
    expect(m.closeness(run(n, alg))).toBe(1);
    expect(half).toBeGreaterThan(m.closeness(solvedCube(n)));
    expect(half).toBeLessThan(1);
    expect(m.matches(run(n, "R2 L2 U2 D2"))).toBe(false);
  });
});
