import { describe, expect, it } from "vitest";

import {
  BUDGET_MIN,
  BUDGET_SHARE,
  drawScale,
  FrameBudget,
  MOTION_SCALES,
  MotionQuality,
  SLOW_MS,
  SWAY_EVERY,
  SwayPacer,
  tooSlowToSway,
  UP_SHARE,
  UP_WINDOWS,
  WINDOW,
} from "./quality";

/** 같은 시간을 창 n개만큼 적는다 */
const feed = (q: { note(ms: number): boolean }, ms: number, windows = 1) => {
  let changed = 0;
  for (let i = 0; i < WINDOW * windows; i++) if (q.note(ms)) changed += 1;
  return changed;
};

describe("한 장 예산(화면 주기)", () => {
  it("60Hz면 약 14ms, 120Hz(프로모션)면 약 7ms", () => {
    const at60 = new FrameBudget();
    const at120 = new FrameBudget();
    for (let i = 0; i < 12; i++) {
      at60.noteInterval(16.7);
      at120.noteInterval(8.33);
    }
    expect(at60.value).toBeCloseTo(16.7 * BUDGET_SHARE, 5);
    expect(at120.value).toBeCloseTo(8.33 * BUDGET_SHARE, 5);
  });

  it("탭이 가려졌다 돌아온 긴 간격은 넣지 않고, 6~16ms 안", () => {
    const b = new FrameBudget();
    for (let i = 0; i < 12; i++) b.noteInterval(i % 2 ? 300 : 2);
    expect(b.value).toBe(BUDGET_MIN);
    const slow = new FrameBudget();
    for (let i = 0; i < 12; i++) slow.noteInterval(33);
    expect(slow.value).toBe(SLOW_MS);
  });

  it("화면 시험은 예산을 고정해 120Hz를 흉내 낸다(간격을 적어도 바뀌지 않는다)", () => {
    const b = new FrameBudget(7.1);
    for (let i = 0; i < 12; i++) b.noteInterval(16.7);
    expect(b.value).toBe(7.1);
  });
});

describe("끄는 동안 해상도 조절", () => {
  it("처음은 제 해상도, GPU가 한 장을 화면 주기 안에 끝내면 그대로 둔다", () => {
    const q = new MotionQuality();
    expect(q.scale).toBe(1);
    for (let i = 0; i < WINDOW * 4; i++) q.note(i % 2 ? 1.2 : 6);
    expect(q.level).toBe(0);
  });

  it("한 장이 오래 걸리는 일이 이어지면 한 단계씩 낮추고 가장 낮은 단계에서 멈춘다", () => {
    const q = new MotionQuality();
    expect(feed(q, 40, 5)).toBe(MOTION_SCALES.length - 1);
    expect(q.scale).toBe(MOTION_SCALES[MOTION_SCALES.length - 1]);
    expect(q.median).toBe(40);
  });

  it("같은 9ms 장도 120Hz 예산에서는 낮추고 60Hz에서는 그대로", () => {
    const at60 = new MotionQuality(new FrameBudget(16.7 * BUDGET_SHARE));
    const at120 = new MotionQuality(new FrameBudget(8.33 * BUDGET_SHARE));
    feed(at60, 9);
    feed(at120, 9);
    expect(at60.level).toBe(0);
    expect(at120.level).toBe(1);
  });

  it("가끔 한 장 늦은 것(가운데 값 아래)으로는 낮추지 않는다", () => {
    const q = new MotionQuality();
    for (let i = 0; i < WINDOW; i++) q.note(i === 3 ? 80 : 3);
    expect(q.level).toBe(0);
    expect(q.median).toBeLessThan(SLOW_MS);
  });

  it("낮춘 뒤 넉넉히 짧은 창이 이어지면 한 단계씩 되돌린다(2026-11-13 사용자 「화질이 열화돼」: 예전에는 다시 올리지 않았다)", () => {
    const q = new MotionQuality(new FrameBudget(7.1));
    feed(q, 12, 2);
    expect(q.level).toBe(2);
    // 예산의 절반 아래가 UP_WINDOWS번 이어지기 전에는 그대로
    feed(q, 7.1 * UP_SHARE * 0.9, UP_WINDOWS - 1);
    expect(q.level).toBe(2);
    feed(q, 7.1 * UP_SHARE * 0.9);
    expect(q.level).toBe(1);
    feed(q, 7.1 * UP_SHARE * 0.9, UP_WINDOWS);
    expect(q.level).toBe(0);
  });

  it("예산 안이지만 넉넉하지 않으면(절반 넘음) 올리지 않는다: 올렸다 내렸다 흔들리지 않게", () => {
    const q = new MotionQuality(new FrameBudget(7.1));
    feed(q, 12);
    expect(q.level).toBe(1);
    feed(q, 7.1 * 0.7, UP_WINDOWS * 3);
    expect(q.level).toBe(1);
  });

  it("무대마다 따로 잰다: 한 무대가 낮춰도 새 무대는 제 해상도로 시작한다", () => {
    const a = new MotionQuality(new FrameBudget(7.1));
    feed(a, 30, 3);
    expect(a.level).toBeGreaterThan(0);
    expect(new MotionQuality(new FrameBudget(7.1)).scale).toBe(1);
  });
});

describe("그릴 해상도 배율(drawScale)", () => {
  it("저절로 흔드는 동안은 끌 때 단계를 아무리 낮췄어도 늘 배율 1(2026-11-13 사용자 「화질이 열화돼」)", () => {
    const q = new MotionQuality(new FrameBudget(7.1));
    feed(q, 40, 5);
    expect(q.scale).toBe(MOTION_SCALES[MOTION_SCALES.length - 1]);
    expect(drawScale({ moving: true, resting: false, swaying: true }, q)).toBe(
      1,
    );
  });

  it("사람이 끄는 중에만 낮춘 배율, 손이 멈췄거나 멈춘 장은 배율 1", () => {
    const q = new MotionQuality(new FrameBudget(7.1));
    feed(q, 12);
    expect(q.scale).toBe(MOTION_SCALES[1]);
    expect(drawScale({ moving: true, resting: false, swaying: false }, q)).toBe(
      MOTION_SCALES[1],
    );
    expect(drawScale({ moving: true, resting: true, swaying: false }, q)).toBe(
      1,
    );
    expect(
      drawScale({ moving: false, resting: false, swaying: false }, q),
    ).toBe(1);
  });
});

describe("흔드는 동안: 해상도 대신 그리는 횟수", () => {
  it("한 장이 예산을 넘으면 화면 갱신 2·3·4번에 한 번으로 줄이고, 넉넉해지면 되돌린다", () => {
    const p = new SwayPacer(new FrameBudget(7.1));
    expect(p.every).toBe(1);
    // 120Hz에서 10ms 장: 두 번에 한 번(14.2ms 안)이면 된다
    feed(p, 10);
    expect(p.every).toBe(2);
    feed(p, 10, 3);
    expect(p.every).toBe(2);
    // 3ms로 짧아지면 다시 매 장
    feed(p, 3, UP_WINDOWS);
    expect(p.every).toBe(1);
  });

  it("가장 드물게 그려도 한 장이 그 사이에 끝나지 않을 때만 흔들기를 그만둔다(소프트웨어 GPU)", () => {
    const p = new SwayPacer(new FrameBudget(14.2));
    feed(p, 4);
    expect(tooSlowToSway(p)).toBe(false);
    for (let k = 0; k < SWAY_EVERY.length - 1; k++) {
      expect(tooSlowToSway(p)).toBe(false);
      feed(p, 150);
    }
    expect(p.every).toBe(SWAY_EVERY[SWAY_EVERY.length - 1]);
    expect(tooSlowToSway(p)).toBe(true);
    // 네 번에 한 번 안이면 흔든다
    feed(p, 14.2 * 3.5);
    expect(tooSlowToSway(p)).toBe(false);
  });
});
