import { describe, expect, it } from "vitest";

import { SKY_STARS } from "./sky";
import { HIT, type SkyState, scaleOf, starAt, stateKey } from "./sky-draw";

describe("starAt: 별 누르는 범위", () => {
  it("별 한가운데를 누르면 그 별이다", () => {
    const W = 360;
    for (const s of SKY_STARS) expect(starAt(s.x * W, s.y * W, W)).toBe(s.n);
  });

  it("작은 하늘은 minHit로 응모 하늘의 기준 크기(HIT px)만큼 누를 수 있다", () => {
    const W = 240;
    // 작은 하늘의 원래 범위(HIT × 크기 비율)보다 멀고 HIT보다 가까운 자리
    const off = (HIT * scaleOf(W) + HIT) / 2;
    let checked = 0;
    for (const s of SKY_STARS) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const x = s.x * W + Math.cos(a) * off;
        const y = s.y * W + Math.sin(a) * off;
        if (starAt(x, y, W, HIT) !== s.n) continue; // 이웃 별이 더 가까운 쪽
        expect(starAt(x, y, W)).toBeNull();
        checked++;
        break;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });
});

describe("stateKey: 미리 그린 층을 다시 그릴지", () => {
  const draw: SkyState = {
    mode: "draw",
    picked: [1, 2, 3, 4, 5, 6],
    focus: null,
    lit: [7],
    bonus: null,
  };

  it("룰렛 불빛이 옮겨도 층은 그대로다(관측 한 번에 수백 번 옮긴다)", () => {
    expect(stateKey({ ...draw, cursor: 8 })).toBe(stateKey(draw));
    expect(stateKey({ ...draw, cursor: 9 })).toBe(
      stateKey({ ...draw, cursor: 8 }),
    );
  });

  it("별이 켜지거나 내 별·누른 별이 바뀌면 다시 그린다", () => {
    expect(stateKey({ ...draw, lit: [7, 8] })).not.toBe(stateKey(draw));
    expect(stateKey({ ...draw, bonus: 9 })).not.toBe(stateKey(draw));
    expect(stateKey({ ...draw, focus: 9 })).not.toBe(stateKey(draw));
    expect(stateKey({ ...draw, picked: [1, 2, 3, 4, 5, 7] })).not.toBe(
      stateKey(draw),
    );
  });
});
