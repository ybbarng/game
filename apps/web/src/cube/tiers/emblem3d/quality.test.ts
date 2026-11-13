import { describe, expect, it } from "vitest";

import {
  BUDGET_MIN,
  BUDGET_SHARE,
  MOTION_SCALES,
  MotionQuality,
  SLOW_MS,
  WINDOW,
} from "./quality";

describe("돌리는 동안 해상도 조절", () => {
  it("처음은 제 해상도, GPU가 한 장을 화면 주기 안에 끝내면 그대로 둔다", () => {
    const q = new MotionQuality();
    expect(q.scale).toBe(1);
    for (let i = 0; i < WINDOW * 4; i++) q.note(i % 2 ? 1.2 : 6);
    expect(q.level).toBe(0);
  });

  it("한 장이 오래 걸리는 일이 이어지면 한 단계씩 낮추고 가장 낮은 단계에서 멈춘다", () => {
    const q = new MotionQuality();
    let changed = 0;
    for (let i = 0; i < WINDOW * 5; i++) if (q.note(40)) changed += 1;
    expect(changed).toBe(MOTION_SCALES.length - 1);
    expect(q.scale).toBe(MOTION_SCALES[MOTION_SCALES.length - 1]);
    expect(q.median).toBe(40);
  });

  it("예산은 화면 주기에서: 60Hz면 약 14ms, 120Hz(프로모션)면 약 7ms라 같은 9ms 장도 120Hz에서는 낮춘다", () => {
    const at60 = new MotionQuality();
    const at120 = new MotionQuality();
    for (let i = 0; i < 12; i++) {
      at60.noteInterval(16.7);
      at120.noteInterval(8.33);
    }
    expect(at60.budget).toBeCloseTo(16.7 * BUDGET_SHARE, 5);
    expect(at120.budget).toBeCloseTo(8.33 * BUDGET_SHARE, 5);
    for (let i = 0; i < WINDOW; i++) {
      at60.note(9);
      at120.note(9);
    }
    expect(at60.level).toBe(0);
    expect(at120.level).toBe(1);
  });

  it("탭이 가려졌다 돌아온 긴 간격은 예산에 넣지 않고, 예산은 6~16ms 안", () => {
    const q = new MotionQuality();
    for (let i = 0; i < 12; i++) q.noteInterval(i % 2 ? 300 : 2);
    expect(q.budget).toBe(BUDGET_MIN);
    const slow = new MotionQuality();
    for (let i = 0; i < 12; i++) slow.noteInterval(33);
    expect(slow.budget).toBe(SLOW_MS);
  });

  it("가끔 한 장 늦은 것(가운데 값 아래)으로는 낮추지 않는다", () => {
    const q = new MotionQuality();
    for (let i = 0; i < WINDOW; i++) q.note(i === 3 ? 80 : 3);
    expect(q.level).toBe(0);
    expect(q.median).toBeLessThan(SLOW_MS);
  });
});
