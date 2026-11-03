import { describe, expect, it } from "vitest";

import { CARDS } from "./cards";
import type { GalaxyState, GameEvent } from "./state";
import { paysOf, roll, scene } from "./test-utils";

type SceneOptions = NonNullable<Parameters<typeof scene>[0]>;

/** 0번 자리가 공문 `card`만 남은 더미에서 공문 칸(4, 또는 `from`에서 3칸)에 멈춘다 */
function draw(
  card: number,
  options: SceneOptions = {},
  from = 1,
): { state: GalaxyState; events: GameEvent[] } {
  const positions = options.positions ?? [from, 0, 0, 0];
  return roll(scene({ ...options, positions, deck: [card] }), [1, 2]);
}

function amounts(events: GameEvent[]) {
  return paysOf(events).map((p) => [p.from, p.to, p.amount]);
}

describe("우주국 공문 16장(2-6)", () => {
  it("글은 표의 문장 그대로, 16장", () => {
    expect(CARDS).toHaveLength(16);
    expect(CARDS[4]?.text).toBe("모든 우주인이 30씩 받습니다.");
  });

  it("1 관측 협조 감사: 50", () => {
    const { state, events } = draw(1);
    expect(amounts(events)).toEqual([[-1, 0, 50]]);
    expect(state.deck).toEqual([]);
    expect(events.some((e) => e.type === "card" && e.card === 1)).toBe(true);
  });

  it("2 별빛 측정 수당: 가진 1등성마다 30", () => {
    const { events } = draw(2, {
      stars: [
        { square: 10, owner: 0 },
        { square: 14, owner: 0 },
        { square: 1, owner: 0 },
        { square: 18, owner: 1 },
      ],
    });
    expect(amounts(events)).toEqual([[-1, 0, 60]]);
    const shown = events.find((e) => e.type === "card");
    expect(shown?.type === "card" && shown.squares).toEqual([10, 14]);
  });

  it("3 푸른 별 관측 주간: 푸른 별을 가진 우주인마다 20", () => {
    const { events } = draw(3, {
      stars: [
        { square: 10, owner: 0 },
        { square: 13, owner: 0 },
        { square: 11, owner: 1 },
        { square: 1, owner: 2 },
      ],
    });
    expect(amounts(events)).toEqual([
      [-1, 0, 20],
      [-1, 1, 20],
    ]);
  });

  it("4 먼 별 탐사 지원: 500광년보다 먼 별마다 40", () => {
    const { events } = draw(4, {
      stars: [9, 10, 14].map((square) => ({ square, owner: 0 })),
    });
    expect(amounts(events)).toEqual([[-1, 0, 80]]);
  });

  it("5 보급선 도착: 모두 30", () => {
    expect(amounts(draw(5).events)).toEqual([
      [-1, 0, 30],
      [-1, 1, 30],
      [-1, 2, 30],
      [-1, 3, 30],
    ]);
  });

  it("6 정거장 안전 점검: 한 단마다 10, 큰 정거장마다 30(맡긴 별은 빼고)", () => {
    const { events } = draw(6, {
      stars: [
        { square: 1, owner: 0 },
        { square: 5, owner: 0, mortgaged: true },
        { square: 13, owner: 0, level: 3 },
        { square: 14, owner: 0, level: 4 },
        { square: 15, owner: 0, level: 3 },
      ],
    });
    expect(amounts(events)).toEqual([[0, -1, 10 + 30 + 30 + 30]]);
  });

  it("7 우주 먼지 청소: 40", () => {
    expect(amounts(draw(7).events)).toEqual([[0, -1, 40]]);
  });

  it("8 붉은 별 장비 교체: 붉은 별마다 20", () => {
    const { events } = draw(8, {
      stars: [2, 6, 9, 10].map((square) => ({ square, owner: 0 })),
    });
    expect(amounts(events)).toEqual([[0, -1, 60]]);
  });

  it("9 동료 우주인 지원: 자산이 가장 많은 사람이 가장 적은 사람에게 100", () => {
    const { events } = draw(9, { cash: [1000, 1500, 500, 1000] });
    expect(amounts(events)).toEqual([[1, 2, 100]]);
    expect(amounts(draw(9).events)).toEqual([]);
  });

  it("10 이웃 별 조사: 가진 별 가운데 100광년보다 가까운 별마다 20", () => {
    const all = [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15];
    const { state, events } = draw(10, {
      stars: all.map((square) => ({ square, owner: 0 })),
    });
    const near = all.filter((sq) => {
      const ly = state.board.squares[sq]?.star?.star.ly;
      return ly !== null && ly !== undefined && ly < 100;
    });
    expect(near.length).toBeGreaterThan(0);
    expect(amounts(events)).toEqual([[-1, 0, 20 * near.length]]);
    expect(state.positions[0]).toBe(4);
    expect(amounts(draw(10).events)).toEqual([]);
  });

  it("11 궤도 이탈: 소행성대에 걸리고 지원금 없음", () => {
    const { state, events } = draw(11, {}, 25);
    expect(state.positions[0]).toBe(8);
    expect(state.jailed[0]).toBe(true);
    expect(amounts(events)).toEqual([]);
    expect(state.turn.next).toBe("end");
  });

  it("12 별 색 조사: 가진 노란·주황 별(4,000~7,500 K)마다 20", () => {
    // 시험 판: 알마크(7) 4,500 K, 웨젠(15) 6,100 K는 노란 별, 시리우스(14) 9,900 K는 아니다
    const { state, events } = draw(12, {
      stars: [
        { square: 7, owner: 0 },
        { square: 15, owner: 0 },
        { square: 14, owner: 0 },
        { square: 17, owner: 1 },
      ],
    });
    expect(amounts(events)).toEqual([[-1, 0, 40]]);
    const shown = events.find((e) => e.type === "card");
    expect(shown?.type === "card" && shown.squares).toEqual([7, 15]);
    expect(state.positions[0]).toBe(4);
  });

  it("13 관측지 초청: 관측지로 가고 관측 지원금은 없다. 우주국을 지나면 지원금은 60", () => {
    const { state, events } = draw(13, { cash: [100, 1000, 1000, 1000] });
    expect(state.positions[0]).toBe(16);
    expect(amounts(events)).toEqual([]);
    // 여름 공문(28)에서는 우주국을 지나 관측지로: 지원금 반
    const wrap = draw(13, {}, 25);
    expect(wrap.state.positions[0]).toBe(16);
    expect(amounts(wrap.events)).toEqual([[-1, 0, 60]]);
  });

  it("14 계절 바꾸기: 다음 계절의 첫 별로 가고 이용료는 반", () => {
    const { state, events } = draw(14, { stars: [{ square: 9, owner: 1 }] });
    expect(state.positions[0]).toBe(9);
    expect(amounts(events)).toEqual([[0, 1, 20]]);
    // 여름 공문(28)에서는 가을 첫 별(1)로, 우주국을 지나 지원금
    const wrap = draw(14, {}, 25);
    expect(wrap.state.positions[0]).toBe(1);
    expect(amounts(wrap.events)).toEqual([[-1, 0, 120]]);
    expect(wrap.state.phase).toBe("buy");
  });

  it("15 혜성 꼬리: 혜성 칸까지 가서 한 번 더 굴린다", () => {
    const { state } = draw(15);
    expect(state.positions[0]).toBe(24);
    expect(state.turn.next).toBe("comet");
    const wrap = draw(15, {}, 25);
    expect(amounts(wrap.events)).toEqual([[-1, 0, 120]]);
  });

  it("16 별자리 선 측량: 별 둘 이상인 별자리마다 30, 완성한 별자리는 50", () => {
    const { events } = draw(16, {
      stars: [
        // 오리온 둘(선 하나), 큰개 셋(완성, 하나는 맡김), 사자 하나(없음)
        { square: 9, owner: 0 },
        { square: 10, owner: 0 },
        { square: 13, owner: 0 },
        { square: 14, owner: 0, mortgaged: true },
        { square: 15, owner: 0 },
        { square: 17, owner: 0 },
        { square: 18, owner: 1 },
        { square: 19, owner: 1 },
      ],
    });
    expect(amounts(events)).toEqual([[-1, 0, 80]]);
  });

  it("남은 공문이 없으면 다시 채운다", () => {
    const s = scene({ positions: [1, 0, 0, 0], deck: [] });
    const { state, events } = roll(s, [1, 2]);
    expect(events.some((e) => e.type === "card")).toBe(true);
    expect(state.deck).toHaveLength(15);
  });
});
