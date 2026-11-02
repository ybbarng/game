import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import { LoopDelay } from "./loop-delay";

/** 히스토그램 흉내(나노초) */
function fakeSource() {
  return {
    max: 9_223_372_036_854_776_000,
    reset() {
      this.max = 9_223_372_036_854_776_000;
    },
  };
}

describe("최근 이벤트 루프 지연 최대", () => {
  it("표본이 없으면 0, 지금 구간의 최대를 ms로", () => {
    const clock = new ManualClock();
    const src = fakeSource();
    const d = new LoopDelay(src, clock, 60_000);
    expect(d.recentMaxMs()).toBe(0);
    src.max = 1_234_567_890;
    expect(d.recentMaxMs()).toBe(1234.6);
  });

  it("구간이 바뀌어도 바로 앞 구간의 멈춤을 한 구간 더 보이고, 그 뒤 잊는다", () => {
    const clock = new ManualClock();
    const src = fakeSource();
    const d = new LoopDelay(src, clock, 60_000);
    src.max = 5_000_000_000;
    clock.advance(60_000);
    expect(d.recentMaxMs()).toBe(5000);
    src.max = 30_000_000;
    expect(d.recentMaxMs()).toBe(5000);
    clock.advance(60_000);
    expect(d.recentMaxMs()).toBe(30);
    clock.advance(60_000);
    expect(d.recentMaxMs()).toBe(0);
  });
});
