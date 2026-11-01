import { describe, expect, it } from "vitest";

import { SKY_STARS } from "./sky";
import { HIT, scaleOf, starAt } from "./sky-draw";

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
