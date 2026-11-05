// @vitest-environment node
import { ManualClock } from "@game/fair-play";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BUZZ_PATTERN,
  ballBuzz,
  buzz,
  buzzOnce,
  canVibrate,
  countdownBuzz,
  forgetBuzzed,
  setVibrateOn,
  subscribeVibrate,
  VIBRATE_KEY,
  vibrateOn,
} from "./haptics";
import { LIVE_ROULETTE_TIMING, planRoulette, rouletteAt } from "./roulette";

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

/* 관측 박자 진동(docs/36 11-73): 카운트다운 3·2·1, 공마다, 내 별은 톡톡. 같은 순간에 둘이 울리지 않는다 */
describe("countdownBuzz", () => {
  it("10~4초는 회차 열쇠의 시작 알림, 3·2·1초는 초마다 열쇠", () => {
    expect(countdownBuzz(7, 10_000)).toEqual({ kind: "countdown", key: "7" });
    expect(countdownBuzz(7, 4_001)).toEqual({ kind: "countdown", key: "7" });
    expect(countdownBuzz(7, 3_000)).toEqual({ kind: "count", key: "7:3" });
    expect(countdownBuzz(7, 2_500)).toEqual({ kind: "count", key: "7:3" });
    expect(countdownBuzz(7, 2_000)).toEqual({ kind: "count", key: "7:2" });
    expect(countdownBuzz(7, 1)).toEqual({ kind: "count", key: "7:1" });
  });
  it("카운트다운 밖이면 없다", () => {
    expect(countdownBuzz(7, 10_001)).toBeNull();
    expect(countdownBuzz(7, 0)).toBeNull();
    expect(countdownBuzz(7, -5)).toBeNull();
  });
});

describe("ballBuzz", () => {
  it("공이 하나 늘면 톡, 내 별이면 톡톡", () => {
    expect(ballBuzz([], [5], [1, 2])).toBe("ball");
    expect(ballBuzz([5], [5, 2], [1, 2])).toBe("ballMine");
  });
  it("그대로이거나 한꺼번에 여럿이면 울리지 않는다", () => {
    expect(ballBuzz([5], [5], [5])).toBeNull();
    expect(ballBuzz([], [5, 2], [5])).toBeNull();
    expect(ballBuzz([], [5, 2, 9, 1, 4, 8, 3], [5])).toBeNull();
  });
});

describe("관측 한 회차의 진동 박자", () => {
  const order = [3, 17, 22, 41, 8, 30, 45];
  const mine = [17, 8, 45, 1, 2, 4];
  const plan = planRoulette(order, LIVE_ROULETTE_TIMING);

  /**
   * 관측지처럼 돈다: 카운트다운은 0.25초마다(RoomView의 시각 갱신), 연출은 16ms마다(프레임) 다음 그림을 본다.
   * `from`(관측 시작 기준 ms)에 들어오고, `jumpAt`이면 그때 화면이 멈췄다가 `jumpTo`로 건너뛴다(숨은 탭에서 돌아옴)
   */
  function run(from: number, jump?: { at: number; to: number }) {
    android();
    const clock = new ManualClock();
    clock.advance(1_000_000);
    const showStart = clock.now() - from;
    const heard: { at: number; p: unknown }[] = [];
    const record = () => {
      while (heard.length < calls.length)
        heard.push({ at: clock.now() - showStart, p: calls[heard.length] });
    };
    let lastSec: number | null = null;
    let last = rouletteAt(plan, Math.max(0, from));
    while (clock.now() - showStart < plan.totalMs + 1000) {
      const t = clock.now() - showStart;
      if (t < 0) {
        const sec = Math.ceil(-t / 1000);
        if (sec !== lastSec) {
          lastSec = sec;
          const b = countdownBuzz(1, -t);
          if (b) buzzOnce(b.kind, b.key);
        }
        record();
        clock.advance(250);
      } else {
        const next = rouletteAt(plan, t);
        const kind = ballBuzz(last.fixed, next.fixed, mine);
        if (kind) buzz(kind);
        last = next;
        record();
        clock.advance(
          jump && t < jump.at && t + 16 >= jump.at ? jump.to - t : 16,
        );
      }
    }
    return heard;
  }

  it("카운트다운 시작 한 번, 3·2·1, 공 일곱 개(내 별 셋은 톡톡)", () => {
    const heard = run(-12_000);
    expect(heard.map((h) => h.p)).toEqual([
      60,
      15,
      15,
      15,
      12,
      [25, 50, 25],
      12,
      12,
      [25, 50, 25],
      12,
      [25, 50, 25],
    ]);
    // 3·2·1은 남은 초가 바뀌는 그 순간(0.25초 갱신 안)
    expect(heard.slice(1, 4).map((h) => h.at)).toEqual([-3000, -2000, -1000]);
  });

  it("어떤 두 진동도 0.9초 안에 겹치지 않는다", () => {
    const heard = run(-12_000);
    for (let i = 1; i < heard.length; i++)
      expect(
        (heard[i]?.at ?? 0) - (heard[i - 1]?.at ?? 0),
      ).toBeGreaterThanOrEqual(900);
  });

  it("3초 안쪽에 늦게 들어오면 시작 알림 없이 남은 초만", () => {
    const heard = run(-2_500);
    expect(heard.slice(0, 4).map((h) => h.p)).toEqual([15, 15, 15, 12]);
  });

  it("연출 도중 들어오면 이미 나온 공은 울리지 않는다", () => {
    const third = plan.stops[2]?.at ?? 0;
    const heard = run(third);
    expect(heard).toHaveLength(5);
  });

  it("화면이 멈췄다 건너뛰어 공 여럿이 한꺼번에 보이면 그때는 울리지 않는다", () => {
    const heard = run(-12_000, {
      at: plan.stops[1]?.at ?? 0,
      to: (plan.stops[4]?.at ?? 0) + 100,
    });
    // 첫 공(3) 한 번, 건너뛴 사이에 나온 셋(17·22·41)은 없음, 뒤의 셋(8·30·45)은 하나씩
    expect(heard.slice(4).map((h) => h.p)).toEqual([
      12,
      [25, 50, 25],
      12,
      [25, 50, 25],
    ]);
  });
});
