import { describe, it } from "vitest";

import { checkFixture } from "./fixture-test-util";

describe("Rust 코어 공통 자료: 홈 시연", () => {
  it("3×3 프리드리히: 십자가 가장 싼 첫 면 색과 그 풀이", () =>
    checkFixture("fixtures/hero.json"));
});
