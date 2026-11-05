import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { COLOR_SCHEMES } from "../settings";
import {
  calmLine,
  calmTint,
  capRepeats,
  HOME_ORIENT,
  KEY_CALM,
  keyMarkShape,
  keyPaint,
  keyTone,
  lumaOf,
  mixRgb,
  type Orient,
  orientAfter,
  orientFromCenters,
  stripedColor,
  stripeImage,
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
    expect(keyPaint(3, HOME_ORIENT, move)).toMatchObject({
      kind: "sweep",
      from,
      to,
      prime: false,
    });
    // 반대 방향은 색 순서를 거꾸로
    expect(keyPaint(3, HOME_ORIENT, `${move}'`)).toMatchObject({
      kind: "sweep",
      from: to,
      to: from,
      prime: true,
    });
  });

  // 2026-11-05 사용자 「x, y, z는 표시할 방법이 마땅치 않았나?」
  it.each([
    ["x", R, "dotted"],
    ["y", U, "dotted"],
    ["z", F, "dotted"],
    ["M", L, "short"],
    ["E", D, "short"],
    ["S", F, "short"],
  ] as const)("%s: 면 %i 색의 %s 표시", (move, color, shape) => {
    const p = keyPaint(3, HOME_ORIENT, move);
    if (!p) throw new Error(move);
    expect(p.color).toBe(color);
    expect(keyMarkShape(p)).toBe(shape);
    // 반대 방향은 같은 색·같은 모양(밝기와 ′로만 구별)
    const q = keyPaint(3, HOME_ORIENT, `${move}'`);
    if (!q) throw new Error(move);
    expect(q).toMatchObject({ color, prime: true });
    expect(keyMarkShape(q)).toBe(shape);
  });

  it("면 돌리기·넓게·안쪽 층은 바탕 칠하기(`solid`, 선 없음)", () => {
    for (const [n, a] of [
      [3, "R"],
      [3, "R'"],
      [3, "Rw"],
      [4, "2F"],
      [5, "3Uw'"],
    ] as const) {
      const p = keyPaint(n, HOME_ORIENT, a);
      if (!p) throw new Error(a);
      expect(keyMarkShape(p), a).toBe("solid");
    }
  });

  it("x·y·z·M·E·S 표시 색도 들고 있는 방향을 따른다", () => {
    // y 뒤 오른쪽은 파랑, 앞은 빨강, 왼쪽은 초록
    const o = follow(3, "y");
    expect(keyPaint(3, o, "x")).toMatchObject({ color: B });
    expect(keyPaint(3, o, "z")).toMatchObject({ color: R });
    expect(keyPaint(3, o, "M")).toMatchObject({ color: F });
    // x·R은 같은 축이라 늘 같은 색
    for (const alg of ["", "y", "x z'", "y2 x"]) {
      const p = follow(3, alg);
      expect(keyPaint(3, p, "x")?.color, alg).toBe(keyPaint(3, p, "R")?.color);
      expect(keyPaint(3, p, "E")?.color, alg).toBe(keyPaint(3, p, "D")?.color);
    }
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

  it("면 돌리기 바탕: 어느 배색이든 밝은 글자가 읽히는 어두운 칸, 반대 방향은 더 옅다", () => {
    for (const colors of Object.values(COLOR_SCHEMES))
      for (const rgb of colors) {
        expect(lumaOf(calmTint(rgb, false))).toBeLessThan(65);
        expect(lumaOf(calmTint(rgb, true))).toBeLessThan(
          lumaOf(calmTint(rgb, false)),
        );
      }
  });
});

/** 색조(0~360°). 무채색이면 null */
const hueOf = (rgb: number): number | null => {
  const [r, g, b] = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255];
  const mx = Math.max(r, g, b);
  const d = mx - Math.min(r, g, b);
  if (d === 0) return null;
  const h =
    mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

describe("면 = 바탕, 응용 = 선(2026-11-05 사용자 「정식 색상은 배경색, 응용(xyz, mes)은 선색」)", () => {
  it("면 돌리기는 바탕, x·y·z는 점선, M·E·S는 짧은 선", () => {
    const shape = (a: string) => {
      const p = keyPaint(3, HOME_ORIENT, a);
      if (!p) throw new Error(a);
      return keyMarkShape(p);
    };
    expect(["R", "U'", "Lw"].map(shape)).toEqual(["solid", "solid", "solid"]);
    expect(["x", "y'", "z"].map(shape)).toEqual(["dotted", "dotted", "dotted"]);
    expect(["M", "E'", "S"].map(shape)).toEqual(["short", "short", "short"]);
  });

  it("선 색은 옅은 바탕과 한 식구: 같은 색조, 바탕보다 진하고 원색보다 차분하다", () => {
    for (const colors of Object.values(COLOR_SCHEMES))
      for (const rgb of colors) {
        const tint = calmTint(rgb, false);
        const line = calmLine(rgb);
        expect(line).toBe(mixRgb(rgb, KEY_CALM.line));
        expect(lumaOf(line)).toBeGreaterThan(lumaOf(tint));
        expect(line).not.toBe(rgb);
        const ht = hueOf(tint);
        const hl = hueOf(line);
        if (ht === null || hl === null) {
          expect(ht).toBe(hl);
          continue;
        }
        expect(hueGap(ht, hl)).toBeLessThan(12);
      }
    expect(KEY_CALM.line).toBeGreaterThan(KEY_CALM.tint * 3);
    expect(KEY_CALM.line).toBeLessThan(1);
  });
});

describe("색약 친화·높은 대비 사선 무늬(2026-11-05)", () => {
  it("표준·직접 고른 색은 무늬가 없다", () => {
    for (let c = 0; c < 6; c++) {
      expect(stripedColor("standard", c)).toBe(false);
      expect(stripedColor("custom", c)).toBe(false);
    }
  });

  it("두 배색에서 한 면에만, 따뜻한 세 면(R·L·D) 가운데 색조가 가운데인 면(L)에 넣는다", () => {
    for (const scheme of ["colorblind", "highContrast"] as const) {
      const colors = COLOR_SCHEMES[scheme];
      const striped = [0, 1, 2, 3, 4, 5].filter((c) => stripedColor(scheme, c));
      expect(striped).toEqual([L]);
      const h = (c: number) => hueOf(calmTint(colors[c] as number, false)) ?? 0;
      // 빨강 쪽 색조(350° 언저리)는 0° 아래로 읽는다
      const hr = h(R) > 300 ? h(R) - 360 : h(R);
      expect(h(L)).toBeGreaterThan(hr);
      expect(h(L)).toBeLessThan(h(D));
      // 무늬 없는 R·D는 색조가 넉넉히 떨어져 색으로 갈린다
      expect(hueGap(h(R), h(D))).toBeGreaterThan(25);
    }
  });

  it("무늬는 옅은 사선이고 반대 방향에도 같은 무늬(더 옅게)", () => {
    const rgb = COLOR_SCHEMES.colorblind[L] as number;
    const plain = stripeImage(rgb, false);
    const prime = stripeImage(rgb, true);
    expect(plain).toMatch(
      /^repeating-linear-gradient\(135deg, #[0-9a-f]{6} 0 2px, transparent 2px 7px\)$/,
    );
    expect(prime).not.toBe(plain);
    expect(prime.replace(/#[0-9a-f]{6}/, "")).toBe(
      plain.replace(/#[0-9a-f]{6}/, ""),
    );
    // 사선 색은 바탕보다 조금만 진하다(글자를 가리지 않는다)
    const stripe = mixRgb(rgb, KEY_CALM.stripe);
    expect(lumaOf(stripe)).toBeGreaterThan(lumaOf(calmTint(rgb, false)));
    expect(lumaOf(stripe)).toBeLessThan(80);
  });
});
