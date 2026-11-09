/**
 * 큐브 맞추기 속도 티어 기준표(2026-11-09, docs/47 14절). 크기마다 티어 열 개, 아이언~마스터는 구간 IV~I,
 * 그랜드마스터·챌린저는 구간 없음(6×6·7×7의 아이언도 구간 없음).
 *
 * 값은 그 구간에 들어가는 최고 Ao5의 상한(초, 이하). 위쪽(골드~챌린저)은 WCA 결과 내보내기(2026-11-09 판)의 개인 최고
 * 평균 분포, 아래쪽(아이언~실버)은 대회 밖 사람(처음 맞춤, 초보 해법 1~3분)을 담도록 늘렸다. 큰 큐브는 마스터 아래를
 * 「3×3 기록이 같은 사람이 그 크기에서 내는 기록」으로, 그랜드마스터·챌린저는 크기마다 세계 약 1,000위·300위로 잡았다.
 * 순수 데이터라 Cubie 미니 모드도 그대로 쓴다.
 */

export const TIER_IDS = [
  "iron",
  "bronze",
  "silver",
  "gold",
  "platinum",
  "emerald",
  "diamond",
  "master",
  "grandmaster",
  "challenger",
] as const;

export type TierId = (typeof TIER_IDS)[number];

export const TIER_LABEL: Readonly<Record<TierId, string>> = {
  iron: "아이언",
  bronze: "브론즈",
  silver: "실버",
  gold: "골드",
  platinum: "플래티넘",
  emerald: "에메랄드",
  diamond: "다이아몬드",
  master: "마스터",
  grandmaster: "그랜드마스터",
  challenger: "챌린저",
};

/** 구간 이름(낮은 쪽부터) */
export const DIVISIONS = ["IV", "III", "II", "I"] as const;
export type Division = (typeof DIVISIONS)[number];

/** WCA 경기자 가운데 그 티어 진입 시간 이하인 사람 */
export interface WcaShare {
  people: number;
  /** 상위 몇 %(진입 시간 이하인 사람의 비율) */
  percent: number;
}

export interface TierRow {
  tier: TierId;
  /**
   * 구간 상한(초, 이하). 구간이 있으면 IV·III·II·I 넷, 없으면 하나. 아이언 IV(또는 구간 없는 아이언)는
   * 「다 맞춤」이라 Infinity
   */
  cuts: readonly number[];
  /** 대회 밖이면 null */
  wca: WcaShare | null;
}

/** 표에 있는 크기 */
export const TIER_SIZES = [2, 3, 4, 5, 6, 7] as const;

const ALL = Number.POSITIVE_INFINITY;

function rows(
  list: readonly [readonly number[], readonly [number, number] | null][],
): TierRow[] {
  return list.map(([cuts, wca], i) => ({
    tier: TIER_IDS[i] as TierId,
    cuts,
    wca: wca ? { people: wca[0], percent: wca[1] } : null,
  }));
}

/** 크기 → 티어 열 개(아이언부터) */
export const TIER_TABLE: Readonly<Record<number, readonly TierRow[]>> = {
  2: rows([
    [[ALL, 300, 210, 145], null],
    [[100, 80, 65, 50], null],
    [
      [40, 34, 28, 24],
      [182_580, 98.7],
    ],
    [
      [20, 18, 15, 14],
      [165_170, 89.3],
    ],
    [
      [12, 11, 9.5, 8.4],
      [132_579, 71.7],
    ],
    [
      [7.5, 6.8, 6.2, 5.7],
      [81_050, 43.8],
    ],
    [
      [5.2, 4.7, 4.3, 3.9],
      [35_337, 19.1],
    ],
    [
      [3.6, 3.1, 2.7, 2.3],
      [9_753, 5.3],
    ],
    [[2.0], [1_040, 0.56]],
    [[1.5], [275, 0.15]],
  ]),
  3: rows([
    [[ALL, 900, 630, 435], null],
    [[300, 240, 190, 150], null],
    [
      [120, 100, 85, 70],
      [280_971, 98.7],
    ],
    [
      [60, 52, 46, 40],
      [246_256, 86.5],
    ],
    [
      [35, 31, 28, 25],
      [175_391, 61.6],
    ],
    [
      [22, 20, 18, 16],
      [101_129, 35.5],
    ],
    [
      [14, 13, 12, 11],
      [36_339, 12.8],
    ],
    [
      [10, 9.3, 8.7, 8.1],
      [8_802, 3.1],
    ],
    [[7.5], [1_209, 0.42]],
    [[6.5], [295, 0.1]],
  ]),
  4: rows([
    [[ALL, 4200, 2820, 1950], null],
    [[1350, 1080, 840, 690], null],
    [[540, 455, 380, 320], null],
    [
      [270, 235, 210, 180],
      [55_554, 99.8],
    ],
    [
      [160, 140, 125, 110],
      [54_294, 97.6],
    ],
    [
      [100, 90, 80, 70],
      [46_993, 84.4],
    ],
    [
      [65, 58, 53, 49],
      [26_319, 47.3],
    ],
    [
      [45, 41, 37, 34],
      [9_473, 17.0],
    ],
    [[31], [1_025, 1.84]],
    [[27], [276, 0.5]],
  ]),
  5: rows([
    [[ALL, 7800, 5400, 3600], null],
    [[2550, 2040, 1620, 1290], null],
    [[1020, 870, 720, 600], null],
    [
      [510, 445, 390, 345],
      [27_167, 100.0],
    ],
    [
      [300, 270, 240, 215],
      [26_880, 98.9],
    ],
    [
      [190, 170, 150, 135],
      [25_319, 93.2],
    ],
    [
      [120, 110, 100, 95],
      [17_007, 62.6],
    ],
    [
      [85, 75, 70, 65],
      [6_883, 25.3],
    ],
    [[58], [964, 3.55]],
    [[51], [312, 1.15]],
  ]),
  6: rows([
    [[ALL], null],
    [[4800, 3900, 3030, 2400], null],
    [[1920, 1620, 1350, 1140], null],
    [[960, 840, 720, 630], null],
    [
      [560, 500, 445, 395],
      [13_073, 99.8],
    ],
    [
      [350, 315, 280, 250],
      [12_465, 95.2],
    ],
    [
      [225, 205, 190, 175],
      [9_409, 71.8],
    ],
    [
      [160, 145, 135, 125],
      [4_521, 34.5],
    ],
    [[113], [1_005, 7.67]],
    [[96], [309, 2.36]],
  ]),
  7: rows([
    [[ALL], null],
    [[7200, 5700, 4500, 3600], null],
    [[2880, 2430, 2040, 1710], null],
    [[1440, 1260, 1110, 960], null],
    [
      [840, 750, 660, 595],
      [10_148, 99.9],
    ],
    [
      [530, 475, 425, 380],
      [9_942, 97.9],
    ],
    [
      [340, 310, 285, 260],
      [7_699, 75.8],
    ],
    [
      [240, 220, 205, 190],
      [3_731, 36.7],
    ],
    [[176], [1_002, 9.87]],
    [[146], [300, 2.95]],
  ]),
};

/** 크기마다 WCA에 등록된 평균 기록 인원(2026-11-09 판) */
export const WCA_PEOPLE: Readonly<Record<number, number>> = {
  2: 185_000,
  3: 284_562,
  4: 55_653,
  5: 27_178,
  6: 13_100,
  7: 10_156,
};

/** 기준 자료 날짜 */
export const TIER_DATA_DATE = "2026-11-09";

/** WCA 결과 내보내기 README가 다시 펴낼 때 붙이라는 문구(그대로) */
export const WCA_CREDIT =
  "This information is based on competition results owned and maintained by the World Cube Assocation, published at https://worldcubeassociation.org/results as of November 9, 2026.";

export const WCA_RESULTS_URL = "https://worldcubeassociation.org/results";
