import { describe, expect, it } from "vitest";

import { eventForSize, plainEvent } from "./events";

describe("지금 크기로 여는 타이머 종목", () => {
  it("저장한 종목이 지금 크기와 같으면 그대로 연다", () => {
    expect(eventForSize("444", 4)).toBe("444");
    expect(eventForSize("333bf", 3)).toBe("333bf");
  });

  it("저장한 종목이 다른 크기면 지금 크기의 보통 종목으로 연다", () => {
    expect(eventForSize("333", 6)).toBe("666");
    expect(eventForSize("333bf", 2)).toBe("222");
    expect(eventForSize("777", 3)).toBe("333");
  });

  it("종목이 없는 크기는 3×3 보통 종목이다", () => {
    expect(plainEvent(5)).toBe("555");
    expect(plainEvent(8)).toBe("333");
  });
});
