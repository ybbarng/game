import { describe, expect, it } from "vitest";

import {
  createFairMatch,
  reshuffleRequest,
  type StepResult,
  step,
  viewOf,
  withRefill,
} from "./match";
import { STANDARD_ONECARD_RULES } from "./rules";
import type { OnecardState } from "./state";

const rules = { ...STANDARD_ONECARD_RULES, players: 2, handSize: 5 as const };

function ok(result: StepResult): OnecardState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** 자리 표 손패(방장 엔진이 보는 모양) */
const hidden = (from: number, n: number) =>
  Array.from({ length: n }, (_, i) => `?_${from + i}`);

describe("멘탈 포커 판(createFairMatch)", () => {
  it("손패는 자리 순서 그대로, 처음 카드가 특수 카드면 버린 더미 밑으로 보내고 더미 맨 위(열린 카드)를 다시 편다", () => {
    const { state, events } = createFairMatch(rules, {
      hands: [hidden(0, 5), hidden(5, 5)],
      open: ["S7"],
      deck: ["HK", "D9", ...hidden(13, 3)],
    });
    expect(events).toEqual([
      { type: "flipAgain", card: "S7" },
      { type: "flipAgain", card: "HK" },
      { type: "dealt", first: 0, top: "D9" },
    ]);
    // 더미 순서는 그대로 앞에서 빠질 뿐이다(섞기 사슬 자리 순서 = 뽑는 순서)
    expect(state.deck).toEqual(hidden(13, 3));
    expect(state.pile).toEqual(["S7", "HK", "D9"]);
    expect(state.suit).toBe("D");
    expect(state.fair).toBe(true);
  });

  it("다시 펼 카드가 아직 자리 표면 던진다(방장이 먼저 모두에게 연다)", () => {
    expect(() =>
      createFairMatch(rules, {
        hands: [hidden(0, 5), hidden(5, 5)],
        open: ["SA"],
        deck: hidden(11, 3),
      }),
    ).toThrow("아직 모른다");
  });

  it("다시 섞기는 바깥이 넣은 새 더미(refill)를 쓰고, 진짜 카드면 버린 더미와 같은 카드인지 본다", () => {
    const base = createFairMatch(rules, {
      hands: [["H3", "H4", "H5", "C9", "C8"], hidden(5, 5)],
      open: ["H6"],
      deck: [],
    }).state;
    // 자리 0이 H3을 내고, 자리 1이 먹으려는데 더미가 비었다
    const played = ok(step(base, 0, { type: "play", card: "H3" }));
    const waiting = ok(step(played, 1, { type: "draw" }));
    expect(waiting.phase).toBe("reshuffle");
    expect(reshuffleRequest(waiting)).toEqual(["H6"]);
    // 새 더미를 모르면 던진다(판 끝 다시 계산이 거기서 멈춘다)
    expect(() => step(waiting, 0, { type: "reshuffle", order: [] })).toThrow();
    // 방장 엔진: 자리 표 새 더미(장 수만 본다)
    const tokens = ok(
      step(withRefill(waiting, ["?_20"]), 0, { type: "reshuffle", order: [] }),
    );
    expect(tokens.hands[1]).toContain("?_20");
    expect(tokens.refill).toBeNull();
    // 진짜 카드: 버린 더미와 다른 카드면 거절
    expect(
      step(withRefill(waiting, ["SK"]), 0, { type: "reshuffle", order: [] }).ok,
    ).toBe(false);
    expect(
      step(withRefill(waiting, ["H6"]), 0, { type: "reshuffle", order: [] }).ok,
    ).toBe(true);
  });

  it("파산한 사람의 패는 판에서 빠진다(다시 섞기에 들어가지 않는다)", () => {
    const base = createFairMatch(
      { ...rules, bankruptAt: 15 },
      {
        hands: [hidden(0, 14), ["H3", "H9"]],
        open: ["C5"],
        deck: hidden(20, 4),
      },
    ).state;
    const after = ok(step(base, 0, { type: "draw" }));
    expect(after.bankrupt).toEqual([0]);
    expect(after.pile).toEqual(["C5"]);
    expect(after.phase).toBe("over");
    // 자리 표가 섞인 화면도 만들 수 있다(낼 수 있는 수는 먹기만)
    expect(viewOf(base, 0).moves).toEqual([{ type: "draw" }]);
  });
});
