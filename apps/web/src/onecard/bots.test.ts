import { ManualClock } from "@game/fair-play";
import type { OnecardSeatBot, ShoutPlan } from "@game/onecard-ai";
import {
  createOnecardScenario,
  type OnecardScenarioOptions,
  type OnecardView,
  viewOf,
} from "@game/onecard-engine";
import { describe, expect, it } from "vitest";

import { onecardBotFor, toKitBot } from "./bots";
import { onecardKit } from "./kit";

/** 이 파일은 옛 규칙(o1, B안)의 진행을 본다(이어하기로 남은 옛 판). o2 겨루기는 race.test.ts */
const o1Scenario = (options: OnecardScenarioOptions) =>
  createOnecardScenario({
    ...options,
    rules: { race: false, ...options.rules },
  });

/** 정해 둔 계획을 차례로 내고, `done`에 든 까닭의 계획은 할 일이 끝났다고 보는 자리 컴퓨터 */
function scripted() {
  const queue: ShoutPlan[] = [];
  const done = new Set<ShoutPlan["reason"]>();
  /** 부를 때마다 받은 시각(대국 시계) */
  const times: (number | undefined)[] = [];
  const bot: OnecardSeatBot = {
    level: 2,
    chooseAction: () => ({ type: "draw" }),
    planShout: (_view, _rng, nowMs) => {
      times.push(nowMs);
      return queue.shift() ?? null;
    },
    hear: (_events, _view, nowMs) => {
      times.push(nowMs);
    },
    shoutNow: (plan, view, nowMs) => {
      times.push(nowMs);
      return done.has(plan.reason)
        ? null
        : { type: "shout", seen: view.turnNo };
    },
  };
  return { bot, queue, done, times };
}

const VIEW: OnecardView = viewOf(
  o1Scenario({
    hands: [
      ["S3", "D9"],
      ["S8", "S9"],
    ],
    pile: ["S5"],
  }),
  1,
);

function setup() {
  const clock = new ManualClock();
  const seat = scripted();
  const kitBot = toKitBot(
    onecardBotFor(2, () => seat.bot),
    clock,
  );
  const react = () => kitBot.react?.(VIEW, [], { seed: 1 }) ?? null;
  return { clock, react, ...seat };
}

const plan = (reason: ShoutPlan["reason"], delayMs: number): ShoutPlan => {
  const target = reason === "catch" ? 0 : 1;
  return { reason, target, targets: [target], delayMs };
};

describe("원카드 컴퓨터 끼우기(toKitBot)", () => {
  it("듣기·계획·다시 보기에 대국 시계의 지금 시각을 준다", () => {
    const { clock, react, queue, times } = setup();
    clock.advance(1234);
    queue.push(plan("catch", 500));
    const first = react();
    expect(times.length).toBeGreaterThan(0);
    expect(times.every((t) => t === 1234)).toBe(true);
    times.length = 0;
    clock.advance(500);
    first?.recheck?.(VIEW);
    expect(times).toEqual([1734]);
  });

  it("잡으려고 기다리는 중에 더 이른 미리 외침이 오면 그 시간에 걸고, 누른 뒤 남은 잡기를 다시 건다", () => {
    const { clock, react, queue, done } = setup();
    queue.push(plan("catch", 2000));
    expect(react()?.delayMs).toBe(2000);
    clock.advance(500);
    queue.push(plan("pre", 150));
    expect(react()).toMatchObject({
      delayMs: 150,
      action: { type: "shout", seen: VIEW.turnNo },
    });
    // 미리 외침을 눌렀다. 잡기는 아직 할 일이 남았다(예: 본인 외침 누름은 남을 잡지 못한다).
    clock.advance(150);
    done.add("pre");
    expect(react()?.delayMs).toBe(1350);
  });

  it("앞 계획이 더 이르면 새 계획이 와도 앞 시간을 지킨다", () => {
    const { clock, react, queue } = setup();
    queue.push(plan("catch", 300));
    expect(react()?.delayMs).toBe(300);
    clock.advance(100);
    queue.push(plan("false", 2000));
    expect(react()?.delayMs).toBe(200);
  });

  it("한 누름으로 할 일이 끝난 계획과 시간이 지난 계획은 버린다", () => {
    const { clock, react, queue, done } = setup();
    queue.push(plan("pre", 100), plan("catch", 1000));
    expect(react()?.delayMs).toBe(100);
    // 미리 외침 누름이 잡기도 했다(shoutBoth): 둘 다 끝났다.
    clock.advance(100);
    done.add("pre");
    done.add("catch");
    expect(react()).toBeNull();
    // 걸어 둔 계획이 없을 때 시간만 지나도 다시 걸지 않는다.
    clock.advance(5000);
    done.clear();
    expect(react()).toBeNull();
  });

  it("시간이 되면 그 순간 화면으로 다시 본다: 누를 까닭이 없어졌으면 누르지 않고, 누르면 그때의 판 번호를 싣는다", () => {
    const { clock, react, queue, done } = setup();
    queue.push(plan("catch", 500));
    const first = react();
    clock.advance(500);
    const later = { ...VIEW, turnNo: VIEW.turnNo + 1 };
    expect(first?.recheck?.(later)).toEqual({
      type: "shout",
      seen: VIEW.turnNo + 1,
    });
    // 쓴 계획은 다시 쓰지 않는다.
    expect(first?.recheck?.(later)).toBeNull();

    queue.push(plan("catch", 300));
    const second = react();
    clock.advance(300);
    done.add("catch");
    expect(second?.recheck?.(VIEW)).toBeNull();
  });

  it("자리마다 자리 컴퓨터를 따로 둔다", () => {
    const table = onecardBotFor(1);
    expect(table.seatBot(1)).toBe(table.seatBot(1));
    expect(table.seatBot(1)).not.toBe(table.seatBot(2));
    expect(table.seatBot(1).level).toBe(1);
    expect(onecardBotFor(7).seatBot(0).level).toBe(2);
  });

  it("세 단계 모두 차례 수를 낼 수 있는 수 가운데서 고르고, 7에는 무늬를 붙인다", () => {
    const state = o1Scenario({
      hands: [
        ["S7", "H9", "C4"],
        ["C3", "D4"],
      ],
      pile: ["S5"],
    });
    const view = onecardKit.viewOf(state, 0);
    for (const level of [0, 1, 2]) {
      const action = toKitBot(onecardBotFor(level)).decide(view, { seed: 3 });
      expect(onecardKit.step(state, 0, action).ok).toBe(true);
      if (action.type === "play" && action.card === "S7")
        expect(action.suit).toBeDefined();
    }
  });
});
