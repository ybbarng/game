// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CURRENT_SIZE_KEY,
  resetCurrentSizeForTest,
  setCurrentSize,
  useCurrentSize,
} from "./current-size";

beforeEach(() => {
  localStorage.clear();
  resetCurrentSizeForTest();
});
afterEach(cleanup);

/** 다른 탭이 지금 크기를 바꾼 것처럼: 저장소를 바꾸고 storage 사건을 보낸다 */
function otherTabSets(n: number) {
  const text = JSON.stringify({ v: 1, n });
  localStorage.setItem(CURRENT_SIZE_KEY, text);
  window.dispatchEvent(
    new StorageEvent("storage", { key: CURRENT_SIZE_KEY, newValue: text }),
  );
}

describe("지금 크기 구독", () => {
  it("저장된 지금 크기로 읽힌다", () => {
    localStorage.setItem(CURRENT_SIZE_KEY, '{"v":1,"n":5}');
    const { result } = renderHook(() => useCurrentSize());
    expect(result.current).toBe(5);
  });

  it("같은 탭의 다른 화면이 바꾸면 따라가고 저장된다", () => {
    const a = renderHook(() => useCurrentSize());
    const b = renderHook(() => useCurrentSize());
    act(() => setCurrentSize(4));
    expect(a.result.current).toBe(4);
    expect(b.result.current).toBe(4);
    expect(localStorage.getItem(CURRENT_SIZE_KEY)).toBe('{"v":1,"n":4}');
  });

  it("다른 탭이 바꾸면 따라간다", () => {
    const { result } = renderHook(() => useCurrentSize());
    expect(result.current).toBe(3);
    act(() => otherTabSets(7));
    expect(result.current).toBe(7);
  });

  it("맞지 않는 크기로는 바꾸지 않는다", () => {
    const { result } = renderHook(() => useCurrentSize());
    act(() => setCurrentSize(9));
    expect(result.current).toBe(3);
    expect(localStorage.getItem(CURRENT_SIZE_KEY)).toBeNull();
  });
});
