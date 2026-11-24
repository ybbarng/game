import type { Card } from "@game/mighty-engine";
import { beforeAll, describe, expect, it } from "vitest";

import {
  audit,
  HONEST_LOG_LENGTH,
  type Played,
  playRound,
  shuffleChecks,
  THIRD_RESHUFFLE_STEP,
} from "./onecard-chain-fixture";
import { type OnecardNet, SMALL_DECK, TOY_SPEC } from "./onecard-fixture";
import {
  checkOnecardReplay,
  type OnecardDraw,
  type OnecardRoundDeal,
  reshuffleOrder,
  sameCards,
} from "./onecard-table";

/* 정직한 판 하나(세 번 다시 섞음)를 두고, 판 끝 검증이 덱 조각을 처음 덱부터 끝까지 잇는지 본다 */

let played: Played;
let deal: OnecardRoundDeal;
let asked: readonly OnecardDraw[];
beforeAll(async () => {
  played = await playRound();
  const host = played.net.decks[0] as OnecardNet["decks"][0];
  deal = host.roundDeal(1) as OnecardRoundDeal;
  asked = host.requestsOf(1);
});

describe("판 끝 검증은 다시 섞은 덱 조각을 처음 덱부터 끝까지 잇는다(세 번 다시 섞는 판)", () => {
  it("정직한 판: 조각 넷의 섞기 증명이 모두 맞고, 버린 더미 = 다음 섞기 입력으로 기록 끝까지 이어진다", async () => {
    const { net, pools, log } = played;
    expect(net.incidents).toEqual([[], []]);
    const host = net.decks[0] as OnecardNet["decks"][0];
    expect(host.reshuffles(1)).toBe(3);
    expect(net.decks[1]?.roundDeal(1)).toEqual(deal);
    // 사슬 잇기: 조각 0은 덱 전체, 조각 k의 입력은 그때 버린 더미(맨 위 뺀 것)이고 연 카드도 그것이다.
    expect(
      reshuffleOrder([
        ...deal.preset.hands.flat(),
        ...deal.preset.open,
        ...deal.preset.deck,
      ] as Card[]),
    ).toEqual(reshuffleOrder(SMALL_DECK));
    expect(deal.declared).toEqual(pools.map(reshuffleOrder));
    for (const [k, refill] of deal.refills.entries())
      expect(sameCards(refill, pools[k] as Card[])).toBe(true);
    for (const d of net.devices)
      for (const id of host.dealsOf(1))
        expect(await shuffleChecks(d, id)).toEqual([true]);

    expect(log).toHaveLength(HONEST_LOG_LENGTH);
    expect(asked).toHaveLength(12);
    const ok = audit(log, deal, asked);
    expect(ok).toMatchObject({ ok: true, upTo: log.length });
    if (ok.ok) expect(ok.state?.reshuffles).toBe(3);
  });

  it("세 번째 다시 섞기 입력에서 한 장을 빼고 알렸으면 그 걸음에서 방장을 짚는다", () => {
    const dropped = {
      ...deal,
      declared: [
        ...deal.declared.slice(0, 2),
        (deal.declared[2] as Card[]).slice(1),
      ],
    };
    expect(audit(played.log, dropped, asked)).toEqual({
      ok: false,
      index: THIRD_RESHUFFLE_STEP,
      seat: 0,
      reason: "방장이 다시 섞을 카드를 버린 더미와 다르게 알렸어요.",
    });
  });

  it("세 번째 조각이 없으면: 판 도중 검증은 그 앞까지만 보고 넘어가지만, 게임 끝 검증은 방장을 짚는다", () => {
    const short = {
      ...deal,
      refills: deal.refills.slice(0, 2),
      declared: deal.declared.slice(0, 2),
    };
    const { log } = played;
    expect(
      checkOnecardReplay(TOY_SPEC, null, 0, log, new Map([[1, short]])),
    ).toMatchObject({ ok: true, upTo: THIRD_RESHUFFLE_STEP });
    expect(audit(log, short, asked)).toEqual({
      ok: false,
      index: THIRD_RESHUFFLE_STEP,
      seat: 0,
      reason: "엔진은 3번째로 다시 섞었는데 방장이 그 덱 조각을 열지 않았어요.",
    });
  });

  it("엔진이 쓰지 않은 네 번째 조각을 열었으면 게임 끝 검증이 방장을 짚는다", () => {
    const extra = {
      ...deal,
      refills: [...deal.refills, ["S2"] as Card[]],
      declared: [...deal.declared, ["S2"] as Card[]],
    };
    expect(audit(played.log, extra, asked)).toEqual({
      ok: false,
      index: HONEST_LOG_LENGTH,
      seat: 0,
      reason:
        "방장이 엔진이 쓰지 않은 다시 섞기를 열었어요(덱 조각 5개, 엔진 다시 섞기 3번).",
    });
  });

  it("게임이 끝난 뒤 남은 더미 카드를 방장 기기에 하나 더 열었으면(마지막에 몰래 엿보기) 방장을 짚는다", () => {
    const peek = [...asked, { ...(asked.at(-1) as OnecardDraw), to: 0 }];
    expect(audit(played.log, deal, peek)).toEqual({
      ok: false,
      index: HONEST_LOG_LENGTH,
      seat: 0,
      reason: "방장이 엔진이 쓰지 않은 더미 카드를 열었어요.",
    });
  });
});
