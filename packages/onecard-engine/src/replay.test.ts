import {
  createRng,
  nextFloat,
  nextInt,
  type RngState,
} from "@game/mighty-engine";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  ONECARD_DECK,
  type OnecardCard,
  shuffledOnecardDeck,
  shuffleOnecards,
} from "./cards";
import {
  activeSeats,
  createMatch,
  legalActions,
  type OnecardSetup,
  replay,
  seededReshuffle,
  shoutWindows,
  step,
  viewOf,
} from "./match";
import {
  O1_ONECARD_RULES,
  type OnecardRules,
  STANDARD_ONECARD_RULES,
} from "./rules";
import type { Action, LoggedAction, OnecardState } from "./state";

function totalCards(state: OnecardState): number {
  return (
    state.deck.length +
    state.pile.length +
    state.hands.reduce((sum, h) => sum + h.length, 0)
  );
}

/** 씨앗 난수로 판을 둔다: 대개 낼 카드를 내고, 가끔 아무나 외치고, 창 시간을 끝내고, 바닥나면 다시 섞는다 */
function drive(
  rules: OnecardRules,
  setup: OnecardSetup,
  rng: RngState,
  maxSteps: number,
): { state: OnecardState; log: LoggedAction[] } {
  let { state } = createMatch(rules, setup);
  const cards = totalCards(state);
  const log: LoggedAction[] = [];
  for (let i = 0; i < maxSteps && state.phase !== "over"; i++) {
    const r = nextFloat(rng);
    const windows = shoutWindows(state);
    let seat = 0;
    let action: Action;
    if (r < 0.12) {
      const active = activeSeats(state);
      seat = active[nextInt(rng, active.length)] as number;
      action = {
        type: "shout",
        seen: Math.max(0, state.turnNo - nextInt(rng, 2)),
        ...(rules.race ? { rt: nextInt(rng, 800) } : {}),
      };
    } else if ((state.racePending?.length ?? 0) > 0 && r < 0.2) {
      action = { type: "raceEnd" };
    } else if (windows.length > 0 && r < 0.3) {
      const w = windows[0] as (typeof windows)[number];
      action = { type: "timeout", kind: w.kind, target: w.seat };
    } else if (state.phase === "reshuffle") {
      action = seededReshuffle(state, nextInt(rng, 2 ** 30)) as Action;
    } else {
      seat = state.turn;
      const moves = legalActions(state, seat);
      const plays = moves.filter((m) => m.type === "play");
      action =
        plays.length > 0 && nextFloat(rng) < 0.85
          ? (plays[nextInt(rng, plays.length)] as Action)
          : { type: "draw" };
    }
    const result = step(state, seat, action);
    if (!result.ok)
      throw new Error(`${i}번째 ${JSON.stringify(action)}: ${result.error}`);
    state = result.state;
    log.push({ seat, action });
    expect(totalCards(state)).toBe(cards);
  }
  return { state, log };
}

const SHORT_DECK: OnecardCard[] = ONECARD_DECK.filter(
  (c) => c.startsWith("S") || c.startsWith("H") || c === "JK" || c === "JC",
);

describe("다시 하기(replay)", () => {
  it("짧은 덱으로 판을 끝까지 두고, 기록으로 다시 하면 같은 상태가 나온다", () => {
    const rules: OnecardRules = {
      ...O1_ONECARD_RULES,
      players: 3,
      handSize: 5,
    };
    const setup = { deck: shuffleOnecards(SHORT_DECK, 11), first: 1 };
    const { state, log } = drive(rules, setup, createRng(5), 3000);
    expect(state.phase).toBe("over");
    expect(state.result?.order).toHaveLength(3);
    expect(log.some((e) => e.action.type === "reshuffle")).toBe(true);
    const again = replay(rules, setup, log);
    expect(again).toEqual({ ok: true, state });
  });

  it("틀린 기록은 몇 번째에서 틀렸는지 알려 준다", () => {
    const setup = { deck: shuffledOnecardDeck(3) };
    const result = replay(O1_ONECARD_RULES, setup, [
      { seat: 1, action: { type: "draw" } },
    ]);
    expect(result).toEqual({ ok: false, index: 0, error: "차례가 아니다" });
  });

  it("무작위 판 여러 개: 카드 수가 늘 같고, 다시 하면 같다(씨앗 고정)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 30 }),
        fc.integer({ min: 2, max: 5 }),
        fc.constantFrom<OnecardRules["handSize"]>(5, 7),
        (seed, players, handSize) => {
          const rules = {
            ...O1_ONECARD_RULES,
            players,
            handSize,
            selfWindowMs: 0 as const,
          };
          const setup = { deck: shuffledOnecardDeck(seed) };
          const { state, log } = drive(rules, setup, createRng(seed), 80);
          expect(replay(rules, setup, log)).toEqual({ ok: true, state });
        },
      ),
      { seed: 20261103, numRuns: 25 },
    );
  });
});

describe("다시 하기(o2 겨루기)", () => {
  it("무작위 판 여러 개: 모으기·겨루기가 섞여도 카드 수가 같고, 다시 하면 같다(결정적)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 30 }),
        fc.integer({ min: 2, max: 5 }),
        (seed, players) => {
          const rules = { ...STANDARD_ONECARD_RULES, players };
          const setup = { deck: shuffledOnecardDeck(seed) };
          const { state, log } = drive(rules, setup, createRng(seed), 80);
          expect(replay(rules, setup, log)).toEqual({ ok: true, state });
        },
      ),
      { seed: 20261104, numRuns: 25 },
    );
  });
});

describe("자리별 화면(viewOf)", () => {
  it("남의 손패·더미 순서·외침 상태는 숨기고 장 수만 보인다", () => {
    const { state } = createMatch(O1_ONECARD_RULES, {
      deck: shuffledOnecardDeck(8),
    });
    const s = (() => {
      const r = step(state, 0, { type: "shout", seen: 0 });
      if (!r.ok) throw new Error(r.error);
      return r.state;
    })();
    const view = viewOf(s, 1);
    expect(view.hand).toHaveLength(view.handCounts[1] as number);
    expect(view.handCounts).toEqual(s.hands.map((h) => h.length));
    expect(view.deckCount).toBe(s.deck.length);
    expect(view.version).toBe(s.version);
    expect(view.turnNo).toBe(s.turnNo);
    const text = JSON.stringify(view);
    for (const seat of [0, 2, 3])
      for (const card of s.hands[seat] ?? [])
        expect(text.includes(`"${card}"`)).toBe(false);
    for (const card of s.deck) expect(text.includes(`"${card}"`)).toBe(false);
    for (const key of [
      "hands",
      "deck",
      "windows",
      "called",
      "preCalled",
      "recent",
    ])
      expect(key in view).toBe(false);
    expect(view.moves).toEqual([]);
    expect(viewOf(s, 0).moves).toEqual(legalActions(s, 0));
  });
});
