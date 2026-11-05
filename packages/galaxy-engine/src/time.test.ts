import { describe, expect, it } from "vitest";

import { clockTurn } from "./match";
import {
  decodeGalaxyRules,
  encodeGalaxyRules,
  type GalaxyRules,
  STANDARD_RULES,
} from "./rules";
import type { GalaxyState } from "./state";
import {
  bidOf,
  must,
  refused,
  revealAll,
  roll,
  scene,
  started,
} from "./test-utils";

const FAST: GalaxyRules = { ...STANDARD_RULES, time: "fast" };

describe("개인 시간(docs/24)", () => {
  it("시간 규칙은 규칙 문자열 꼬리로 오가고, 없으면 시계가 없다", () => {
    expect(decodeGalaxyRules(encodeGalaxyRules(FAST))).toEqual({
      ok: true,
      rules: FAST,
    });
    const none = started();
    expect(none.clocks).toBeNull();
    expect(clockTurn(none)).toBeNull();
  });

  it("결정에 쓴 시간이 깎이고, 모두가 함께 내는 공개 동안은 시계가 서 있다", () => {
    const s = started(FAST);
    const seat = s.turn.seat;
    expect(clockTurn(s)).toEqual({ seat, left: 180_000 + 90_000 });
    const rolled = must(s, seat, { type: "roll", spent: 40_000 }).state;
    expect(rolled.clocks?.[seat]).toEqual({ main: 140_000, periods: 3 });
    expect(clockTurn(rolled)).toBeNull();
    const after = revealAll(rolled).state;
    expect(after.clocks?.[seat]?.main).toBe(140_000);
  });

  it("입찰 동안은 재지 않고, 도착 인수는 차례인 사람 시계가 간다", () => {
    const buy: GalaxyState = {
      ...scene({ rules: FAST, positions: [14, 0, 0, 0] }),
      phase: "buy",
    };
    const bidding = must(buy, 0, { type: "pass", spent: 1_000 }).state;
    expect(clockTurn(bidding)).toBeNull();
    expect(must(bidding, 1, bidOf(bidding, 1, 0)).state.clocks?.[1]?.main).toBe(
      180_000,
    );
    const s = scene({
      rules: FAST,
      positions: [8, 0, 0, 0],
      stars: [{ square: 14, owner: 1 }],
    });
    const landed = roll(s, [2, 4]).state;
    expect(landed.phase).toBe("takeover");
    expect(clockTurn(landed)?.seat).toBe(0);
    const answered = must(landed, 0, {
      type: "declineTakeover",
      spent: 5_000,
    }).state;
    expect(answered.clocks?.[0]?.main).toBe(175_000);
  });

  it("시간을 넘긴 결정은 하지 않고 시간패로 끝난다", () => {
    const s = scene({ rules: FAST });
    const { state } = must(s, 0, { type: "roll", spent: 10_000_000 });
    expect(state.phase).toBe("gameOver");
    expect(state.result?.kind).toBe("time");
    expect(state.result?.standings.at(-1)?.seat).toBe(0);
    expect(state.revealFor).toBeNull();
  });

  it("시간패 알림: 남았으면 거절, 다 썼으면 그 사람이 꼴찌", () => {
    const s = scene({ rules: FAST });
    expect(refused(s, 0, { type: "timeout", spent: 1_000 })).toContain("남았");
    expect(refused(s, 1, { type: "timeout", spent: 999_999 })).toContain(
      "시계",
    );
    expect(refused(scene(), 0, { type: "timeout", spent: 999_999 })).toContain(
      "시계",
    );
    const { state } = must(s, 0, { type: "timeout", spent: 270_000 });
    expect(state.result?.kind).toBe("time");
    expect(state.clocks?.[0]).toEqual({ main: 0, periods: 0 });
  });
});
