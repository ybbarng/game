import { describe, expect, it } from "vitest";

import {
  judgeShout,
  raceGather,
  type StepResult,
  shoutWindows,
  step,
} from "./match";
import {
  decodeOnecardRules,
  encodeOnecardRules,
  HUMAN_RT_FLOOR_MS,
  O1_ONECARD_RULES,
  RACE_TIE_MS,
  raceOrder,
  STANDARD_ONECARD_RULES,
} from "./rules";
import { createOnecardScenario } from "./scenario";
import type { Action, GameEvent, OnecardState } from "./state";

/** o2 반응 속도 겨루기(docs/42 17절) */

function okEvents(result: StepResult): [OnecardState, GameEvent[]] {
  if (!result.ok) throw new Error(result.error);
  return [result.state, result.events];
}

function ok(result: StepResult): OnecardState {
  return okEvents(result)[0];
}

function press(state: OnecardState, seat: number, rt: number, seen?: number) {
  return ok(
    step(state, seat, { type: "shout", seen: seen ?? state.turnNo, rt }),
  );
}

/** 자리 0이 두 장(H9·H8)을 들고 차례인 장면 */
function table() {
  return createOnecardScenario({
    hands: [
      ["H9", "H8"],
      ["D3", "D4", "D5"],
      ["S3", "S4", "S5"],
      ["C3", "C4", "C5"],
    ],
    pile: ["H5"],
  });
}

/** 자리 0이 H9를 내 한 장이 된 장면(겨루기 창이 열림) */
function oneLeft() {
  return ok(step(table(), 0, { type: "play", card: "H9" }));
}

function counts(state: OnecardState) {
  return state.hands.map((h) => h.length);
}

describe("규칙 문자열 o2", () => {
  it("기본 규칙은 o2 겨루기, 옛 o1은 옛 규칙으로 풀린다", () => {
    expect(STANDARD_ONECARD_RULES.race).toBe(true);
    const code = encodeOnecardRules(STANDARD_ONECARD_RULES);
    expect(code).toBe("o2-p4h7a2.3.5.5.7fab20e0c1x1t3000r0j0");
    expect(decodeOnecardRules(code)).toEqual({
      ok: true,
      rules: STANDARD_ONECARD_RULES,
    });
    const old = decodeOnecardRules(
      "o1-p4h7a2.3.5.5.7fab20e0c1x1w1000t3000r0j0",
    );
    expect(old).toEqual({ ok: true, rules: O1_ONECARD_RULES });
    expect(old.ok && old.rules.race).toBeFalsy();
  });

  it.each([
    "o2-p4h7a2.3.5.5.7fab20e0c1x1w1000t3000r0j0",
    "o2-p4h7a2.3.5.5.7fab20e0c1x1t3000r0j0s0",
  ])("틀린 o2 문자열 %j는 받지 않는다", (text) => {
    expect(decodeOnecardRules(text).ok).toBe(false);
  });
});

describe("겨루기 창", () => {
  it("외치지 않고 한 장이 되면 겨루기 창 하나(잡기 창 길이)가 열린다", () => {
    expect(shoutWindows(oneLeft())).toEqual([
      { id: 1, seat: 0, kind: "raceWindow", ms: 3000 },
    ]);
  });

  it("창이 없을 때 누름은 헛외침이다. 두 장인 내 차례에도(미리 외침 없음)", () => {
    const [after, events] = okEvents(
      step(table(), 0, { type: "shout", seen: 0, rt: 200 }),
    );
    expect(events).toContainEqual({ type: "falseShout", seat: 0 });
    expect(counts(after)).toEqual([3, 3, 3, 3]);
  });

  it("자극 전(한 장 되기 전 판)을 보고 누르면 헛외침", () => {
    const s = oneLeft();
    const [after, events] = okEvents(
      step(s, 1, { type: "shout", seen: 0, rt: 900 }),
    );
    expect(events).toContainEqual({ type: "falseShout", seat: 1 });
    expect(counts(after)).toEqual([1, 4, 3, 3]);
  });

  it("아무도 안 누르면 창이 닫히고 벌칙이 없다. 그 판을 보고 늦게 누르면 한 번은 늦음, 다음은 헛외침", () => {
    const s = oneLeft();
    const [closed, events] = okEvents(
      step(s, 0, { type: "timeout", kind: "raceWindow", target: 0, id: 1 }),
    );
    expect(events).toEqual([]);
    expect(shoutWindows(closed)).toEqual([]);
    const late = press(closed, 1, 3100);
    expect(counts(late)).toEqual([1, 3, 3, 3]);
    const again = okEvents(step(late, 1, { type: "shout", seen: 1, rt: 3200 }));
    expect(again[1]).toContainEqual({ type: "falseShout", seat: 1 });
  });

  it("옛 창 종류(catchWindow)의 시간 끝은 받지 않는다", () => {
    expect(
      step(oneLeft(), 0, { type: "timeout", kind: "catchWindow", target: 0 })
        .ok,
    ).toBe(false);
  });
});

describe("반응 시간 겨루기(혼자 하기: 모았다가 rt 순)", () => {
  it("누름은 바로 처리하지 않고 모은다. 모으는 시계가 생긴다", () => {
    const s = press(oneLeft(), 1, 300);
    expect(s.racePending).toEqual([{ seat: 1, seen: 1, rt: 300 }]);
    expect(raceGather(s)).toEqual({ since: 1, seat: 1, ms: 150 });
    expect(counts(s)).toEqual([1, 3, 3, 3]);
  });

  it("도착 순서와 상관없이 rt가 짧은 쪽이 이긴다: 본인이 늦게 닿았지만 더 빠르면 안전", () => {
    const s = press(press(oneLeft(), 1, 300), 0, 200);
    const [after, events] = okEvents(step(s, 0, { type: "raceEnd" }));
    expect(events).toEqual([
      { type: "shouted", seat: 0 },
      { type: "shouted", seat: 1 },
    ]);
    expect(after.called[0]).toBe(true);
    expect(counts(after)).toEqual([1, 3, 3, 3]);
    expect(shoutWindows(after)).toEqual([]);
    expect(raceGather(after)).toBeNull();
  });

  it("남이 늦게 닿았지만 더 빠르면 잡힌다(본인 300 vs 잡는 사람 150)", () => {
    const s = press(press(oneLeft(), 0, 300), 2, 150);
    const [after, events] = okEvents(step(s, 0, { type: "raceEnd" }));
    expect(events).toContainEqual({ type: "caught", seat: 2, target: 0 });
    expect(counts(after)).toEqual([2, 3, 3, 3]);
  });

  it("하한 아래는 모두 100으로 동점이고, 동점이면 본인이 이긴다(본인 30 vs 잡는 사람 20)", () => {
    const s = press(press(oneLeft(), 1, 20), 0, 30);
    const [after, events] = okEvents(step(s, 0, { type: "raceEnd" }));
    expect(events[0]).toEqual({ type: "shouted", seat: 0 });
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: "caught" }),
    );
    expect(counts(after)).toEqual([1, 3, 3, 3]);
  });

  it("다음 행동 전에 모은 누름을 먼저 처리한다", () => {
    const s = press(oneLeft(), 1, 400);
    const [after, events] = okEvents(step(s, 1, { type: "draw" }));
    expect(events[0]).toEqual({ type: "shouted", seat: 1 });
    expect(events).toContainEqual({ type: "caught", seat: 1, target: 0 });
    expect(counts(after)).toEqual([2, 4, 3, 3]);
  });

  it("창 시간 끝보다 모은 누름이 먼저다(시간 끝 직전의 누름이 사라지지 않는다)", () => {
    const s = press(oneLeft(), 1, 2950);
    const after = ok(
      step(s, 0, { type: "timeout", kind: "raceWindow", target: 0, id: 1 }),
    );
    expect(counts(after)).toEqual([2, 3, 3, 3]);
  });
});

describe("청구 묶음(온라인 방장이 정한 겨루기 순서)", () => {
  const claims = (shouts: { seat: number; rt: number }[]): Action => ({
    type: "claims",
    batch: 0,
    shouts: shouts.map((c, i) => ({ ...c, seen: 1, id: `c${i}` })),
  });

  it("묶음은 받은 차례 그대로 처리한다(방장이 겨루기 순서로 넣는다)", () => {
    const [after, events] = okEvents(
      step(
        oneLeft(),
        0,
        claims([
          { seat: 3, rt: 150 },
          { seat: 0, rt: 300 },
        ]),
      ),
    );
    expect(events).toContainEqual({ type: "caught", seat: 3, target: 0 });
    expect(counts(after)).toEqual([2, 3, 3, 3]);
  });

  it("방장 기기 컴퓨터가 모으던 누름과 함께 rt 순으로 줄 세운다", () => {
    const s = press(oneLeft(), 2, 250);
    const [after, events] = okEvents(
      step(s, 0, claims([{ seat: 0, rt: 180 }])),
    );
    expect(events[0]).toEqual({ type: "shouted", seat: 0 });
    expect(counts(after)).toEqual([1, 3, 3, 3]);
  });

  it("같은 기록을 다시 돌리면 같은 결과(결정적)", () => {
    const actions: [number, Action][] = [
      [0, { type: "play", card: "H9" }],
      [2, { type: "shout", seen: 1, rt: 400 }],
      [0, claims([{ seat: 1, rt: 200 }])],
    ];
    const run = () =>
      actions.reduce((s, [seat, a]) => ok(step(s, seat, a)), table());
    expect(run()).toEqual(run());
    expect(counts(run())).toEqual([2, 3, 3, 3]);
  });
});

describe("raceOrder", () => {
  const owner = (p: { seat: number }) => p.seat === 0;

  it("먼저 본 판, 같은 판에서는 rt(하한 적용) 순", () => {
    const order = raceOrder(
      [
        { seat: 1, seen: 2, rt: 50 },
        { seat: 2, seen: 1, rt: 900 },
        { seat: 3, seen: 1, rt: 300 },
      ],
      () => false,
    );
    expect(order.map((p) => p.seat)).toEqual([3, 2, 1]);
  });

  it(`공정 창 ${RACE_TIE_MS}ms 안이면 본인이 앞, 밖이면 rt 순`, () => {
    const tie = raceOrder(
      [
        { seat: 1, seen: 1, rt: 200 },
        { seat: 0, seen: 1, rt: 200 + RACE_TIE_MS },
      ],
      owner,
    );
    expect(tie.map((p) => p.seat)).toEqual([0, 1]);
    const apart = raceOrder(
      [
        { seat: 1, seen: 1, rt: 200 },
        { seat: 0, seen: 1, rt: 201 + RACE_TIE_MS },
      ],
      owner,
    );
    expect(apart.map((p) => p.seat)).toEqual([1, 0]);
  });

  it(`하한(${HUMAN_RT_FLOOR_MS}ms) 아래는 모두 동점`, () => {
    const order = raceOrder(
      [
        { seat: 1, seen: 1, rt: 0 },
        { seat: 0, seen: 1, rt: 99 },
      ],
      owner,
    );
    expect(order.map((p) => p.seat)).toEqual([0, 1]);
  });

  it("잡는 사람끼리 동점이면 tiebreak가 가른다", () => {
    const order = raceOrder(
      [
        { seat: 1, seen: 1, rt: 120 },
        { seat: 2, seen: 1, rt: 125 },
      ],
      () => false,
      (c) => [...c].reverse(),
    );
    expect(order.map((p) => p.seat)).toEqual([2, 1]);
  });
});

describe("o1 기록은 옛 판정 그대로", () => {
  it("o1 규칙이면 두 장인 내 차례의 누름은 미리 외침", () => {
    const s = createOnecardScenario({
      rules: { race: false },
      hands: [
        ["H9", "H8"],
        ["D3", "D4"],
      ],
      pile: ["H5"],
    });
    expect(judgeShout(s, 0, 0)).toEqual({ kind: "pre" });
    const after = ok(step(s, 0, { type: "play", card: "H9" }));
    expect(shoutWindows(after)[0]?.kind).toBe("selfWindow");
  });
});
