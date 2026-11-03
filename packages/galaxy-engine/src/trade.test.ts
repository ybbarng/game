import { describe, expect, it } from "vitest";

import { pendingSeats } from "./match";
import { SHORT_RULES, STANDARD_RULES } from "./rules";
import type { Action } from "./state";
import { must, PAIR_BOARD, paysOf, refused, roll, scene } from "./test-utils";

const base = () =>
  scene({
    stars: [
      { square: 13, owner: 0 },
      { square: 15, owner: 0 },
      { square: 14, owner: 1 },
      { square: 1, owner: 0 },
      { square: 25, owner: 1, mortgaged: true },
    ],
  });

const offer = (
  extra: Partial<Extract<Action, { type: "offer" }>> = {},
): Action => ({
  type: "offer",
  to: 1,
  give: { stars: [1], cash: 100 },
  get: { stars: [14], cash: 0 },
  ...extra,
});

describe("거래(2-8)", () => {
  it("굴리기 전 한 명에게 제안하고, 상대가 받으면 별과 별빛이 오간다", () => {
    const offered = must(base(), 0, offer()).state;
    expect(offered.phase).toBe("trade");
    expect(pendingSeats(offered)).toEqual([1]);
    expect(refused(offered, 0, { type: "acceptTrade" })).toContain("나에게 온");
    const { state, events } = must(offered, 1, { type: "acceptTrade" });
    expect(state.owners[1]).toBe(1);
    expect(state.owners[14]).toBe(0);
    expect(paysOf(events)).toEqual([
      { type: "pay", from: 0, to: 1, amount: 100, reason: "trade" },
    ]);
    // 큰개자리 완성이 알려진다.
    expect(events).toContainEqual({
      type: "linked",
      seat: 0,
      group: 3,
      owned: 3,
      size: 3,
    });
    expect(state.phase).toBe("turn");
    expect(state.turn.next).toBe("roll");
    expect(refused(state, 0, offer())).toContain("이미");
  });

  it("거절되면 그 차례에는 다시 제안하지 못한다", () => {
    const offered = must(base(), 0, offer()).state;
    const { state, events } = must(offered, 1, { type: "rejectTrade" });
    expect(events.some((e) => e.type === "tradeRejected")).toBe(true);
    expect(state.owners[1]).toBe(0);
    expect(state.phase).toBe("turn");
    expect(refused(state, 0, offer())).toContain("이미");
  });

  it("거래 제한: 굴린 뒤, 거래 끈 판, 맡긴 별, 2단 이상 별자리, 가진 것보다 많은 별빛, 남의 별, 별 없음, 나 자신", () => {
    const s = base();
    const rolled = roll({ ...s, positions: [29, 0, 0, 0] }, [1, 2]).state;
    expect(refused(rolled, 0, offer())).toContain("굴리기 전");
    expect(refused({ ...s, rules: SHORT_RULES }, 0, offer())).toContain(
      "끈 판",
    );
    expect(refused(s, 0, offer({ get: { stars: [25], cash: 0 } }))).toContain(
      "거래할 수 없는",
    );
    const leveled = scene({
      stars: [
        ...[13, 14, 15].map((square) => ({ square, owner: 1, level: 2 })),
        { square: 1, owner: 0 },
      ],
    });
    expect(refused(leveled, 0, offer())).toContain("거래할 수 없는");
    expect(
      refused(s, 0, offer({ give: { stars: [1], cash: 5000 } })),
    ).toContain("많아요");
    expect(refused(s, 0, offer({ give: { stars: [14], cash: 0 } }))).toContain(
      "거래할 수 없는",
    );
    expect(
      refused(
        s,
        0,
        offer({ give: { stars: [], cash: 10 }, get: { stars: [], cash: 0 } }),
      ),
    ).toContain("하나는");
    expect(refused(s, 0, offer({ to: 0 }))).toContain("상대");
    expect(refused(s, 1, offer({ to: 0 }))).toContain("내 차례");
  });
});

describe("정거장 올리기·내리기, 맡기기·되찾기", () => {
  const complete = (level = 1) =>
    scene({
      stars: [13, 14, 15].map((square) => ({ square, owner: 0, level })),
    });

  it("별자리를 완성해야 2단부터 올릴 수 있고, 고르게 올린다", () => {
    let s = complete();
    const built = must(s, 0, { type: "build", square: 14 });
    expect(paysOf(built.events)).toEqual([
      {
        type: "pay",
        from: 0,
        to: -1,
        amount: 100,
        reason: "build",
        square: 14,
      },
    ]);
    s = built.state;
    expect(s.levels[14]).toBe(2);
    expect(refused(s, 0, { type: "build", square: 14 })).toContain("고르게");
    s = must(s, 0, { type: "build", square: 13 }).state;
    s = must(s, 0, { type: "build", square: 15 }).state;
    s = must(s, 0, { type: "build", square: 14 }).state;
    expect(s.levels[14]).toBe(3);
    expect(refused(complete(4), 0, { type: "build", square: 14 })).toContain(
      "큰 정거장",
    );
    const two = scene({
      stars: [
        { square: 13, owner: 0 },
        { square: 14, owner: 0 },
      ],
    });
    expect(refused(two, 0, { type: "build", square: 14 })).toContain("완성");
    const mortgaged = scene({
      stars: [13, 14, 15].map((square) => ({
        square,
        owner: 0,
        mortgaged: square === 13,
      })),
    });
    expect(refused(mortgaged, 0, { type: "build", square: 14 })).toContain(
      "맡긴",
    );
    expect(refused(scene(), 0, { type: "build", square: 14 })).toContain(
      "내 별",
    );
    expect(refused(complete(), 1, { type: "build", square: 14 })).toContain(
      "때가 아니",
    );
  });

  it("2개짜리 별자리는 둘을 모으면 완성이라 바로 올릴 수 있다", () => {
    const s = scene({
      board: PAIR_BOARD,
      rules: { ...STANDARD_RULES, sky: "pairs" },
      stars: [
        { square: 1, owner: 0 },
        { square: 2, owner: 0 },
      ],
    });
    expect(must(s, 0, { type: "build", square: 1 }).state.levels[1]).toBe(2);
  });

  it("내리면 한 단 값의 절반, 고르게 내린다", () => {
    const s = scene({
      stars: [
        { square: 13, owner: 0, level: 2 },
        { square: 14, owner: 0, level: 3 },
        { square: 15, owner: 0, level: 2 },
      ],
    });
    expect(refused(s, 0, { type: "sell", square: 13 })).toContain("고르게");
    const sold = must(s, 0, { type: "sell", square: 14 });
    expect(paysOf(sold.events)).toEqual([
      { type: "pay", from: -1, to: 0, amount: 50, reason: "sell", square: 14 },
    ]);
    expect(refused(complete(), 0, { type: "sell", square: 14 })).toContain(
      "내릴",
    );
  });

  it("맡기면 별 값의 절반, 되찾을 때 55%(올림), 정거장이 있으면 먼저 내린다", () => {
    const s = complete();
    const m = must(s, 0, { type: "mortgage", square: 14 });
    expect(paysOf(m.events)[0]?.amount).toBe(110);
    expect(refused(m.state, 0, { type: "mortgage", square: 14 })).toContain(
      "이미",
    );
    const u = must(m.state, 0, { type: "unmortgage", square: 14 });
    expect(paysOf(u.events)[0]?.amount).toBe(121);
    expect(refused(complete(2), 0, { type: "mortgage", square: 13 })).toContain(
      "먼저",
    );
    expect(refused(s, 0, { type: "unmortgage", square: 14 })).toContain(
      "맡긴 별이 아니",
    );
  });
});
