import { createRng } from "@game/mighty-engine";
import {
  type Action,
  createOnecardScenario,
  HUMAN_RT_FLOOR_MS,
  type OnecardState,
  STANDARD_ONECARD_RULES,
  step,
  viewOf,
} from "@game/onecard-engine";
import { describe, expect, it } from "vitest";

import { levelInfo, ONECARD_LEVELS, type OnecardLevel } from "./levels";
import { createMemory, type OnecardMemory, observe } from "./memory";
import { planShout, shoutAction } from "./shout";
import { playGame } from "./simulate";

/** o2 반응 속도 겨루기의 컴퓨터(docs/42 17-4) */

function table(turn: number) {
  let state: OnecardState = createOnecardScenario({
    hands: [
      ["H9", "S3"],
      ["D3", "D4", "C5"],
      ["C9", "D8", "SK"],
    ],
    pile: ["H5"],
    turn,
  });
  const memories = state.hands.map((_, s) => createMemory(viewOf(state, s)));
  return {
    get state() {
      return state;
    },
    memories,
    act(seat: number, action: Action, now: number) {
      const r = step(state, seat, action);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
      for (const [s, m] of memories.entries())
        observe(m, r.events, viewOf(state, s), now);
      return r.events;
    },
  };
}

describe("겨루기 계획", () => {
  it("두 장인 내 차례에 미리 외치지 않는다", () => {
    const t = table(0);
    for (const level of [0, 1, 2] as OnecardLevel[])
      expect(
        planShout(
          viewOf(t.state, 0),
          level,
          createRng(1),
          t.memories[0] as OnecardMemory,
          0,
        ),
      ).toBeNull();
  });

  it("한 장이 된 나는 단계별 반응 시간 뒤에, 한 장이 된 판을 본 것으로 rt를 실어 누른다", () => {
    for (const level of [0, 1, 2] as OnecardLevel[]) {
      const [lo, hi] = levelInfo(level).shout.raceSelfMs;
      for (let seed = 1; seed <= 50; seed++) {
        const t = table(0);
        t.act(0, { type: "play", card: "H9" }, 1000);
        const view = viewOf(t.state, 0);
        const plan = planShout(
          view,
          level,
          createRng(seed),
          t.memories[0] as OnecardMemory,
          1000,
        );
        if (!plan) continue;
        expect(plan.reason).toBe("self");
        expect(plan.delayMs).toBeGreaterThanOrEqual(lo);
        expect(plan.delayMs).toBeLessThanOrEqual(hi);
        expect(
          shoutAction(
            plan,
            view,
            t.memories[0] as OnecardMemory,
            1000 + plan.delayMs,
          ),
        ).toEqual({
          type: "shout",
          seen: 1,
          rt: plan.delayMs,
        });
      }
    }
  });

  it("잡기도 한 장이 된 때부터 잰 rt를 싣고, 늦게 알아채면 지금 바로(늦은 만큼 rt가 길다)", () => {
    const t = table(0);
    t.act(0, { type: "play", card: "H9" }, 1000);
    const view = viewOf(t.state, 1);
    // 2초 늦게 계획을 세움
    let plan = null;
    for (let seed = 1; !plan && seed < 50; seed++)
      plan = planShout(view, 2, createRng(seed), createMemory(view), 3000);
    // 기억 없이 새로 만들면 잡을 거리를 모른다
    expect(plan).toBeNull();
    for (let seed = 1; !plan && seed < 50; seed++) {
      const m = createMemory(viewOf(table(0).state, 1));
      const t2 = table(0);
      const r = step(t2.state, 0, { type: "play", card: "H9" });
      if (!r.ok) throw new Error(r.error);
      observe(m, r.events, viewOf(r.state, 1), 1000);
      plan = planShout(viewOf(r.state, 1), 2, createRng(seed), m, 3000);
    }
    expect(plan).toMatchObject({ reason: "catch", target: 0, delayMs: 0 });
    expect(plan?.rtMs).toBe(2000);
  });

  it("모든 단계의 반응 시간은 사람 하한 아래로 내려가지 않고, 고수도 사람 보통 반응(250~400ms) 안쪽에서 진다", () => {
    for (const info of ONECARD_LEVELS) {
      expect(info.shout.raceSelfMs[0]).toBeGreaterThanOrEqual(
        HUMAN_RT_FLOOR_MS,
      );
      expect(info.shout.raceCatchMs[0]).toBeGreaterThanOrEqual(
        HUMAN_RT_FLOOR_MS,
      );
    }
    const expert = levelInfo(2).shout;
    expect(expert.raceSelfMs[0]).toBeGreaterThan(200);
    expect(expert.raceCatchMs[0]).toBeGreaterThan(250);
    // 입문 > 중수 > 고수
    expect(levelInfo(0).shout.raceCatchMs[0]).toBeGreaterThan(
      levelInfo(1).shout.raceCatchMs[0],
    );
    expect(levelInfo(1).shout.raceCatchMs[0]).toBeGreaterThan(
      expert.raceCatchMs[0],
    );
  });

  it("한 장인 사람의 외침이 들리면 안전으로 본다(본인 시간이 없다)", () => {
    const t = table(0);
    t.act(0, { type: "play", card: "H9" }, 1000);
    expect((t.memories[1] as OnecardMemory).marks[0]).toBe("exposed");
    t.act(0, { type: "shout", seen: 1, rt: 2500 }, 3500);
    t.act(0, { type: "raceEnd" }, 3650);
    expect((t.memories[1] as OnecardMemory).marks[0]).toBe("safe");
  });
});

describe("가상 판(o2)", () => {
  it("컴퓨터끼리 끝까지 두고 같은 씨앗이면 같은 판", () => {
    const rules = {
      ...STANDARD_ONECARD_RULES,
      players: 3,
      handSize: 5 as const,
    };
    const a = playGame([0, 1, 2], rules, 7);
    const b = playGame([0, 1, 2], rules, 7);
    expect(a.state.phase).toBe("over");
    expect(a).toEqual(b);
    expect(a.shouts.some((n) => n > 0)).toBe(true);
  });
});
