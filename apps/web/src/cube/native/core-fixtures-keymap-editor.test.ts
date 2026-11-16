import { describe, it } from "vitest";

import { checkFixture } from "./fixture-test-util";

describe("Rust 코어 공통 자료: 사용자 키 배치 편집", () => {
  it("동작 목록·키 이름·가져오기·설정 화면 대본", () =>
    checkFixture("fixtures/keymap-editor.json"));
});
