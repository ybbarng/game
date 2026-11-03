import {
  applyMoves,
  type CubeMove,
  isSolved,
  parseMoves,
  randomCubeState,
  solvedCube,
} from "@game/cube-engine";
import { solve2x2, solve3x3, solvedFacelets } from "@game/cube-solver";
import { describe, expect, it } from "vitest";
import {
  coordMoveTables,
  cornerCoord,
  edgeCoord,
  FACE_MOVE_COUNT,
  faceMoveName,
  readCubie,
} from "./cubie";
import { applyToFacelets, toFacelets } from "./facelets";
import { solveExpert2, solveExpert3 } from "./methods";

/**
 * 엔진 상태 ↔ 해법기 스티커 문자열 잇기, 그리고 엔진의 무작위 상태를 해법기로 푸는지.
 */

/** 시험용 결정적 난수(mulberry32) */
function rng(seed: number) {
  let s = seed >>> 0;
  return (max: number) => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * max);
  };
}

function randomMoves(n: number, count: number, seed: number): CubeMove[] {
  const next = rng(seed);
  const axes = ["x", "y", "z"] as const;
  return Array.from({ length: count }, () => {
    const a = 1 + next(n);
    const b = a + next(n - a + 1);
    return {
      axis: axes[next(3)] as CubeMove["axis"],
      from: a,
      to: b,
      turns: (1 + next(3)) as 1 | 2 | 3,
    };
  });
}

describe("엔진 → 스티커 문자열", () => {
  it.each([2, 3, 4, 5])(
    "%i×%i 맞춘 상태는 해법기의 맞춘 문자열과 같다",
    (n) => {
      expect(toFacelets(n, solvedCube(n))).toBe(solvedFacelets(n));
    },
  );

  it.each([2, 3, 4, 5])(
    "%i×%i 안쪽 층·큐브 돌리기까지 같은 수를 두면 두 쪽이 같다",
    (n) => {
      const start = randomCubeState(n, n * 10);
      const moves = randomMoves(n, 40, n);
      let f = toFacelets(n, start).split("");
      for (const m of moves) f = applyToFacelets(n, f, m);
      expect(f.join("")).toBe(toFacelets(n, applyMoves(n, start, moves)));
    },
  );
});

describe("엔진의 무작위 상태를 해법기로 푼다", () => {
  it.each([1, 2, 3, 4, 5])("3×3 씨앗 %i", (seed) => {
    const start = randomCubeState(3, seed);
    const sol = solve3x3(toFacelets(3, start));
    expect(isSolved(3, applyMoves(3, start, parseMoves(3, sol)))).toBe(true);
  });

  it("3×3 큐브를 돌린 상태(가운데가 기본 방향이 아님)도 푼다", () => {
    const start = applyMoves(
      3,
      randomCubeState(3, 9),
      parseMoves(3, "x y' Rw"),
    );
    const sol = solve3x3(toFacelets(3, start));
    expect(isSolved(3, applyMoves(3, start, parseMoves(3, sol)))).toBe(true);
    const r = solveExpert3(start);
    expect(
      isSolved(3, applyMoves(3, start, parseMoves(3, r.moves.join(" ")))),
    ).toBe(true);
  });

  it.each([1, 2, 3, 4, 5])("2×2 씨앗 %i", (seed) => {
    const start = randomCubeState(2, seed);
    const sol = solve2x2(toFacelets(2, start));
    expect(isSolved(2, applyMoves(2, start, parseMoves(2, sol)))).toBe(true);
  });

  it("초고수 해법은 3×3 21수·2×2 11수 안", () => {
    for (const seed of [1, 2, 3]) {
      expect(
        solveExpert3(randomCubeState(3, seed)).moves.length,
      ).toBeLessThanOrEqual(21);
      expect(
        solveExpert2(randomCubeState(2, seed)).moves.length,
      ).toBeLessThanOrEqual(11);
    }
  });
});

describe("조각 좌표 수 표", () => {
  it("좌표를 표로 옮긴 결과가 스티커로 둔 뒤 읽은 결과와 같다", () => {
    const { corner, edge } = coordMoveTables();
    const next = rng(5);
    let f = solvedFacelets(3).split("");
    let cc = Array.from({ length: 8 }, (_, i) => i * 3);
    let ec = Array.from({ length: 12 }, (_, i) => i * 2);
    for (let k = 0; k < 60; k++) {
      const m = next(FACE_MOVE_COUNT);
      const [move] = parseMoves(3, faceMoveName(m)) as [CubeMove];
      f = applyToFacelets(3, f, move);
      cc = cc.map((c) => corner[c * FACE_MOVE_COUNT + m] as number);
      ec = ec.map((e) => edge[e * FACE_MOVE_COUNT + m] as number);
      const cube = readCubie(f.join(""), 3);
      expect(cc).toEqual(cc.map((_, p) => cornerCoord(cube, p)));
      expect(ec).toEqual(ec.map((_, p) => edgeCoord(cube, p)));
    }
  });
});
