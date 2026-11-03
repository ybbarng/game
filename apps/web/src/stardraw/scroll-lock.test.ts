// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { lockScroll } from "./scroll-lock";

const overflow = () => document.documentElement.style.overflow;

describe("lockScroll", () => {
  it("하나라도 열려 있으면 막고, 모두 닫히면 처음 값으로 푼다", () => {
    const a = lockScroll();
    expect(overflow()).toBe("hidden");
    a();
    expect(overflow()).toBe("");
  });

  it("겹쳐 열린 덮개가 먼저 연 쪽부터 닫혀도 마지막에 풀린다(2026-11-03 PC 스크롤 막힘)", () => {
    const letter = lockScroll();
    const register = lockScroll();
    letter();
    expect(overflow()).toBe("hidden");
    register();
    expect(overflow()).toBe("");
  });

  it("같은 해제를 두 번 불러도 다른 덮개의 막기를 풀지 않는다", () => {
    const a = lockScroll();
    const b = lockScroll();
    a();
    a();
    expect(overflow()).toBe("hidden");
    b();
    expect(overflow()).toBe("");
  });
});
