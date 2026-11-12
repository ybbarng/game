import { describe, it } from "vitest";

import { checkFixture } from "./fixture-test-util";

describe("Rust 코어 공통 자료: 공식 연습", () => {
  it("단계·공식 고르기·출제·진행기", () =>
    checkFixture("fixtures/practice.json"));
  it("Rust 공식 연습 자료 파일", () => checkFixture("src/practice_data.rs"));
});
