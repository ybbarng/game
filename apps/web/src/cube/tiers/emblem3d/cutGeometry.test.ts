import { describe, expect, it } from "vitest";

import {
  CORNER_CUT,
  nearestSeed,
  polyFromPlanes,
  ROUND_R,
  roundBoxMesh,
  roundBoxSdf,
  stepCutPlanes,
  voronoiSeeds,
} from "./cutGeometry";
import { GEM_BOX_HALF, type Vec3 } from "./gem";

const H = GEM_BOX_HALF;

describe("아홉째 시안의 실제 기하(docs/47 14-7)", () => {
  it("계단 컷 조각: 평면 62개로 깎은 다면체가 30면 넘게 남고, 그물은 상자 안·평면 안쪽에 닫혀 있다", () => {
    const planes = stepCutPlanes();
    expect(planes).toHaveLength(62);
    const mesh = polyFromPlanes(planes);
    // 테이블 6 + 계단 띠 + 꼭짓점 8. 이웃 면 쪽 띠와 겹치는 바깥 띠 일부는 잘려 나간다(2026-11-12 잰 값 38면)
    expect(mesh.faces).toBeGreaterThan(30);
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const v: Vec3 = [
        mesh.positions[i] as number,
        mesh.positions[i + 1] as number,
        mesh.positions[i + 2] as number,
      ];
      for (const x of v) expect(Math.abs(x)).toBeLessThanOrEqual(H + 1e-6);
      for (const p of planes)
        expect(
          p.n[0] * v[0] + p.n[1] * v[1] + p.n[2] * v[2],
        ).toBeLessThanOrEqual(p.h + 1e-5);
    }
    // 삼각형마다 바깥을 보는 감김(면 법선과 같은 쪽)
    for (let i = 0; i < mesh.positions.length; i += 9) {
      const a = mesh.positions.slice(i, i + 3) as unknown as Vec3;
      const b = mesh.positions.slice(i + 3, i + 6) as unknown as Vec3;
      const c = mesh.positions.slice(i + 6, i + 9) as unknown as Vec3;
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cr = [
        (e1[1] as number) * (e2[2] as number) -
          (e1[2] as number) * (e2[1] as number),
        (e1[2] as number) * (e2[0] as number) -
          (e1[0] as number) * (e2[2] as number),
        (e1[0] as number) * (e2[1] as number) -
          (e1[1] as number) * (e2[0] as number),
      ];
      const n = mesh.normals.slice(i, i + 3);
      expect(
        (cr[0] as number) * (n[0] as number) +
          (cr[1] as number) * (n[1] as number) +
          (cr[2] as number) * (n[2] as number),
      ).toBeGreaterThan(0);
    }
    expect(CORNER_CUT).toBeLessThan(1);
  });

  it("둥근 모서리 조각: 그물 꼭짓점은 거리 함수 0 위에 있고 법선은 길이 1", () => {
    const m = roundBoxMesh(H, ROUND_R, 8);
    for (let i = 0; i < m.positions.length; i += 3) {
      const v: Vec3 = [
        m.positions[i] as number,
        m.positions[i + 1] as number,
        m.positions[i + 2] as number,
      ];
      expect(Math.abs(roundBoxSdf(v, H, ROUND_R))).toBeLessThan(1e-6);
      expect(
        Math.hypot(
          m.normals[i] as number,
          m.normals[i + 1] as number,
          m.normals[i + 2] as number,
        ),
      ).toBeCloseTo(1, 6);
    }
    expect(roundBoxSdf([0, 0, 0], H, ROUND_R)).toBeCloseTo(-H, 6);
  });

  it("결정 구조 씨앗은 늘 같고 상자 안에 있으며, 가까운 씨앗을 고른다", () => {
    const a = voronoiSeeds(6, H, 101);
    expect(voronoiSeeds(6, H, 101)).toEqual(a);
    expect(voronoiSeeds(6, H, 102)).not.toEqual(a);
    for (const s of a) for (const x of s) expect(Math.abs(x)).toBeLessThan(H);
    expect(nearestSeed(a, a[3] as Vec3)).toBe(3);
  });
});
