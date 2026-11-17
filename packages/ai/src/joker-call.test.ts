import {
  type Card,
  createRng,
  createScenario,
  type MatchState,
  presetRules,
  step,
  trickJokerCallVerdict,
  viewOf,
} from "@game/mighty-engine";
import { describe, expect, it } from "vitest";

import { createRuleBot, heuristicBot, NORMAL_BOOK } from "./heuristic-bot";
import { jokerCallChance } from "./joker-call";

const rules = presetRules("standard5");
/** 조커콜 가리기가 없는 예전 중수 */
const oldNormal = createRuleBot({
  book: NORMAL_BOOK.filter((r) => r !== "jokerCallOdds"),
});

/**
 * 기루다 ♥(마이티 ♠A, 조커콜 ♣3), 0번 주공이 조커를 프렌드로 불렀고 1번이 조커를 쥐었다(아직 안 드러남).
 * 둘째 턴부터 `leader`가 선을 잡는다.
 */
function scene(leader: number, hands: Card[][]): MatchState {
  return createScenario({
    rules,
    phase: "play",
    declarer: 0,
    goal: { kiruda: "H", score: 13 },
    friend: { kind: "card", card: "JK" },
    leader,
    hands,
  });
}

describe("조커콜 가리기", () => {
  it("같은 편이 조커를 가진 것이 확실하면 조커콜을 하지 않는다", () => {
    // 주공은 조커를 프렌드로 불렀으니 조커는 프렌드(우리 편) 손에 있다.
    const state = scene(0, [
      ["C3", "SA", "H5"],
      ["JK", "C5", "D2"],
      ["CK", "D3", "D4"],
      ["CQ", "D5", "D6"],
      ["CJ", "D7", "D8"],
    ]);
    const view = viewOf(state, 0);
    expect(jokerCallChance(view)).toEqual({
      effective: 0,
      lostTrick: 0,
      ownJoker: 1,
      noJoker: 0,
    });
    const action = heuristicBot.decide(view, createRng(1));
    expect(action).toMatchObject({ type: "play", card: "C3" });
    expect(action).not.toHaveProperty("jokerCall");
    // 예전 중수는 우리 편 조커를 끌어냈다.
    expect(oldNormal.decide(view, createRng(1))).toMatchObject({
      card: "C3",
      jokerCall: true,
    });
  });

  it("상대 편이 조커를 가진 것이 확실하고 우리 편이 그 턴을 먹을 수 있으면 조커콜을 한다", () => {
    // 야당 2번 선. 조커는 프렌드(상대 편)에게 있고, 뒤의 야당 4번이 ♣A로 그 턴을 먹는다.
    let state = scene(2, [
      ["C2", "H3", "H4"],
      ["JK", "D2", "D3"],
      ["C3", "SA", "D9"],
      ["CK", "D5", "D6"],
      ["CA", "D7", "D8"],
    ]);
    const view = viewOf(state, 2);
    // 프렌드가 1·3·4번 가운데 누구든 조커는 상대 편에 있다. 턴은 주공(두 몫)과 남은 둘이 나눠 먹는다고 본다.
    expect(jokerCallChance(view)).toEqual({
      effective: 0.5,
      lostTrick: 0.5,
      ownJoker: 0,
      noJoker: 0,
    });
    const action = heuristicBot.decide(view, createRng(1));
    expect(action).toEqual({ type: "play", card: "C3", jokerCall: true });

    // 실제로 두면 그 턴은 「효과 있음」이다.
    const rng = createRng(1);
    for (const seat of [2, 3, 4, 0, 1]) {
      const move =
        seat === 2 ? action : heuristicBot.decide(viewOf(state, seat), rng);
      const result = step(state, seat, move);
      if (!result.ok) throw new Error(result.error);
      state = result.state;
    }
    const trick = state.round.tricks.at(-1);
    if (!trick) throw new Error("턴이 끝나지 않았다");
    expect(trickJokerCallVerdict(trick, (s) => s === 0 || s === 1)).toBe(
      "effective",
    );
  });
});
