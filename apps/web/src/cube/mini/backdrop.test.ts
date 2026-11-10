import { describe, expect, it } from "vitest";

import {
  BACKDROP,
  backdropBackground,
  backdropBox,
  outlineFilter,
} from "./backdrop";

describe("큐브 뒤 받침", () => {
  it("큐브 사각형을 넉넉히 감싸고 가운데를 맞춘다", () => {
    const box = backdropBox([{ x: 120, y: 140, w: 80, h: 80 }], 320, 380);
    expect(box).not.toBeNull();
    if (!box) return;
    expect(box.x + box.w / 2).toBeCloseTo(160);
    expect(box.y + box.h / 2).toBeCloseTo(180);
    expect(box.w).toBeCloseTo(80 * BACKDROP.spread);
  });

  it("큐브와 거울 판을 함께 감싼다", () => {
    const box = backdropBox(
      [
        { x: 100, y: 100, w: 60, h: 60 },
        { x: 40, y: 40, w: 30, h: 30 },
        { x: 200, y: 220, w: 30, h: 30 },
      ],
      320,
      380,
    );
    if (!box) throw new Error("받침이 없다");
    expect(box.x).toBeLessThanOrEqual(40);
    expect(box.y).toBeLessThanOrEqual(40);
    expect(box.x + box.w).toBeGreaterThanOrEqual(230);
    expect(box.y + box.h).toBeGreaterThanOrEqual(250);
  });

  it("창 가장자리에 닿지 않게 줄여 네모 가장자리가 드러나지 않는다(48~480pt 모두)", () => {
    for (const side of [48, 96, 200, 480]) {
      // 큐브가 창을 거의 채운다(누르는 자리는 여유를 둬 창 밖으로 조금 나간다)
      const m = side * 0.05;
      const box = backdropBox(
        [{ x: -m, y: m, w: side + 2 * m, h: side - 2 * m }],
        side,
        side,
      );
      if (!box) throw new Error("받침이 없다");
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w).toBeLessThanOrEqual(side + 1e-9);
      expect(box.y + box.h).toBeLessThanOrEqual(side + 1e-9);
      // 같은 비율: 창에 대한 받침 크기가 창 크기와 상관없이 같다
      expect(box.w / side).toBeCloseTo(1);
    }
  });

  it("사각형이 없거나 창이 없으면 받침도 없다", () => {
    expect(backdropBox([], 100, 100)).toBeNull();
    expect(backdropBox([{ x: 0, y: 0, w: 10, h: 10 }], 0, 100)).toBeNull();
  });

  it("그림은 어두운 빛과 밝은 테 두 겹이고 끝은 투명하다", () => {
    const bg = backdropBackground();
    expect(bg.match(/radial-gradient/g)).toHaveLength(2);
    expect(bg).toContain(`rgba(0,0,0,${BACKDROP.shade})`);
    expect(bg).toContain(`rgba(255,255,255,${BACKDROP.rim})`);
    expect(bg).toContain("rgba(0,0,0,0) 100%");
  });

  it("윤곽 그림자는 밝은 빛 뒤 어두운 그림자 두 겹이고, 폭은 창 크기에 비례한다", () => {
    const small = outlineFilter(96);
    expect(small.match(/drop-shadow/g)).toHaveLength(2);
    expect(small.indexOf("255,255,255")).toBeLessThan(small.indexOf("0,0,0"));
    const widths = (f: string) =>
      [...f.matchAll(/0 0 ([\d.]+)px/g)].map((m) => Number(m[1]));
    const [rim96, shade96] = widths(small);
    const [rim480, shade480] = widths(outlineFilter(480));
    expect((shade480 ?? 0) / (shade96 ?? 1)).toBeCloseTo(5, 0);
    expect((rim480 ?? 0) / (rim96 ?? 1)).toBeCloseTo(5, 0);
    // 가장 작은 창에서도 사라지지 않는다
    expect(Math.min(...widths(outlineFilter(48)))).toBeGreaterThanOrEqual(0.5);
  });
});
