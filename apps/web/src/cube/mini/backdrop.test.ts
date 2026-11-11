import { describe, expect, it } from "vitest";

import { OUTLINE, outlineFilter } from "./backdrop";

/** filter 글에서 drop-shadow마다 [x, y, 흐림 폭(px), 색] */
function layers(f: string) {
  return [
    ...f.matchAll(
      /drop-shadow\((-?[\d.]+)(?:px)? (-?[\d.]+)(?:px)? ([\d.]+)(?:px)? (rgba\([^)]*\))\)/g,
    ),
  ].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
    blur: Number(m[3]),
    color: m[4] ?? "",
  }));
}

describe("큐브 윤곽", () => {
  it("흐림 없는 흰 선 네 겹(상하좌우) 뒤 어두운 그림자 한 겹이다(둥근 받침 없이 큐브 실루엣만 따른다)", () => {
    const l = layers(outlineFilter(96));
    expect(l).toHaveLength(5);
    const rims = l.slice(0, 4);
    for (const r of rims) {
      expect(r.color).toBe(`rgba(255,255,255,${OUTLINE.rim})`);
      // 2026-11-11 「테두리 들어간 거 맞아?」: 흐린 빛은 앱 엔진(WebKit)에서 옅게 그려져 거의 안 보였다
      expect(r.blur).toBe(0);
    }
    // 네 방향으로 같은 거리만큼 민다
    const dirs = rims.map((r) => `${Math.sign(r.x)},${Math.sign(r.y)}`);
    expect(new Set(dirs)).toEqual(new Set(["1,0", "-1,0", "0,1", "0,-1"]));
    expect(new Set(rims.map((r) => Math.abs(r.x) + Math.abs(r.y))).size).toBe(
      1,
    );
    expect(l[4]?.color).toBe(`rgba(0,0,0,${OUTLINE.shade})`);
  });

  it("검은 바탕에서 보이게 밝은 선은 진하고, 그림자보다 좁다", () => {
    expect(OUTLINE.rim).toBeGreaterThanOrEqual(0.5);
    const l = layers(outlineFilter(200));
    expect(Math.abs(l[0]?.x ?? 99)).toBeLessThan((l[4]?.blur ?? 0) / 2);
  });

  it("폭은 창 크기에 비례하고, 가장 작은 창에서도 1px 아래로 내려가지 않는다", () => {
    const big = layers(outlineFilter(480));
    const small = layers(outlineFilter(96));
    expect((big[4]?.blur ?? 0) / (small[4]?.blur ?? 1)).toBeCloseTo(5, 0);
    expect(big[0]?.x).toBeCloseTo(480 * OUTLINE.rimWidth, 1);
    for (const r of layers(outlineFilter(48)).slice(0, 4))
      expect(Math.abs(r.x) + Math.abs(r.y)).toBeGreaterThanOrEqual(1);
  });
});
