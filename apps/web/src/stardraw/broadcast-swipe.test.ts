import { describe, expect, it } from "vitest";

import { swipeResult } from "./broadcast-swipe";

describe("swipeResult", () => {
  it("옆으로 80px 넘게 밀면 지운다(양쪽)", () => {
    expect(swipeResult({ x: 81, y: 0 })).toBe("dismiss");
    expect(swipeResult({ x: -81, y: 0 })).toBe("dismiss");
  });

  it("위·아래로 60px 넘게 밀면 지운다", () => {
    expect(swipeResult({ x: 0, y: -61 })).toBe("dismiss");
    expect(swipeResult({ x: 0, y: 61 })).toBe("dismiss");
  });

  it("조금 끌다 놓으면 제자리로 돌아간다(아래로 끌어 뒤를 잠깐 본다)", () => {
    expect(swipeResult({ x: 0, y: 60 })).toBe("stay");
    expect(swipeResult({ x: 0, y: -60 })).toBe("stay");
    expect(swipeResult({ x: 80, y: 0 })).toBe("stay");
    expect(swipeResult({ x: 10, y: 30 })).toBe("stay");
  });

  it("거의 움직이지 않았으면 누른 것으로 본다", () => {
    expect(swipeResult({ x: 0, y: 0 })).toBe("go");
    expect(swipeResult({ x: 7, y: -7 })).toBe("go");
    expect(swipeResult({ x: 8, y: 0 })).toBe("stay");
  });
});
