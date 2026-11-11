import { describe, expect, it } from "vitest";

import { OUTLINE, outlineFilter } from "./backdrop";

/** filter 글에서 drop-shadow마다 [흐림 폭(px), 색] */
function layers(f: string): { blur: number; color: string }[] {
  return [...f.matchAll(/drop-shadow\(0 0 ([\d.]+)px (rgba\([^)]*\))\)/g)].map(
    (m) => ({ blur: Number(m[1]), color: m[2] ?? "" }),
  );
}

describe("큐브 윤곽", () => {
  it("밝은 테두리 두 겹 뒤 어두운 그림자 한 겹이다(둥근 받침 없이 큐브 실루엣만 따른다)", () => {
    const l = layers(outlineFilter(96));
    expect(l).toHaveLength(3);
    expect(l[0]?.color).toBe(`rgba(255,255,255,${OUTLINE.rim[0]})`);
    expect(l[1]?.color).toBe(`rgba(255,255,255,${OUTLINE.rim[1]})`);
    expect(l[2]?.color).toBe(`rgba(0,0,0,${OUTLINE.shade})`);
  });

  it("검은 바탕에서 보이게 밝은 테두리는 진하고, 선처럼 좁다", () => {
    // 2026-11-11 「구별이 확실해야」: 예전 흰 빛 22% 한 겹은 검은 바탕에서 거의 보이지 않았다
    for (const a of OUTLINE.rim) expect(a).toBeGreaterThanOrEqual(0.5);
    const [rim, , shade] = layers(outlineFilter(200));
    expect(rim?.blur ?? 99).toBeLessThan((shade?.blur ?? 0) / 2);
  });

  it("폭은 창 크기에 비례하고, 가장 작은 창에서도 사라지지 않는다", () => {
    const small = layers(outlineFilter(96));
    const big = layers(outlineFilter(480));
    expect((big[2]?.blur ?? 0) / (small[2]?.blur ?? 1)).toBeCloseTo(5, 0);
    expect((big[0]?.blur ?? 0) / (small[0]?.blur ?? 1)).toBeCloseTo(5, 0);
    for (const l of layers(outlineFilter(48)))
      expect(l.blur).toBeGreaterThanOrEqual(0.4);
  });
});
