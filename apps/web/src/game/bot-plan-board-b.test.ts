// @vitest-environment node
import { describe, it } from "vitest";

import { boardGroup, expectPlanPrint } from "./bot-plan-fixture";

// 체스·장기·오목과 판 번호 기록은 `bot-plan-board.test.ts`가 동시에 본다
describe("컴퓨터 계획 판 번호: 판 게임 컴퓨터 지문이 지금 번호에 남긴 것과 같다(바둑·야구·윷·은하)", () => {
  it.each(boardGroup(1).map((c) => [c.kit.id, c] as const))("%s", (_id, c) =>
    expectPlanPrint(c),
  );
});
