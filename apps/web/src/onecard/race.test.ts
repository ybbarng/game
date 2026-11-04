import { ManualClock } from "@game/fair-play";
import { ONECARD_LEVELS } from "@game/onecard-ai";
import {
  type Action,
  createOnecardScenario,
  type GameEvent,
  type OnecardScenarioOptions,
  type OnecardState,
  type OnecardView,
  RACE_GATHER_MS,
} from "@game/onecard-engine";
import { describe, expect, it } from "vitest";

import type { KitBot } from "@/game/kit";
import { LocalMatch } from "@/game/local-match";

import { onecardBotFor, toKitBot } from "./bots";
import { onecardKit } from "./kit";
import { HOLD_MS } from "./shout-press";

/** o2 반응 속도 겨루기를 혼자 하기 진행(LocalMatch)으로(docs/42 17절) */

const quietBot: KitBot<OnecardView, Action> = {
  name: "quiet",
  decide: (view) =>
    view.moves.find((a) => a.type === "play") ?? { type: "draw" },
};

/** 한 장이 된 사람이 있으면 `delayMs` 뒤 rt `rtMs`로 누르는 컴퓨터 */
function catcher(delayMs: number, rtMs: number): KitBot<OnecardView, Action> {
  let done = false;
  return {
    ...quietBot,
    react: (view) => {
      if (done || view.handCounts[0] !== 1) return null;
      done = true;
      return {
        delayMs,
        action: { type: "shout", seen: view.turnNo, rt: rtMs },
      };
    },
  };
}

/** 나: ♠3·◆9, 컴퓨터: 클로버만(♠를 못 따라 먹는다). 맨 위 ♠5 */
const ONE_LEFT: OnecardScenarioOptions = {
  hands: [
    ["S3", "D9"],
    ["C8", "C9", "C10", "CJ"],
  ],
  pile: ["S5"],
};

function scenario(bot: KitBot<OnecardView, Action, GameEvent> = quietBot) {
  const clock = new ManualClock();
  const initialState = createOnecardScenario(ONE_LEFT);
  const match = new LocalMatch({
    kit: onecardKit,
    rules: initialState.rules,
    seed: 1,
    humanSeat: 0,
    bot,
    initialState,
    clock,
  });
  const events: GameEvent[] = [];
  match.subscribe((s) => events.push(...s.events));
  const state = () => JSON.parse(match.serialize()) as OnecardState;
  return { clock, match, events, state };
}

describe("o2 혼자 하기 겨루기", () => {
  it("한 장이 되면 겨루기 창 하나, 아무도 안 누르면 창 길이 뒤 닫힌다", () => {
    const { clock, match, state } = scenario();
    match.submit({ type: "play", card: "S3" });
    expect(state().windows.map((w) => w.kind)).toEqual(["race"]);
    clock.advance(3000);
    expect(state().windows).toEqual([]);
    expect(state().hands[0]).toHaveLength(1);
  });

  it("사람 누름은 모았다가 모으는 시간 뒤 처리한다: 혼자 누르면 안전", () => {
    const { clock, match, state, events } = scenario();
    match.submit({ type: "play", card: "S3" });
    match.submit({ type: "shout", seen: 1, rt: 320 });
    expect(state().racePending).toHaveLength(1);
    clock.advance(RACE_GATHER_MS - 1);
    expect(state().called[0]).toBe(false);
    clock.advance(1);
    expect(state().called[0]).toBe(true);
    expect(events).toContainEqual({ type: "shouted", seat: 0 });
    expect(match.actionLog().at(-1)?.action).toEqual({ type: "raceEnd" });
  });

  it("내 누름이 먼저 닿아도 컴퓨터 rt가 더 짧으면 잡힌다(도착 순이 아니라 rt 순)", () => {
    const { clock, match, state, events } = scenario(catcher(60, 200));
    match.submit({ type: "play", card: "S3" });
    match.submit({ type: "shout", seen: 1, rt: 300 });
    clock.advance(RACE_GATHER_MS);
    expect(events).toContainEqual({ type: "caught", seat: 1, target: 0 });
    expect(state().hands[0]).toHaveLength(2);
  });

  it("내 rt가 더 짧으면 컴퓨터가 먼저 닿아도 안전", () => {
    const { clock, match, state } = scenario(catcher(0, 400));
    match.submit({ type: "play", card: "S3" });
    clock.advance(100);
    match.submit({ type: "shout", seen: 1, rt: 250 });
    clock.advance(RACE_GATHER_MS);
    expect(state().called[0]).toBe(true);
    expect(state().hands[0]).toHaveLength(1);
  });

  it("컴퓨터 누름은 반응 시간 + 누르고 있기 시간 뒤에 닿는다(사람 누름과 같은 늦음)", () => {
    const clock = new ManualClock();
    const bot = toKitBot(onecardBotFor(2), clock);
    const initialState = createOnecardScenario({
      hands: [
        ["S3", "D9"],
        ["C8", "C9", "C10"],
      ],
      pile: ["S5"],
    });
    const match = new LocalMatch({
      kit: onecardKit,
      rules: initialState.rules,
      seed: 3,
      humanSeat: 0,
      bot,
      initialState,
      clock,
    });
    match.submit({ type: "play", card: "S3" });
    const lo = ONECARD_LEVELS[2]?.shout.raceCatchMs[0] ?? 0;
    clock.advance(lo + HOLD_MS - 1);
    expect(match.actionLog().some((e) => e.action.type === "shout")).toBe(
      false,
    );
    clock.advance(3000);
    const shout = match.actionLog().find((e) => e.action.type === "shout");
    expect(shout?.seat).toBe(1);
    expect(
      (shout?.action as { rt?: number } | undefined)?.rt,
    ).toBeGreaterThanOrEqual(lo);
  });
});
