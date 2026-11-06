import { describe, expect, it } from "vitest";
import { CHO_GLYPHS, fitGlyph } from "./cho-glyphs";

describe("초 글자 윤곽", () => {
  it("일곱 기물 모두 윤곽과 상자가 있다", () => {
    expect(Object.keys(CHO_GLYPHS).sort()).toEqual(
      ["A", "C", "E", "K", "N", "P", "R"].sort(),
    );
    for (const g of Object.values(CHO_GLYPHS)) {
      expect(g.d.length).toBeGreaterThan(100);
      expect(g.box[2]).toBeGreaterThan(0);
      expect(g.box[3]).toBeGreaterThan(0);
    }
  });

  it("馬는 원본이 뒤집혀 있어 윤곽 가운데를 축으로 180도 돌린다", () => {
    const [x, y, w, h] = CHO_GLYPHS.N.box;
    const m = /^rotate\(180 ([\d.]+) ([\d.]+)\)$/.exec(
      CHO_GLYPHS.N.transform ?? "",
    );
    expect(m).not.toBeNull();
    expect(Number(m?.[1])).toBeCloseTo(x + w / 2, 1);
    expect(Number(m?.[2])).toBeCloseTo(y + h / 2, 1);
  });

  it("윤곽을 알 가운데에 긴 변 크기로 놓고, 경로 변환은 그 안쪽에 붙인다", () => {
    const g = { box: [10, 20, 40, 20] as const, d: "" };
    // 가운데 (30, 30)이 (5, 5)로, 긴 변 40이 2로
    expect(fitGlyph(g, 5, 5, 2)).toBe(
      "translate(5 5) scale(0.05) translate(-30 -30)",
    );
    expect(fitGlyph({ ...g, transform: "rotate(180 30 30)" }, 5, 5, 2)).toBe(
      "translate(5 5) scale(0.05) translate(-30 -30) rotate(180 30 30)",
    );
  });
});
