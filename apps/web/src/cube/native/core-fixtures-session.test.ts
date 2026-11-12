import { describe, it } from "vitest";

import { checkFixture } from "./fixture-test-util";

describe("Rust 코어 공통 자료: 한 판 세션", () => {
  it("차례 → 알림·진행·콤보·기록 칸", () =>
    checkFixture("fixtures/session.json"));
});
