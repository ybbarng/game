/**
 * 티어 엠블럼의 모양·색(TierEmblem.tsx)과 HDR 반짝임 그림(scripts/build-cube-tier-hdr.mjs)이 함께 쓰는 값.
 * 그림 스크립트가 Node로 이 파일을 바로 불러오므로(형 지우기) 다른 파일을 import하지 않고 지울 수 있는 TS 문법만 쓴다.
 *
 * 좌표는 viewBox 0~64(엠블럼) 기준이고, 구간 표시는 그 아래 64~74에 그린다. 큐브는 가운데 C를 중심으로 한 등각 육면체,
 * 둘레는 같은 방향의 육각 테두리다.
 */

export type Pt = readonly [number, number];

/** 엠블럼 한 변(viewBox) */
export const EMBLEM_BOX = 64;
/** 구간 표시까지 넣은 높이 */
export const EMBLEM_BOX_PIPS = 74;

const SIN60 = Math.sqrt(3) / 2;

/** 가운데에서 반지름 r인 위로 뾰족한 육각형 꼭짓점: 위·오른위·오른아래·아래·왼아래·왼위 */
export function hexAround(c: Pt, r: number): Pt[] {
  return [
    [c[0], c[1] - r],
    [c[0] + r * SIN60, c[1] - r / 2],
    [c[0] + r * SIN60, c[1] + r / 2],
    [c[0], c[1] + r],
    [c[0] - r * SIN60, c[1] + r / 2],
    [c[0] - r * SIN60, c[1] - r / 2],
  ];
}

/** 큐브 가운데(앞 꼭짓점)와 반지름 */
export const CUBE_C: Pt = [32, 34];
export const CUBE_R = 20;
/** 큐브 바깥 육각형(위·오른위·오른아래·아래·왼아래·왼위) */
export const CUBE_HEX = hexAround(CUBE_C, CUBE_R);
/** 둘레 테두리 반지름 */
export const RING_R = 27;

/** HDR 반짝임이 있는 티어(위 넷) */
export const HDR_TIERS = [
  "diamond",
  "master",
  "grandmaster",
  "challenger",
] as const;
export type HdrTier = (typeof HDR_TIERS)[number];

/** 작은 네 갈래 반짝임 하나(viewBox 단위). r은 빛줄기 길이 */
export interface Glint {
  x: number;
  y: number;
  r: number;
}

/**
 * 티어마다 반짝임 자리. SVG(보통 화면)와 HDR 그림이 같은 자리에 그린다. 위 티어일수록 하나씩 는다.
 * 첫째는 늘 윗면 뒤 꼭짓점 가까이(빛이 위에서 온다).
 */
export const GLINTS: Readonly<Record<HdrTier, readonly Glint[]>> = {
  diamond: [
    { x: 32, y: 16.5, r: 6.5 },
    { x: 47.5, y: 25.5, r: 3.6 },
  ],
  master: [
    { x: 32, y: 16.5, r: 6.5 },
    { x: 47.5, y: 25.5, r: 3.6 },
    { x: 17, y: 42.5, r: 3 },
  ],
  grandmaster: [
    { x: 32, y: 16.5, r: 7 },
    { x: 47.5, y: 25.5, r: 3.8 },
    { x: 17, y: 42.5, r: 3.2 },
  ],
  challenger: [
    { x: 32, y: 16.5, r: 7.5 },
    { x: 47.5, y: 25.5, r: 4 },
    { x: 17, y: 42.5, r: 3.4 },
    { x: 32, y: 4.6, r: 3.6 },
  ],
};

/**
 * HDR 반짝임의 빛 색(선형 sRGB 비율, 가장 큰 값 1). 보석·금속마다 살짝 물든 흰빛.
 * 그림 스크립트가 BT.2020으로 바꿔 PQ로 적는다.
 */
export const HDR_TINT: Readonly<
  Record<HdrTier, readonly [number, number, number]>
> = {
  diamond: [0.82, 0.93, 1],
  master: [0.95, 0.8, 1],
  grandmaster: [1, 0.78, 0.76],
  challenger: [1, 0.9, 0.68],
};

/**
 * 빛이 면을 따라 지나가는 띠: 그림 세 장(왼쪽·가운데·오른쪽)을 차례로 켰다 끄며 지나가는 것처럼 보인다.
 * img에 transform을 걸지 않으려고(Safari가 transform 걸린 HDR 그림을 SDR로 그린 적이 있다, docs/36 HDR 별빛) 자리를 그림에 굽는다.
 * 값은 띠 가운데의 x(viewBox), 띠는 왼아래에서 오른위로 기운다.
 */
export const BAND_FRAMES = [22, 32, 42] as const;
/** 띠 기울기(x가 y 1만큼 바뀔 때 옮겨 가는 양)와 반폭 */
export const BAND_SLANT = 0.55;
export const BAND_HALF = 3.2;

/** HDR 그림 경로(public 아래) */
export function hdrGlintSrc(tier: HdrTier): string {
  return `/cube/tiers/hdr-${tier}-glint.avif`;
}
export function hdrBandSrc(tier: HdrTier, frame: number): string {
  return `/cube/tiers/hdr-${tier}-band${frame}.avif`;
}
