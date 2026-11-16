import { describe, it } from "vitest";

import { check } from "./marks-check";

describe("강조한 조각 = 실제로 넣는 조각", () => {
  it("3×3 프리드리히 섞기 1~8번: 찾은 짝을 넣고, 함께 맞은 짝은 다음 짝 앞에 확인한다", async () => {
    for (let seed = 1; seed <= 8; seed++) await check("3-cfop", seed, false);
  });
});
