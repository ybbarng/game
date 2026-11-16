// @vitest-environment node
import { describe, it } from "vitest";

import { CARD_CASES, expectPlanPrint } from "./bot-plan-fixture";

describe("컴퓨터 계획 판 번호: 카드 게임 컴퓨터 지문이 지금 번호에 남긴 것과 같다", () => {
  it.each(CARD_CASES.map((c) => [c.kit.id, c] as const))("%s", (_id, c) =>
    expectPlanPrint(c),
  );
});
