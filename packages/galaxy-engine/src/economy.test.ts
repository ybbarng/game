import { describe, expect, it } from "vitest";

import { buildBoard, STAR_SQUARES, sideOf } from "./board";
import { observatoryGrant, rentOf } from "./match";
import { STANDARD_RULES } from "./rules";
import type { GalaxyState } from "./state";
import { TEST_CONSTELLATIONS, TEST_SKY } from "./test-sky";
import { must, paysOf, refused, roll, scene } from "./test-utils";

/** 시리우스(14)를 1번 자리가 가진 장면 */
function sirius(
  extra: NonNullable<NonNullable<Parameters<typeof scene>[0]>["stars"]> = [],
  round = 1,
): GalaxyState {
  return scene({ round, stars: [{ square: 14, owner: 1 }, ...extra] });
}

describe("정거장 이용료(2-2)", () => {
  it("1단·둘·완성·2단·3단·큰 정거장·맡김", () => {
    expect(rentOf(sirius(), 14)).toBe(40);
    expect(rentOf(sirius([{ square: 13, owner: 1 }]), 14)).toBe(70);
    const all = [
      { square: 13, owner: 1 },
      { square: 15, owner: 1 },
    ];
    expect(rentOf(sirius(all), 14)).toBe(90);
    const leveled = (level: number) =>
      scene({
        stars: [13, 14, 15].map((square) => ({ square, owner: 1, level })),
      });
    expect(rentOf(leveled(2), 14)).toBe(180);
    expect(rentOf(leveled(3), 14)).toBe(310);
    expect(rentOf(leveled(4), 14)).toBe(440);
    expect(
      rentOf(scene({ stars: [{ square: 14, owner: 1, mortgaged: true }] }), 14),
    ).toBe(0);
    expect(rentOf(scene(), 14)).toBe(0);
    // 가장 싼 별도 10은 낸다(60 × 0.2 = 12 → 10).
    const cheap = scene({
      rules: { ...STANDARD_RULES, seasonal: false },
      stars: [{ square: 1, owner: 1 }],
    });
    expect(rentOf(cheap, 1)).toBe(10);
  });

  it("제철 하늘: 지금 계절 변의 이용료는 1.5배, 다른 변은 그대로", () => {
    // 기본 4인 20차례: 6돌림부터 겨울(변 1)
    const winter = sirius([], 6);
    expect(winter.season).toBe(1);
    expect(rentOf(winter, 14)).toBe(70);
    const full = scene({
      round: 6,
      stars: [13, 14, 15].map((square) => ({ square, owner: 1, level: 2 })),
    });
    expect(rentOf(full, 14)).toBe(260);
    const autumn = scene({ round: 6, stars: [{ square: 2, owner: 1 }] });
    expect(rentOf(autumn, 2)).toBe(20);
    const off = scene({
      rules: { ...STANDARD_RULES, seasonal: false },
      round: 6,
      stars: [{ square: 14, owner: 1 }],
    });
    expect(off.season).toBeNull();
    expect(rentOf(off, 14)).toBe(40);
  });

  it("제철 하늘은 별자리로 정한다(g4): 맞은편 변에 선 별도 제 계절에 오르고, 그 변의 남의 별은 오르지 않는다", () => {
    const board = buildBoard(TEST_SKY, TEST_CONSTELLATIONS);
    const cma = board.groups.findIndex((g) => g.id === "CMa");
    const group = board.groups[cma] as (typeof board.groups)[number];
    expect(group.home).toBe(1);
    const away = group.squares.find((sq) => sideOf(sq) !== 1) as number;
    expect(sideOf(away)).toBe(3);
    // 겨울 변(1)에 선 맞은편 별자리 별
    const stranger = STAR_SQUARES.find(
      (sq) =>
        sideOf(sq) === 1 &&
        board.squares[sq]?.star?.group !== cma &&
        board.groups[board.squares[sq]?.star?.group ?? 0]?.home !== 1,
    ) as number;
    const at = (round: number, square: number) =>
      rentOf(scene({ board, round, stars: [{ square, owner: 1 }] }), square);
    // 1돌림 가을, 6돌림 겨울
    expect(at(6, away)).toBeGreaterThan(at(1, away));
    expect(at(6, stranger)).toBe(at(1, stranger));
  });

  it("제철 하늘: 반올림으로 1.5배가 같아져도 적어도 10 더 낸다", () => {
    // 셰아트(2, 값 80): 1단 80 × 0.2 = 16 → 20, 제철 80 × 0.2 × 1.5 = 24 → 20이라 30으로 올린다
    const plain = scene({
      rules: { ...STANDARD_RULES, seasonal: false },
      stars: [{ square: 2, owner: 1 }],
    });
    expect(rentOf(plain, 2)).toBe(20);
    const inSeason = scene({ round: 1, stars: [{ square: 2, owner: 1 }] });
    expect(inSeason.season).toBe(0);
    expect(rentOf(inSeason, 2)).toBe(30);
  });

  it("남의 별에 멈추면 이용료를 주인에게 낸다(주인이 소행성대에 있어도)", () => {
    const s = {
      ...sirius(),
      positions: [8, 8, 0, 0],
      jailed: [false, true, false, false],
    };
    const { state, events } = roll(s, [2, 4]);
    expect(state.positions[0]).toBe(14);
    expect(paysOf(events)).toEqual([
      { type: "pay", from: 0, to: 1, amount: 40, reason: "rent", square: 14 },
    ]);
    expect(state.phase).toBe("turn");
    expect(state.turn.next).toBe("end");
  });
});

describe("한 바퀴와 지원금", () => {
  it("우주국을 지나면 지원금 120, 멈춘 주인 없는 별은 살 수 있다", () => {
    const { state, events } = roll(scene({ positions: [30, 0, 0, 0] }), [1, 2]);
    expect(state.positions[0]).toBe(1);
    expect(paysOf(events).map((p) => p.reason)).toEqual(["salary"]);
    expect(state.phase).toBe("buy");
    const bought = must(state, 0, { type: "buy" });
    expect(bought.state.owners[1]).toBe(0);
    expect(bought.state.levels[1]).toBe(1);
    expect(bought.state.cash[0]).toBe(1000 + 120 - 60);
    expect(bought.state.turn.next).toBe("end");
  });

  it("우주국에 멈춰도 지원금은 한 번", () => {
    const { state, events } = roll(scene({ positions: [29, 0, 0, 0] }), [1, 2]);
    expect(state.positions[0]).toBe(0);
    expect(paysOf(events)).toHaveLength(1);
    expect(state.cash[0]).toBe(1120);
  });

  it("별빛이 모자라면 사지 못하고 넘길 수만 있다", () => {
    const s = roll(
      scene({ positions: [8, 0, 0, 0], cash: [100, 1000, 1000, 1000] }),
      [2, 4],
    ).state;
    expect(s.phase).toBe("buy");
    expect(refused(s, 0, { type: "buy" })).toContain("모자라");
    expect(must(s, 0, { type: "pass" }).state.phase).toBe("bid");
  });

  it("내 별에 멈추면 아무 일 없다", () => {
    const s = scene({
      positions: [8, 0, 0, 0],
      stars: [{ square: 14, owner: 0 }],
    });
    const { state, events } = roll(s, [2, 4]);
    expect(paysOf(events)).toEqual([]);
    expect(state.turn.next).toBe("end");
  });
});

describe("같은 눈", () => {
  it("같은 눈이면 칸의 일을 마친 뒤 한 번 더 굴린다", () => {
    const first = roll(scene(), [3, 3]).state;
    expect(first.phase).toBe("buy");
    const bought = must(first, 0, { type: "buy" }).state;
    expect(bought.turn.next).toBe("roll");
    expect(refused(bought, 0, { type: "end" })).toContain("굴려야");
    const second = roll(bought, [1, 2]).state;
    expect(second.positions[0]).toBe(9);
    expect(second.phase).toBe("buy");
    expect(must(second, 0, { type: "pass" }).state.phase).toBe("bid");
  });

  it("한 차례에 세 번째 같은 눈이면 움직이지 않고 소행성대에 걸린다", () => {
    let s = scene({
      stars: [
        { square: 6, owner: 0 },
        { square: 14, owner: 0 },
      ],
    });
    s = roll(s, [3, 3]).state;
    s = roll(s, [4, 4]).state;
    expect(s.positions[0]).toBe(14);
    const { state, events } = roll(s, [1, 1]);
    expect(state.positions[0]).toBe(8);
    expect(state.jailed[0]).toBe(true);
    expect(events.some((e) => e.type === "jailed" && e.by === "doubles")).toBe(
      true,
    );
    expect(state.turn.next).toBe("end");
  });
});

describe("소행성대(2-5)", () => {
  const jailed = (cash = 1000) =>
    scene({
      positions: [8, 0, 0, 0],
      jailed: [0],
      cash: [cash, 1000, 1000, 1000],
    });

  it("그냥 멈추면 지나가는 길이다", () => {
    const { state } = roll(scene({ positions: [5, 0, 0, 0] }), [1, 2]);
    expect(state.positions[0]).toBe(8);
    expect(state.jailed[0]).toBe(false);
    expect(state.turn.next).toBe("end");
  });

  it("50을 내고 바로 나가 굴린다", () => {
    const s = jailed();
    expect(s.turn.next).toBe("jailRoll");
    const paid = must(s, 0, { type: "payFine" });
    expect(paysOf(paid.events)).toEqual([
      { type: "pay", from: 0, to: -1, amount: 50, reason: "fine" },
    ]);
    expect(paid.state.jailed[0]).toBe(false);
    expect(paid.state.turn.next).toBe("roll");
    expect(roll(paid.state, [1, 2]).state.positions[0]).toBe(11);
    expect(refused(jailed(40), 0, { type: "payFine" })).toContain("모자라");
  });

  it("굴려서 같은 눈이면 그 눈만큼 나가고, 한 번 더는 없다", () => {
    const { state, events } = roll(jailed(), [3, 3]);
    expect(state.positions[0]).toBe(14);
    expect(state.jailed[0]).toBe(false);
    expect(events.some((e) => e.type === "freed" && e.by === "doubles")).toBe(
      true,
    );
    const done = must(state, 0, { type: "pass" }).state;
    expect(done.phase).toBe("bid");
  });

  it("같은 눈이 아니면 그 차례를 쉬고, 다음 차례에는 그냥 나간다", () => {
    const { state } = roll(jailed(), [1, 2]);
    expect(state.positions[0]).toBe(8);
    expect(state.turn.next).toBe("end");
    expect(state.jailed[0]).toBe(false);
    let s = must(state, 0, { type: "end" }).state;
    expect(s.turn.seat).toBe(1);
    // 다른 자리 차례를 넘겨 다시 0번 차례
    for (const seat of [1, 2, 3]) {
      s = { ...s, positions: s.positions.map((p, i) => (i === seat ? 29 : p)) };
      s = roll(s, [1, 2]).state;
      s = must(s, seat, { type: "end" }).state;
    }
    expect(s.turn.seat).toBe(0);
    expect(s.turn.next).toBe("roll");
  });
});

describe("관측지와 혜성", () => {
  it("관측지에 멈추면 자산 순위로 관측 지원금(꼴찌 150 ~ 1위 0)", () => {
    const poor = scene({
      positions: [13, 0, 0, 0],
      cash: [500, 1000, 1500, 2000],
    });
    expect(observatoryGrant(poor, 0)).toBe(150);
    expect(observatoryGrant(poor, 1)).toBe(100);
    expect(observatoryGrant(poor, 2)).toBe(50);
    expect(observatoryGrant(poor, 3)).toBe(0);
    const { events } = roll(poor, [1, 2]);
    expect(paysOf(events)).toEqual([
      { type: "pay", from: -1, to: 0, amount: 150, reason: "observatory" },
    ]);
    expect(events).toContainEqual({ type: "observed", seat: 0, amount: 150 });
    // 1위라 0이어도 받은 값을 사건으로 남긴다(돈은 오가지 않는다)
    const rich = roll(
      scene({ positions: [13, 0, 0, 0], cash: [3000, 1000, 1000, 1000] }),
      [1, 2],
    ).events;
    expect(rich).toContainEqual({ type: "observed", seat: 0, amount: 0 });
    expect(paysOf(rich)).toEqual([]);
    const three = scene({
      rules: { ...STANDARD_RULES, players: 3 },
      cash: [100, 200, 300],
    });
    expect([0, 1, 2].map((s) => observatoryGrant(three, s))).toEqual([
      120, 60, 0,
    ]);
  });

  it("혜성에 멈추면 한 번 더 굴려 그만큼 더 간다(같은 눈이어도 한 번 더 없음)", () => {
    const at = roll(scene({ positions: [21, 0, 0, 0] }), [1, 2]).state;
    expect(at.positions[0]).toBe(24);
    expect(at.turn.next).toBe("comet");
    const { state } = roll(at, [3, 3]);
    expect(state.positions[0]).toBe(30);
    expect(state.phase).toBe("buy");
    expect(must(state, 0, { type: "buy" }).state.turn.next).toBe("end");
  });

  it("같은 눈으로 혜성에 왔으면 혜성 굴림 뒤에 한 번 더 굴린다", () => {
    const at = roll(scene({ positions: [18, 0, 0, 0] }), [3, 3]).state;
    expect(at.turn.next).toBe("comet");
    const after = roll(at, [1, 2]).state;
    expect(after.positions[0]).toBe(27);
    expect(must(after, 0, { type: "buy" }).state.turn.next).toBe("roll");
  });
});
