import { describe, expect, it } from "vitest";

import { ONECARD_DECK, type OnecardCard, type Suit } from "./cards";
import { createMatch, legalActions, type StepResult, step } from "./match";
import { type OnecardRules, STANDARD_ONECARD_RULES } from "./rules";
import { createOnecardScenario } from "./scenario";
import type { Action, GameEvent, OnecardState } from "./state";

function ok(result: StepResult): OnecardState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

function okEvents(result: StepResult): [OnecardState, GameEvent[]] {
  if (!result.ok) throw new Error(result.error);
  return [result.state, result.events];
}

function play(
  state: OnecardState,
  seat: number,
  card: OnecardCard,
  suit?: Suit,
): OnecardState {
  return ok(
    step(state, seat, { type: "play", card, ...(suit ? { suit } : {}) }),
  );
}

function draw(state: OnecardState, seat: number): OnecardState {
  return ok(step(state, seat, { type: "draw" }));
}

const FILLER: OnecardCard[] = ["C3", "C4", "C5", "C6", "C8", "C9", "C10"];

describe("판 시작", () => {
  it("먼저 내는 자리부터 한 장씩 돌려 7장씩 주고 한 장을 편다", () => {
    const deck = [...ONECARD_DECK].reverse();
    const { state, events } = createMatch(STANDARD_ONECARD_RULES, {
      deck,
      first: 2,
    });
    expect(state.hands.map((h) => h.length)).toEqual([7, 7, 7, 7]);
    // 자리 2가 첫 장을 받는다
    expect(state.hands[2]?.[0]).toBe(deck[0]);
    expect(state.hands[3]?.[0]).toBe(deck[1]);
    expect(state.turn).toBe(2);
    expect(state.pile).toHaveLength(1);
    expect(state.deck).toHaveLength(54 - 28 - 1);
    expect(events.at(-1)).toMatchObject({ type: "dealt", first: 2 });
  });

  it("처음 손패 5장 옵션", () => {
    const { state } = createMatch(
      { ...STANDARD_ONECARD_RULES, players: 3, handSize: 5 },
      { deck: ONECARD_DECK },
    );
    expect(state.hands.map((h) => h.length)).toEqual([5, 5, 5]);
  });

  it("첫 카드가 특수 카드면 더미 밑으로 보내고 다시 편다", () => {
    const rules = {
      ...STANDARD_ONECARD_RULES,
      players: 2,
      handSize: 5 as const,
    };
    const hands = ONECARD_DECK.slice(13, 23);
    const deck = [...hands, "H2", "S7", "JC", "H5", "C9"] as OnecardCard[];
    const { state, events } = createMatch(rules, { deck });
    expect(state.pile).toEqual(["H5"]);
    expect(state.suit).toBe("H");
    expect(state.deck).toEqual(["C9", "H2", "S7", "JC"]);
    expect(events.filter((e) => e.type === "flipAgain")).toHaveLength(3);
  });

  it.each([
    [{ ...STANDARD_ONECARD_RULES, players: 1 }, ONECARD_DECK],
    [{ ...STANDARD_ONECARD_RULES, players: 6 }, ONECARD_DECK],
    [STANDARD_ONECARD_RULES, ["H2", "H2", ...ONECARD_DECK.slice(2)]],
    [STANDARD_ONECARD_RULES, ONECARD_DECK.slice(0, 28)],
  ] as [OnecardRules, OnecardCard[]][])("받지 않는 시작 %#", (rules, deck) => {
    expect(() => createMatch(rules, { deck })).toThrow();
  });
});

describe("기본 내기·먹기", () => {
  const base = () =>
    createOnecardScenario({
      hands: [
        ["H9", "S5", "C3"],
        ["H3", "D4", "C4"],
        ["D5", "D6", "C5"],
        ["D7", "D8", "C6"],
      ],
      pile: ["H5"],
    });

  it("같은 무늬나 같은 숫자를 내면 다음 자리 차례", () => {
    let s = play(base(), 0, "S5");
    expect(s.pile.at(-1)).toBe("S5");
    expect(s.suit).toBe("S");
    expect(s.turn).toBe(1);
    expect(s.hands[0]).toEqual(["S5", "H9", "C3"].filter((c) => c !== "S5"));
    expect(step(s, 1, { type: "play", card: "D4" }).ok).toBe(false);
    s = draw(s, 1);
    expect(s.hands[1]).toHaveLength(4);
    expect(s.turn).toBe(2);
  });

  it("맞지 않는 카드·남의 차례·손에 없는 카드는 받지 않는다", () => {
    const s = base();
    expect(step(s, 0, { type: "play", card: "C3" }).ok).toBe(false);
    expect(step(s, 1, { type: "play", card: "H3" }).ok).toBe(false);
    expect(step(s, 0, { type: "play", card: "H4" }).ok).toBe(false);
    expect(step(s, 9, { type: "draw" }).ok).toBe(false);
  });

  it("낼 카드가 있어도 먹을 수 있고, 먹으면 차례가 끝난다", () => {
    const s = draw(base(), 0);
    expect(s.hands[0]).toHaveLength(4);
    expect(s.turn).toBe(1);
  });

  it("할 수 있는 행동: 낼 수 있는 카드와 먹기", () => {
    expect(legalActions(base(), 0)).toEqual([
      { type: "play", card: "S5" },
      { type: "play", card: "H9" },
      { type: "draw" },
    ]);
    expect(legalActions(base(), 1)).toEqual([]);
  });
});

describe("특수 카드", () => {
  const four = (hand0: OnecardCard[], top: OnecardCard = "H5") =>
    createOnecardScenario({
      hands: [hand0, ["D3", "D4"], ["S3", "S4"], ["C3", "C4"]],
      pile: [top],
    });

  it("7: 무늬를 골라야 하고, 고른 무늬를 따른다", () => {
    const s0 = four(["H7", "S9", "S8"]);
    expect(step(s0, 0, { type: "play", card: "H7" }).ok).toBe(false);
    expect(step(s0, 0, { type: "play", card: "S9", suit: "D" }).ok).toBe(false);
    const s = play(s0, 0, "H7", "D");
    expect(s.suit).toBe("D");
    expect(s.turn).toBe(1);
    expect(legalActions(s, 1)).toEqual([
      { type: "play", card: "D3" },
      { type: "play", card: "D4" },
      { type: "draw" },
    ]);
    // 7은 무늬마다 고르는 행동이 따로 있다
    expect(
      legalActions(s0, 0).filter((a) => a.type === "play" && a.card === "H7"),
    ).toHaveLength(4);
  });

  it("J: 다음 사람을 건너뛴다", () => {
    expect(play(four(["HJ", "S9"]), 0, "HJ").turn).toBe(2);
  });

  it("Q: 방향을 바꾼다", () => {
    const s = play(four(["HQ", "S9"]), 0, "HQ");
    expect(s.direction).toBe(-1);
    expect(s.turn).toBe(3);
    expect(draw(s, 3).turn).toBe(2);
  });

  it("K: 한 번 더 낸다", () => {
    const s = play(four(["HK", "S9", "SK"]), 0, "HK");
    expect(s.turn).toBe(0);
    expect(play(s, 0, "SK").turn).toBe(0);
  });

  describe("둘이 할 때", () => {
    const two = (hand0: OnecardCard[]) =>
      createOnecardScenario({
        hands: [hand0, ["D3", "D4"]],
        pile: ["H5"],
      });
    it("Q는 K처럼 한 번 더", () => {
      const s = play(two(["HQ", "S9"]), 0, "HQ");
      expect(s.turn).toBe(0);
      expect(s.direction).toBe(1);
    });
    it("J도 건너뛰면 다시 내 차례", () => {
      expect(play(two(["HJ", "S9"]), 0, "HJ").turn).toBe(0);
    });
  });

  it("다 낸 사람과 파산한 사람은 차례에서 건너뛴다", () => {
    const s = createOnecardScenario({
      hands: [["HJ", "S9"], ["D3"], ["S3"], ["C3"]],
      pile: ["H5"],
    });
    const t = {
      ...s,
      finished: [1],
      hands: s.hands.map((h, i) => (i === 1 ? [] : h)),
    };
    // 1은 빠졌으니 J는 2를 건너뛰고 3에게
    expect(play(t, 0, "HJ").turn).toBe(3);
  });
});

describe("공격", () => {
  const attackTable = () =>
    createOnecardScenario({
      hands: [
        ["H2", "S9", "S8"],
        ["HA", "D4", "D3"],
        ["S6", "D6", "C6"],
        ["H6", "JK", "C7"],
      ],
      pile: ["H5"],
      deck: [...FILLER, "D10", "DJ", "DQ", "DK", "SQ", "SJ"],
    });

  it("공격은 쌓이고, 못 막으면 쌓인 만큼 먹고 차례가 끝난다", () => {
    let s = play(attackTable(), 0, "H2");
    expect(s.attack).toBe(2);
    // 같은 무늬 A로 받아친다
    s = play(s, 1, "HA");
    expect(s.attack).toBe(5);
    expect(legalActions(s, 2)).toEqual([{ type: "draw" }]);
    const [after, events] = okEvents(step(s, 2, { type: "draw" }));
    expect(after.hands[2]).toHaveLength(8);
    expect(after.attack).toBe(0);
    expect(after.turn).toBe(3);
    expect(events).toContainEqual({
      type: "drew",
      seat: 2,
      count: 5,
      reason: "attack",
    });
    // 먹은 뒤에는 공격 카드 위에 평소처럼 낸다(무늬 H 또는 A)
    expect(after.suit).toBe("H");
    expect(legalActions(after, 3)).toContainEqual({ type: "play", card: "H6" });
  });

  it("조커 공격은 조커로만 막고, 먹은 뒤에는 아무 카드나 낸다", () => {
    let s = createOnecardScenario({
      hands: [
        ["JK", "S9"],
        ["SA", "S2", "JC", "D3"],
        ["C9", "D9"],
      ],
      pile: ["H5"],
    });
    s = play(s, 0, "JK");
    expect(s.attack).toBe(5);
    expect(s.suit).toBeNull();
    expect(legalActions(s, 1)).toEqual([
      { type: "play", card: "JC" },
      { type: "draw" },
    ]);
    s = play(s, 1, "JC");
    expect(s.attack).toBe(12);
    s = draw(s, 2);
    expect(s.hands[2]).toHaveLength(14);
    expect(s.turn).toBe(0);
    expect(legalActions(s, 0)).toContainEqual({ type: "play", card: "S9" });
  });

  it("♠A는 5장, 그 위 다른 A로 받아친다", () => {
    let s = createOnecardScenario({
      hands: [
        ["SA", "S9"],
        ["DA", "D3"],
        ["C9", "D9"],
      ],
      pile: ["S5"],
    });
    s = play(s, 0, "SA");
    expect(s.attack).toBe(5);
    s = play(s, 1, "DA");
    expect(s.attack).toBe(8);
  });

  it("흑백 조커는 흑색 뒤에만(색 제한 옵션)", () => {
    const s = createOnecardScenario({
      rules: { jokerColor: true },
      hands: [
        ["JK", "JC", "H9"],
        ["D3", "D4"],
      ],
      pile: ["H5"],
    });
    expect(legalActions(s, 0)).toEqual([
      { type: "play", card: "H9" },
      { type: "play", card: "JC" },
      { type: "draw" },
    ]);
  });
});

describe("마지막 카드·순위·파산", () => {
  it("공격 카드 한 장으로는 끝낼 수 없다(기본)", () => {
    const s = createOnecardScenario({
      hands: [["H2"], ["D3", "D4"]],
      pile: ["H5"],
    });
    expect(legalActions(s, 0)).toEqual([{ type: "draw" }]);
    expect(step(s, 0, { type: "play", card: "H2" }).ok).toBe(false);
  });

  it("다 내면 순위가 매겨지고 남은 사람끼리 계속, 한 사람 남으면 판 끝", () => {
    let s = createOnecardScenario({
      hands: [["H9", "H8"], ["H3"], ["H4", "H6", "H10"]],
      pile: ["H5"],
      turn: 1,
    });
    const [s1, events] = okEvents(step(s, 1, { type: "play", card: "H3" }));
    expect(events).toContainEqual({ type: "finished", seat: 1, place: 1 });
    expect(s1.phase).toBe("play");
    expect(s1.turn).toBe(2);
    s = play(s1, 2, "H4");
    s = play(s, 0, "H9");
    s = play(s, 2, "H6");
    expect(s.turn).toBe(0);
    const [end, endEvents] = okEvents(step(s, 0, { type: "draw" }));
    expect(end.phase).toBe("play");
    const last = play(end, 2, "H10");
    expect(last.phase).toBe("over");
    expect(last.result).toEqual({
      ranks: [3, 1, 2],
      scores: [2, 0, 0],
      order: [1, 2, 0],
      hands: [expect.any(Array), [], []],
    });
    expect(endEvents.some((e) => e.type === "ended")).toBe(false);
  });

  it("한 명 나면 판 끝(옵션): 나머지는 손패 장 수로 순위", () => {
    const s = createOnecardScenario({
      rules: { endOnFirst: true },
      hands: [["H9"], ["D3", "D4", "D5"], ["S3", "S4"], ["C3", "C4"]],
      pile: ["H5"],
    });
    const end = play(s, 0, "H9");
    expect(end.phase).toBe("over");
    expect(end.result?.ranks).toEqual([1, 4, 2, 2]);
    expect(end.result?.scores).toEqual([0, 3, 2, 2]);
  });

  it("손패가 20장 이상이 되면 파산: 패는 버린 더미 밑으로, 남은 사람끼리 계속", () => {
    const big = ONECARD_DECK.filter((c) => c.startsWith("C")).slice(0, 13);
    const big2 = ONECARD_DECK.filter((c) => c.startsWith("S")).slice(0, 5);
    const s = createOnecardScenario({
      hands: [
        ["HA", "H9"],
        [...big, ...big2],
        ["D3", "D4"],
      ],
      pile: ["H5"],
    });
    expect(s.hands[1]).toHaveLength(18);
    let t = play(s, 0, "HA");
    const [after, events] = okEvents(step(t, 1, { type: "draw" }));
    expect(events).toContainEqual({ type: "bankrupt", seat: 1 });
    expect(after.bankrupt).toEqual([1]);
    expect(after.hands[1]).toEqual([]);
    expect(after.bankruptCounts[1]).toBe(21);
    expect(after.pile).toHaveLength(23);
    expect(after.pile.at(-1)).toBe("HA");
    expect(after.turn).toBe(2);
    expect(after.phase).toBe("play");
    t = draw(after, 2);
    expect(t.turn).toBe(0);
  });

  it("파산 옵션을 끄면 많이 들어도 계속", () => {
    const big = ONECARD_DECK.filter((c) => c.startsWith("C"));
    const s = createOnecardScenario({
      rules: { bankruptAt: 0 },
      hands: [["HA", "H9"], [...big, "S3", "S4", "S5", "S6", "S8"], ["D3"]],
      pile: ["H5"],
    });
    const after = draw(play(s, 0, "HA"), 1);
    expect(after.bankrupt).toEqual([]);
    expect(after.hands[1]).toHaveLength(21);
  });

  it("둘 중 하나가 파산하면 판 끝: 남은 사람이 앞, 파산한 사람이 뒤", () => {
    const big = ONECARD_DECK.filter((c) => c.startsWith("C")).slice(0, 13);
    const s = createOnecardScenario({
      hands: [
        ["HA", "H9"],
        [...big, "S3", "S4", "S5", "S6", "S8"],
      ],
      pile: ["H5"],
    });
    const end = draw(play(s, 0, "HA"), 1);
    expect(end.phase).toBe("over");
    expect(end.result?.order).toEqual([0, 1]);
    expect(end.result?.ranks).toEqual([1, 2]);
    expect(end.result?.scores).toEqual([1, 21]);
  });
});

describe("기타", () => {
  it("끝난 판·없는 자리·모르는 행동은 받지 않는다", () => {
    const s = createOnecardScenario({
      hands: [["H9"], ["D3", "D4"]],
      pile: ["H5"],
    });
    const end = play(s, 0, "H9");
    expect(step(end, 1, { type: "draw" }).ok).toBe(false);
    expect(step(s, -1, { type: "draw" }).ok).toBe(false);
    expect(step(s, 0, { type: "nope" } as unknown as Action).ok).toBe(false);
  });

  it("그만두기: 지금 손패로 순위를 매기고 끝낸다", () => {
    const s = createOnecardScenario({
      hands: [["H9", "H8"], ["D3"]],
      pile: ["H5"],
    });
    const [end, events] = okEvents(step(s, 1, { type: "retire" }));
    expect(end.phase).toBe("over");
    expect(end.retired).toBe(true);
    expect(end.result?.ranks).toEqual([2, 1]);
    expect(events[0]).toMatchObject({ type: "ended", retired: true });
  });
});
