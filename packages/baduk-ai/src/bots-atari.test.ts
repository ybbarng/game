import { createBadukScenario, pointAt, viewOf } from "@game/baduk-engine";
import { createRng } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";

import { badukBeginnerBot, badukExpertBot, badukIntermediateBot } from "./bots";

/*
 * 단수 장면. 고수는 실제 단계(6000번 탐색)로 두어 장면 하나가 0.4초쯤 걸린다.
 * bots.test.ts와 나눠 두 파일이 동시에 돌게 한다(한 파일 안의 시험은 차례로 돈다)
 */

const BOTS = [badukBeginnerBot, badukIntermediateBot, badukExpertBot];
const at = (name: string) => pointAt(name, 9);

describe("바둑 컴퓨터: 단수 장면", () => {
  it.each(BOTS.map((b) => [b.name, b] as const))(
    "%s: 단수에 걸린 석 점을 따낸다",
    (_name, bot) => {
      const state = createBadukScenario({
        black: ["D6", "E6", "F6", "D4", "E4", "F4", "C5"],
        white: ["D5", "E5", "F5"],
      });
      const action = bot.decide(viewOf(state, 0), createRng(5));
      expect(action).toEqual({ type: "place", at: at("G5") });
    },
  );

  it.each(BOTS.map((b) => [b.name, b] as const))(
    "%s: 단수에 걸린 내 석 점을 살린다",
    (_name, bot) => {
      const state = createBadukScenario({
        black: ["D5", "E5", "F5"],
        white: ["D6", "E6", "F6", "D4", "E4", "F4", "C5"],
      });
      const action = bot.decide(viewOf(state, 0), createRng(5));
      expect(action).toEqual({ type: "place", at: at("G5") });
    },
  );
});
