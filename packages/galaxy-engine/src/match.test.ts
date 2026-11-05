import { describe, expect, it } from "vitest";

import {
  createMatch,
  type LoggedAction,
  legalActions,
  pendingSeats,
  replay,
  startTotal,
  viewOf,
} from "./match";
import { SHORT_RULES, STANDARD_RULES } from "./rules";
import type { Action, GalaxyState } from "./state";
import {
  BOARD,
  bidOf,
  bidRevealOf,
  chainAction,
  chainOf,
  must,
  refused,
  revealAll,
  scene,
  started,
} from "./test-utils";

describe("판 시작과 사슬", () => {
  it("모두 약속하면 첫 차례가 시작되고, 첫 차례는 시드로 정한다", () => {
    const { state } = createMatch(STANDARD_RULES, 7, BOARD);
    expect(state.phase).toBe("commit");
    expect(pendingSeats(state)).toEqual([0, 1, 2, 3]);
    // 첫 차례 자리는 1,000, 그 뒤 자리는 차례대로 40씩 더(3-6 g3 첫 차례 이점 보정, g5에서 20 → 40)
    expect(
      state.cash.map((_, seat) => state.cash[(state.starter + seat) % 4]),
    ).toEqual([1000, 1040, 1080, 1120]);
    expect(state.cash.reduce((a, b) => a + b, 0)).toBe(
      startTotal(STANDARD_RULES),
    );
    const s = started();
    expect(s.phase).toBe("turn");
    expect(s.turn.seat).toBe(s.starter);
    expect(pendingSeats(s)).toEqual([s.starter]);
    expect(createMatch(STANDARD_RULES, 7, BOARD).state.starter).toBe(s.starter);
  });

  it("하늘이 다른 판으로는 만들지 않는다", () => {
    expect(() =>
      createMatch({ ...STANDARD_RULES, sky: "zodiac" }, 1, BOARD),
    ).toThrow();
  });

  it("굴리면 모든 자리가 고리를 공개하고, 그 고리들로 두 눈이 정해진다", () => {
    const s = started();
    const seat = s.turn.seat;
    const rolled = must(s, seat, { type: "roll" }).state;
    expect(rolled.phase).toBe("reveal");
    expect(pendingSeats(rolled)).toEqual([0, 1, 2, 3]);
    const { state, events } = revealAll(rolled);
    const dice = events.find((e) => e.type === "dice");
    expect(
      dice?.type === "dice" && dice.dice.every((d) => d >= 1 && d <= 6),
    ).toBe(true);
    expect(state.lastRoll?.seat).toBe(seat);
    expect(state.revealCount).toBe(1);
    const moved = events.find((e) => e.type === "moved");
    if (dice?.type !== "dice" || moved?.type !== "moved")
      throw new Error("사건 없음");
    expect(moved.to).toBe(dice.dice[0] + dice.dice[1]);
  });

  it("약속·공개 잘못은 거절한다", () => {
    const { state } = createMatch(STANDARD_RULES, 7, BOARD);
    expect(refused(state, 0, { type: "commit", hash: "xyz" })).toContain(
      "형식",
    );
    const one = must(state, 0, chainAction(state, 0)).state;
    expect(refused(one, 0, chainAction(state, 0))).toContain("이미");
    const s = started();
    const seat = s.turn.seat;
    expect(refused(s, (seat + 1) % 4, { type: "roll" })).toContain("차례");
    const r = must(s, seat, { type: "roll" }).state;
    // 다른 자리의 고리, 건너뛴 고리는 받지 않는다.
    const other = chainOf(r.keys[1] as string, 0)[1] as string;
    expect(refused(r, 0, { type: "reveal", link: other })).toContain("고리");
    const skipped = chainOf(r.keys[0] as string, 0)[2] as string;
    expect(refused(r, 0, { type: "reveal", link: skipped })).toContain("고리");
    const once = must(r, 0, chainAction(r, 0)).state;
    expect(refused(once, 0, chainAction(r, 0))).toContain("이미");
    expect(refused(s, seat, { type: "end" })).toContain("굴려야");
    expect(refused(s, seat, { type: "buy" })).toContain("살 때");
    expect(refused(s, 9, { type: "roll" })).toContain("없는 자리");
    expect(refused(s, seat, { type: "fly" } as unknown as Action)).toContain(
      "모르는",
    );
  });

  it("사슬을 다 쓴 자리가 있으면 굴리기 전에 모두 다시 약속한다", () => {
    const s = scene();
    const worn: GalaxyState = {
      ...s,
      chains: s.chains.map((c, i) => (i === 2 ? { ...c, used: 600 } : c)),
    };
    const r = must(worn, 0, { type: "roll" });
    expect(r.state.phase).toBe("commit");
    expect(r.state.generation).toBe(1);
    expect(r.events.some((e) => e.type === "recommit")).toBe(true);
    let next = r.state;
    for (let seat = 0; seat < 4; seat++)
      next = must(next, seat, chainAction(next, seat)).state;
    expect(next.phase).toBe("reveal");
    expect(revealAll(next).state.lastRoll?.seat).toBe(0);
  });

  it("짧은 판은 첫 공개로 사람마다 다른 별자리의 별 2개를 나눠 주고 시작한다", () => {
    const s = started(SHORT_RULES, 3);
    expect(s.phase).toBe("reveal");
    expect(s.revealFor).toBe("deal");
    const { state, events } = revealAll(s);
    expect(state.phase).toBe("turn");
    const groups = new Set<number>();
    for (let seat = 0; seat < 4; seat++) {
      const mine = state.owners.flatMap((o, sq) => (o === seat ? [sq] : []));
      expect(mine).toHaveLength(2);
      const group = state.board.squares[mine[0] ?? -1]?.star?.group;
      expect(state.board.squares[mine[1] ?? -1]?.star?.group).toBe(group);
      groups.add(group ?? -1);
    }
    expect(groups.size).toBe(4);
    expect(
      events.filter((e) => e.type === "linked").map((e) => e.type),
    ).toHaveLength(4);
    expect(events.some((e) => e.type === "dealt")).toBe(true);
    // 별을 나눠 줘도 별빛은 그대로(시작 자금 + 뒤 자리 보정)
    expect(state.cash).toEqual(s.cash);
  });
});

describe("화면과 기록", () => {
  it("화면에는 남의 재료가 없고 내 재료만 있다", () => {
    const s = started();
    const view = viewOf(s, 1);
    expect(view.botKey).toBe(s.keys[1]);
    expect(JSON.stringify(view)).not.toContain(s.keys[0] as string);
    expect(JSON.stringify(view)).not.toContain(s.keys[2] as string);
    expect("keys" in view).toBe(false);
    expect(view.decision).toBeNull();
    expect(viewOf(s, s.turn.seat).decision?.kind).toBe("roll");
  });

  it("입찰이 끝나기 전에는 남이 낸 값이 화면에 없다", () => {
    const buy: GalaxyState = {
      ...scene({ positions: [14, 0, 0, 0] }),
      phase: "buy",
    };
    let a = must(buy, 0, { type: "pass" }).state;
    const values = [370, 0, 230, 0];
    for (const [seat, v] of values.entries())
      a = must(a, seat, bidOf(a, seat, v)).state;
    a = must(a, 0, bidRevealOf(a, 0, 370)).state;
    const view = viewOf(a, 1);
    expect(view.auction?.revealed).toEqual([true, false, false, false]);
    const text = JSON.stringify(view);
    expect(text).not.toContain('"value":370');
    expect(view.auction).not.toHaveProperty("reveals");
    expect(text).not.toContain(a.keys[0] as string);
    expect(text).not.toContain(a.keys[2] as string);
  });

  it("다시 두기(replay)로 같은 상태가 나온다", () => {
    const rules = STANDARD_RULES;
    let { state } = createMatch(rules, 11, BOARD);
    const log: LoggedAction[] = [];
    const act = (seat: number, action: Action) => {
      state = must(state, seat, action).state;
      log.push({ seat, action });
    };
    for (let seat = 0; seat < 4; seat++) act(seat, chainAction(state, seat));
    for (let n = 0; n < 60 && state.phase !== "gameOver"; n++) {
      const seats = [...pendingSeats(state)];
      const seat = seats[0] as number;
      if (state.phase === "reveal" || state.phase === "commit") {
        for (const s of seats) act(s, chainAction(state, s));
      } else if (state.phase === "bid") {
        for (const s of seats) act(s, bidOf(state, s, 0));
      } else if (state.phase === "bidReveal") {
        for (const s of seats) act(s, bidRevealOf(state, s, 0));
      } else {
        const options = legalActions(state, seat);
        const pick =
          options.find((o) => o.type === "buy") ??
          options.find((o) => o.type === "roll") ??
          options.find((o) => o.type === "end") ??
          options[0];
        if (!pick) throw new Error(`할 일이 없다: ${state.phase}`);
        act(seat, pick);
      }
    }
    const again = replay(rules, 11, BOARD, log);
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.state).toEqual(state);
    const broken = replay(rules, 11, BOARD, [
      ...log.slice(0, 4),
      { seat: 0, action: { type: "end" } },
    ]);
    expect(broken.ok).toBe(false);
  });

  it("legalActions는 지금 받아들여지는 행동만 낸다", () => {
    const s = scene({ stars: [{ square: 1, owner: 0 }] });
    const kinds = legalActions(s, 0).map((a) => a.type);
    expect(kinds).toContain("roll");
    expect(kinds).toContain("mortgage");
    expect(kinds).not.toContain("end");
    expect(legalActions(s, 1)).toEqual([]);
  });
});
