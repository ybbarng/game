import { gostopBeginnerBot } from "@game/gostop-ai";
import {
  GOSTOP3_RULES,
  type GostopState,
  MATGO_RULES,
} from "@game/gostop-engine";
import { monthOf } from "@game/hwatu";
import { describe, expect, it } from "vitest";

import { simulateCardTable } from "@/hwatu/card-table-sim";

import { gostopFair } from "./fair";
import { gostopKit } from "./kit";

/**
 * 고스톱 카드 표 약속(`gostopFair`)을 암호 없이 본다(`simulateCardTable`이 걸음마다 공통 확인을 한다).
 * 진짜 암호로 이어 붙인 곳은 `fair-room.test.ts`(총통으로 바로 끝나는 판)와 화투 공통 시험(`hwatu/fair-room-*.test.ts`)이 본다
 */
/** 흔들 수 있으면 흔들고 폭탄이 있으면 터뜨리는 컴퓨터(손패 여러 장을 모두에게 보이는 길을 꼭 지나게) */
const shaker: typeof gostopBeginnerBot = {
  name: "gostop-shaker",
  decide(view, rng) {
    const d = view.decision;
    if (d?.kind === "play") {
      const bomb = d.bombs[0];
      if (bomb !== undefined) return { type: "bomb", month: bomb };
      const card = d.shakeable[0];
      if (card !== undefined) return { type: "play", card, shake: true };
    }
    return gostopBeginnerBot.decide(view, rng);
  },
};

describe("고스톱 카드 표 약속", () => {
  it.each([
    ["맞고 두 판", { ...MATGO_RULES, rounds: 2 }, 2],
    ["3명 두 판", { ...GOSTOP3_RULES, rounds: 2 }, 2],
  ] as const)(
    "%s: 약속대로 끝까지 치고, 판 끝 다시 계산과 복기가 맞는다",
    (_name, rules, rounds) => {
      for (const seed of [1, 2, 3]) {
        const sim = simulateCardTable({
          kit: gostopKit,
          rules,
          seed,
          bot: gostopBeginnerBot,
        });
        expect((sim.final as GostopState).phase).toBe("gameOver");
        expect(sim.rounds).toBe(rounds);
      }
    },
  );

  it("낸 카드와 뒤집은 더미만 모두에게 열고, 흔들거나 폭탄이면 그 달 석 장을 연다", () => {
    let flips = 0;
    let shakes = 0;
    let bombs = 0;
    // 패는 시드로 정해진다: 1·5는 흔들기, 10은 폭탄이 나는 판이다
    for (const seed of [1, 5, 10]) {
      simulateCardTable({
        kit: gostopKit,
        rules: { ...MATGO_RULES, rounds: 1 },
        seed,
        bot: shaker,
        check: (step) => {
          const action = step.action as {
            type: string;
            card?: string;
            shake?: boolean;
            month?: number;
          };
          const played = step.opened.filter((o) => o.why === "play");
          for (const o of step.opened.filter((x) => x.why === "deck")) {
            expect(o.to).toBe(-1);
            flips++;
          }
          if (action.type === "play" && action.shake) {
            shakes++;
            expect(played).toHaveLength(3);
            expect(
              played.every(
                (o) => monthOf(o.card) === monthOf(action.card as string),
              ),
            ).toBe(true);
          } else if (action.type === "bomb") {
            bombs++;
            expect(played).toHaveLength(3);
            expect(played.every((o) => monthOf(o.card) === action.month)).toBe(
              true,
            );
          } else if (action.type === "play")
            expect(played.length).toBeLessThanOrEqual(1);
          else expect(played).toEqual([]);
        },
      });
    }
    expect(flips).toBeGreaterThan(0);
    expect(shakes).toBeGreaterThan(0);
    expect(bombs).toBeGreaterThan(0);
  });

  it("처음 받은 손패가 총통이면 판을 시작할 때 그 넉 장을 모두에게 보이고 판이 바로 끝난다", () => {
    // 섞기 시드를 찾아 총통이 나는 판을 만든다(약속이 정하는 것은 "그 넉 장만 모두에게")
    let found = 0;
    for (let deckSeed = 1; deckSeed < 400 && found === 0; deckSeed++) {
      const sim = simulateCardTable({
        kit: gostopKit,
        rules: { ...GOSTOP3_RULES, rounds: 1 },
        seed: 1,
        deckSeed,
        bot: gostopBeginnerBot,
        until: () => true,
      });
      const shown = (sim.dealt.get(1) ?? []).filter(
        (o) => o.why === "chongtong",
      );
      if (shown.length === 0) continue;
      found++;
      expect(shown).toHaveLength(4);
      expect(new Set(shown.map((o) => monthOf(o.card))).size).toBe(1);
      expect((sim.initial as GostopState).phase).toBe("gameOver");
      expect((sim.initial as GostopState).result?.kind).toBe("chongtong");
    }
    expect(found).toBe(1);
  });

  it("약속을 틀리게 바꾸면 짚는다: 흔들 때 손패를 모두 열면", () => {
    const spec = {
      ...gostopFair,
      revealsOf: (
        action: Parameters<typeof gostopFair.revealsOf>[0],
        view: Parameters<typeof gostopFair.revealsOf>[1],
      ) =>
        action.type === "play"
          ? [...view.hand]
          : gostopFair.revealsOf(action, view),
    };
    expect(() =>
      simulateCardTable({
        kit: gostopKit,
        spec,
        rules: { ...MATGO_RULES, rounds: 1 },
        seed: 1,
        bot: gostopBeginnerBot,
      }),
    ).toThrow(/보일 일이 없는 카드를 열었다/);
  });
});
