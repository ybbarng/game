import { describe, expect, it } from "vitest";

import { bump, linearRgb, peakNm, planck, spectrumRgb, sum } from "./spectrum";

describe("별빛 색 계산", () => {
  it("차가운 별은 붉고, 해는 거의 흰색, 뜨거운 별은 푸르다", () => {
    const [r1, , b1] = linearRgb(planck(3350));
    expect(r1).toBe(1);
    expect(b1).toBeLessThan(0.3);
    const sun = spectrumRgb(planck(5800));
    expect(Math.min(...sun)).toBeGreaterThan(215);
    const [r3, , b3] = linearRgb(planck(30000));
    expect(b3).toBe(1);
    expect(r3).toBeLessThan(0.75);
  });

  it("어떤 온도에서도 초록이 빨강·파랑보다 두드러지지 않는다(초록 별이 없다)", () => {
    for (let k = 1000; k <= 40000; k *= 1.05) {
      const [r, g, b] = linearRgb(planck(k));
      expect(g - Math.max(r, b)).toBeLessThan(0.02);
    }
  });

  it("어떤 온도에서도 초록이 빨강·파랑보다 함께 낮지 않다(분홍·보라 별이 없다)", () => {
    // 흑체 색 줄은 6000~7000K에서 화면의 흰색 기준(D65)보다 아주 살짝 분홍 쪽을 지난다(0.03 남짓, 눈으로 구별 못 함)
    for (let k = 1000; k <= 40000; k *= 1.05) {
      const [r, g, b] = linearRgb(planck(k));
      expect(g).toBeGreaterThanOrEqual(Math.min(r, b) - 0.05);
    }
  });

  it("해의 꼭대기는 초록 근처(약 500nm)인데도 흰빛이다", () => {
    expect(peakNm(5800)).toBeGreaterThan(490);
    expect(peakNm(5800)).toBeLessThan(510);
  });

  it("좁은 봉우리를 초록에 두면 초록, 넓히면 흰빛에 가깝다", () => {
    const [r, g, b] = linearRgb(bump(530, 15));
    expect(g).toBe(1);
    expect(Math.max(r, b)).toBeLessThan(0.5);
    const wide = linearRgb(bump(530, 150));
    expect(Math.min(...wide)).toBeGreaterThan(0.6);
  });

  it("빨강과 파랑 두 봉우리를 더하면 분홍(초록이 가장 낮다)", () => {
    const [r, g, b] = linearRgb(sum(bump(630, 25), bump(450, 20)));
    expect(g).toBeLessThan(r);
    expect(g).toBeLessThan(b);
  });
});
