// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  BOARD_CASES,
  CARD_CASES,
  expectPlanPrint,
  PRINTS,
} from "./bot-plan-fixture";
import { botPlanOf } from "./kit";

describe("컴퓨터 계획 판 번호: 판 게임 컴퓨터 지문이 지금 번호에 남긴 것과 같다", () => {
  it.each(BOARD_CASES.map((c) => [c.kit.id, c] as const))("%s", (_id, c) =>
    expectPlanPrint(c),
  );
});

describe("컴퓨터 계획 판 번호 기록", () => {
  it("게임마다 1부터 지금 번호까지 빠짐없이 적고, 번호마다 지문이 다르다", () => {
    for (const c of [...CARD_CASES, ...BOARD_CASES]) {
      const prints = PRINTS[c.kit.id] ?? {};
      const plans = Object.keys(prints).map(Number);
      const upTo = Array.from({ length: botPlanOf(c.kit) }, (_, i) => i + 1);
      expect({ game: c.kit.id, plans }).toEqual({
        game: c.kit.id,
        plans: upTo,
      });
      const values = Object.values(prints);
      expect({ game: c.kit.id, distinct: new Set(values).size }).toEqual({
        game: c.kit.id,
        distinct: values.length,
      });
    }
  });
});
