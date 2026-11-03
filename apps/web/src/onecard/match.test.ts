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

import { onecardBotFor, toKitBot } from "./bots";
import { onecardKit } from "./kit";

/** 외치지 않고 낼 수 있는 첫 카드를 내는 컴퓨터(외침·잡기 시험에서 컴퓨터가 끼어들지 않게) */
const quietBot: KitBot<OnecardView, Action> = {
  name: "quiet",
  decide: (view) =>
    view.moves.find((a) => a.type === "play") ?? { type: "draw" },
};

type MakeBot = (clock: ManualClock) => KitBot<OnecardView, Action, GameEvent>;

function scenario(
  options: OnecardScenarioOptions,
  makeBot: MakeBot = () => quietBot,
  pace?: (clock: ManualClock) => (next: () => void) => void,
) {
  const clock = new ManualClock();
  const initialState = createOnecardScenario(options);
  const match = new LocalMatch({
    kit: onecardKit,
    rules: initialState.rules,
    seed: 1,
    humanSeat: 0,
    bot: makeBot(clock),
    initialState,
    clock,
    ...(pace ? { pace: pace(clock) } : {}),
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

  it("방장 새로고침(resume)으로 이어 가도 열려 있던 창을 다시 재 시간 끝을 넣는다", () => {
    const { match } = scenario(ONE_LEFT);
    match.submit({ type: "play", card: "S3" });
    const clock = new ManualClock();
    const resumed = new LocalMatch({
      kit: onecardKit,
      rules: match.rawState().rules,
      seed: 1,
      humanSeat: 0,
      bot: quietBot,
      clock,
      resume: match.resumeState(),
    });
    match.dispose();
    clock.advance(STANDARD_ONECARD_RULES.selfWindowMs);
    expect(resumed.rawState().windows.map((w) => w.kind)).toEqual(["catch"]);
  });

  it("컴퓨터 반응 난수를 저장·새로고침에 남겨 이어 간 뒤에도 처음부터 다시 쓰지 않는다", () => {
    const { match } = scenario(ONE_LEFT, (c) => toKitBot(onecardBotFor(2), c));
    match.submit({ type: "play", card: "S3" });
    const saved = match.save();
    const resume = match.resumeState();
    const fresh = new LocalMatch({
      kit: onecardKit,
      rules: match.rawState().rules,
      seed: 1,
    }).save();
    // 반응을 물었으니 처음 값과 달라졌고, 그 값이 저장·새로고침 둘 다에 남는다
    expect(saved.reactRng).toBeDefined();
    expect(saved.reactRng).not.toBe(fresh.reactRng);
    expect(resume.reactRng).toBe(saved.reactRng);
    const again = new LocalMatch({
      kit: onecardKit,
      rules: match.rawState().rules,
      seed: 1,
      humanSeat: 0,
      clock: new ManualClock(),
      resume,
    });
    expect(again.save().reactRng).toBe(saved.reactRng);
    const restored = new LocalMatch(
      {
        kit: onecardKit,
        rules: match.rawState().rules,
        seed: 1,
        clock: new ManualClock(),
        ...(saved.reactRng !== undefined ? { reactRng: saved.reactRng } : {}),
      },
      [],
    );
    expect(restored.save().reactRng).toBe(saved.reactRng);
  });

  it("방장 자리 행동을 준비하는 중에 온 청구 묶음(submitHost)도 거절하지 않고 줄 끝에 세워 넣는다", async () => {
    const clock = new ManualClock();
    const initialState = createOnecardScenario(ONE_LEFT);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const match = new LocalMatch({
      kit: onecardKit,
      rules: initialState.rules,
      seed: 1,
      humanSeat: 0,
      bot: quietBot,
      initialState,
      clock,
      prepare: async (_state, _seat, action) => {
        if (action.type === "play") await gate;
        return { ok: true, action };
      },
    });
    const settle = async () => {
      for (let i = 0; i < 20; i++) await Promise.resolve();
    };
    match.submit({ type: "play", card: "S3" });
    const claims: Action = {
      type: "claims",
      batch: 0,
      shouts: [{ seat: 1, seen: 0, id: "a" }],
    };
    // 사람 행동 길(submitAs)은 앞 행동을 준비하는 동안 거절한다. 발표는 그러면 사라지므로 방장 기기 길을 쓴다
    expect(match.submitAs(0, claims).ok).toBe(false);
    match.submitHost(0, claims);
    release();
    await settle();
    expect(
      match
        .actionLog()
        .map((e) => e.action.type)
        .slice(0, 2),
    ).toEqual(["play", "claims"]);
  });

  it("준비 줄(prepare, 멘탈 포커)이 있으면 창 시간 끝도 그 줄을 탄다", async () => {
    const clock = new ManualClock();
    const initialState = createOnecardScenario(ONE_LEFT);
    const prepared: string[] = [];
    const match = new LocalMatch({
      kit: onecardKit,
      rules: initialState.rules,
      seed: 1,
      humanSeat: 0,
      bot: quietBot,
      initialState,
      clock,
      prepare: async (_state, _seat, action) => {
        prepared.push(action.type);
        return { ok: true, action };
      },
    });
    const settle = async () => {
      for (let i = 0; i < 20; i++) await Promise.resolve();
    };
    match.submit({ type: "play", card: "S3" });
    await settle();
    clock.advance(STANDARD_ONECARD_RULES.selfWindowMs);
    await settle();
    expect(prepared).toContain("timeout");
    expect(match.rawState().windows.map((w) => w.kind)).toEqual(["catch"]);
  });

  it("엔진이 창 시간 끝을 거절하면 창 시계를 다시 건다(다음 걸음을 기다리지 않는다)", () => {
    const clock = new ManualClock();
    const initialState = createOnecardScenario(ONE_LEFT);
    let refuse = 1;
    const match = new LocalMatch({
      kit: onecardKit,
      rules: initialState.rules,
      seed: 1,
      humanSeat: 0,
      bot: quietBot,
      initialState,
      clock,
      step: (state, seat, action) => {
        if (action.type === "timeout" && refuse > 0) {
          refuse--;
          return { ok: false, error: "시험: 한 번 거절" };
        }
        return onecardKit.step(state, seat, action);
      },
    });
    match.submit({ type: "play", card: "S3" });
    clock.advance(STANDARD_ONECARD_RULES.selfWindowMs);
    expect(match.rawState().windows.map((w) => w.kind)).toEqual(["self"]);
    clock.advance(STANDARD_ONECARD_RULES.selfWindowMs);
    expect(match.rawState().windows.map((w) => w.kind)).toEqual(["catch"]);
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

  it("고수 컴퓨터는 외치지 않은 한 장짜리를 본인 시간이 지나야 잡는다", () => {
    const { clock, match, events, state } = scenario(ONE_LEFT, (c) =>
      toKitBot(onecardBotFor(2), c),
    );
    match.submit({ type: "play", card: "S3" });
    clock.advance(STANDARD_ONECARD_RULES.selfWindowMs - 1);
    expect(events.some((e) => e.type === "caught")).toBe(false);
    clock.advance(2001);
    expect(
      events.some((e) => e.type === "caught" && e.seat === 1 && e.target === 0),
    ).toBe(true);
    expect(state().hands[0]).toHaveLength(2);
    expect(events.some((e) => e.type === "falseShout")).toBe(false);
  });

  it("컴퓨터는 남이 외친 것을 들으면 잡지 않는다", () => {
    const { clock, match, events } = scenario(ONE_LEFT, (c) =>
      toKitBot(onecardBotFor(2), c),
    );
    match.submit({ type: "shout", seen: match.current().turnNo });
    match.submit({ type: "play", card: "S3" });
    clock.advance(10_000);
    expect(events.some((e) => e.type === "caught")).toBe(false);
    expect(events.some((e) => e.type === "falseShout")).toBe(false);
  });

  it("잡을 사람이 있을 때 두 장인 자기 차례를 맞은 컴퓨터는 한 번 눌러 미리 외치고 잡는다(검토 4번)", () => {
    // 나는 ♠3을 내고 외치지 않는다. 컴퓨터는 ♠ 두 장이라 바로 두 장인 자기 차례다.
    const { clock, match, events, state } = scenario(
      {
        hands: [
          ["S3", "D9"],
          ["S8", "S9"],
        ],
        pile: ["S5"],
      },
      (c) => toKitBot(onecardBotFor(2), c),
      (c) => (next) => c.after(700, next),
    );
    match.submit({ type: "play", card: "S3" });
    // 미리 외침은 카드를 내기(700ms) 전에 닿는다.
    clock.advance(699);
    expect(state().preCalled[1]).toBe(true);
    // 내 본인 시간이 끝나면 그 누름으로 잡힌다(shoutBoth).
    clock.advance(STANDARD_ONECARD_RULES.selfWindowMs - 699);
    expect(
      events.some((e) => e.type === "caught" && e.seat === 1 && e.target === 0),
    ).toBe(true);
    expect(events.some((e) => e.type === "falseShout")).toBe(false);
  });

  it("세 단계 모두 씨앗 판을 진행한다(컴퓨터 외침·창 시계 포함, 앞 40걸음)", () => {
    for (const level of [0, 1, 2]) {
      const clock = new ManualClock();
      const match = new LocalMatch({
        kit: onecardKit,
        rules: { ...STANDARD_ONECARD_RULES, players: 3, handSize: 5 as const },
        seed: 11,
        humanSeat: 0,
        bot: toKitBot(onecardBotFor(level), clock),
        clock,
      });
      for (let i = 0; i < 40 && match.current().phase !== "over"; i++) {
        const view = match.current();
        if (view.phase === "play" && view.turn === 0) {
          const state = JSON.parse(match.serialize()) as OnecardState;
          const action = legalActions(state, 0)[0] as Action;
          expect(match.submit(action).ok).toBe(true);
        }
        clock.advance(250);
      }
      // 컴퓨터 수가 기록에 남고, 저장한 기록으로 다시 만들 수 있다(이어하기·복기).
      const saved = match.save();
      expect(saved.log.some((e) => e.bot)).toBe(true);
      expect(onecardKit.replay(saved.rules, saved.seed, saved.log).ok).toBe(
        true,
      );
    }
  });
});
