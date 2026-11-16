import { describe, expect, it } from "vitest";

import { PROOF_DEFER_MS } from "./device";
import { network } from "./device-fixture";
import { ONECARD_CARDS, OnecardDeck, onecardDealId } from "./onecard-table";

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

/**
 * 원카드 판 끝 열기와 덱 조각 확인 시간(r255, 한 기기에서 모든 사람 몫을 계산한다. 메시지 지연은 없다).
 * 처음 덱 54장(손패 7장씩, 처음 펼칠 카드 한 장) + 다시 섞은 조각 `reshuffles`개(20장씩)를 두고, 모두가
 * `OnecardDeck.revealAll`로 모든 조각의 열쇠를 공개한 뒤 모든 기기가 조각마다 카드를 열어 확인하기까지(`roundDeal`).
 * 열쇠 증명 만들기·확인과 조각별 카드 확인이 들어간다. 진짜 카드로 엔진을 다시 돌리는 일은 엔진 걸음뿐이라 뺐다.
 * 한 사람 몫은 전체를 사람 수로 나눈 어림이다(사람마다 하는 일이 같다: 내 열쇠 증명, 남의 증명 확인)
 */
describe("원카드 판 끝 열기와 확인 시간 (pnpm --filter @game/fair-play bench)", () => {
  it.each([
    [4, 3],
    [4, 1],
    [2, 3],
  ])(
    "%i명 다시 섞기 %i번",
    async (n, reshuffles) => {
      const ids = Array.from({ length: n }, (_, i) => i);
      const net = network(ids);
      const decks = net.devices.map(
        (device) =>
          new OnecardDeck({
            device,
            devices: ids,
            deviceOf: (seat) => seat,
            onIncident: (x) => {
              throw new Error(`정직한 판에서 알림: ${x.reason}`);
            },
            clock: net.clock,
          }),
      );
      const [host] = decks as [OnecardDeck];
      for (const d of decks) d.beginRound(1, Array(n).fill(7));
      /** 지금 조각 더미를 사람마다 돌아가며 한 장씩 먹인다(다시 섞으려면 더미가 바닥나야 한다. 판 끝까지 남의 카드는 숨어 있다) */
      let turn = 0;
      const drawAll = () => {
        while (host.remaining(1) > 0) {
          const drawn = host.draw(1, turn++ % n, 1);
          for (const d of decks.slice(1))
            for (const r of drawn) d.request(r.deal, r.slot, r.to);
        }
      };
      drawAll();
      for (let k = 1; k <= reshuffles; k++) {
        const cards = ONECARD_CARDS.slice(0, 20);
        for (const d of decks) d.reshuffle(1, k, cards, { trusted: true });
        drawAll();
      }
      await net.settle();
      net.clock.advance(PROOF_DEFER_MS);
      await net.settle();
      const t0 = performance.now();
      for (const d of decks) d.revealAll(1);
      while (decks.some((d) => d.roundDeal(1) === null)) await tick();
      const t1 = performance.now();
      const cards = host.roundDeal(1)?.cards.size;
      expect(cards).toBe(54 + 20 * reshuffles);
      console.log(
        `${n}명 다시 섞기 ${reshuffles}번(카드 자리 ${cards}): 모두 열고 확인까지 ${Math.round(t1 - t0)}ms, 한 사람 몫(어림) ${Math.round((t1 - t0) / n)}ms`,
      );
    },
    600_000,
  );
});
