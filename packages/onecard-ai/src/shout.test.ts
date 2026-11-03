import { createRng } from "@game/mighty-engine";
import {
  type Action,
  createOnecardScenario,
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
import { planShout, shoutAction } from "./shout";
import { playGame } from "./simulate";

/** 판과 자리마다 기억을 함께 들고 행동을 넣는다 */
function table(options: OnecardScenarioOptions) {
  let state = createOnecardScenario(options);
  const memories = state.hands.map((_, s) => createMemory(viewOf(state, s)));
  return {
    get state(): OnecardState {
      return state;
    },
    memories,
    act(seat: number, action: Action) {
      const r = step(state, seat, action);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
      memories.forEach((m, s) => {
        observe(m, r.events, viewOf(state, s));
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
  it("잡기 확률과 시간이 단계 값과 맞다(입문 0.2·2~4초, 중수 0.5·1~3초, 고수 0.9·0.5~2초)", () => {
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
    expect([a.min, a.max]).toEqual([expect.any(Number), expect.any(Number)]);
    expect(a.min).toBeGreaterThanOrEqual(2000);
    expect(a.max).toBeLessThanOrEqual(4000);
    expect(c.min).toBeGreaterThanOrEqual(500);
    expect(c.max).toBeLessThanOrEqual(2000);
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
    ).toEqual({ type: "shout", seen: r.state.turnNo });
  });
});
