import { describe, expect, it } from "vitest";

import { MOTION_SCALES, MotionQuality, SLOW_MS, WINDOW } from "./quality";

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

  it("가끔 한 장 늦은 것(가운데 값 아래)으로는 낮추지 않는다", () => {
    const q = new MotionQuality();
    for (let i = 0; i < WINDOW; i++) q.note(i === 3 ? 80 : 3);
    expect(q.level).toBe(0);
    expect(q.median).toBeLessThan(SLOW_MS);
  });
});
