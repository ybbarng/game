import type { Card } from "@game/mighty-engine";
import { describe, expect, it, vi } from "vitest";

import type { Incident } from "./coordinator";
import { type OnecardNet, onecardNet } from "./onecard-fixture";
import { type Party, Party as PartyClass } from "./protocol";

/** 기기가 기다리는 시간(증명 미루기 10초, 응답 30초의 두 배)을 넉넉히 넘긴다 */
const PROOF_WAIT_MS = 120_000;

/** 더미 석 장을 1번이 뽑아 내고, 버린 더미(맨 위 빼고) 석 장을 다시 섞을 준비를 한다 */
async function emptyDeck(net: OnecardNet): Promise<Card[]> {
  await net.settle();
  net.draw(1, 3);
  await net.settle();
  net.play(1, [5, 6, 7]);
  await net.settle();
  const pub = net.decks[0]?.publicCards(1) as Map<number, Card>;
  return [4, 5, 6, 7].map((g) => pub.get(g) as Card);
}

/** 할 일을 다 마치고 기다리는 시간(미룬 증명·응답 기다리기)이 다 지나게 한다 */
async function finish(net: OnecardNet): Promise<void> {
  await net.settle();
  for (let i = 0; net.clock.pending() > 0; i++) {
    if (i > 10) throw new Error("기다림이 끝나지 않는다");
    net.clock.advance(PROOF_WAIT_MS);
    await net.settle();
  }
}

/** 확정된(누군지 확인하는 중이 아닌) 마지막 알림 */
const settled = (list: Incident[] | undefined) =>
  (list ?? []).filter((i) => !i.pending).at(-1);

describe("다시 섞은 사슬을 조작하면 드러난다", () => {
  it("다시 섞을 때 한 장을 다른 카드의 복제로 바꾸면 섞기 증명이 그 기기를 짚는다", async () => {
    const net = onecardNet();
    const [a, b, c] = (await emptyDeck(net)) as [Card, Card, Card];
    // 속이는 기기(1번): 다시 섞은 석 장 덱에서 한 장을 복제로 바꾼다(0번이 뽑을 카드를 엿볼 수 있게).
    const real = PartyClass.prototype.lockAndShuffle;
    PartyClass.prototype.lockAndShuffle = async function (
      this: Party,
      deck,
      pass,
    ) {
      const out = await real.call(this, deck, pass);
      if (this.id === 1 && deck.length === 3) out[1] = out[2] as bigint;
      return out;
    };
    try {
      net.reshuffle(1, [a, b, c]);
      net.draw(0, 3);
      for (const d of net.decks) d.revealAll(1);
      await finish(net);
    } finally {
      PartyClass.prototype.lockAndShuffle = real;
    }
    // 속인 기기는 맞는 증명을 만들 수 없어 내지 못한다. 늦은 것만으로는 탓하지 않고, 판 끝에 같은 카드가
    // 두 번 열리면 범인을 찾는다(증명을 끝내지 않은 기기가 하나뿐이다).
    const seg1 = net.decks[0]?.dealsOf(1)[1] as number;
    const culprit = await net.devices[0]?.shuffleCulprit(seg1);
    expect(culprit?.device).toBe(1);
    await vi.waitFor(() =>
      expect(settled(net.incidents[0])).toMatchObject({ seat: 1 }),
    );
    expect(net.decks[0]?.roundDeal(1)).toBeNull();
  });

  it("방장이 알린 카드와 다른 카드로 다시 섞기 사슬을 시작하면(바꿔치기) 참가자가 방장을 짚는다", async () => {
    const net = onecardNet();
    const [a, b, c, top] = (await emptyDeck(net)) as [Card, Card, Card, Card];
    // 방장은 참가자에게 [a, b, c]를 알렸지만 자기 사슬은 [a, b, 맨 위 카드]로 시작한다.
    net.decks[0]?.reshuffle(1, 1, [a, b, top]);
    net.decks[1]?.reshuffle(1, 1, [a, b, c]);
    net.draw(1, 3);
    for (const d of net.decks) d.revealAll(1);
    await finish(net);
    expect(settled(net.incidents[1])).toMatchObject({ seat: 0 });
    expect(net.decks[1]?.roundDeal(1)).toBeNull();
  });
});
