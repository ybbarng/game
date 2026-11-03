import type { Card } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";

import { type FairDevice, groupOf, PROOF_DEFER_MS } from "./device";
import { network } from "./device-fixture";
import {
  onecardNet,
  SMALL_DECK,
  TOY_SPEC,
  type ToyAction,
} from "./onecard-fixture";
import {
  checkOnecardReplay,
  ONECARD_CARDS,
  OnecardDeck,
  type OnecardDraw,
  type OnecardLogged,
  type OnecardRoundDeal,
  onecardDealId,
  onecardLayout,
  reshuffleOrder,
} from "./onecard-table";
import { decode, encodedDeck } from "./protocol";

/** 그 기기 판의 섞기 증명 확인 결과(남의 섞기마다 하나) */
async function shuffleChecks(d: FairDevice, deal: number): Promise<boolean[]> {
  const ctx = (
    d as unknown as {
      deals: Map<
        number,
        {
          shuffles: Map<string, { checked: Map<number, Promise<boolean>> }>;
        }
      >;
    }
  ).deals.get(deal);
  return Promise.all(ctx?.shuffles.get("0:shuffle")?.checked.values() ?? []);
}

describe("원카드 덱과 자리 번호", () => {
  it("54장은 마이티 53장(흑백 조커 JK) + 컬러 조커 JC이고, JC도 잠그기 전 값으로 바꾸고 되돌린다", () => {
    expect(ONECARD_CARDS).toHaveLength(54);
    expect(new Set(ONECARD_CARDS).size).toBe(54);
    expect(ONECARD_CARDS.slice(-2)).toEqual(["JK", "JC"]);
    const g = groupOf("r255");
    expect(encodedDeck(g, ONECARD_CARDS).map((v) => decode(g, v))).toEqual([
      ...ONECARD_CARDS,
    ]);
  });

  it("손패 → 처음 펼칠 카드 → 더미 순서로 자리를 정하고, 조각마다 기기 판 번호가 따로다", () => {
    const layout = onecardLayout([7, 7, 7]);
    expect(layout.hands[2]).toEqual([14, 15, 16, 17, 18, 19, 20]);
    expect(layout.open).toEqual([21]);
    expect(layout.deck).toHaveLength(32);
    expect(onecardDealId(1, 0)).toBe(1024);
    expect(onecardDealId(2, 3)).toBe(2051);
    expect(() => onecardDealId(1, 1024)).toThrow();
  });

  it("다시 섞을 카드는 카드 번호표 순서로 맞춘다(기기마다 같은 덱에서 사슬을 시작한다)", () => {
    expect(reshuffleOrder(["JC", "D2", "JK", "S3"] as Card[])).toEqual([
      "S3",
      "D2",
      "JK",
      "JC",
    ]);
    expect(() => reshuffleOrder(["?_3" as Card])).toThrow();
  });
});

describe("판 도중 다시 섞기(기기 둘, 메시지)", () => {
  // 한 판에서 더미를 두 번 다 쓰고 두 번 다시 섞는다. 조각 0(8장) → 조각 1(3장) → 조각 2(2장).
  it("버린 더미를 새 사슬로 다시 섞어 뽑는 사람만 보고, 판 끝에 세 조각을 이어 진짜 패로 다시 돌린다", async () => {
    const net = onecardNet();
    const [host, guest] = net.decks as [
      (typeof net.decks)[0],
      (typeof net.decks)[0],
    ];
    await net.settle();
    for (const d of net.decks) expect(d.dealtHere(1)).toBe(true);
    // 처음 덱을 다 뽑는다: 더미 석 장(판 자리 5·6·7)을 1번에게.
    expect(net.draw(1, 5)).toBe(3);
    expect(host.remaining(1)).toBe(0);
    await net.settle();
    expect([...guest.knownCards(1).keys()].sort()).toEqual([2, 3, 4, 5, 6, 7]);
    expect(host.knownCards(1).has(5)).toBe(false);
    // 1번이 석 장을 낸다. 버린 더미는 [4, 5, 6, 7], 맨 위(7)를 빼고 다시 섞는다.
    net.play(1, [5, 6, 7]);
    await net.settle();
    const pub = host.publicCards(1);
    const pool1 = [4, 5, 6].map((g) => pub.get(g) as Card);
    net.reshuffle(1, pool1);
    expect(host.reshuffling(1)).toBe(true);
    // 다시 섞는 사슬이 끝나기 전에 뽑기를 알려도 된다(자리 번호는 미리 정해져 있다).
    expect(net.draw(0, 2)).toBe(2);
    await net.settle();
    expect(host.reshuffling(1)).toBe(false);
    const drawn = [8, 9].map((g) => host.knownCards(1).get(g));
    for (const c of drawn) expect(pool1).toContain(c);
    expect(guest.knownCards(1).has(8)).toBe(false);
    // 0번이 두 장을 낸다. 조각 1에 남은 한 장은 1번에게, 그다음 두 번째로 다시 섞어 한 장을 모두에게 펼친다.
    net.play(0, [8, 9]);
    expect(net.draw(1, 1)).toBe(1);
    await net.settle();
    const pool2 = [7, 8].map((g) => host.publicCards(1).get(g) as Card);
    net.reshuffle(2, pool2);
    expect(net.draw(-1, 1)).toBe(1);
    await net.settle();
    expect(guest.publicCards(1).get(11)).toBe(host.publicCards(1).get(11));
    expect(pool2).toContain(host.publicCards(1).get(11));
    expect(host.reshuffles(1)).toBe(2);

    for (const d of net.decks) d.revealAll(1);
    await net.settle();
    expect(net.incidents).toEqual([[], []]);
    const deal = host.roundDeal(1) as OnecardRoundDeal;
    expect(guest.roundDeal(1)).toEqual(deal);
    expect(deal.cards.size).toBe(8 + 3 + 2);
    expect(deal.declared).toEqual([
      reshuffleOrder(pool1),
      reshuffleOrder(pool2),
    ]);
    expect(deal.refills.map((r) => r.length)).toEqual([3, 2]);
    expect(reshuffleOrder(deal.refills[0] as Card[])).toEqual(deal.declared[0]);
    expect(
      reshuffleOrder(
        deal.preset.hands
          .flat()
          .concat(deal.preset.open, deal.preset.deck) as Card[],
      ),
    ).toEqual(reshuffleOrder(SMALL_DECK));
    // 다시 섞은 사슬에도 섞기 증명이 붙는다. 증명은 판 진행을 막지 않는다: 카드가 없는 기기는 증명을
    // 미뤄 두고(PROOF_DEFER_MS) 그동안 뽑기·펼치기·판 끝 열기가 이미 다 끝났다. 시간이 지나면 서로 확인한다.
    const [seg0, seg1, seg2] = host.dealsOf(1) as [number, number, number];
    expect(await shuffleChecks(net.devices[0] as FairDevice, seg2)).toEqual([]);
    for (let i = 0; net.clock.pending() > 0; i++) {
      if (i > 10) throw new Error("기다림이 끝나지 않는다");
      net.clock.advance(PROOF_DEFER_MS);
      await net.settle();
    }
    for (const d of net.devices)
      for (const id of [seg0, seg1, seg2])
        expect(await shuffleChecks(d, id)).toEqual([true]);
    expect(net.incidents).toEqual([[], []]);

    // 판 끝 검증: 진짜 카드로 장난감 엔진을 다시 돌린다.
    const c = (g: number) => deal.cards.get(g) as string;
    const log: OnecardLogged<ToyAction>[] = [
      { seat: 1, action: { type: "draw", n: 3 } },
      { seat: 1, action: { type: "play", card: c(5) } },
      { seat: 1, action: { type: "play", card: c(6) } },
      { seat: 1, action: { type: "play", card: c(7) } },
      { seat: 0, action: { type: "draw", n: 2 } },
      { seat: 0, action: { type: "play", card: c(8) } },
      { seat: 0, action: { type: "play", card: c(9) } },
      { seat: 1, action: { type: "draw", n: 1 } },
      { seat: 0, action: { type: "flip" } },
    ];
    const deals = new Map([[1, deal]]);
    const requests = (of: readonly OnecardDraw[]) => ({
      of: () => of,
      deviceOf: (seat: number) => seat,
    });
    const asked = host.requestsOf(1);
    const ok = checkOnecardReplay(
      TOY_SPEC,
      null,
      0,
      log,
      deals,
      requests(asked),
    );
    expect(ok.ok && ok.upTo).toBe(log.length);
    if (ok.ok) expect(ok.state.discard.at(-1)).toBe(c(11));

    // 방장이 1번이 뽑을 카드를 자기 기기로 열었다.
    const stolen = asked.map((r, i) => (i === 0 ? { ...r, to: 0 } : r));
    expect(
      checkOnecardReplay(TOY_SPEC, null, 0, log, deals, requests(stolen)),
    ).toMatchObject({ ok: false, index: 0, seat: 0, reason: /엔진과 다르게/ });
    // 엔진이 쓰지 않은 더미 카드를 하나 더 열었다(판이 바뀔 때 드러난다).
    const extra = [...asked, { ...(asked.at(-1) as OnecardDraw), to: 0 }];
    const ended: OnecardLogged<ToyAction>[] = [
      ...log,
      { seat: 0, action: { type: "end" } },
    ];
    const twoRounds = new Map([
      [1, deal],
      [2, deal],
    ]);
    expect(
      checkOnecardReplay(TOY_SPEC, null, 0, ended, twoRounds, requests(asked)),
    ).toMatchObject({ ok: true, upTo: ended.length });
    expect(
      checkOnecardReplay(TOY_SPEC, null, 0, ended, twoRounds, requests(extra)),
    ).toMatchObject({ ok: false, seat: 0, reason: /쓰지 않은 더미/ });
    // 다시 섞을 카드를 버린 더미와 다르게 알렸다(맨 위 카드를 넣고 한 장을 뺐다).
    const lying = {
      ...deal,
      declared: [
        reshuffleOrder([c(7), c(4), c(5)] as Card[]),
        ...deal.declared.slice(1),
      ],
    };
    expect(
      checkOnecardReplay(TOY_SPEC, null, 0, log, new Map([[1, lying]])),
    ).toMatchObject({
      ok: false,
      index: 4,
      seat: 0,
      reason: /버린 더미와 다르게/,
    });
    // 손에 없는 카드를 냈다(진짜 카드로 보면 규칙에 맞지 않는다).
    const wrong = log.map((e, i) =>
      i === 1 ? { ...e, action: { type: "play" as const, card: c(0) } } : e,
    );
    expect(checkOnecardReplay(TOY_SPEC, null, 0, wrong, deals)).toMatchObject({
      ok: false,
      index: 1,
      seat: 1,
    });
    // 다시 섞은 더미를 아직 모르면 그 앞까지만 본다.
    const unknown = { ...deal, refills: [] };
    expect(
      checkOnecardReplay(TOY_SPEC, null, 0, log, new Map([[1, unknown]])),
    ).toMatchObject({ ok: true, upTo: 4 });

    // 새로고침한 기기: 남긴 것으로 조각과 뽑기를 같은 차례로 되살린다(앞 조각을 다 뽑은 뒤에 다시 섞었다).
    const saved = host.snapshot();
    expect(saved.rounds[0]?.reshuffles).toEqual(deal.declared);
    const net2 = network([0, 1]);
    const problems: unknown[] = [];
    const again = net2.devices.map(
      (device) =>
        new OnecardDeck({
          device,
          devices: [0, 1],
          deviceOf: (seat) => seat,
          onIncident: (x) => problems.push(x),
          cards: SMALL_DECK,
        }),
    );
    for (const d of again) d.resume(saved);
    await net2.settle();
    expect(problems).toEqual([]);
    expect(again[1]?.requestsOf(1)).toEqual(asked);
    expect(again[1]?.reshuffles(1)).toBe(2);
    expect(again[1]?.roundDeal(1)?.declared).toEqual(deal.declared);
  });
});

describe("다시 섞기와 뽑기에서 방장 부정을 그 자리에서 막는다", () => {
  it("더미가 남았는데 다시 섞으려 하면 짚는다", async () => {
    const net = onecardNet();
    await net.settle();
    net.decks[1]?.reshuffle(1, 1, ["S2"]);
    expect(net.incidents[1]).toEqual([
      { seat: 0, reason: "방장이 더미가 남았는데 다시 섞으려 했다" },
    ]);
  });

  it("아직 모두에게 열리지 않은 카드(남의 손패)를 다시 섞으려 하면 짚는다", async () => {
    const net = onecardNet();
    await net.settle();
    net.draw(1, 3);
    await net.settle();
    // 0번 손패(판 자리 0) 카드: 1번 기기는 모르지만 0번 기기가 알린다. 처음 펼친 카드와 함께.
    const hidden = net.decks[0]?.knownCards(1).get(0) as Card;
    const open = net.decks[1]?.publicCards(1).get(4) as Card;
    net.decks[1]?.reshuffle(1, 1, [open, hidden]);
    await net.settle();
    expect(net.incidents[1]).toEqual([
      {
        seat: 0,
        reason: "방장이 아직 모두에게 열리지 않은 카드를 다시 섞으려 했다",
      },
    ]);
  });

  it("더미를 순서와 다르게 열라고 하면 짚는다", async () => {
    const net = onecardNet();
    const guest = net.decks[1];
    guest?.request(onecardDealId(1, 0), 6, 1);
    expect(net.incidents[1]).toEqual([
      { seat: 0, reason: "방장이 더미를 순서와 다르게 열라고 했다" },
    ]);
    await net.settle();
  });
});
