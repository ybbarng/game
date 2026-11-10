import { describe, expect, it } from "vitest";

import {
  COAST_MS,
  coast,
  dragSpin,
  FRONT,
  flingSpeed,
  HOME_MS,
  homeSpin,
  isTurned,
  PITCH_MAX,
  wrapYaw,
} from "./spin";

describe("3D 엠블럼 끌어 돌리기", () => {
  it("좌우로 끌면 그만큼 돌고, 칸 너비를 끌면 약 200° 돈다", () => {
    const s = dragSpin(FRONT, 300, 0, 300);
    expect(s.yaw).toBeCloseTo(Math.PI * 1.1);
    expect(s.pitch).toBe(0);
    expect(dragSpin(FRONT, -150, 0, 300).yaw).toBeCloseTo(-Math.PI * 0.55);
  });

  it("위아래는 아주 조금만 기울고 한도를 넘지 않는다", () => {
    expect(dragSpin(FRONT, 0, 30, 300).pitch).toBeGreaterThan(0);
    expect(dragSpin(FRONT, 0, 30, 300).pitch).toBeLessThan(PITCH_MAX);
    expect(dragSpin(FRONT, 0, 3000, 300).pitch).toBe(PITCH_MAX);
    expect(dragSpin(FRONT, 0, -3000, 300).pitch).toBe(-PITCH_MAX);
  });

  it("끌기는 끌기 시작한 각에서 더한다(놓은 각에서 이어 돈다)", () => {
    const start = { yaw: 1, pitch: 0.05 };
    const s = dragSpin(start, 30, 0, 300);
    expect(s.yaw).toBeGreaterThan(1);
    expect(s.pitch).toBe(0.05);
  });

  it("놓을 때 빠르기는 최근 90ms만 보고, 상한이 있다", () => {
    expect(flingSpeed([])).toBe(0);
    expect(flingSpeed([{ t: 0, yaw: 0 }])).toBe(0);
    // 오래전 움직임은 빼고 마지막 구간만
    const v = flingSpeed([
      { t: 0, yaw: 0 },
      { t: 500, yaw: 0 },
      { t: 550, yaw: 0.05 },
    ]);
    expect(v).toBeCloseTo(0.001);
    expect(
      flingSpeed([
        { t: 0, yaw: 0 },
        { t: 10, yaw: 10 },
      ]),
    ).toBe(0.012);
  });

  it("미끄러짐은 지수로 줄어 멈추고, 간 거리는 쪼개 계산해도 같다", () => {
    const one = coast(0, 0.004, 100);
    const a = coast(0, 0.004, 50);
    const two = coast(a.yaw, a.speed, 50);
    expect(two.yaw).toBeCloseTo(one.yaw, 10);
    expect(two.speed).toBeCloseTo(one.speed, 10);
    // 끝까지 가면 v·τ만큼 가서 멈춘다
    let s = { yaw: 0, speed: 0.004 };
    for (let i = 0; i < 200 && s.speed !== 0; i++)
      s = coast(s.yaw, s.speed, 16);
    expect(s.speed).toBe(0);
    expect(s.yaw).toBeCloseTo(0.004 * COAST_MS, 1);
  });

  it("yaw는 (-π, π]로 접고, 정면에서 벗어났는지 본다", () => {
    expect(wrapYaw(0)).toBe(0);
    expect(wrapYaw(2 * Math.PI)).toBeCloseTo(0);
    expect(wrapYaw(Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapYaw(-Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapYaw(3 * Math.PI + 0.5)).toBeCloseTo(-Math.PI + 0.5);
    expect(isTurned(FRONT)).toBe(false);
    expect(isTurned({ yaw: 4 * Math.PI, pitch: 0 })).toBe(false);
    expect(isTurned({ yaw: 0.3, pitch: 0 })).toBe(true);
    expect(isTurned({ yaw: 0, pitch: 0.05 })).toBe(true);
  });

  it("처음 각도로는 가까운 쪽으로 돌아 정면에 선다", () => {
    const from = { yaw: 2 * Math.PI - 0.4, pitch: 0.1 };
    expect(homeSpin(from, 0).yaw).toBeCloseTo(-0.4);
    const mid = homeSpin(from, 0.5);
    expect(mid.yaw).toBeGreaterThan(-0.4);
    expect(mid.yaw).toBeLessThan(0);
    expect(homeSpin(from, 1)).toEqual({ yaw: -0, pitch: 0 });
    expect(homeSpin(from, 2)).toEqual(homeSpin(from, 1));
    expect(HOME_MS).toBeGreaterThan(0);
  });
});
