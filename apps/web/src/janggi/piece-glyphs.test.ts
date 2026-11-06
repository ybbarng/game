import { describe, expect, it } from "vitest";
import { fitGlyph, PIECE_GLYPHS } from "./piece-glyphs";

describe("기물 한자 윤곽", () => {
  it("초·한 모두 일곱 기물의 윤곽과 상자가 있다", () => {
    for (const side of ["c", "h"] as const) {
      expect(Object.keys(PIECE_GLYPHS[side]).sort()).toEqual(
        ["A", "C", "E", "K", "N", "P", "R"].sort(),
      );
      for (const g of Object.values(PIECE_GLYPHS[side])) {
        expect(g.d.length).toBeGreaterThan(100);
        expect(g.box[2]).toBeGreaterThan(0);
        expect(g.box[3]).toBeGreaterThan(0);
      }
    }
  });

  it("초·한 馬 모두 원본 그대로 쓰고 돌리지 않는다(위 가로획, 아래 고리가 바른 모양)", () => {
    expect(PIECE_GLYPHS.c.N.transform ?? "").not.toContain("rotate");
    expect(PIECE_GLYPHS.h.N.transform ?? "").not.toContain("rotate");
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
