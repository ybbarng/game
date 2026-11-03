// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWakeLock } from "./wake-lock";

/** 화면 깨우기 잠금 흉내: 잡은 수·푼 수를 센다 */
function fakeWakeLock() {
  const made: { released: boolean; release: () => Promise<void> }[] = [];
  const request = vi.fn(async () => {
    const s = {
      released: false,
      release: async () => {
        s.released = true;
      },
    };
    made.push(s);
    return s;
  });
  Object.defineProperty(navigator, "wakeLock", {
    value: { request },
    configurable: true,
  });
  return { request, made };
}

function setVisible(v: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    value: v,
    configurable: true,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "wakeLock");
  setVisible("visible");
});

const flush = () => act(async () => {});

describe("관측 동안 화면 깨우기 잠금", () => {
  it("관측 중에만 잡고, 끝나면 푼다", async () => {
    const w = fakeWakeLock();
    const { rerender } = renderHook(({ on }) => useWakeLock(on), {
      initialProps: { on: false },
    });
    await flush();
    expect(w.request).not.toHaveBeenCalled();
    rerender({ on: true });
    await flush();
    expect(w.request).toHaveBeenCalledTimes(1);
    rerender({ on: false });
    await flush();
    expect(w.made[0]?.released).toBe(true);
  });

  it("탭을 떠났다 돌아오면(브라우저가 잠금을 풂) 다시 잡는다", async () => {
    const w = fakeWakeLock();
    renderHook(() => useWakeLock(true));
    await flush();
    // 탭을 떠나면 브라우저가 잠금을 푼다
    const first = w.made[0];
    if (first) first.released = true;
    setVisible("hidden");
    await flush();
    setVisible("visible");
    await flush();
    expect(w.request).toHaveBeenCalledTimes(2);
  });

  it("지원하지 않는 브라우저에서는 아무 일도 하지 않는다", async () => {
    const { unmount } = renderHook(() => useWakeLock(true));
    await flush();
    unmount();
  });
});
