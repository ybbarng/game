import { beforeAll, describe, expect, it } from "vitest";
import { type CubieCube, cubieToFacelets, parity } from "./cubie";
import {
  applyAlgorithm,
  isSolvedFacelets,
  solvedFacelets,
  splitMoves,
} from "./facelets";
import { init3x3, solve3x3 } from "./two-phase";

const S3 = solvedFacelets(3);

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

function shuffled(n: number, next: (max: number) => number): number[] {
  const p = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = next(i + 1);
    [p[i], p[j]] = [p[j] as number, p[i] as number];
  }
  return p;
}

function randomCube(seed: number): string {
  const next = rng(seed);
  const cp = shuffled(8, next);
  const ep = shuffled(12, next);
  if (parity(cp) !== parity(ep))
    [ep[0], ep[1]] = [ep[1] as number, ep[0] as number];
  const co = Array.from({ length: 7 }, () => next(3));
  co.push((3 - (co.reduce((a, b) => a + b, 0) % 3)) % 3);
  const eo = Array.from({ length: 11 }, () => next(2));
  eo.push(eo.reduce((a, b) => a + b, 0) % 2);
  const c: CubieCube = { cp, co, ep, eo };
  return cubieToFacelets(c);
}

// 표는 파일에서 한 번만 만든다
beforeAll(() => {
  init3x3();
});

describe("3×3 2단계 해법", () => {
  it("맞춘 상태는 빈 해", () => {
    expect(solve3x3(S3)).toBe("");
  });

  it("짧은 섞기를 풀어 맞춘다", () => {
    for (const alg of ["R", "U F'", "R U R' U'", "D2 L B' R2"]) {
      const f = applyAlgorithm(S3, alg);
      const sol = solve3x3(f);
      expect(isSolvedFacelets(applyAlgorithm(f, sol))).toBe(true);
      expect(applyAlgorithm(f, sol)).toBe(S3);
    }
  });

  it("무작위 상태를 21수 안에 푼다", () => {
    for (let seed = 1; seed <= 8; seed++) {
      const f = randomCube(seed);
      const sol = solve3x3(f);
      expect(splitMoves(sol).length).toBeLessThanOrEqual(21);
      expect(applyAlgorithm(f, sol)).toBe(S3);
    }
  });

  it("같은 입력이면 같은 해", () => {
    const f = randomCube(42);
    expect(solve3x3(f)).toBe(solve3x3(f));
  });

  it("최대 길이를 넓히면 그 안에서 푼다", () => {
    const f = randomCube(7);
    const sol = solve3x3(f, { maxLength: 23 });
    expect(splitMoves(sol).length).toBeLessThanOrEqual(23);
    expect(applyAlgorithm(f, sol)).toBe(S3);
  });

  it("큐브를 돌린 상태(가운데가 기본 방향이 아님)도 푼다", () => {
    for (const [seed, rot] of [
      [1, "x"],
      [2, "y'"],
      [3, "z2"],
      [4, "x y"],
      [5, "Rw U Fw'"],
    ] as const) {
      const f = applyAlgorithm(randomCube(seed), rot);
      const sol = solve3x3(f);
      expect(isSolvedFacelets(applyAlgorithm(f, sol))).toBe(true);
    }
  });

  it("맞출 수 없는 상태는 오류", () => {
    const a = S3.split("");
    [a[8], a[9], a[20]] = [a[20] as string, a[8] as string, a[9] as string];
    expect(() => solve3x3(a.join(""))).toThrow();
  });
});
