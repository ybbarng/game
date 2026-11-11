import { describe, it } from "vitest";

import { checkFixture } from "./fixture-test-util";

describe("Rust 코어 공통 자료: OLL·PLL 알아보기", () => {
  it("상태 → F2L·상황·쥐는 법·공식 보기", () =>
    checkFixture("fixtures/spot.json"));
});
