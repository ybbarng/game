import type { GalaxyConstellation, GalaxySky, GalaxyStar } from "./sky-types";

/*
 * 시험용 사계절 하늘(docs/48 5-8 표의 24별). 밝기·온도·거리는 그럴듯한 어림값이다.
 * 실제 하늘 자료(`src/sky/`)는 자료 스크립트가 만든다(G1). 이 파일은 시험과 장면에만 쓴다.
 * 별자리 안 칸 순서는 밝은 별을 가운데에 둔다.
 */

type Row = [
  id: string,
  ko: string,
  hr: number,
  bayer: string,
  mag: number,
  k: number,
  ly: number | null,
  ra: number,
  dec: number,
];

function star([id, ko, hr, bayer, mag, k, ly, ra, dec]: Row): GalaxyStar {
  return { id, ko, hr, bayer, mag, k, ly, ra, dec };
}

function constellation(
  id: string,
  ko: string,
  season: GalaxyConstellation["season"],
  rows: Row[],
): GalaxyConstellation {
  return { id, ko, season, stars: rows.map(star), lines: [], extra: [] };
}

export const TEST_CONSTELLATIONS: GalaxyConstellation[] = [
  constellation("Peg", "페가수스자리", "autumn", [
    ["Markab", "마르카브", 8781, "α", 2.49, 9800, 133, 346.2, 15.2],
    ["Scheat", "셰아트", 8775, "β", 2.42, 3700, 196, 345.9, 28.1],
    ["Algenib", "알게니브", 39, "γ", 2.83, 21000, 390, 3.3, 15.2],
  ]),
  constellation("And", "안드로메다자리", "autumn", [
    ["Alpheratz", "알페라츠", 15, "α", 2.06, 13800, 97, 2.1, 29.1],
    ["Mirach", "미라크", 337, "β", 2.05, 3800, 197, 17.4, 35.6],
    ["Almach", "알마크", 603, "γ", 2.17, 4500, 350, 31.0, 42.3],
  ]),
  constellation("Ori", "오리온자리", "winter", [
    ["Betelgeuse", "베텔게우스", 2061, "α", 0.5, 3600, 550, 88.8, 7.4],
    ["Rigel", "리겔", 1713, "β", 0.13, 12100, 860, 78.6, -8.2],
    ["Bellatrix", "벨라트릭스", 1790, "γ", 1.64, 22000, 250, 81.3, 6.3],
  ]),
  constellation("CMa", "큰개자리", "winter", [
    ["Adhara", "아다라", 2618, "ε", 1.5, 22200, 430, 104.7, -29.0],
    ["Sirius", "시리우스", 2491, "α", -1.46, 9900, 8.6, 101.3, -16.7],
    ["Wezen", "웨젠", 2693, "δ", 1.84, 6100, 1600, 107.1, -26.4],
  ]),
  constellation("Leo", "사자자리", "spring", [
    ["Algieba", "알기에바", 4057, "γ", 2.08, 4500, 130, 155.0, 19.8],
    ["Regulus", "레굴루스", 3982, "α", 1.35, 12500, 79, 152.1, 12.0],
    ["Denebola", "데네볼라", 4534, "β", 2.14, 8500, 36, 177.3, 14.6],
  ]),
  constellation("Boo", "목동자리", "spring", [
    ["Izar", "이자르", 5506, "ε", 2.37, 4500, 200, 221.2, 27.1],
    ["Arcturus", "아르크투루스", 5340, "α", -0.05, 4300, 37, 213.9, 19.2],
    ["Muphrid", "무프리드", 5235, "η", 2.68, 6100, 37, 208.7, 18.4],
  ]),
  constellation("Lyr", "거문고자리", "summer", [
    ["Sulafat", "술라파트", 7178, "γ", 3.24, 9800, 620, 284.7, 32.7],
    ["Vega", "베가", 7001, "α", 0.03, 9600, 25, 279.2, 38.8],
    ["Sheliak", "셸리악", 7106, "β", 3.52, 13300, 960, 282.5, 33.4],
  ]),
  constellation("Aql", "독수리자리", "summer", [
    ["Tarazed", "타라제드", 7525, "γ", 2.72, 4100, 400, 296.6, 10.6],
    ["Altair", "알타이르", 7557, "α", 0.76, 7700, 17, 297.7, 8.9],
    ["Alshain", "알샤인", 7602, "β", 3.71, 5100, 45, 298.8, 6.4],
  ]),
];

export const TEST_SKY: GalaxySky = {
  id: "seasons",
  ko: "사계절 하늘",
  constellations: ["Peg", "And", "Ori", "CMa", "Leo", "Boo", "Lyr", "Aql"],
};

/**
 * 별자리 2개짜리 하늘(12 × 2) 시험용. 같은 24별을 둘씩 묶은 가짜 별자리다
 */
export const TEST_PAIR_CONSTELLATIONS: GalaxyConstellation[] = (() => {
  const stars = TEST_CONSTELLATIONS.flatMap((c) => c.stars);
  return Array.from({ length: 12 }, (_, i) => ({
    id: `Z${i}`,
    ko: `시험 별자리 ${i + 1}`,
    season: null,
    stars: stars.slice(i * 2, i * 2 + 2),
    lines: [],
    extra: [],
  }));
})();

export const TEST_PAIR_SKY: GalaxySky = {
  id: "pairs",
  ko: "시험 두 별 하늘",
  constellations: TEST_PAIR_CONSTELLATIONS.map((c) => c.id),
};
