import { ManualClock } from "@game/fair-play";
import {
  type Action,
  createOnecardScenario,
  type GameEvent,
  legalActions,
  type OnecardScenarioOptions,
  type OnecardState,
  type OnecardView,
  STANDARD_ONECARD_RULES,
} from "@game/onecard-engine";
import { describe, expect, it } from "vitest";

import type { KitBot } from "@/game/kit";
import { LocalMatch } from "@/game/local-match";

import { createOnecardBot, toKitBot } from "./bots";
import { onecardKit } from "./kit";

/** 외치지 않고 낼 수 있는 첫 카드를 내는 컴퓨터(외침·잡기 시험에서 컴퓨터가 끼어들지 않게) */
const quietBot: KitBot<OnecardView, Action> = {
  name: "quiet",
  decide: (view) =>
    view.moves.find((a) => a.type === "play") ?? { type: "draw" },
};

function scenario(
  options: OnecardScenarioOptions,
  bot: KitBot<OnecardView, Action, GameEvent> = quietBot,
) {
  const clock = new ManualClock();
  const initialState = createOnecardScenario(options);
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

/** 나: ♠3·◆9, 컴퓨터: 클로버만(♠를 못 따라 먹는다). 맨 위 ♠5 */
const ONE_LEFT: OnecardScenarioOptions = {
  hands: [
    ["S3", "D9"],
    ["C8", "C9", "C10", "CJ"],
  ],
  pile: ["S5"],
};

describe("원카드 대국 진행(LocalMatch + onecardKit)", () => {
  it("외치지 않고 한 장이 되면 본인 시간 P 뒤 잡기 창 T로, T 뒤 닫힌다(시간 끝은 대국 기기가 넣는다)", () => {
    const { clock, match, state } = scenario(ONE_LEFT);
    expect(match.submit({ type: "play", card: "S3" }).ok).toBe(true);
    // 컴퓨터는 클로버뿐이라 먹고 차례를 넘긴다(같은 걸음 안에서 바로).
    expect(state().windows.map((w) => w.kind)).toEqual(["self"]);
    clock.advance(STANDARD_ONECARD_RULES.selfWindowMs - 1);
    expect(state().windows.map((w) => w.kind)).toEqual(["self"]);
    clock.advance(1);
    expect(state().windows.map((w) => w.kind)).toEqual(["catch"]);
    clock.advance(STANDARD_ONECARD_RULES.catchWindowMs);
    expect(state().windows).toEqual([]);
    const timeouts = match
      .actionLog()
      .filter((e) => e.action.type === "timeout")
      .map((e) => (e.action as { kind: string }).kind);
    expect(timeouts).toEqual(["selfWindow", "catchWindow"]);
  });

  it("본인 시간 안에 더미를 치면(그 판 번호) 안전하고 창이 닫힌다", () => {
    const { clock, match, state, events } = scenario(ONE_LEFT);
    match.submit({ type: "play", card: "S3" });
    const seen = match.current().turnNo;
    clock.advance(300);
    expect(match.submit({ type: "shout", seen }).ok).toBe(true);
    expect(state().windows).toEqual([]);
    expect(state().called[0]).toBe(true);
    expect(events.some((e) => e.type === "shouted" && e.seat === 0)).toBe(true);
    expect(events.some((e) => e.type === "falseShout")).toBe(false);
    clock.advance(10_000);
    expect(match.actionLog().some((e) => e.action.type === "timeout")).toBe(
      false,
    );
  });

  it("두 장일 때 내 차례에 미리 치면 낸 뒤 창이 열리지 않는다", () => {
    const { match, state } = scenario(ONE_LEFT);
    expect(
      match.submit({ type: "shout", seen: match.current().turnNo }).ok,
    ).toBe(true);
    match.submit({ type: "play", card: "S3" });
    expect(state().windows).toEqual([]);
    expect(state().called[0]).toBe(true);
  });

  it("잡을 사람이 없는데 치면 헛외침으로 한 장 먹는다", () => {
    const { match, events } = scenario({
      hands: [
        ["S3", "D9", "D10"],
        ["C8", "C9", "C10"],
      ],
      pile: ["S5"],
      turn: 1,
    });
    expect(match.current().hand).toHaveLength(3);
    match.submit({ type: "shout", seen: match.current().turnNo });
    expect(events.some((e) => e.type === "falseShout" && e.seat === 0)).toBe(
      true,
    );
    expect(match.current().hand).toHaveLength(4);
  });

  it("더미가 바닥나면 대국 기기가 씨앗으로 다시 섞어 넣고(기록에 남는다) 이어서 먹는다", () => {
    const { match, state, events } = scenario({
      hands: [
        ["C3", "C4"],
        ["D3", "D4", "D5"],
      ],
      pile: ["S5", "S6", "S7", "S8"],
      deck: [],
    });
    expect(match.submit({ type: "draw" }).ok).toBe(true);
    expect(events.some((e) => e.type === "reshuffled")).toBe(true);
    expect(match.actionLog().some((e) => e.action.type === "reshuffle")).toBe(
      true,
    );
    expect(state().hands[0]).toHaveLength(3);
    expect(state().phase).toBe("play");
  });

  it("컴퓨터는 외치지 않은 한 장짜리를 계획한 시간에 잡는다", () => {
    const catcher = toKitBot(
      createOnecardBot({
        preCall: 1,
        selfCall: 1,
        catchChance: 1,
        catchDelay: [500, 500],
      }),
    );
    const { clock, match, events, state } = scenario(ONE_LEFT, catcher);
    match.submit({ type: "play", card: "S3" });
    // 본인 시간 안에는 잡지 않는다.
    clock.advance(STANDARD_ONECARD_RULES.selfWindowMs - 1);
    expect(events.some((e) => e.type === "caught")).toBe(false);
    clock.advance(501);
    expect(
      events.some((e) => e.type === "caught" && e.seat === 1 && e.target === 0),
    ).toBe(true);
    expect(state().hands[0]).toHaveLength(2);
    expect(events.some((e) => e.type === "falseShout")).toBe(false);
  });

  it("컴퓨터는 남이 외친 것을 들으면 잡지 않는다", () => {
    const catcher = toKitBot(
      createOnecardBot({
        preCall: 1,
        selfCall: 1,
        catchChance: 1,
        catchDelay: [500, 500],
      }),
    );
    const { clock, match, events } = scenario(ONE_LEFT, catcher);
    match.submit({ type: "shout", seen: match.current().turnNo });
    match.submit({ type: "play", card: "S3" });
    clock.advance(10_000);
    expect(events.some((e) => e.type === "caught")).toBe(false);
    expect(events.some((e) => e.type === "falseShout")).toBe(false);
  });

  it("씨앗 판을 사람이 낼 수 있는 첫 수로 두면 끝까지 간다(컴퓨터 외침·창 시계 포함)", () => {
    const clock = new ManualClock();
    const rules = {
      ...STANDARD_ONECARD_RULES,
      players: 3,
      handSize: 5 as const,
    };
    const match = new LocalMatch({
      kit: onecardKit,
      rules,
      seed: 11,
      humanSeat: 0,
      bot: toKitBot(createOnecardBot()),
      clock,
    });
    for (let i = 0; i < 2000 && match.current().phase !== "over"; i++) {
      const view = match.current();
      if (view.phase === "play" && view.turn === 0) {
        const state = JSON.parse(match.serialize()) as OnecardState;
        const action = legalActions(state, 0)[0] as Action;
        expect(match.submit(action).ok).toBe(true);
      }
      clock.advance(250);
    }
    const view = match.current();
    expect(view.phase).toBe("over");
    expect(view.result?.order).toHaveLength(3);
    // 저장한 기록으로 다시 만들 수 있다(이어하기·복기).
    const saved = match.save();
    const replayed = onecardKit.replay(saved.rules, saved.seed, saved.log);
    expect(replayed.ok).toBe(true);
  });
});

describe("임시 컴퓨터", () => {
  it("차례 수는 늘 낼 수 있는 수 가운데서 고르고, 7은 무늬를 붙인다", () => {
    const bot = createOnecardBot();
    const state = createOnecardScenario({
      hands: [
        ["S7", "H9"],
        ["C3", "C4"],
      ],
      pile: ["S5"],
    });
    const view = onecardKit.viewOf(state, 0);
    const action = bot.chooseAction(view, { seed: 1 });
    expect(action.type).toBe("play");
    if (action.type === "play" && action.card === "S7")
      expect(action.suit).toBeDefined();
    expect(onecardKit.step(state, 0, action).ok).toBe(true);
  });

  it("내 차례에 두 장이고 낼 카드가 있으면 미리 외칠 계획을 한 번만 세운다", () => {
    const bot = createOnecardBot({
      preCall: 1,
      selfCall: 0,
      catchChance: 0,
      catchDelay: [0, 0],
    });
    const state = createOnecardScenario({
      hands: [
        ["S3", "H9"],
        ["C3", "C4"],
      ],
      pile: ["S5"],
    });
    const view = onecardKit.viewOf(state, 0);
    bot.hear?.([], view);
    expect(bot.planShout(view, { seed: 1 })).not.toBeNull();
    expect(bot.planShout(view, { seed: 1 })).toBeNull();
  });
});
