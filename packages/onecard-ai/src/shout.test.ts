import { createRng } from "@game/mighty-engine";
import {
  type Action,
  createOnecardScenario,
  judgeShout,
  type OnecardScenarioOptions,
  type OnecardState,
  STANDARD_ONECARD_RULES,
  step,
  viewOf,
} from "@game/onecard-engine";
import { describe, expect, it } from "vitest";

import type { OnecardLevel } from "./levels";
import { createMemory, type OnecardMemory, observe } from "./memory";
import { createSeatBot } from "./seat";
import { CATCH_MARGIN_MS, planShout, shoutAction } from "./shout";
import { playGame } from "./simulate";

/** 판과 자리마다 기억을 함께 들고 행동을 넣는다 */
function table(options: OnecardScenarioOptions) {
  // 이 파일의 계획 시험은 옛 규칙(o1). o2 겨루기는 race.test.ts
  let state = createOnecardScenario({
    ...options,
    rules: { race: false, ...options.rules },
  });
  const memories = state.hands.map((_, s) => createMemory(viewOf(state, s)));
  return {
    get state(): OnecardState {
      return state;
    },
    memories,
    /** `now`: 받아들인 시각(ms). 없으면 기억이 시간을 따지지 않는다 */
    act(seat: number, action: Action, now?: number) {
      const r = step(state, seat, action);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
      memories.forEach((m, s) => {
        observe(m, r.events, viewOf(state, s), now);
      });
      return r.events;
    },
  };
}

/** 1번이 H9를 내고 외치지 않은 채 한 장이 되는 판 */
function exposedOne(rules: OnecardScenarioOptions["rules"] = {}) {
  const t = table({
    hands: [
      ["D3", "D4", "C5"],
      ["H9", "S3"],
      ["C9", "D8", "SK"],
    ],
    pile: ["H5"],
    turn: 1,
    rules,
  });
  t.act(1, { type: "play", card: "H9" });
  return t;
}

/** 같은 상황을 씨앗만 바꿔 여러 번: 계획이 나온 비율 */
function rate(
  make: () => { view: ReturnType<typeof viewOf>; memory: OnecardMemory },
  level: OnecardLevel,
  reason: string,
  trials = 400,
) {
  let hits = 0;
  const delays: number[] = [];
  for (let seed = 1; seed <= trials; seed++) {
    const { view, memory } = make();
    const plan = planShout(view, level, createRng(seed), memory);
    if (plan?.reason === reason) {
      hits++;
      delays.push(plan.delayMs);
    }
  }
  return {
    rate: hits / trials,
    min: Math.min(...delays),
    max: Math.max(...delays),
  };
}

describe("기억", () => {
  it("외치지 않고 한 장이 되면 잡을 거리, 외치는 소리를 들으면 안전", () => {
    const t = exposedOne();
    expect(t.memories[0]?.marks[1]).toBe("exposed");
    expect(t.memories[1]?.marks[1]).toBe("exposed");
    t.act(1, { type: "shout", seen: t.state.turnNo });
    expect(t.memories[0]?.marks[1]).toBe("safe");
  });

  it("본인 시간 P가 지나 엔진이 받지 않은 본인 외침은 안전으로 보지 않고 잡으러 간다", () => {
    // 시각 0에 1번이 외치지 않고 한 장이 된다
    const t = table({
      hands: [
        ["D3", "D4", "C5"],
        ["H9", "S3"],
        ["C9", "D8", "SK"],
      ],
      pile: ["H5"],
      turn: 1,
    });
    t.act(1, { type: "play", card: "H9" }, 0);
    // 1초(P)가 지나 잡기 창이 됐고, 1.5초에 1번이 외친다 → 엔진은 받지 않는다(lateSelf)
    t.act(1, { type: "timeout", kind: "selfWindow", target: 1 }, 1000);
    expect(judgeShout(t.state, 1, t.state.turnNo).kind).toBe("lateSelf");
    t.act(1, { type: "shout", seen: t.state.turnNo }, 1500);
    const memory = t.memories[0] as OnecardMemory;
    expect(memory.marks[1]).toBe("exposed");
    // 그래서 0번은 여전히 잡을 수 있다
    const plan = planShout(viewOf(t.state, 0), 2, createRng(1), memory);
    expect(plan).toMatchObject({ reason: "catch", target: 1 });
    const action = shoutAction(
      plan as NonNullable<typeof plan>,
      viewOf(t.state, 0),
      memory,
    );
    expect(t.act(0, action as Action, 1600)).toContainEqual({
      type: "caught",
      seat: 0,
      target: 1,
    });
  });

  it("본인 시간 P 안(여유 포함)의 외침은 안전, 시각을 모르면 외침은 모두 안전", () => {
    const inTime = exposedOne();
    inTime.memories.forEach((m) => {
      m.exposedAt[1] = 0;
    });
    inTime.act(1, { type: "shout", seen: inTime.state.turnNo }, 1200);
    expect(inTime.memories[0]?.marks[1]).toBe("safe");

    const noClock = exposedOne();
    noClock.act(1, { type: "timeout", kind: "selfWindow", target: 1 });
    noClock.act(1, { type: "shout", seen: noClock.state.turnNo });
    expect(noClock.memories[0]?.marks[1]).toBe("safe");
  });

  it("P가 0이면 본인 외침은 늘 받지 않으므로 잡을 거리로 남는다", () => {
    const t = table({
      hands: [
        ["D3", "D4", "C5"],
        ["H9", "S3"],
      ],
      pile: ["H5"],
      turn: 1,
      rules: { selfWindowMs: 0 },
    });
    t.act(1, { type: "play", card: "H9" }, 0);
    expect(judgeShout(t.state, 1, t.state.turnNo).kind).toBe("lateSelf");
    t.act(1, { type: "shout", seen: t.state.turnNo }, 100);
    expect(t.memories[0]?.marks[1]).toBe("exposed");
  });

  it("두 장인 차례에 미리 외치고 내면 처음부터 안전", () => {
    const t = table({
      hands: [
        ["D3", "D4"],
        ["H9", "S3"],
      ],
      pile: ["H5"],
      turn: 1,
    });
    t.act(1, { type: "shout", seen: t.state.turnNo });
    expect(t.memories[0]?.marks[1]).toBe("pre");
    t.act(1, { type: "play", card: "H9" });
    expect(t.memories[0]?.marks[1]).toBe("safe");
  });

  it("먹으면 한 장 상태가 풀린다", () => {
    const t = exposedOne();
    t.act(2, { type: "draw" });
    expect(t.memories[0]?.marks[1]).toBe("exposed");
    t.act(0, { type: "draw" });
    t.act(1, { type: "draw" });
    expect(t.memories[0]?.marks[1]).toBe("none");
  });
});

describe("외침 계획", () => {
  it("기본 규칙(P 1초·T 3초)에서 잡기 확률과 시간이 letsuno 값과 맞다", () => {
    const make = () => {
      const t = exposedOne();
      return {
        view: viewOf(t.state, 0),
        memory: t.memories[0] as OnecardMemory,
      };
    };
    const a = rate(make, 0, "catch");
    const b = rate(make, 1, "catch");
    const c = rate(make, 2, "catch");
    expect(a.rate).toBeGreaterThan(0.12);
    expect(a.rate).toBeLessThan(0.28);
    expect(b.rate).toBeGreaterThan(0.42);
    expect(b.rate).toBeLessThan(0.58);
    expect(c.rate).toBeGreaterThan(0.85);
    // 입문 2~3.8초(창이 닫히기 0.25초 전까지만), 중수 1~3초, 고수 0.5~2초
    expect(a.min).toBeGreaterThanOrEqual(2000);
    expect(a.max).toBeLessThanOrEqual(4000 - CATCH_MARGIN_MS);
    expect(b.min).toBeGreaterThanOrEqual(1000);
    expect(b.max).toBeLessThanOrEqual(3000);
    expect(c.min).toBeGreaterThanOrEqual(500);
    expect(c.max).toBeLessThanOrEqual(2000);
  });

  it.each([
    [0, 2000],
    [1000, 2000],
    [2000, 5000],
  ] as const)(
    "P %ims·T %ims: 잡기는 늘 창이 닫히기 전에 닿는다",
    (selfWindowMs, catchWindowMs) => {
      const rules = { selfWindowMs, catchWindowMs };
      for (const level of [0, 1, 2] as const) {
        const r = rate(
          () => {
            const t = exposedOne(rules);
            return {
              view: viewOf(t.state, 0),
              memory: t.memories[0] as OnecardMemory,
            };
          },
          level,
          "catch",
        );
        expect(r.rate).toBeGreaterThan(0);
        expect(r.max).toBeLessThanOrEqual(
          selfWindowMs + catchWindowMs - CATCH_MARGIN_MS,
        );
      }
    },
  );

  it("너무 늦게 알아채 창 안에 닿지 못하면 누르지 않는다", () => {
    const t = table({
      hands: [
        ["D3", "D4", "C5"],
        ["H9", "S3"],
        ["C9", "D8", "SK"],
      ],
      pile: ["H5"],
      turn: 1,
    });
    t.act(1, { type: "play", card: "H9" }, 0);
    const memory = t.memories[0] as OnecardMemory;
    // P+T = 4초. 3.9초에야 계획을 세우면(창이 닫히기 0.25초 전을 넘었다) 누르지 않는다
    expect(
      planShout(viewOf(t.state, 0), 2, createRng(1), memory, 3900),
    ).toBeNull();
    // 3초면 바로 누른다
    const u = exposedOne();
    const late = u.memories[0] as OnecardMemory;
    late.exposedAt[1] = 0;
    const plan = planShout(viewOf(u.state, 0), 2, createRng(1), late, 3000);
    expect(plan).toMatchObject({ reason: "catch", delayMs: 0 });
  });

  it("잡을 사람이 둘이면 한 번 눌러 둘 다 잡는다", () => {
    const t = table({
      hands: [
        ["D3", "D4", "C5"],
        ["H9", "S3"],
        ["H8", "D8"],
      ],
      pile: ["H5"],
      turn: 1,
    });
    t.act(1, { type: "play", card: "H9" }, 0);
    t.act(2, { type: "play", card: "H8" }, 100);
    t.act(1, { type: "timeout", kind: "selfWindow", target: 1 }, 1000);
    t.act(2, { type: "timeout", kind: "selfWindow", target: 2 }, 1100);
    const memory = t.memories[0] as OnecardMemory;
    const view = viewOf(t.state, 0);
    const plan = planShout(view, 2, createRng(1), memory, 1100);
    expect(plan).toMatchObject({ reason: "catch", targets: [1, 2] });
    expect(planShout(view, 2, createRng(2), memory, 1100)).toBeNull();
    const action = shoutAction(
      plan as NonNullable<typeof plan>,
      view,
      memory,
      1100 + (plan?.delayMs ?? 0),
    );
    const events = t.act(0, action as Action, 1100 + (plan?.delayMs ?? 0));
    expect(events).toContainEqual({ type: "caught", seat: 0, target: 1 });
    expect(events).toContainEqual({ type: "caught", seat: 0, target: 2 });
  });

  it("같은 상황에는 계획을 한 번만 세운다", () => {
    const t = exposedOne();
    const view = viewOf(t.state, 0);
    const memory = t.memories[0] as OnecardMemory;
    const rng = createRng(1);
    expect(planShout(view, 2, rng, memory)?.reason).toBe("catch");
    expect(planShout(view, 2, rng, memory)).toBeNull();
  });

  it("본인 외침은 본인 시간 P 안에, P가 0이면 하지 않는다", () => {
    const self = rate(
      () => {
        const t = exposedOne();
        return {
          view: viewOf(t.state, 1),
          memory: t.memories[1] as OnecardMemory,
        };
      },
      0,
      "self",
    );
    expect(self.rate).toBeGreaterThan(0.5);
    expect(self.rate).toBeLessThan(0.7);
    expect(self.max).toBeLessThan(STANDARD_ONECARD_RULES.selfWindowMs);
    const none = rate(
      () => {
        const t = exposedOne({ selfWindowMs: 0 });
        return {
          view: viewOf(t.state, 1),
          memory: t.memories[1] as OnecardMemory,
        };
      },
      2,
      "self",
    );
    expect(none.rate).toBe(0);
  });

  it("두 장인 내 차례에 낼 카드가 있으면 미리 외친다(고수는 늘)", () => {
    const t = table({
      hands: [
        ["H9", "S3"],
        ["D3", "D4"],
      ],
      pile: ["H5"],
    });
    const plan = planShout(
      viewOf(t.state, 0),
      2,
      createRng(1),
      t.memories[0] as OnecardMemory,
    );
    expect(plan?.reason).toBe("pre");
    const action = shoutAction(
      plan as NonNullable<typeof plan>,
      viewOf(t.state, 0),
      t.memories[0] as OnecardMemory,
    );
    expect(action).toEqual({ type: "shout", seen: t.state.turnNo });
    t.act(0, action as Action);
    t.act(0, { type: "play", card: "H9" });
    expect(t.state.called[0]).toBe(true);
  });

  it("미리 외칠 시간이 됐을 때 다시 섞기 중이면 누르지 않는다(엔진은 헛외침으로 본다)", () => {
    const t = table({
      hands: [
        ["H9", "S3"],
        ["D3", "D4"],
      ],
      pile: ["C4", "H5"],
      deck: [],
    });
    const memory = t.memories[0] as OnecardMemory;
    const plan = planShout(viewOf(t.state, 0), 2, createRng(1), memory);
    expect(plan?.reason).toBe("pre");
    // 계획과 누름 사이에 판이 다시 섞기를 기다리게 됐다
    const waiting: OnecardState = { ...t.state, phase: "reshuffle" };
    expect(judgeShout(waiting, 0, waiting.turnNo).kind).toBe("false");
    expect(
      shoutAction(plan as NonNullable<typeof plan>, viewOf(waiting, 0), memory),
    ).toBeNull();
  });

  it("입문은 이미 외친 사람을 가끔 잡으려 해 헛외침을 한다, 중수·고수는 하지 않는다", () => {
    const make = () => {
      const t = exposedOne();
      t.act(1, { type: "shout", seen: t.state.turnNo });
      return {
        view: viewOf(t.state, 0),
        memory: t.memories[0] as OnecardMemory,
      };
    };
    expect(rate(make, 0, "false").rate).toBeGreaterThan(0.08);
    expect(rate(make, 1, "false").rate).toBe(0);
    expect(rate(make, 2, "false").rate).toBe(0);
  });

  it("잡기를 넣으면 잡히고, 그사이 외쳤으면 누르지 않는다", () => {
    const t = exposedOne();
    const memory = t.memories[0] as OnecardMemory;
    const plan = planShout(viewOf(t.state, 0), 2, createRng(1), memory);
    expect(plan).toMatchObject({ reason: "catch", target: 1 });
    // 본인 시간이 끝나 잡기 창이 됐다
    t.act(1, { type: "timeout", kind: "selfWindow", target: 1 });
    const action = shoutAction(
      plan as NonNullable<typeof plan>,
      viewOf(t.state, 0),
      memory,
    );
    const events = t.act(0, action as Action);
    expect(events).toContainEqual({ type: "caught", seat: 0, target: 1 });

    const u = exposedOne();
    const memory2 = u.memories[0] as OnecardMemory;
    const plan2 = planShout(viewOf(u.state, 0), 2, createRng(1), memory2);
    u.act(1, { type: "shout", seen: u.state.turnNo });
    expect(
      shoutAction(
        plan2 as NonNullable<typeof plan2>,
        viewOf(u.state, 0),
        memory2,
      ),
    ).toBeNull();
  });
});

describe("판 전체(가상 시계)", () => {
  it("세 단계가 외침·잡기까지 하며 3인 판을 끝낸다", () => {
    const game = playGame(
      [0, 1, 2],
      { ...STANDARD_ONECARD_RULES, players: 3, handSize: 5 },
      5,
    );
    expect(game.state.phase).toBe("over");
    expect(game.shouts.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  it("같은 씨앗이면 같은 판", () => {
    const rules = { ...STANDARD_ONECARD_RULES, players: 4 };
    const a = playGame([0, 0, 1, 1], rules, 9);
    const b = playGame([0, 0, 1, 1], rules, 9);
    expect(b.state.result).toEqual(a.state.result);
    expect(b.shouts).toEqual(a.shouts);
  });
});

describe("자리 컴퓨터(화면 모양)", () => {
  it("사건을 들으면 외치지 않은 한 장짜리를 잡으러 간다, 듣지 못하면 모른다", () => {
    const t = exposedOne();
    const deaf = createSeatBot(2);
    expect(deaf.planShout(viewOf(t.state, 0), createRng(1))).toBeNull();

    const start = createOnecardScenario({
      hands: [
        ["D3", "D4", "C5"],
        ["H9", "S3"],
        ["C9", "D8", "SK"],
      ],
      pile: ["H5"],
      turn: 1,
    });
    const bot = createSeatBot(2);
    bot.hear([], viewOf(start, 0));
    const r = step(start, 1, { type: "play", card: "H9" });
    if (!r.ok) throw new Error(r.error);
    bot.hear(r.events, viewOf(r.state, 0));
    const plan = bot.planShout(viewOf(r.state, 0), createRng(1));
    expect(plan).toMatchObject({ reason: "catch", target: 1 });
    expect(
      bot.shoutNow(plan as NonNullable<typeof plan>, viewOf(r.state, 0)),
    ).toMatchObject({ type: "shout", seen: r.state.turnNo }); // 기본 규칙(o2)은 rt도 싣는다
  });
});
