import { nyrongppongBeginnerBot } from "@game/nyrongppong-ai";
import {
  type NyrongppongState,
  STANDARD_RULES,
} from "@game/nyrongppong-engine";
import { describe, expect, it } from "vitest";

import { simulateCardTable } from "@/hwatu/card-table-sim";

import { nyrongppongFair } from "./fair";
import { nyrongppongKit } from "./kit";
import { onlineRules } from "./settings";

/**
 * 나이롱뽕 카드 표 약속(`nyrongppongFair`)을 암호 없이 본다(`simulateCardTable`이 걸음마다 공통 확인을 한다).
 * 진짜 암호로 이어 붙인 곳은 `hwatu/nyrongppong-reload.test.ts`가 한 판으로 본다
 */
const rulesOf = (players: number, rounds: number) =>
  onlineRules({ ...STANDARD_RULES, players, rounds });

describe("나이롱뽕 카드 표 약속", () => {
  it.each([
    [2, 2],
    [3, 2],
    [4, 1],
  ])(
    "%i명 %i판: 약속대로 끝까지 치고, 판 끝 다시 계산과 복기가 맞는다",
    (players, rounds) => {
      for (const seed of [1, 2, 3]) {
        const sim = simulateCardTable({
          kit: nyrongppongKit,
          rules: rulesOf(players, rounds),
          seed,
          bot: nyrongppongBeginnerBot,
        });
        expect((sim.final as NyrongppongState).phase).toBe("gameOver");
        expect(sim.rounds).toBe(rounds);
      }
    },
  );

  it("더미에서 가져온 카드는 가져간 사람만 보고, 버린 카드·뽕한 두 장은 모두가 본다", () => {
    let draws = 0;
    let discards = 0;
    simulateCardTable({
      kit: nyrongppongKit,
      rules: rulesOf(3, 1),
      seed: 4,
      bot: nyrongppongBeginnerBot,
      check: (step) => {
        const action = step.action as { type: string; card?: string };
        const deck = step.opened.filter((o) => o.why === "deck");
        // 더미에서 나간 카드는 모두 가져간 사람에게만 연다(누구의 행동 뒤든)
        const drawers = (step.events as { type: string; seat?: number }[])
          .filter((e) => e.type === "drew")
          .map((e) => e.seat);
        expect(deck.map((o) => o.to)).toEqual(drawers);
        draws += drawers.length;
        if (action.type === "discard") {
          discards++;
          expect(
            step.opened.filter((o) => o.why === "play").map((o) => o.card),
          ).toEqual([action.card]);
        }
        if (action.type === "call")
          expect(step.opened.filter((o) => o.why === "play")).toHaveLength(2);
      },
    });
    expect(draws).toBeGreaterThan(0);
    expect(discards).toBeGreaterThan(0);
  });

  it("판이 끝나는 걸음 전에 모든 카드를 연다(남은 손패 합이 점수다)", () => {
    const sim = simulateCardTable({
      kit: nyrongppongKit,
      rules: rulesOf(2, 1),
      seed: 5,
      bot: nyrongppongBeginnerBot,
    });
    const last = sim.steps.at(-1);
    expect(last?.opened.some((o) => o.why === "all")).toBe(true);
  });

  it("약속을 틀리게 바꾸면 짚는다: 가져온 카드를 모두에게 열면", () => {
    expect(() =>
      simulateCardTable({
        kit: nyrongppongKit,
        spec: { ...nyrongppongFair, deckUses: (_e, n) => Array(n).fill(null) },
        rules: rulesOf(2, 1),
        seed: 1,
        bot: nyrongppongBeginnerBot,
      }),
    ).toThrow(/보일 일이 없는 카드를 열었다/);
  });
});
