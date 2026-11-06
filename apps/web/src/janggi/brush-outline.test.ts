import { describe, expect, it } from "vitest";
import { brushOutline, signedArea, strokePolygons } from "./brush-outline";
import { CHO_GLYPHS, fitGlyph } from "./cho-glyphs";

describe("붓 획 윤곽", () => {
  it("열린 획은 굵기만큼 둘레를 두르고 모두 같은 방향으로 돈다(겹쳐도 구멍이 나지 않게)", () => {
    const right = strokePolygons({
      pts: [
        [0, 0, 4],
        [10, 0, 4],
      ],
    });
    const left = strokePolygons({
      pts: [
        [10, 5, 4],
        [0, 5, 4],
      ],
    });
    expect(right).toHaveLength(1);
    expect(Math.sign(signedArea(right[0] ?? []))).toBe(1);
    expect(Math.sign(signedArea(left[0] ?? []))).toBe(1);
    // 둥근 끝까지: 가로 -2..12, 세로 -2..2
    const { box } = brushOutline([
      {
        pts: [
          [0, 0, 4],
          [10, 0, 4],
        ],
      },
    ]);
    expect(box[0]).toBeCloseTo(-2, 0);
    expect(box[2]).toBeCloseTo(14, 0);
    expect(box[3]).toBeCloseTo(4, 0);
  });

  it("닫힌 획(고리)은 바깥과 안쪽을 반대로 돌려 가운데에 구멍을 낸다", () => {
    const ring = strokePolygons({
      closed: true,
      pts: [
        [10, 0, 2],
        [20, 10, 2],
        [10, 20, 2],
        [0, 10, 2],
      ],
    });
    expect(ring).toHaveLength(2);
    const [outer, inner] = ring.map((p) => signedArea(p));
    expect(Math.abs(outer ?? 0)).toBeGreaterThan(Math.abs(inner ?? 0));
    expect(Math.sign(outer ?? 0)).toBe(-Math.sign(inner ?? 0));
  });
});

describe("초 글자 윤곽", () => {
  it("일곱 기물 모두 윤곽과 상자가 있고, 알 가운데에 긴 변 크기로 놓인다", () => {
    for (const g of Object.values(CHO_GLYPHS)) {
      expect(g.d.length).toBeGreaterThan(100);
      expect(g.box[2]).toBeGreaterThan(0);
      expect(g.box[3]).toBeGreaterThan(0);
    }
    const g = { box: [10, 20, 40, 20] as const, d: "" };
    // 가운데 (30, 30)이 (5, 5)로, 긴 변 40이 2로
    expect(fitGlyph(g, 5, 5, 2)).toBe(
      "translate(5 5) scale(0.05) translate(-30 -30)",
    );
  });
});
