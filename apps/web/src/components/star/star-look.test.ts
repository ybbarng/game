import { describe, expect, it } from "vitest";
import { coreHeat, deepColor, glowOf, rhythm, sizeOf } from "./star-look";

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

  it("밝은 별일수록 빛무리가 넓고 빛줄기가 길며, 어두운 별은 빛줄기가 없다", () => {
    const sirius = glowOf(-1.46);
    const rigel = glowOf(0.13);
    const dim = glowOf(2.9);
    expect(sirius.halo).toBeGreaterThan(rigel.halo);
    expect(sirius.spike).toBeGreaterThan(rigel.spike);
    expect(rigel.spike).toBeGreaterThan(0);
    expect(dim.spike).toBe(0);
    expect(dim.haloA).toBeLessThan(sirius.haloA);
  });

  it("반짝임 박자는 별마다 달라 한꺼번에 반짝이지 않는다", () => {
    const beats = [1, 2, 3, 5, 9, 10, 11].map((s) => rhythm(s).twinkleMs);
    expect(new Set(beats).size).toBe(beats.length);
    for (const b of beats) {
      expect(b).toBeGreaterThanOrEqual(7000);
      expect(b).toBeLessThanOrEqual(13000);
    }
  });

  it("가운데가 타는 정도는 온도를 따르고, 박자는 같은 씨앗이면 같다", () => {
    expect(coreHeat(20000)).toBeGreaterThan(coreHeat(4000));
    expect(rhythm(7)).toEqual(rhythm(7));
    expect(rhythm(7).boilMs).not.toBe(rhythm(8).boilMs);
  });
});
