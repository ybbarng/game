// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BUZZ_PATTERN,
  buzz,
  buzzOnce,
  canVibrate,
  forgetBuzzed,
  setVibrateOn,
  subscribeVibrate,
  VIBRATE_KEY,
  vibrateOn,
} from "./haptics";

/** 흉내 낸 localStorage(node 환경에는 없다) */
function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

let calls: unknown[];

/** 진동 함수가 있는 기기(안드로이드 Chrome) */
function android(result: boolean | (() => boolean) = true) {
  vi.stubGlobal("navigator", {
    vibrate: (p: unknown) => {
      calls.push(p);
      return typeof result === "function" ? result() : result;
    },
  });
}

beforeEach(() => {
  calls = [];
  forgetBuzzed();
  vi.stubGlobal("localStorage", fakeStorage());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buzz", () => {
  it("켜져 있으면 종류별 무늬로 한 번 떤다", () => {
    android();
    expect(buzz("broadcast")).toBe(true);
    expect(buzz("countdown")).toBe(true);
    expect(buzz("seal1")).toBe(true);
    expect(calls).toEqual([[30, 80, 30], 60, [40, 60, 80]]);
  });

  it("무늬는 짧다: 칸마다 100ms 안쪽, 합쳐 300ms 안쪽", () => {
    for (const p of Object.values(BUZZ_PATTERN)) {
      const list = typeof p === "number" ? [p] : p;
      expect(Math.max(...list)).toBeLessThanOrEqual(100);
      expect(list.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(300);
    }
  });

  it("「진동」을 끄면 부르지 않고, 다시 켜면 떤다", () => {
    android();
    setVibrateOn(false);
    expect(localStorage.getItem(VIBRATE_KEY)).toBe("off");
    expect(vibrateOn()).toBe(false);
    expect(buzz("confirm")).toBe(false);
    expect(calls).toEqual([]);
    setVibrateOn(true);
    expect(localStorage.getItem(VIBRATE_KEY)).toBeNull();
    expect(buzz("confirm")).toBe(true);
    expect(calls).toEqual([20]);
  });

  it("움직임 줄이기와 묶지 않는다: 움직임 줄이기를 켜도 떤다", () => {
    android();
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("reduce"),
    }));
    expect(buzz("seal")).toBe(true);
    expect(calls).toEqual([40]);
  });

  it("진동 함수가 없는 기기(아이폰 등)는 조용히 넘어간다", () => {
    vi.stubGlobal("navigator", {});
    expect(canVibrate()).toBe(false);
    expect(buzz("broadcast")).toBe(false);
  });

  it("브라우저가 거절하거나(누른 적 없음·숨은 화면) 던지면 조용히 넘어간다", () => {
    android(false);
    expect(buzz("broadcast")).toBe(false);
    android(() => {
      throw new Error("막힘");
    });
    expect(() => buzz("broadcast")).not.toThrow();
    expect(buzz("broadcast")).toBe(false);
  });

  it("저장소를 못 쓰면 켬으로 친다", () => {
    android();
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("막힘");
      },
      setItem: () => {
        throw new Error("막힘");
      },
      removeItem: () => {
        throw new Error("막힘");
      },
    });
    expect(vibrateOn()).toBe(true);
    expect(() => setVibrateOn(false)).not.toThrow();
    expect(buzz("tap")).toBe(true);
  });

  it("설정이 바뀌면 구독한 쪽에 알린다", () => {
    const seen: boolean[] = [];
    const off = subscribeVibrate(() => seen.push(vibrateOn()));
    setVibrateOn(false);
    setVibrateOn(true);
    off();
    setVibrateOn(false);
    expect(seen).toEqual([false, true]);
  });
});

describe("buzzOnce", () => {
  it("같은 회차에는 한 번만, 다른 회차·다른 종류는 따로", () => {
    android();
    expect(buzzOnce("broadcast", 12)).toBe(true);
    expect(buzzOnce("broadcast", 12)).toBe(false);
    expect(buzzOnce("countdown", 12)).toBe(true);
    expect(buzzOnce("broadcast", 13)).toBe(true);
    expect(calls).toEqual([[30, 80, 30], 60, [30, 80, 30]]);
  });

  it("꺼 둔 동안 지난 알림은 나중에 켜도 다시 울리지 않는다", () => {
    android();
    setVibrateOn(false);
    expect(buzzOnce("broadcast", 5)).toBe(false);
    setVibrateOn(true);
    expect(buzzOnce("broadcast", 5)).toBe(false);
    expect(calls).toEqual([]);
  });
});
