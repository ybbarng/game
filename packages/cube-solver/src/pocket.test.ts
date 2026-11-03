import { describe, expect, it } from "vitest";
import {
  applyAlgorithm,
  isSolvedFacelets,
  solvedFacelets,
  splitMoves,
} from "./facelets";
import {
  distance2x2,
  init2x2,
  POCKET_STATE_COUNT,
  pocketDistance,
  solve2x2,
} from "./pocket";

const S2 = solvedFacelets(2);

describe("2×2 최적 해", () => {
  it("거리별 상태 개수가 알려진 값과 같다(HTM, 최대 11)", () => {
    init2x2();
    const counts = new Array<number>(12).fill(0);
    for (let s = 0; s < POCKET_STATE_COUNT; s++) {
      const d = pocketDistance(s);
      counts[d] = (counts[d] as number) + 1;
    }
    expect(counts).toEqual([
      1, 9, 54, 321, 1847, 9992, 50136, 227536, 870072, 1887748, 623800, 2644,
    ]);
  });

  it("1~3수 섞기는 정확히 그 길이로 푼다", () => {
    const cases: [string, number][] = [
      ["", 0],
      ["R", 1],
      ["U2", 1],
      ["L'", 1],
      ["D", 1],
      ["R U", 2],
      ["F2 R'", 2],
      ["R U F", 3],
      ["L D' B2", 3],
    ];
    for (const [alg, len] of cases) {
      const f = applyAlgorithm(S2, alg);
      expect(distance2x2(f)).toBe(len);
      const sol = solve2x2(f);
      expect(splitMoves(sol)).toHaveLength(len);
      expect(isSolvedFacelets(applyAlgorithm(f, sol))).toBe(true);
    }
  });

  it("큐브를 돌려 들어도 같은 길이", () => {
    const f = applyAlgorithm(S2, "R U' F2 R2 U x y'");
    expect(distance2x2(f)).toBe(
      distance2x2(applyAlgorithm(S2, "R U' F2 R2 U")),
    );
  });

  it("긴 섞기도 풀고, 해는 11수를 넘지 않는다", () => {
    const algs = [
      "R U R' U' R' F R2 U' R' U' R U R' F'",
      "F R U' R' U' R U R' F' R U R' U' R' F R F'",
      "R2 U2 F2 R2 U' F2 U2 R' F' U2 R2",
    ];
    for (const alg of algs) {
      const f = applyAlgorithm(S2, alg);
      const sol = solve2x2(f);
      expect(splitMoves(sol).length).toBe(distance2x2(f));
      expect(splitMoves(sol).length).toBeLessThanOrEqual(11);
      expect(isSolvedFacelets(applyAlgorithm(f, sol))).toBe(true);
    }
  });

  it("맞출 수 없는 상태는 오류", () => {
    // 한 꼭짓점의 스티커 셋을 돌려 붙인다(URF: U4=3, R1=4, F2=9)
    const a = S2.split("");
    [a[3], a[4], a[9]] = [a[9] as string, a[3] as string, a[4] as string];
    expect(() => distance2x2(a.join(""))).toThrow();
    expect(() => distance2x2("UUU")).toThrow();
  });
});
