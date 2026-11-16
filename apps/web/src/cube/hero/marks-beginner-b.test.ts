import { describe, it } from "vitest";

import { check } from "./marks-check";

describe("강조한 조각 = 실제로 넣는 조각", () => {
  it("3×3 초보자 섞기 101~200번: 찾은 조각을 넣고, 그동안 다른 조각을 넣지 않고, 강조 없이 맞은 조각이 없다", async () => {
    for (let seed = 101; seed <= 200; seed++)
      await check("3-beginner", seed, true);
  });
});
