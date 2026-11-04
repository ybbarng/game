import { minhwatuBeginnerBot } from "@game/minhwatu-ai";
import { type MinhwatuState, STANDARD_RULES } from "@game/minhwatu-engine";
import { describe, expect, it } from "vitest";

import { simulateCardTable } from "@/hwatu/card-table-sim";

import { minhwatuFair } from "./fair";
import { minhwatuKit } from "./kit";

/**
 * 민화투 카드 표 약속(`minhwatuFair`)을 암호 없이 본다(`simulateCardTable`이 걸음마다 공통 확인을 한다).
 * 진짜 암호로 이어 붙인 곳은 화투 공통 시험(`hwatu/fair-room-*.test.ts`)이 민화투로 본다
 */
describe("민화투 카드 표 약속", () => {
  it.each([2, 3])(
    "%i명 두 판: 약속대로 끝까지 치고, 판 끝 다시 계산과 복기가 맞는다",
    (players) => {
      for (const seed of [1, 2, 3]) {
        const sim = simulateCardTable({
          kit: minhwatuKit,
          rules: { ...STANDARD_RULES, players, rounds: 2 },
          seed,
          bot: minhwatuBeginnerBot,
        });
        expect((sim.final as MinhwatuState).phase).toBe("gameOver");
        expect(sim.rounds).toBe(2);
      }
    },
  );

  it("낸 카드와 뒤집은 더미만 모두에게 연다", () => {
    simulateCardTable({
      kit: minhwatuKit,
      rules: { ...STANDARD_RULES, rounds: 1 },
      seed: 1,
      bot: minhwatuBeginnerBot,
      check: (step) => {
        const action = step.action as { type: string; card?: string };
        expect(step.opened.every((o) => o.to === -1)).toBe(true);
        expect(
          step.opened.filter((o) => o.why === "play").map((o) => o.card),
        ).toEqual(action.type === "play" ? [action.card] : []);
      },
    });
  });

  it("약속을 틀리게 바꾸면 짚는다: 낼 카드를 열지 않으면", () => {
    expect(() =>
      simulateCardTable({
        kit: minhwatuKit,
        spec: { ...minhwatuFair, revealsOf: () => [] },
        rules: { ...STANDARD_RULES, rounds: 1 },
        seed: 1,
        bot: minhwatuBeginnerBot,
      }),
    ).toThrow(/열지 않았다/);
  });

  it("약속을 틀리게 바꾸면 짚는다: 낸 사람이 아닌 때 더미를 열면(deckGuard)", () => {
    expect(() =>
      simulateCardTable({
        kit: minhwatuKit,
        spec: { ...minhwatuFair, deckGuard: () => false },
        rules: { ...STANDARD_RULES, rounds: 1 },
        seed: 1,
        bot: minhwatuBeginnerBot,
      }),
    ).toThrow(/deckGuard/);
  });
});
