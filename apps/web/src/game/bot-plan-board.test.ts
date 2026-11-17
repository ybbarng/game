// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  BOARD_CASES,
  BOARD_GROUPS,
  boardGroup,
  CARD_CASES,
  expectPlanPrint,
  PRINTS,
} from "./bot-plan-fixture";
import { registeredGames } from "./bot-registry";
import { botPlanOf } from "./kit";

// 나머지 판 게임(바둑·야구·윷·은하)은 `bot-plan-board-b.test.ts`가 동시에 본다
describe("컴퓨터 계획 판 번호: 판 게임 컴퓨터 지문이 지금 번호에 남긴 것과 같다(체스·장기·오목)", () => {
  it.each(boardGroup(0).map((c) => [c.kit.id, c] as const))("%s", (_id, c) =>
    expectPlanPrint(c),
  );
});

describe("컴퓨터 계획 판 번호 기록", () => {
  it("컴퓨터가 있는 게임(컴퓨터 등록부)은 모두 지문을 잰다", () => {
    const ids = [...CARD_CASES, ...BOARD_CASES].map((c) => c.kit.id);
    expect(ids).toEqual(expect.arrayContaining(registeredGames()));
  });

  it("판 게임은 모두 한 시험 파일에서만 지문을 잰다", () => {
    const grouped = BOARD_GROUPS.flat();
    expect([...grouped].sort()).toEqual(
      BOARD_CASES.map((c) => c.kit.id).sort(),
    );
  });

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
