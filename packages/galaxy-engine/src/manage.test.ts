import { describe, expect, it } from "vitest";

import { STANDARD_RULES } from "./rules";
import { must, PAIR_BOARD, paysOf, refused, scene } from "./test-utils";

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
