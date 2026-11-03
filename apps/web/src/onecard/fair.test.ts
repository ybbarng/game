import {
  checkOnecardTable,
  flipCount,
  type OnecardRoundDeal,
  onecardLayout,
  sameCards,
} from "@game/fair-play";
import {
  type Action,
  createFairMatch,
  reshuffleRequest,
  STANDARD_ONECARD_RULES,
  step,
  withRefill,
} from "@game/onecard-engine";
import { describe, expect, it } from "vitest";

import { onecardFair } from "./fair";

/*
 * 판 끝 다시 계산(checkOnecardTable)을 진짜 카드로 짠 짧은 판으로 본다(섞기 사슬 없이: 사슬·열쇠는 fair-play 시험이 본다).
 * 덱 14장: 손패 5·5(자리 0~9), 처음 펼칠 카드(자리 10), 더미 석 장(자리 11~13).
 * 처음 카드 ♠7은 특수 카드라 버린 더미 밑으로 가고 더미 맨 위 ♥5를 다시 편다.
 */
const rules = {
  ...STANDARD_ONECARD_RULES,
  players: 2,
  handSize: 5 as const,
  endOnFirst: true,
};
const ORDER = [
  ...["H3", "H4", "C3", "C4", "C5"],
  ...["D4", "D5", "D6", "D8", "C9"],
  "S7",
  ...["H5", "D9", "D3"],
];
const layout = onecardLayout([5, 5], 1, ORDER.length);
const at = (slot: number) => ORDER[slot] as string;
const preset = {
  hands: layout.hands.map((s) => s.map(at)),
  open: layout.open.map(at),
  deck: layout.deck.map(at),
};

/** ♥3 냄, 1 먹음(◆9), 0 먹음(◆3), 1 먹음 → 더미가 비어 다시 섞기(♠7·♥5) → 1이 새 더미 맨 위를 먹음 */
const LOG: { seat: number; action: Action }[] = [
  { seat: 0, action: { type: "play", card: "H3" } },
  { seat: 1, action: { type: "draw" } },
  { seat: 0, action: { type: "draw" } },
  { seat: 1, action: { type: "draw" } },
  { seat: 0, action: { type: "reshuffle", order: [] } },
];
const REFILL = ["H5", "S7"];

function deals(declared = ["S7", "H5"]): Map<number, OnecardRoundDeal> {
  const cards = new Map<number, string>(ORDER.map((c, i) => [i, c]));
  for (const [i, c] of REFILL.entries()) cards.set(ORDER.length + i, c);
  return new Map([
    [
      1,
      {
        preset,
        refills: [REFILL],
        declared: [declared],
        cards,
      } as OnecardRoundDeal,
    ],
  ]);
}

/** 방장이 연 더미 자리: 다시 펴기(모두), 1·0·(다시 섞은 뒤)1 */
const ASKED = [{ to: -1 }, { to: 1 }, { to: 0 }, { to: 1 }];

const check = (
  options: { declared?: string[]; asked?: { to: number }[] } = {},
) =>
  checkOnecardTable(
    onecardFair,
    rules,
    0,
    LOG,
    deals(options.declared),
    { of: () => options.asked ?? ASKED, deviceOf: (seat) => seat },
    flipCount,
  );

describe("원카드 멘탈 포커 연결 코드", () => {
  it("처음 카드 다시 펴기(flipAgain)는 onecardLayout의 더미 자리 순서와 맞는다: 다시 편 만큼 더미 앞 자리가 빠진다", () => {
    const { state, events } = createFairMatch(rules, preset);
    expect(flipCount(events)).toBe(1);
    // 엔진 더미 = 레이아웃 더미 자리에서 다시 편 만큼 뺀 나머지(같은 순서). 특수 카드는 버린 더미 밑으로.
    expect(state.deck).toEqual(layout.deck.slice(1).map(at));
    expect(state.pile).toEqual([at(layout.open[0] as number), at(11)]);
  });

  it("reshuffleRequest(엔진이 다시 섞을 카드)와 checkOnecardReplay가 보는 pool이 같은 카드다", () => {
    let state = createFairMatch(rules, preset).state;
    for (const entry of LOG.slice(0, 4)) {
      const r = step(state, entry.seat, entry.action);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    expect(state.phase).toBe("reshuffle");
    const wanted = reshuffleRequest(state) ?? [];
    expect(sameCards(wanted, onecardFair.reshufflePool(state))).toBe(true);
    expect(wanted).toEqual(["S7", "H5"]);
    // 방장 엔진(자리 표 새 더미)도 같은 걸음을 받아들인다
    const tokens = step(withRefill(state, ["?_14", "?_15"]), 0, {
      type: "reshuffle",
      order: [],
    });
    expect(tokens.ok).toBe(true);
  });

  it("정직한 기록은 통과한다(다시 섞은 더미까지 진짜 카드로)", () => {
    const result = check();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.upTo).toBe(LOG.length);
      expect(result.state.hands[1]).toContain("H5");
    }
  });

  it("방장이 다시 섞을 카드를 버린 더미와 다르게 알렸으면 짚는다", () => {
    const result = check({ declared: ["S7", "D9"] });
    expect(result).toMatchObject({
      ok: false,
      seat: 0,
      reason: "방장이 다시 섞을 카드를 버린 더미와 다르게 알렸다",
    });
  });

  it("방장이 먹을 카드를 다른 기기에 열었으면 짚는다", () => {
    const result = check({
      asked: [{ to: -1 }, { to: 0 }, { to: 0 }, { to: 1 }],
    });
    expect(result).toMatchObject({ ok: false, seat: 0 });
  });

  it("다시 펴지 않을 때 더미를 모두에게 열었거나 다시 편 만큼 열지 않았으면 짚는다", () => {
    expect(check({ asked: ASKED.slice(1) })).toMatchObject({
      ok: false,
      reason: "방장이 처음 카드를 엔진과 다르게 다시 폈다",
    });
    expect(check({ asked: [{ to: 1 }, ...ASKED.slice(1)] })).toMatchObject({
      ok: false,
    });
  });
});
