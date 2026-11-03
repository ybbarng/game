import type { Card } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";

import type { FairWire } from "./device";
import { onecardNet } from "./onecard-fixture";
import { ONECARD_SHOWN_WAIT_MS } from "./onecard-table";

/** 메시지 순서가 바뀌는 망(열쇠는 방장을 거치지 않고 직접 온다)에서 정직한 방장을 잘못 짚지 않는다 */
describe("원카드 다시 섞기: 메시지 순서", () => {
  it("카드를 낸 사람의 열쇠가 다시 섞기 알림보다 늦게 닿아도 정직한 방장을 짚지 않는다", async () => {
    // 0번 기기가 낸 카드의 열쇠를 붙잡아 두었다가, 다시 섞기 알림을 처리한 뒤에 1번 기기에 넣는다.
    let holding = false;
    const held: FairWire[] = [];
    const net = onecardNet({
      drop: (message, from) => {
        if (!holding || from !== 0) return false;
        held.push(message);
        return true;
      },
    });
    await net.settle();
    net.draw(0, 3);
    await net.settle();
    holding = true;
    net.play(0, [5, 6, 7]);
    await net.settle();
    const known = net.decks[0]?.knownCards(1) as Map<number, Card>;
    const pool = [4, 5, 6].map((g) => known.get(g) as Card);
    net.reshuffle(1, pool);
    await net.settle();
    // 1번 기기는 아직 낸 카드를 모른다(열쇠가 알림보다 늦다). 예전에는 여기서 방장을 짚었다.
    expect(net.decks[1]?.publicCards(1).has(5)).toBe(false);
    expect(net.incidents).toEqual([[], []]);
    holding = false;
    for (const message of held.splice(0)) net.devices[1]?.receive(message, 0);
    await net.settle();
    for (let i = 0; net.clock.pending() > 0; i++) {
      if (i > 10) throw new Error("기다림이 끝나지 않는다");
      net.clock.advance(ONECARD_SHOWN_WAIT_MS);
      await net.settle();
    }
    expect(net.incidents).toEqual([[], []]);
    expect(net.decks[1]?.segmentReady(1, 1)).toBe(true);
  });
});
