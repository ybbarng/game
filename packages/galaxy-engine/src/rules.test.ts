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
      [STANDARD_RULES, "g5-4mtwoq-seasons"],
      [{ ...STANDARD_RULES, moon: false }, "g5-4mtwq-seasons"],
      [{ ...STANDARD_RULES, requests: false }, "g5-4mtwo-seasons"],
      [{ ...STANDARD_RULES, meteor: true }, "g5-4mtwroq-seasons"],
      [{ ...SHORT_RULES, players: 2 }, "g5-2stwoq-seasons"],
      [
        {
          ...SHORT_RULES,
          players: 2,
          trade: false,
          moon: false,
          requests: false,
        },
        "g5-2snw-seasons",
      ],
      [{ ...LONG_RULES, players: 3, seasonal: false }, "g5-3ltnoq-seasons"],
      [
        { ...STANDARD_RULES, meteor: true, time: "fast" },
        "g5-4mtwroq-seasons-t1",
      ],
    ];
    for (const [rules, text] of cases) {
      expect(encodeGalaxyRules(rules)).toBe(text);
      expect(decodeGalaxyRules(text)).toEqual({ ok: true, rules });
    }
    // 쓰기는 하늘을 가리지 않는다(내가 고른 하늘 문자열 모양)
    expect(
      encodeGalaxyRules({ ...STANDARD_RULES, sky: "custom.Ori.CMa" }),
    ).toBe("g5-4mtwoq-custom.Ori.CMa");
  });

  it("형식이 틀린 문자열은 받지 않는다", () => {
    for (const text of [
      "g5-5mtw-seasons",
      "g5-4xtw-seasons",
      "g6-4mtwoq-seasons",
      "g5-4mtw-",
      "g5-4mtwrr-seasons",
      "g5-4mtwor-seasons",
      "g5-4mtwqo-seasons",
      "g5-4mtw-seasons-t9",
      "y1-2s4b6p",
      // 없는 하늘, 자료는 있지만 아직 열지 않은 하늘
      "g5-4mtw-custom.Ori.CMa",
      "g5-4mtw-nowhere",
      "g5-4mtw-zodiac",
    ])
      expect(decodeGalaxyRules(text).ok).toBe(false);
  });

  it("차례 수 표(2-11)", () => {
    expect(turnLimitOf(STANDARD_RULES)).toBe(20);
    expect(turnLimitOf({ ...STANDARD_RULES, players: 2 })).toBe(36);
    expect(turnLimitOf(SHORT_RULES)).toBe(12);
    expect(turnLimitOf({ ...SHORT_RULES, players: 3 })).toBe(17);
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

  it("옛 판 번호(g1~g4) 문자열은 옛 규칙 판으로 알아보고 받지 않는다", () => {
    for (const text of [
      "g1-4mtw-seasons",
      "g2-4mtw-seasons",
      "g3-4mtw-seasons",
      "g4-4mtwoq-seasons",
    ]) {
      const result = decodeGalaxyRules(text);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain("옛 규칙");
    }
  });
});
