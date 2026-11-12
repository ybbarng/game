import { describe, expect, it } from "vitest";

import { PRACTICE_STAGES } from "../practice/stages";
import { CORE_MASKS } from "./core-fixtures-screen";
import { checkFixture } from "./fixture-test-util";

describe("Rust 코어 공통 자료: 화면 상태", () => {
  it("가리기 이름 × 크기, 공식 연습 단계마다 시작 모양에서 칠할 값", () =>
    checkFixture("fixtures/mask.json"));

  it("공식 연습 단계가 쓰는 가리기 이름은 모두 코어가 옮겼다(새 이름을 쓰면 코어에도 옮긴다)", () => {
    for (const s of PRACTICE_STAGES)
      if (s.mask !== "all") expect(CORE_MASKS, s.id).toContain(s.mask);
  });
});
