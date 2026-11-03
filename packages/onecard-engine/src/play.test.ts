import { describe, expect, it } from "vitest";

import type { OnecardCard, Suit } from "./cards";
import {
  canCounter,
  canFollow,
  finishBlocked,
  playProblem,
  type TableFace,
} from "./play";
import { type OnecardRules, STANDARD_ONECARD_RULES } from "./rules";

function face(
  top: OnecardCard,
  suit: Suit | null,
  attack = 0,
  rules: Partial<OnecardRules> = {},
): TableFace {
  return { rules: { ...STANDARD_ONECARD_RULES, ...rules }, top, suit, attack };
}

describe("공격이 없을 때 내기", () => {
  it.each([
    ["H5", "H", "H9", true, "같은 무늬"],
    ["H5", "H", "S5", true, "같은 숫자"],
    ["H5", "H", "S9", false, "무늬도 숫자도 다름"],
    ["H5", "H", "JK", true, "조커는 아무 때나"],
    ["H5", "H", "JC", true, "조커는 아무 때나"],
    ["JK", null, "S9", true, "조커 뒤에는 아무 카드"],
    ["JC", null, "D3", true, "조커 뒤에는 아무 카드"],
    ["S7", "D", "D9", true, "7로 바꾼 무늬"],
    ["S7", "D", "S9", false, "7로 바꾸기 전 무늬는 안 됨"],
    ["S7", "D", "H7", true, "7 위에 7"],
  ] as [OnecardCard, Suit | null, OnecardCard, boolean, string][])(
    "%s(무늬 %s) 위 %s → %s (%s)",
    (top, suit, card, expected) => {
      expect(canFollow(face(top, suit), card)).toBe(expected);
    },
  );

  it.each([
    ["S5", "S", "JK", true],
    ["C5", "C", "JK", true],
    ["H5", "H", "JK", false],
    ["D5", "D", "JC", true],
    ["S5", "S", "JC", false],
    ["JK", null, "JC", true],
  ] as [OnecardCard, Suit | null, OnecardCard, boolean][])(
    "조커 색 제한: %s 위 %s → %s",
    (top, suit, card, expected) => {
      expect(canFollow(face(top, suit, 0, { jokerColor: true }), card)).toBe(
        expected,
      );
    },
  );
});

describe("공격 받아치기", () => {
  it.each([
    ["H2", "H", "S2", true, "2는 아무 2로"],
    ["H2", "H", "HA", true, "2는 같은 무늬 A로"],
    ["H2", "H", "SA", false, "2를 다른 무늬 A로는 못 막음"],
    ["H2", "H", "JK", true, "2는 조커로"],
    ["H2", "H", "H5", false, "같은 무늬라도 공격 카드가 아니면 안 됨"],
    ["HA", "H", "DA", true, "A는 아무 A로"],
    ["HA", "H", "SA", true, "A는 ♠A로"],
    ["SA", "S", "HA", true, "♠A도 A로"],
    ["HA", "H", "H2", false, "A는 2로 못 막음"],
    ["HA", "H", "JC", true, "A는 조커로"],
    ["JK", null, "JC", true, "조커는 조커로"],
    ["JC", null, "SA", false, "조커는 A로 못 막음"],
    ["JK", null, "S2", false, "조커는 2로 못 막음"],
  ] as [OnecardCard, Suit | null, OnecardCard, boolean, string][])(
    "%s 위 %s → %s (%s)",
    (top, suit, card, expected) => {
      expect(canCounter(face(top, suit, 3), card)).toBe(expected);
    },
  );

  it("공격 중에는 7·J·Q·K 같은 특수 카드를 못 낸다", () => {
    const f = face("H2", "H", 2);
    expect(playProblem(f, ["H7", "HK"], "H7")).toMatch(/공격/);
    expect(playProblem(f, ["H7", "HK"], "HK")).toMatch(/공격/);
  });
});

describe("마지막 카드 제한", () => {
  it.each([
    ["attack", "H2", true],
    ["attack", "HA", true],
    ["attack", "JK", true],
    ["attack", "H7", false],
    ["attack", "HK", false],
    ["special", "H7", true],
    ["special", "HJ", true],
    ["special", "HQ", true],
    ["special", "HK", true],
    ["special", "H5", false],
    ["none", "JC", false],
  ] as [OnecardRules["finish"], OnecardCard, boolean][])(
    "%s 규칙에서 %s로 끝내기 막힘 → %s",
    (finish, card, blocked) => {
      expect(finishBlocked({ ...STANDARD_ONECARD_RULES, finish }, card)).toBe(
        blocked,
      );
    },
  );

  it("마지막 한 장이 공격 카드면 낼 수 없고, 두 장일 때는 낼 수 있다", () => {
    const f = face("H5", "H");
    expect(playProblem(f, ["H2"], "H2")).toMatch(/끝낼 수 없다/);
    expect(playProblem(f, ["H2", "S9"], "H2")).toBeNull();
  });

  it("손에 없는 카드", () => {
    expect(playProblem(face("H5", "H"), ["H9"], "H8")).toMatch(/손에 없는/);
  });
});
