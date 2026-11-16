import { describe, it } from "vitest";

import { checkFixture } from "./fixture-test-util";

// 4×4 야우 한 판은 길어 한 판 세션 자료(`core-fixtures-session.test.ts`)와 따로 돈다
describe("Rust 코어 공통 자료: 한 판 세션(4×4 야우)", () => {
  it("야우 풀이로 맞추는 차례 → 알림·진행·콤보·구간(센터 둘·십자 셋)·기록 칸", () =>
    checkFixture("fixtures/session-yau.json"));
});
