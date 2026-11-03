import { describe, expect, it } from "vitest";

import {
  assetsOf,
  debtPlan,
  legalActions,
  pendingSeats,
  standingsOf,
  step,
} from "./match";
import { LONG_RULES } from "./rules";
import type { GalaxyState } from "./state";
import { chainAction, must, paysOf, refused, roll, scene } from "./test-utils";

type SceneOptions = NonNullable<Parameters<typeof scene>[0]>;

/** 0번 자리가 소행성대(8)에서 2·4로 시리우스(14)에 멈춘다 */
function landOnSirius(options: SceneOptions) {
  return roll(scene({ positions: [8, 0, 0, 0], ...options }), [2, 4]);
}

const cma = (owner: number, level: number) =>
  [13, 14, 15].map((square) => ({ square, owner, level }));

describe("빚 정리와 운항 중단(2-9)", () => {
  it("모자라지만 정리하면 낼 수 있으면 빚 정리 단계, 별빛이 넉넉해지면 바로 갚는다", () => {
    const { state } = landOnSirius({
      cash: [10, 1000, 1000, 1000],
      stars: [
        { square: 14, owner: 1 },
        { square: 1, owner: 0 },
      ],
    });
    expect(state.phase).toBe("debt");
    expect(state.debt).toEqual({ seat: 0, to: 1, amount: 20, reason: "rent" });
    expect(pendingSeats(state)).toEqual([0]);
    expect(refused(state, 0, { type: "end" })).toContain("차례가 아니");
    expect(refused(state, 0, { type: "unmortgage", square: 1 })).toContain(
      "빚",
    );
    const { state: paid, events } = must(state, 0, {
      type: "mortgage",
      square: 1,
    });
    expect(paysOf(events).map((p) => [p.from, p.to, p.amount])).toEqual([
      [-1, 0, 30],
      [0, 1, 20],
    ]);
    expect(paid.debt).toBeNull();
    expect(paid.phase).toBe("turn");
    expect(paid.turn.next).toBe("end");
    expect(paid.cash[0]).toBe(20);
  });

  it("빚 정리 제안: 높은 정거장부터 고르게 내리고, 그래도 모자라면 싼 별부터 맡긴다", () => {
    const { state } = landOnSirius({
      cash: [0, 1000, 1000, 1000],
      stars: [
        ...cma(1, 3),
        ...[9, 10, 11].map((square) => ({ square, owner: 0, level: 3 })),
      ],
    });
    expect(state.debt?.amount).toBe(290);
    const plan = debtPlan(state);
    expect(plan.map((a) => a.type)).toEqual([
      "sell",
      "sell",
      "sell",
      "sell",
      "sell",
      "sell",
      "mortgage",
    ]);
    let s = state;
    for (const action of plan) s = must(s, 0, action).state;
    expect(s.phase).toBe("turn");
    expect(s.cash[0]).toBe(270 + 90 - 290);
    expect(debtPlan(s)).toEqual([]);
  });

  it("남에게 낼 빚을 정리해도 못 내면 운항 중단: 별(맡긴 그대로)과 별빛이 그 사람에게, 기본 판은 그 차례에 끝난다", () => {
    const { state, events } = landOnSirius({
      cash: [5, 1000, 1000, 1000],
      stars: [...cma(1, 3), { square: 1, owner: 0, mortgaged: true }],
    });
    expect(events).toContainEqual({ type: "bankrupt", seat: 0, to: 1 });
    expect(paysOf(events).map((p) => [p.from, p.to, p.amount])).toEqual([
      [0, 1, 5],
    ]);
    expect(state.owners[1]).toBe(1);
    expect(state.mortgaged[1]).toBe(true);
    expect(state.out[0]).toBe(true);
    expect(state.phase).toBe("gameOver");
    expect(state.result?.kind).toBe("bankrupt");
    expect(state.result?.seat).toBe(0);
    expect(state.result?.standings.at(-1)).toMatchObject({
      seat: 0,
      rank: 4,
      out: true,
    });
    expect(state.result?.standings[0]?.seat).toBe(1);
  });

  it("우주국에 낼 빚이면 별은 주인 없는 별로 돌아간다", () => {
    const s = scene({
      positions: [1, 0, 0, 0],
      cash: [10, 1000, 1000, 1000],
      deck: [7],
      stars: [{ square: 2, owner: 0, mortgaged: true }],
    });
    const { state, events } = roll(s, [1, 2]);
    expect(events).toContainEqual({ type: "bankrupt", seat: 0, to: -1 });
    expect(state.owners[2]).toBe(-1);
    expect(state.mortgaged[2]).toBe(false);
    expect(state.bankIn).toBe(10);
    expect(state.phase).toBe("gameOver");
  });

  it("차례가 아닌 사람의 빚(공문 9)도 그 사람이 정리한다", () => {
    const s = scene({
      positions: [1, 0, 0, 0],
      cash: [1000, 50, 900, 1000],
      deck: [9],
      stars: cma(1, 3),
    });
    const { state } = roll(s, [1, 2]);
    expect(state.phase).toBe("debt");
    expect(state.debt).toMatchObject({ seat: 1, to: 2, amount: 100 });
    expect(pendingSeats(state)).toEqual([1]);
    const paid = must(state, 1, { type: "sell", square: 14 }).state;
    expect(paid.phase).toBe("turn");
    expect(paid.turn.seat).toBe(0);
    expect(paid.cash[2]).toBe(1000);
  });

  it("긴 판은 운항을 멈춘 사람을 빼고 이어 가고, 한 사람이 남으면 끝난다", () => {
    const rules = { ...LONG_RULES, players: 3 as const };
    const { state } = landOnSirius({
      rules,
      cash: [0, 1000, 1000],
      positions: [8, 0, 0],
      stars: cma(1, 3),
    });
    expect(state.out[0]).toBe(true);
    expect(state.phase).toBe("turn");
    expect(state.turn.seat).toBe(1);
    expect(refused(state, 0, { type: "roll" })).toContain("운항");
    const two = landOnSirius({
      rules: { ...LONG_RULES, players: 2 },
      cash: [0, 1000],
      positions: [8, 0],
      stars: cma(1, 3),
    }).state;
    expect(two.phase).toBe("gameOver");
    expect(two.result?.kind).toBe("lastStanding");
    expect(two.result?.standings[0]?.seat).toBe(1);
  });
});

describe("끝과 순위(2-10)", () => {
  /** 마지막 자리 차례(첫 차례는 0번) */
  const lastTurn = (options: SceneOptions = {}): GalaxyState => ({
    ...scene({ turn: 3, ...options }),
    starter: 0,
  });

  it("정한 차례 수를 마치면 끝나고 자산으로 순위를 매긴다", () => {
    let s = lastTurn({ round: 20, stars: [{ square: 3, owner: 3 }] });
    s = roll(s, [1, 2]).state;
    const { state, events } = must(s, 3, { type: "end" });
    expect(state.phase).toBe("gameOver");
    expect(state.result?.kind).toBe("turns");
    expect(state.result?.standings.map((r) => [r.seat, r.rank])).toEqual([
      [3, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
    expect(events.at(-1)?.type).toBe("gameEnded");
    expect(legalActions(state, 0)).toEqual([]);
  });

  it("돌림 가운데에서는 끝나지 않고, 돌림이 바뀌면 제철 하늘이 바뀐다", () => {
    const mid = must(
      roll(scene({ turn: 1, positions: [0, 29, 0, 0] }), [1, 2]).state,
      1,
      {
        type: "end",
      },
    ).state;
    expect(mid.turn.seat).toBe(2);
    let s = lastTurn({ round: 5, positions: [0, 0, 0, 29] });
    s = roll(s, [1, 2]).state;
    const { state, events } = must(s, 3, { type: "end" });
    expect(state.round).toBe(6);
    expect(state.season).toBe(1);
    expect(events).toContainEqual({ type: "seasonChanged", season: 1 });
    expect(state.turn.seat).toBe(0);
  });

  it("시간 상한: 엔진 밖 시계가 알리면 그 돌림을 마치고 끝난다", () => {
    const s = scene();
    const up = must(s, 2, { type: "timeUp" }).state;
    expect(up.timeUp).toBe(true);
    expect(refused(up, 2, { type: "timeUp" })).toContain("이미");
    expect(
      refused(scene({ rules: LONG_RULES }), 0, { type: "timeUp" }),
    ).toContain("긴 판");
    let t = { ...lastTurn({ positions: [0, 0, 0, 29] }), timeUp: true };
    t = roll(t, [1, 2]).state;
    const ended = must(t, 3, { type: "end" }).state;
    expect(ended.result?.kind).toBe("timeUp");
  });

  it("자산 = 별빛 + 별 값(맡긴 별은 절반) + 지은 정거장 + 완성 별자리마다 100", () => {
    const s = scene({
      cash: [500, 1000, 1000, 1000],
      stars: [...cma(0, 2), { square: 1, owner: 0, mortgaged: true }],
    });
    expect(assetsOf(s, 0)).toBe(500 + 620 + 300 + 30 + 100);
    expect(standingsOf(s)[0]?.seat).toBe(0);
  });

  it("기권하면 끝나고 기권한 사람이 꼴찌", () => {
    const { state } = must(scene({ cash: [100, 1000, 3000, 1000] }), 2, {
      type: "resign",
    });
    expect(state.result?.kind).toBe("resign");
    expect(state.result?.standings.at(-1)?.seat).toBe(2);
    expect(refused(state, 0, { type: "roll" })).toContain("끝난");
  });

  it("끝내기: 공개를 기다리던 사람이 하나뿐이면 그 사람이 꼴찌, 아니면 순위 없이", () => {
    let s = must(scene(), 0, { type: "roll" }).state;
    expect(s.phase).toBe("reveal");
    const r = step(s, 0, { type: "retire" });
    expect(r.ok && r.state.result).toBeNull();
    for (const seat of [0, 1, 2]) s = must(s, seat, chainAction(s, seat)).state;
    const { state } = must(s, 0, { type: "retire" });
    expect(state.result?.kind).toBe("forfeit");
    expect(state.result?.seat).toBe(3);
    expect(state.retired).toBe(true);
  });
});
