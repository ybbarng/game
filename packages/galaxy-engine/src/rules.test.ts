import { describe, expect, it } from "vitest";

import {
  decodeGalaxyRules,
  encodeGalaxyRules,
  type GalaxyRules,
  LONG_RULES,
  round10,
  SHORT_RULES,
  STANDARD_RULES,
  turnLimitOf,
} from "./rules";

describe("규칙 문자열", () => {
  it("기본·짧은·긴 판과 시간 꼬리가 왕복한다", () => {
    const cases: [GalaxyRules, string][] = [
      [STANDARD_RULES, "g1-4mtw-seasons"],
      [{ ...SHORT_RULES, players: 2 }, "g1-2snw-seasons"],
      [{ ...LONG_RULES, players: 3, seasonal: false }, "g1-3ltn-seasons"],
      [{ ...STANDARD_RULES, time: "fast" }, "g1-4mtw-seasons-t1"],
    ];
    for (const [rules, text] of cases) {
      expect(encodeGalaxyRules(rules)).toBe(text);
      expect(decodeGalaxyRules(text)).toEqual({ ok: true, rules });
    }
    // 쓰기는 하늘을 가리지 않는다(내가 고른 하늘 문자열 모양)
    expect(
      encodeGalaxyRules({ ...STANDARD_RULES, sky: "custom.Ori.CMa" }),
    ).toBe("g1-4mtw-custom.Ori.CMa");
  });

  it("형식이 틀린 문자열은 받지 않는다", () => {
    for (const text of [
      "g1-5mtw-seasons",
      "g1-4xtw-seasons",
      "g2-4mtw-seasons",
      "g1-4mtw-",
      "g1-4mtw-seasons-t9",
      "y1-2s4b6p",
      // 없는 하늘, 자료는 있지만 아직 열지 않은 하늘
      "g1-4mtw-custom.Ori.CMa",
      "g1-4mtw-nowhere",
      "g1-4mtw-zodiac",
    ])
      expect(decodeGalaxyRules(text).ok).toBe(false);
  });

  it("차례 수 표(2-11)", () => {
    expect(turnLimitOf(STANDARD_RULES)).toBe(20);
    expect(turnLimitOf({ ...STANDARD_RULES, players: 2 })).toBe(36);
    expect(turnLimitOf({ ...SHORT_RULES, players: 3 })).toBe(14);
    expect(turnLimitOf(LONG_RULES)).toBeNull();
  });

  it("천분율 곱을 10 단위로 반올림한다(0.5는 올림)", () => {
    expect(round10(220, 100)).toBe(20);
    expect(round10(220, 150)).toBe(30);
    expect(round10(220, 1300)).toBe(290);
    expect(round10(220, 2400)).toBe(530);
    expect(round10(220, 150, 1500)).toBe(50);
    expect(round10(60, 100)).toBe(10);
    expect(round10(45)).toBe(50);
  });
});
