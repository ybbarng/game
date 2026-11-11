import { describe, it } from "vitest";

import { checkFixture } from "./fixture-test-util";

// 3×3 해법 표를 만드는 시간이 커서 섞기 자료만 따로 둔다(파일마다 동시에 돈다)
describe("Rust 코어 공통 자료: 섞기", () => {
  it("씨앗 → 섞기 글", () => checkFixture("fixtures/scramble.json"));
});
