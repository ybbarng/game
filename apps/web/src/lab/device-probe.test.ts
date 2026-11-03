import { describe, expect, it } from "vitest";

import {
  frameRate,
  summarizeTaps,
  timerStep,
  timestampUnit,
} from "./device-probe";

describe("timerStep: performance.now 최소 간격", () => {
  it("0.1ms 단위로 오르는 가짜 시계", () => {
    let t = 0;
    let reads = 0;
    // 다섯 번 읽을 때마다 0.1ms 오른다
    const now = () => {
      reads++;
      if (reads % 5 === 0) t += 0.1;
      return t;
    };
    const result = timerStep(now, 5);
    expect(result.minStepMs).toBe(0.1);
    expect(result.distinctSteps).toBe(1);
  });

  it("멈춘 시계는 상한까지 읽고 null", () => {
    const result = timerStep(() => 0, 5);
    expect(result.minStepMs).toBeNull();
    expect(result.reads).toBeGreaterThan(5_000_000);
  });
});

describe("frameRate: 주사율 추정", () => {
  it.each([
    [16.6667, 60],
    [8.3333, 120],
    [11.1111, 90],
  ])("간격 %dms → %dHz", (gap, hz) => {
    const times = Array.from({ length: 31 }, (_, i) => 1000 + i * gap);
    expect(frameRate(times).hz).toBe(hz);
  });

  it("빠진 프레임은 p95에 보이고 중앙값은 그대로", () => {
    const gaps = [...Array(19).fill(16), 33];
    const times = [0];
    for (const g of gaps) times.push((times.at(-1) as number) + g);
    const { hz, intervals } = frameRate(times);
    expect(hz).toBe(63);
    expect(intervals.max).toBe(33);
  });
});

describe("timestampUnit: 시각 값의 단위", () => {
  it.each([
    [[1, 2, 100], 1],
    [[1.5, 3], 0.5],
    [[12.3, 45.6], 0.1],
    [[12.345, 45.678], 0.001],
    [[12.3456789], 0],
    [[], null],
  ])("%j → %s", (values, unit) => {
    expect(timestampUnit(values)).toBe(unit);
  });
});

describe("summarizeTaps", () => {
  it("click − pointerdown과 처리 지연을 모은다", () => {
    const s = summarizeTaps([
      {
        downTs: 1000,
        handlerLagMs: 2,
        clickMinusDownMs: 90,
        pointerType: "touch",
      },
      {
        downTs: 2000,
        handlerLagMs: 4,
        clickMinusDownMs: null,
        pointerType: "touch",
      },
    ]);
    expect(s).toMatchObject({
      n: 2,
      timeStampUnitMs: 1,
      handlerLag: { min: 2, max: 4 },
      clickMinusDown: { n: 1, p50: 90 },
      pointerTypes: ["touch"],
    });
  });
});
