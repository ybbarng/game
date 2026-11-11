import { describe, it } from "vitest";

import { checkFixture } from "./fixture-test-util";

describe("Rust 코어 공통 자료", () => {
  it("표기 → 상태·맞춤 판정", () => checkFixture("fixtures/moves.json"));
  it("기록 → Ao5·티어", () => checkFixture("fixtures/tier.json"));
  it("다시 보기·구간 기록 글", () => checkFixture("fixtures/replay.json"));
  it("Rust 자료 파일(공식 상황·티어 표)", () => checkFixture("src/data.rs"));
  it("키 누름 차례 → 수·명령(두 손·표기)", () =>
    checkFixture("fixtures/keys.json"));
  it("Rust 키 배치 자료 파일", () => checkFixture("src/keymap_data.rs"));
});
