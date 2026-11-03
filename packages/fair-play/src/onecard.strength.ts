import { describe, expect, it } from "vitest";

import { PROOF_DEFER_MS } from "./device";
import { network } from "./device-fixture";
import { ONECARD_CARDS, onecardDealId } from "./onecard-table";

declare const performance: { now(): number };
declare const console: { log(...args: unknown[]): void };
declare function setTimeout(callback: () => void, ms: number): unknown;

const tick = () => new Promise<void>((r) => setTimeout(() => r(), 0));

/**
 * 원카드 판 도중 다시 섞기 계산 시간(r255, 한 기기에서 모든 사람 몫을 계산한다. 메시지 지연은 없다).
 * `OnecardDeck.reshuffle` + `draw`가 하는 일과 같다: 새 기기 판으로 버린 더미 n장을 섞고(사람마다 섞기 +
 * 다시 잠그기) 맨 위 두 장을 한 사람에게 연다.
 * - 뽑기까지: 사슬이 끝나 뽑는 사람이 두 장을 연 때(그동안 그 사람만 기다린다)
 * - 한 사람 몫: 한 기기가 사슬에서 한 계산(섞기 + 다시 잠그기)의 합 가운데 가장 큰 것
 * - 증명: 섞기 증명(약속·응답·확인)이 모두 끝나기까지. 판을 멈추지 않고 뒤에서 돈다
 */
describe("원카드 다시 섞기 계산 시간 (pnpm --filter @game/fair-play bench)", () => {
  it.each([
    [4, 40],
    [2, 40],
    [4, 20],
  ])(
    "%i명 %i장",
    async (n, size) => {
      const ids = Array.from({ length: n }, (_, i) => i);
      const net = network(ids);
      const deal = onecardDealId(1, 1);
      const cards = ONECARD_CARDS.slice(0, size);
      const compute = new Map<number, number>();
      for (const d of net.devices)
        d.on("timing", (_deal, what, ms) => {
          if (what === "compute")
            compute.set(d.id, (compute.get(d.id) ?? 0) + ms);
        });
      const t0 = performance.now();
      for (const d of net.devices) {
        d.start(deal, ids, cards);
        d.assign(
          deal,
          new Map([
            [0, 1],
            [1, 1],
          ]),
        );
      }
      const drawer = net.devices[1];
      while ((drawer?.myCards(deal).size ?? 0) < 2) await tick();
      const t1 = performance.now();
      await net.settle();
      // 카드가 없는 기기는 증명을 미뤄 둔다(PROOF_DEFER_MS). 시계를 넘겨 모두 증명하게 한다(미루는 시간은 빼고 잰다).
      net.clock.advance(PROOF_DEFER_MS);
      await net.settle();
      const t2 = performance.now();
      expect(drawer?.myCards(deal).size).toBe(2);
      console.log(
        `${n}명 ${size}장: 뽑기까지 ${Math.round(t1 - t0)}ms, 한 사람 몫(사슬, 가장 큰) ${Math.round(Math.max(...compute.values()))}ms, 뽑은 뒤 증명 끝까지 ${Math.round(t2 - t1)}ms`,
      );
    },
    600_000,
  );
});
