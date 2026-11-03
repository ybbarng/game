import { fullDeck } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";

import {
  isAttackCard,
  isOnecardCard,
  isSpecialCard,
  ONECARD_DECK,
  type OnecardCard,
  rankOf,
  shuffledOnecardDeck,
  sortOnecards,
  suitOf,
} from "./cards";
import {
  attackValue,
  decodeOnecardRules,
  encodeOnecardRules,
  type OnecardRules,
  STANDARD_ONECARD_RULES,
} from "./rules";

describe("카드·덱", () => {
  it("54장이고 흑백 조커 JK, 컬러 조커 JC가 끝에 있다", () => {
    expect(ONECARD_DECK).toHaveLength(54);
    expect(new Set(ONECARD_DECK).size).toBe(54);
    expect(ONECARD_DECK.slice(-2)).toEqual(["JK", "JC"]);
  });

  it("마이티 덱의 카드 표기와 같다(조커 JK 포함)", () => {
    for (const card of fullDeck()) expect(isOnecardCard(card)).toBe(true);
    expect(isOnecardCard("JC")).toBe(true);
    expect(isOnecardCard("X1")).toBe(false);
  });

  it.each([
    ["SA", "S", "A", true, true],
    ["D10", "D", "10", false, false],
    ["H2", "H", "2", true, true],
    ["C7", "C", "7", false, true],
    ["SJ", "S", "J", false, true],
    ["DQ", "D", "Q", false, true],
    ["HK", "H", "K", false, true],
    ["JK", null, null, true, true],
    ["JC", null, null, true, true],
  ] as const)(
    "%s: 무늬 %s, 숫자 %s, 공격 %s, 특수 %s",
    (card, suit, rank, attack, special) => {
      expect(suitOf(card)).toBe(suit);
      expect(rankOf(card)).toBe(rank);
      expect(isAttackCard(card)).toBe(attack);
      expect(isSpecialCard(card)).toBe(special);
    },
  );

  it("씨앗이 같으면 같은 순서, 다르면 다른 순서로 섞는다", () => {
    expect(shuffledOnecardDeck(7)).toEqual(shuffledOnecardDeck(7));
    expect(shuffledOnecardDeck(7)).not.toEqual(shuffledOnecardDeck(8));
    expect(sortOnecards(shuffledOnecardDeck(7))).toEqual(ONECARD_DECK);
  });
});

describe("공격 장 수", () => {
  it.each([
    ["S2", 2],
    ["HA", 3],
    ["SA", 5],
    ["JK", 5],
    ["JC", 7],
    ["H7", 0],
  ] as [OnecardCard, number][])("%s → %i장", (card, n) => {
    expect(attackValue(card, STANDARD_ONECARD_RULES)).toBe(n);
  });

  it("옵션으로 장 수를 바꾼다", () => {
    const rules = {
      ...STANDARD_ONECARD_RULES,
      attack: { two: 2, ace: 3, spadeAce: 10, blackJoker: 10, colorJoker: 13 },
    };
    expect(attackValue("SA", rules)).toBe(10);
    expect(attackValue("JC", rules)).toBe(13);
  });
});

describe("규칙 문자열", () => {
  it("기본 규칙", () => {
    expect(encodeOnecardRules(STANDARD_ONECARD_RULES)).toBe(
      "o1-p4h7a2.3.5.5.7fab20e0c1x1w1000t3000r0j0",
    );
  });

  it("바꾼 규칙도 그대로 돌아온다", () => {
    const rules: OnecardRules = {
      players: 2,
      handSize: 5,
      attack: { two: 3, ace: 4, spadeAce: 10, blackJoker: 10, colorJoker: 15 },
      jokerColor: true,
      finish: "special",
      bankruptAt: 0,
      endOnFirst: true,
      catchPenalty: 2,
      falseShoutPenalty: 0,
      selfWindowMs: 0,
      catchWindowMs: 5000,
      shoutReward: true,
      shoutBoth: false,
    };
    expect(encodeOnecardRules(rules).endsWith("s0")).toBe(true);
    const decoded = decodeOnecardRules(encodeOnecardRules(rules));
    expect(decoded).toEqual({ ok: true, rules });
    expect(
      decodeOnecardRules(encodeOnecardRules(STANDARD_ONECARD_RULES)),
    ).toEqual({ ok: true, rules: STANDARD_ONECARD_RULES });
  });

  it.each([
    "",
    "o1-p6h7a2.3.5.5.7fab20e0c1x1w1000t3000r0j0",
    "o1-p4h6a2.3.5.5.7fab20e0c1x1w1000t3000r0j0",
    "o1-p4h7a2.3.5.5.0fab20e0c1x1w1000t3000r0j0",
    "o1-p4h7a2.3.5.5.7fab21e0c1x1w1000t3000r0j0",
    "o1-p4h7a2.3.5.5.7fab20e0c1x1w1500t3000r0j0",
  ])("틀린 문자열 %j는 받지 않는다", (text) => {
    expect(decodeOnecardRules(text).ok).toBe(false);
  });
});
