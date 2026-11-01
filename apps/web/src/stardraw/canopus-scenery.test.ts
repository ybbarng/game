import { describe, expect, it } from "vitest";
import {
  apparentAltitude,
  MARADO,
  SEOUL,
  toHorizontal,
  transitAfterNoon,
} from "./astro";
import {
  aboveSeoulRidge,
  MARADO_BOATS,
  ridgeAt,
  SEOUL_RIDGES,
  seoulSkyline,
} from "./canopus-scenery";
import data from "./canopus-sky.json";

const CANOPUS = data.canopus;

/** 그림과 같은 계산: 그날 밤 남중 순간의 겉보기 고도·방위 */
function canopusAt(place: typeof SEOUL, day: number) {
  const t = transitAfterNoon(CANOPUS.ra, place, day);
  const h = toHorizontal(CANOPUS.ra, CANOPUS.dec, place, t);
  return { az: h.az, alt: apparentAltitude(h.alt) };
}

const NIGHTS = [
  Date.UTC(2026, 10, 15, 3),
  Date.UTC(2026, 11, 15, 3),
  Date.UTC(2027, 0, 4, 3),
  Date.UTC(2027, 1, 1, 3),
  Date.UTC(2027, 2, 1, 3),
];

describe("능선 꺾은선", () => {
  it("꼭짓점 사이는 곧게 잇고, 범위 밖은 끝점 고도", () => {
    const r = [
      [100, 1],
      [110, 3],
    ] as const;
    expect(ridgeAt(r, 105)).toBeCloseTo(2, 6);
    expect(ridgeAt(r, 90)).toBe(1);
    expect(ridgeAt(r, 120)).toBe(3);
  });

  it("두 겹 모두 그림의 방위 범위(120~240°)를 덮는다", () => {
    for (const ridge of [SEOUL_RIDGES.far, SEOUL_RIDGES.near]) {
      expect(ridge[0]?.[0]).toBeLessThan(120);
      expect(ridge[ridge.length - 1]?.[0]).toBeGreaterThan(240);
    }
  });
});

describe("서울 남쪽 산의 골짜기", () => {
  it("남중한 카노푸스는 정남, 겉보기 고도는 지평선 바로 위(0~0.5°)", () => {
    for (const day of NIGHTS) {
      const c = canopusAt(SEOUL, day);
      expect(c.az).toBeCloseTo(180, 1);
      expect(c.alt).toBeGreaterThan(0);
      expect(c.alt).toBeLessThan(0.5);
    }
  });

  it("골짜기 바닥이 카노푸스 방위에 있고 그 고도보다 낮아 골짜기로 보인다", () => {
    for (const day of NIGHTS) {
      const c = canopusAt(SEOUL, day);
      expect(seoulSkyline(c.az)).toBeLessThan(c.alt);
      expect(aboveSeoulRidge(c.az, c.alt)).toBe(true);
    }
  });

  it("골짜기는 좁다: 정남에서 몇 도만 벗어나도 같은 높이의 별은 산에 가린다", () => {
    const { alt } = canopusAt(SEOUL, NIGHTS[2] as number);
    for (const az of [120, 150, 170, 176, 184, 190, 210, 240]) {
      expect(aboveSeoulRidge(az, alt)).toBe(false);
    }
  });

  it("지평선 아래 별은 골짜기에서도 보이지 않는다", () => {
    expect(aboveSeoulRidge(180, -0.1)).toBe(false);
  });
});

describe("마라도 앞바다의 배", () => {
  it("카노푸스와 수면 반영(정남 ±5°)을 가리지 않는다", () => {
    const c = canopusAt(MARADO, NIGHTS[2] as number);
    for (const b of MARADO_BOATS) {
      const half = b.length / 2;
      expect(Math.abs(b.az - c.az)).toBeGreaterThan(half + 5);
      expect(b.water).toBeLessThanOrEqual(0);
    }
  });
});
