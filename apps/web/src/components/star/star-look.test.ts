import { describe, expect, it } from "vitest";
import { coreHeat, deepColor, rhythm, sizeOf } from "./star-look";

describe("별 원반 값", () => {
  it("뜨거운 별은 파랗고 차가운 별은 붉다(진한 색이라 흰 별도 색이 남는다)", () => {
    const [r1, , b1] = deepColor(22000); // 아다라
    const [r2, , b2] = deepColor(3600); // 베텔게우스
    expect(b1).toBeGreaterThan(r1);
    expect(r2).toBeGreaterThan(b2 + 100);
    const vega = deepColor(9600);
    expect(Math.max(...vega) - Math.min(...vega)).toBeGreaterThan(40);
  });

  it("밝은 별일수록 크고, 시리우스는 3.7등급 별의 약 세 배다", () => {
    expect(sizeOf(-1.46)).toBeGreaterThan(sizeOf(0.03));
    const ratio = sizeOf(-1.46) / sizeOf(3.71);
    expect(ratio).toBeGreaterThan(2.5);
    expect(ratio).toBeLessThan(3.5);
  });

  it("가운데가 타는 정도는 온도를 따르고, 박자는 같은 씨앗이면 같다", () => {
    expect(coreHeat(20000)).toBeGreaterThan(coreHeat(4000));
    expect(rhythm(7)).toEqual(rhythm(7));
    expect(rhythm(7).boilMs).not.toBe(rhythm(8).boilMs);
  });
});
