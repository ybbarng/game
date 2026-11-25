import { describe, expect, it } from "vitest";

import {
  DRAG_RATE,
  dragYaw,
  nextYaw,
  REST_YAW,
  RESUME_AFTER,
  SPIN_PERIOD,
  type SpinState,
} from "./core-spin";

const state = (over: Partial<SpinState> = {}): SpinState => ({
  yaw: REST_YAW,
  releasedAt: null,
  dragging: false,
  ...over,
});

describe("분해한 큐브의 속 3D 돌기", () => {
  it("저절로 돌면 40초에 한 바퀴(16ms 한 장마다 같은 만큼)", () => {
    let s = state({ yaw: 0 });
    for (let t = 16; t <= SPIN_PERIOD; t += 16)
      s = { ...s, yaw: nextYaw(s, t, 16, false) };
    expect(s.yaw).toBeCloseTo((Math.PI * 2 * (2500 * 16)) / SPIN_PERIOD, 6);
    expect(SPIN_PERIOD).toBe(40_000);
  });

  it("한 장 사이가 길어도(탭을 가렸다 돌아옴) 100ms만큼만 돈다", () => {
    expect(nextYaw(state({ yaw: 0 }), 10_000, 9_000, false)).toBeCloseTo(
      (100 / SPIN_PERIOD) * Math.PI * 2,
      9,
    );
  });

  it("동작 줄이기면 엣지 블럭이 옆으로 보이는 각도에 멈춘다", () => {
    expect(nextYaw(state(), 1_000, 16, true)).toBe(REST_YAW);
    expect(REST_YAW).toBeCloseTo((150 * Math.PI) / 180, 9);
  });

  it("끄는 동안은 저절로 돌지 않고, 민 만큼 따라 돈다", () => {
    expect(nextYaw(state({ yaw: 1, dragging: true }), 500, 16, false)).toBe(1);
    expect(dragYaw(1, 50)).toBeCloseTo(1 + 50 * DRAG_RATE, 9);
  });

  it("손을 떼면 그 각도에 머물다가 잠시 뒤 그 각도에서 다시 돈다", () => {
    const s = state({ yaw: 2, releasedAt: 1_000 });
    expect(nextYaw(s, 1_000 + RESUME_AFTER - 1, 16, false)).toBe(2);
    expect(nextYaw(s, 1_000 + RESUME_AFTER, 16, false)).toBeGreaterThan(2);
  });
});
