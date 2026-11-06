import { describe, expect, it } from "vitest";
import { brushOutline, signedArea, strokePolygons } from "./brush-outline";
import { CHO_GLYPH_SETS, CHO_GLYPHS, fitGlyph } from "./cho-glyphs";

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

  it("붓끝 모양: 뾰족한 끝은 획 방향으로 더 나가고, 각진 끝은 더 나가지 않는다", () => {
    const pts = [
      [0, 0, 4],
      [10, 0, 4],
    ] as const;
    // 둥근 끝은 반지름(2)만큼, 뾰족한 끝은 굵기의 0.9배(3.6)만큼, 각진 끝은 거의 나가지 않는다
    const right = (end: "round" | "point" | "flat") =>
      brushOutline([{ pts, end }]).box;
    expect(right("round")[2]).toBeCloseTo(14, 0);
    expect(right("point")[2]).toBeCloseTo(15.6, 0);
    expect(right("flat")[2]).toBeLessThan(14);
    // 각진 시작은 한쪽 모서리만 뒤로 밀려 비스듬하다
    const flat = strokePolygons({ pts, start: "flat" })[0] ?? [];
    const xs = flat.filter(([x]) => x < 1).map(([x]) => x);
    expect(Math.min(...xs)).toBeCloseTo(-1.4, 1);
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
  it("세 안 모두 일곱 기물의 윤곽과 상자가 있고, 판은 안 1을 쓴다", () => {
    for (const set of Object.values(CHO_GLYPH_SETS)) {
      expect(Object.keys(set).sort()).toEqual(
        ["A", "C", "E", "K", "N", "P", "R"].sort(),
      );
      for (const g of Object.values(set)) {
        expect(g.d.length).toBeGreaterThan(100);
        expect(g.box[2]).toBeGreaterThan(0);
        expect(g.box[3]).toBeGreaterThan(0);
      }
    }
    expect(CHO_GLYPHS).toBe(CHO_GLYPH_SETS.wikimedia);
  });

  it("윤곽을 알 가운데에 긴 변 크기로 놓고, 원본 변환은 그 안쪽에 붙인다", () => {
    const g = { box: [10, 20, 40, 20] as const, d: "" };
    // 가운데 (30, 30)이 (5, 5)로, 긴 변 40이 2로
    expect(fitGlyph(g, 5, 5, 2)).toBe(
      "translate(5 5) scale(0.05) translate(-30 -30)",
    );
    expect(fitGlyph({ ...g, transform: "matrix(2 0 0 2 1 1)" }, 5, 5, 2)).toBe(
      "translate(5 5) scale(0.05) translate(-30 -30) matrix(2 0 0 2 1 1)",
    );
  });
});
