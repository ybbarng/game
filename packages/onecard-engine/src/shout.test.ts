import { describe, expect, it } from "vitest";

import { judgeShout, type StepResult, shoutWindows, step } from "./match";
import type { OnecardRules } from "./rules";
import { createOnecardScenario } from "./scenario";
import type { GameEvent, OnecardState } from "./state";

function okEvents(result: StepResult): [OnecardState, GameEvent[]] {
  if (!result.ok) throw new Error(result.error);
  return [result.state, result.events];
}

function ok(result: StepResult): OnecardState {
  return okEvents(result)[0];
}

function shout(state: OnecardState, seat: number, seen = state.turnNo) {
  return okEvents(step(state, seat, { type: "shout", seen }));
}

/** 자리 0이 두 장(H9·H8)을 들고 차례인 장면 */
function table(rules: Partial<OnecardRules> = {}) {
  return createOnecardScenario({
    rules,
    hands: [
      ["H9", "H8"],
      ["D3", "D4", "D5"],
      ["S3", "S4", "S5"],
      ["C3", "C4", "C5"],
    ],
    pile: ["H5"],
  });
}

/** 자리 0이 외치지 않고 H9를 내 한 장이 된 장면(본인 시간 P가 열림) */
function forgot(rules: Partial<OnecardRules> = {}) {
  return ok(step(table(rules), 0, { type: "play", card: "H9" }));
}

function counts(state: OnecardState) {
  return state.hands.map((h) => h.length);
}

describe("미리 외침·본인 외침", () => {
  it("자기 차례에 두 장일 때 외치면 미리 외침: 다음 낸 카드로 한 장이 되면 안전", () => {
    const [pre, events] = shout(table(), 0);
    expect(events).toEqual([{ type: "shouted", seat: 0 }]);
    expect(pre.preCalled[0]).toBe(true);
    const after = ok(step(pre, 0, { type: "play", card: "H9" }));
    expect(after.called[0]).toBe(true);
    expect(shoutWindows(after)).toEqual([]);
    // 이미 외친 사람을 잡으면 헛외침
    const [caught, more] = shout(after, 1);
    expect(more).toContainEqual({ type: "falseShout", seat: 1 });
    expect(counts(caught)).toEqual([1, 4, 3, 3]);
  });

  it("미리 외친 뒤 먹으면 외침이 사라진다", () => {
    const [pre] = shout(table(), 0);
    const after = ok(step(pre, 0, { type: "draw" }));
    expect(after.preCalled[0]).toBe(false);
  });

  it("내 차례가 아닐 때 두 장이면 미리 외침이 아니라 헛외침", () => {
    const s = createOnecardScenario({
      hands: [
        ["H9", "H8", "H7"],
        ["D3", "D4"],
      ],
      pile: ["H5"],
    });
    expect(judgeShout(s, 1, s.turnNo)).toEqual({ kind: "false" });
  });

  it("외치지 않고 한 장이 되면 본인 시간 P가 열리고, 그 안에 외치면 안전", () => {
    const s = forgot();
    expect(shoutWindows(s)).toEqual([
      { id: 1, seat: 0, kind: "selfWindow", ms: 1000 },
    ]);
    const [safe, events] = shout(s, 0);
    expect(events).toEqual([{ type: "shouted", seat: 0 }]);
    expect(safe.called[0]).toBe(true);
    expect(shoutWindows(safe)).toEqual([]);
    expect(counts(safe)).toEqual([1, 3, 3, 3]);
  });

  it("본인 시간이 0이면 바로 잡기 창", () => {
    expect(shoutWindows(forgot({ selfWindowMs: 0 }))).toEqual([
      { id: 1, seat: 0, kind: "catchWindow", ms: 3000 },
    ]);
  });

  it("본인 외침 보상(옵션): 다른 사람들이 한 장씩", () => {
    const [safe, events] = shout(forgot({ shoutReward: true }), 0);
    expect(counts(safe)).toEqual([1, 4, 4, 4]);
    expect(events.filter((e) => e.type === "drew")).toHaveLength(3);
  });
});

describe("P 안 남의 외침과 P 끝 잡기", () => {
  it("P 안에 온 남의 외침은 헛외침도 잡기도 아니다. 본인이 이어서 외치면 그냥 지나간다", () => {
    const [held, events] = shout(forgot(), 2);
    expect(events).toEqual([{ type: "shouted", seat: 2 }]);
    expect(counts(held)).toEqual([1, 3, 3, 3]);
    expect(held.windows[0]?.heldBy).toBe(2);
    const [safe] = shout(held, 0);
    expect(counts(safe)).toEqual([1, 3, 3, 3]);
    expect(safe.called[0]).toBe(true);
  });

  it("P가 끝날 때 본인이 안 외쳤으면 P 안에 외친 처음 사람이 잡은 것이 된다", () => {
    let [s] = shout(forgot(), 2);
    [s] = shout(s, 3);
    expect(s.windows[0]?.heldBy).toBe(2);
    const [after, events] = okEvents(
      step(s, 1, { type: "timeout", kind: "selfWindow", target: 0 }),
    );
    expect(events).toEqual([
      { type: "caught", seat: 2, target: 0 },
      { type: "drew", seat: 0, count: 1, reason: "caught" },
    ]);
    expect(counts(after)).toEqual([2, 3, 3, 3]);
    expect(shoutWindows(after)).toEqual([]);
  });

  it("P가 끝날 때 아무도 안 외쳤으면 잡기 창 T가 새 번호로 열린다", () => {
    const after = ok(
      step(forgot(), 1, { type: "timeout", kind: "selfWindow", target: 0 }),
    );
    expect(shoutWindows(after)).toEqual([
      { id: 2, seat: 0, kind: "catchWindow", ms: 3000 },
    ]);
  });
});

describe("잡기 창 T", () => {
  const catchOpen = (rules: Partial<OnecardRules> = {}) =>
    ok(
      step(forgot(rules), 1, {
        type: "timeout",
        kind: "selfWindow",
        target: 0,
      }),
    );

  it("창 안에 남이 외치면 잡힌다. 잡는 사람끼리 순서는 없고 처음 처리된 사람만 기록", () => {
    const s = catchOpen();
    const seen = s.turnNo;
    const [caught, events] = shout(s, 3, seen);
    expect(events).toEqual([
      { type: "shouted", seat: 3 },
      { type: "caught", seat: 3, target: 0 },
      { type: "drew", seat: 0, count: 1, reason: "caught" },
    ]);
    expect(counts(caught)).toEqual([2, 3, 3, 3]);
    // 같은 판을 보고 늦게 닿은 둘째 사람은 벌칙 없음(늦음)
    expect(judgeShout(caught, 2, seen)).toEqual({ kind: "late" });
    const [late, more] = shout(caught, 2, seen);
    expect(more).toEqual([{ type: "shouted", seat: 2 }]);
    expect(counts(late)).toEqual([2, 3, 3, 3]);
  });

  it("잡기 벌칙 2장(옵션)", () => {
    const [caught] = shout(catchOpen({ catchPenalty: 2 }), 1);
    expect(counts(caught)).toEqual([3, 3, 3, 3]);
  });

  it("본인 시간이 지난 뒤 본인 외침은 받지 않는다(벌칙도 없음, 여전히 잡힐 수 있다)", () => {
    const s = catchOpen();
    expect(judgeShout(s, 0, s.turnNo)).toEqual({ kind: "lateSelf" });
    const [after] = shout(s, 0);
    expect(counts(after)).toEqual([1, 3, 3, 3]);
    expect(after.called[0]).toBe(false);
    const [caught] = shout(after, 1);
    expect(counts(caught)).toEqual([2, 3, 3, 3]);
  });

  it("창이 닫힌 뒤: 같은 판을 보고 누르면 늦음(벌칙 없음), 다음 판부터는 헛외침", () => {
    const closed = ok(
      step(catchOpen(), 1, { type: "timeout", kind: "catchWindow", target: 0 }),
    );
    expect(shoutWindows(closed)).toEqual([]);
    expect(judgeShout(closed, 2, closed.turnNo)).toEqual({ kind: "late" });
    const next = ok(step(closed, 1, { type: "draw" }));
    const [after, events] = shout(next, 2);
    expect(events).toEqual([
      { type: "shouted", seat: 2 },
      { type: "falseShout", seat: 2 },
      { type: "drew", seat: 2, count: 1, reason: "falseShout" },
    ]);
    expect(counts(after)).toEqual([1, 4, 4, 3]);
  });

  it("잡기 창이 열리자 세 사람이 같은 판을 보고 연달아 외쳐도: 첫 사람만 잡고 나머지는 벌칙 없음", () => {
    const s = catchOpen();
    const seen = s.turnNo;
    const [first, e1] = shout(s, 1, seen);
    expect(e1).toContainEqual({ type: "caught", seat: 1, target: 0 });
    const [second, e2] = shout(first, 2, seen);
    const [third, e3] = shout(second, 3, seen);
    // 외침과 벌칙 먹기는 판 번호를 올리지 않아 누구도 옛 판으로 버려지지 않는다
    expect(third.turnNo).toBe(seen);
    for (const e of [...e2, ...e3]) {
      expect(e.type).toBe("shouted");
    }
    expect(judgeShout(second, 3, seen)).toEqual({ kind: "late" });
    expect(counts(third)).toEqual([2, 3, 3, 3]);
  });

  it("본인 시간 끝 직후, 그 전 판 번호 그대로의 잡기가 받아진다", () => {
    const s = forgot();
    const seen = s.turnNo;
    const opened = ok(
      step(s, 2, { type: "timeout", kind: "selfWindow", target: 0 }),
    );
    expect(opened.turnNo).toBe(seen);
    expect(judgeShout(opened, 3, seen)).toEqual({
      kind: "catch",
      targets: [0],
      held: [],
    });
    const [caught] = shout(opened, 3, seen);
    expect(counts(caught)).toEqual([2, 3, 3, 3]);
  });

  it("그 사람의 손패가 바뀌면 창이 일찍 닫히고, 늦은 시간 끝은 받지 않는다", () => {
    let s = catchOpen();
    // 1·2·3이 먹어 다시 0 차례
    s = ok(step(s, 1, { type: "draw" }));
    s = ok(step(s, 2, { type: "draw" }));
    s = ok(step(s, 3, { type: "draw" }));
    expect(shoutWindows(s)).toHaveLength(1);
    s = ok(step(s, 0, { type: "draw" }));
    expect(shoutWindows(s)).toEqual([]);
    expect(
      step(s, 1, { type: "timeout", kind: "catchWindow", target: 0 }).ok,
    ).toBe(false);
  });

  it("마지막 카드를 내도 창이 닫힌다", () => {
    let s = catchOpen();
    s = ok(step(s, 1, { type: "draw" }));
    s = ok(step(s, 2, { type: "draw" }));
    s = ok(step(s, 3, { type: "draw" }));
    s = ok(step(s, 0, { type: "play", card: "H8" }));
    expect(s.finished).toEqual([0]);
    expect(shoutWindows(s)).toEqual([]);
  });

  it("잡히는 사람이 둘이면 한 번 외침으로 둘 다 잡는다", () => {
    const s0 = createOnecardScenario({
      rules: { selfWindowMs: 0 },
      hands: [
        ["H9", "H8"],
        ["H3", "H4"],
        ["S3", "S4", "S5"],
      ],
      pile: ["H5"],
    });
    let s = ok(step(s0, 0, { type: "play", card: "H9" }));
    s = ok(step(s, 1, { type: "play", card: "H3" }));
    expect(shoutWindows(s).map((w) => w.seat)).toEqual([0, 1]);
    const [caught, events] = shout(s, 2);
    expect(events.filter((e) => e.type === "caught")).toHaveLength(2);
    expect(counts(caught)).toEqual([2, 2, 3]);
  });
});

describe("헛외침·판 번호(seen)", () => {
  it("아무도 잡을 사람이 없으면 헛외침, 벌칙 옵션 0이면 먹지 않는다", () => {
    const [after] = shout(table(), 1);
    expect(counts(after)).toEqual([2, 4, 3, 3]);
    const [none, events] = shout(table({ falseShoutPenalty: 0 }), 1);
    expect(counts(none)).toEqual([2, 3, 3, 3]);
    expect(events).toContainEqual({ type: "falseShout", seat: 1 });
  });

  it("헛외침 벌칙 2장(옵션)", () => {
    const [after] = shout(table({ falseShoutPenalty: 2 }), 1);
    expect(counts(after)).toEqual([2, 5, 3, 3]);
  });

  it("한 장이 되기 전 판을 보고 누르면 그 판 기준으로 헛외침", () => {
    const before = table();
    const s = forgot();
    expect(judgeShout(s, 2, before.turnNo)).toEqual({ kind: "false" });
  });

  it("잊은 판을 보고 눌렀는데 그사이 본인이 외쳤으면 벌칙 없음(늦음)", () => {
    const s = forgot();
    const seen = s.turnNo;
    const [safe] = shout(s, 0);
    expect(judgeShout(safe, 2, seen)).toEqual({ kind: "late" });
    // 외침은 판 번호를 올리지 않으므로 같은 판이면 여전히 늦음
    expect(safe.turnNo).toBe(seen);
    // 다음 차례 행동 뒤 판을 보고 누르면 헛외침
    const next = ok(step(safe, 1, { type: "draw" }));
    expect(judgeShout(next, 2, next.turnNo)).toEqual({ kind: "false" });
  });

  it("2수 넘게 지난 판을 가리키면 벌칙 없이 버린다", () => {
    let s = table();
    const seen = s.turnNo;
    s = ok(step(s, 0, { type: "draw" }));
    s = ok(step(s, 1, { type: "draw" }));
    expect(judgeShout(s, 3, seen)).toEqual({ kind: "false" });
    s = ok(step(s, 2, { type: "draw" }));
    expect(judgeShout(s, 3, seen)).toEqual({ kind: "stale" });
    const [after, events] = shout(s, 3, seen);
    expect(events).toEqual([{ type: "shouted", seat: 3 }]);
    expect(counts(after)).toEqual(counts(s));
    expect(after.version).toBe(s.version + 1);
  });

  it("앞으로의 판 번호·빠진 자리는 받지 않는다", () => {
    const s = table();
    expect(step(s, 1, { type: "shout", seen: s.turnNo + 1 }).ok).toBe(false);
    expect(step(s, 1, { type: "shout", seen: -1 }).ok).toBe(false);
    const out = { ...s, finished: [1] };
    expect(step(out, 1, { type: "shout", seen: s.turnNo }).ok).toBe(false);
  });

  it("없는 창의 시간 끝은 받지 않는다", () => {
    const s = table();
    expect(
      step(s, 0, { type: "timeout", kind: "selfWindow", target: 0 }).ok,
    ).toBe(false);
    expect(
      step(forgot(), 0, { type: "timeout", kind: "catchWindow", target: 0 }).ok,
    ).toBe(false);
  });

  it("벌칙으로 먹다가 더미가 바닥나면 다시 섞기를 기다린다", () => {
    const s = createOnecardScenario({
      hands: [
        ["H9", "H8"],
        ["D3", "D4"],
      ],
      pile: ["C3", "C4", "H5"],
      deck: [],
    });
    const [waiting, events] = shout(s, 1);
    expect(waiting.phase).toBe("reshuffle");
    expect(events.at(-1)).toEqual({ type: "reshuffleNeeded", count: 2 });
    // 기다리는 동안에도 외칠 수 있고, 벌칙은 줄을 선다
    const [more] = shout(waiting, 1);
    expect(more.queue).toEqual([
      { seat: 1, left: 1, reason: "falseShout" },
      { seat: 1, left: 1, reason: "falseShout" },
    ]);
    const after = ok(step(more, 0, { type: "reshuffle", order: ["C4", "C3"] }));
    expect(counts(after)).toEqual([2, 4]);
    expect(after.phase).toBe("play");
    expect(after.turn).toBe(0);
  });
});
