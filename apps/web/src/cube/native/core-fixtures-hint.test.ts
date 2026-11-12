import { describe, it } from "vitest";

import { checkFixture } from "./fixture-test-util";

// 사람 해법 탐색이 무거워 따로 둔다(파일마다 동시에 돈다)
describe("Rust 코어 공통 자료: 사람 해법과 공식 보기", () => {
  it("상태 → 공식 보기·해법 수", () => checkFixture("fixtures/hint.json"));
  it("Rust 사람 해법 공식 표", () => checkFixture("src/human_data.rs"));
});
