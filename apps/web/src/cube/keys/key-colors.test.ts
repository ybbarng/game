import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { COLOR_SCHEMES } from "../settings";
import {
  calmTint,
  capRepeats,
  HOME_ORIENT,
  KEY_LOOK_DEFAULT,
  keyPaint,
  keyTone,
  lumaOf,
  type Orient,
  orientAfter,
  orientFromCenters,
  parseKeyLook,
} from "./key-colors";

const [U, R, F, D, L, B] = [0, 1, 2, 3, 4, 5];

/** 공식을 한 수씩 두며 들고 있는 방향을 따라간다 */
const follow = (n: number, alg: string): Orient => {
  let o = HOME_ORIENT;
  for (const m of parseMoves(n, alg)) o = orientAfter(n, o, m);
  return o;
};

describe("들고 있는 방향", () => {
  it("y를 치면 R 키 색이 바뀐다(오른쪽에 파랑이 온다)", () => {
    const o = follow(3, "y");
    expect(keyPaint(3, o, "R")).toMatchObject({ kind: "face", color: B });
    expect(keyPaint(3, HOME_ORIENT, "R")).toMatchObject({ color: R });
  });

  it("홀수 큐브: 수를 따라간 방향 = 가운데 칸으로 읽은 방향", () => {
    for (const alg of ["y", "x z'", "Rw U", "M E S", "x2 Lw' F", "3Rw"]) {
      const s = applyMoves(3, solvedCube(3), parseMoves(3, alg));
      const centers = orientFromCenters(3, s);
      // 가운데 층(M·E·S)은 「절반 넘는 층」이 아니라 수로는 못 따라간다. 그래서 홀수는 가운데 칸을 쓴다
      if (/[MES]/.test(alg)) continue;
      expect(follow(3, alg), alg).toEqual(centers);
    }
  });

  it("짝수 큐브: 절반 넘는 층을 함께 돌리는 넓게는 큐브 전체 돌리기로 친다", () => {
    expect(follow(4, "3Rw")).toEqual(follow(4, "x"));
    expect(follow(4, "3Lw")).toEqual(follow(4, "x'"));
    // 4×4의 Rw(두 층)는 절반이라 방향을 바꾸지 않는다
    expect(follow(4, "Rw")).toEqual(HOME_ORIENT);
    expect(follow(4, "R U 2R")).toEqual(HOME_ORIENT);
  });
});

describe("키 칠하기", () => {
  it("면·넓게·안쪽 층은 그 면 색, 반대 방향은 prime", () => {
    expect(keyPaint(3, HOME_ORIENT, "R'")).toEqual({
      kind: "face",
      color: R,
      prime: true,
      wide: false,
    });
    expect(keyPaint(3, HOME_ORIENT, "Uw")).toMatchObject({
      color: U,
      wide: true,
    });
    expect(keyPaint(4, HOME_ORIENT, "2F")).toMatchObject({ color: F });
    // 3×3의 2U는 가운데 층 E'(두 색 화살)
    expect(keyPaint(3, HOME_ORIENT, "2U")).toMatchObject({ kind: "sweep" });
  });

  it.each([
    ["x", F, U],
    ["y", F, L],
    ["z", U, R],
    ["M", F, D],
    ["E", F, R],
    ["S", U, R],
  ])("%s: 앞(위) 줄이 %i → %i 면으로", (move, from, to) => {
    expect(keyPaint(3, HOME_ORIENT, move)).toEqual({
      kind: "sweep",
      from,
      to,
      prime: false,
    });
    // 반대 방향은 색 순서를 거꾸로
    expect(keyPaint(3, HOME_ORIENT, `${move}'`)).toEqual({
      kind: "sweep",
      from: to,
      to: from,
      prime: true,
    });
  });

  it("두 색 화살도 들고 있는 방향을 따른다", () => {
    const o = follow(3, "y");
    // y 뒤 앞은 빨강, 위는 흰: x는 빨강 → 흰
    expect(keyPaint(3, o, "x")).toMatchObject({ from: R, to: U });
  });

  it("칸 바탕은 어둡게: 흰·노랑 키도 밝은 글자가 읽히는 어두운 칸, 반대 방향은 더 옅다", () => {
    const schemes = Object.values(COLOR_SCHEMES);
    for (const colors of schemes)
      for (const rgb of colors) {
        const plain = keyTone(rgb, false);
        const prime = keyTone(rgb, true);
        // 흰 글자(255)와 넉넉히 떨어진 어두운 바탕
        expect(lumaOf(plain.fill)).toBeLessThan(80);
        expect(lumaOf(prime.fill)).toBeLessThan(lumaOf(plain.fill) + 0.01);
        expect(prime.fill).not.toBe(plain.fill);
      }
    // 흰 키도 꽉 찬 흰색이 아니다
    expect(lumaOf(keyTone(0xffffff, false).fill)).toBeLessThan(70);
  });
});

describe("차분한 키 그림(2026-11-05 「어지러움」)", () => {
  it("키 글자와 수가 같은 글자면 한 번만 적는다", () => {
    // 「표기」: R 키 = R·R'·Rw, X 키 = x
    expect(capRepeats("R", "R")).toBe(true);
    expect(capRepeats("R", "R'")).toBe(true);
    expect(capRepeats("R", "Rw")).toBe(true);
    expect(capRepeats("X", "x")).toBe(true);
    // 「두 손」: L 키 = D', I 키 = R은 따로
    expect(capRepeats("L", "D'")).toBe(false);
    expect(capRepeats("I", "R")).toBe(false);
    // 동작 글이 없거나 낱말이면 키 글자를 적는다
    expect(capRepeats("3", undefined)).toBe(false);
    expect(capRepeats("2", "깊이 2")).toBe(false);
  });

  it("모르는 안 이름은 권하는 안으로", () => {
    expect(parseKeyLook("dot")).toBe("dot");
    expect(parseKeyLook(null)).toBe(KEY_LOOK_DEFAULT);
    expect(parseKeyLook("vivid")).toBe(KEY_LOOK_DEFAULT);
  });

  it("옅은 바탕 안: 어느 배색이든 밝은 글자가 읽히는 어두운 칸, 반대 방향은 더 옅다", () => {
    for (const colors of Object.values(COLOR_SCHEMES))
      for (const rgb of colors) {
        expect(lumaOf(calmTint(rgb, false))).toBeLessThan(65);
        expect(lumaOf(calmTint(rgb, true))).toBeLessThan(
          lumaOf(calmTint(rgb, false)),
        );
      }
  });
});
