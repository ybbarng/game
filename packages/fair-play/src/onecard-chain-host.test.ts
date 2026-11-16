import type { Card } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";

import {
  audit,
  playRound,
  settled,
  THIRD_RESHUFFLE_STEP,
} from "./onecard-chain-fixture";
import type { OnecardDraw, OnecardRoundDeal } from "./onecard-table";

/* 세 번 다시 섞는 판에서 방장이 세 번째 다시 섞기 입력을 바꾸면 판 끝에 드러나 방장을 짚는다 */
describe("다시 섞기 입력을 바꾼 방장(세 번째 다시 섞기)", () => {
  it("모두에게 버린 더미 대신 맨 위 카드를 끼워 알리면: 사슬·증명·열린 카드 확인은 지나도 판 끝 검증이 그 걸음에서 방장을 짚는다", async () => {
    const { net, log } = await playRound({
      third: (pool, top) => ({ all: [pool[0], pool[1], top] as Card[] }),
    });
    expect(net.incidents).toEqual([[], []]);
    const guest = net.decks[1];
    const deal = guest?.roundDeal(1) as OnecardRoundDeal;
    const asked = guest?.requestsOf(1) as OnecardDraw[];
    expect(audit(log, deal, asked)).toEqual({
      ok: false,
      index: THIRD_RESHUFFLE_STEP,
      seat: 0,
      reason: "방장이 다시 섞을 카드를 버린 더미와 다르게 알렸다",
    });
  });

  it("알린 카드와 다른 카드로 자기 사슬을 시작하면(맨 위 카드를 끼움) 참가자가 판 끝에 방장을 짚는다", async () => {
    const { net } = await playRound({
      third: (pool, top) => ({ own: [pool[0], pool[1], top] as Card[] }),
    });
    expect(settled(net.incidents[1])).toMatchObject({ seat: 0 });
    expect(net.decks[1]?.roundDeal(1)).toBeNull();
  });
});
