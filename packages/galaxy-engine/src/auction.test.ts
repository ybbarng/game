import { describe, expect, it } from "vitest";

import { pendingSeats } from "./match";
import type { GalaxyState } from "./state";
import {
  auctionWith,
  bidOf,
  bidRevealOf,
  must,
  paysOf,
  refused,
  scene,
} from "./test-utils";

/** `seat`이 시리우스(14)에 멈춰 넘긴 상태(봉인 입찰 시작) */
function passed(seat = 0, cash = [1000, 1000, 1000, 1000]): GalaxyState {
  const positions = [0, 0, 0, 0].map((p, i) => (i === seat ? 14 : p));
  const s: GalaxyState = {
    ...scene({ turn: seat, positions, cash }),
    phase: "buy",
  };
  return must(s, seat, { type: "pass" }).state;
}

describe("봉인 입찰(2-7)", () => {
  it("모두 몰래 내고 공개하면 가장 높은 값을 낸 사람이 그 값에 산다", () => {
    const s = passed();
    expect(s.phase).toBe("bid");
    expect(pendingSeats(s)).toEqual([0, 1, 2, 3]);
    const { state, events } = auctionWith(s, [0, 150, 200, 0]);
    expect(state.owners[14]).toBe(2);
    expect(state.levels[14]).toBe(1);
    expect(paysOf(events)).toEqual([
      { type: "pay", from: 2, to: -1, amount: 200, reason: "bid", square: 14 },
    ]);
    expect(state.lastAuction).toMatchObject({
      winner: 2,
      price: 200,
      bids: [0, 150, 200, 0],
    });
    expect(state.phase).toBe("turn");
    expect(state.turn.seat).toBe(0);
    expect(state.turn.next).toBe("end");
  });

  it("공개한 값이 약속과 다르면 받지 않는다", () => {
    let s = passed();
    for (const [seat, v] of [100, 0, 0, 0].entries())
      s = must(s, seat, bidOf(s, seat, v)).state;
    expect(s.phase).toBe("bidReveal");
    expect(refused(s, 0, bidRevealOf(s, 0, 200))).toContain("달라요");
    expect(
      refused(s, 0, { type: "bidReveal", value: 100, salt: "zz" }),
    ).toContain("형식");
    const once = must(s, 0, bidRevealOf(s, 0, 100)).state;
    expect(refused(once, 0, bidRevealOf(s, 0, 100))).toContain("이미");
  });

  it("두 번 내거나 입찰 때가 아니면 받지 않는다", () => {
    const s = passed();
    const once = must(s, 1, bidOf(s, 1, 50)).state;
    expect(refused(once, 1, bidOf(s, 1, 60))).toContain("이미");
    expect(refused(once, 1, bidRevealOf(s, 1, 50))).toContain("때가 아니");
    expect(refused(scene(), 0, bidOf(s, 0, 10))).toContain("때가 아니");
  });

  it("같은 값이면 넘긴 사람 다음 사람부터 앞선다(넘긴 사람이 마지막)", () => {
    expect(auctionWith(passed(0), [0, 150, 150, 0]).state.owners[14]).toBe(1);
    expect(auctionWith(passed(2), [150, 0, 150, 0]).state.owners[14]).toBe(0);
    expect(auctionWith(passed(0), [150, 0, 0, 150]).state.owners[14]).toBe(3);
  });

  it("아무도 내지 않으면 주인 없이 남는다", () => {
    const { state, events } = auctionWith(passed(), [0, 0, 0, 0]);
    expect(state.owners[14]).toBe(-1);
    expect(state.lastAuction?.winner).toBeNull();
    expect(paysOf(events)).toEqual([]);
  });

  it("10 단위가 아니거나 가진 별빛보다 많은 값은 내지 않은 것으로 센다", () => {
    const s = passed(0, [1000, 100, 1000, 1000]);
    const { state } = auctionWith(s, [0, 500, 15, 20]);
    expect(state.lastAuction?.bids).toEqual([0, 0, 0, 20]);
    expect(state.owners[14]).toBe(3);
  });
});
