/**
 * 티어 엠블럼의 모양·색(TierEmblem.tsx)과 HDR 반짝임 그림(scripts/build-cube-tier-hdr.mjs)이 함께 쓰는 값.
 * 그림 스크립트가 Node로 이 파일을 바로 불러오므로(형 지우기) 다른 파일을 import하지 않고 지울 수 있는 TS 문법만 쓴다.
 *
 * 좌표는 viewBox 0~64(엠블럼) 기준이고, 구간 표시는 그 아래 64~74에 그린다. 가운데 C에 베벨 금속 육각 틀과 그 안의
 * 등각 큐브가 있고(이 둘을 「몸」이라 한다), 몸은 티어마다 `coreScale`만큼 키운다. 낮은 티어는 몸이 크고 장식이 없으며,
 * 위 티어는 몸이 조금 작아지는 대신 큐브 조각 날개·볏·궤도·왕관·빛살로 바깥 실루엣이 커진다(여러 게임 티어 엠블럼의 공통 결,
 * docs/47 14-6).
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

/** 엠블럼 가운데 */
export const CENTER: Pt = [32, 32];
/** 몸 크기 1일 때: 틀 바깥·안 반지름, 큐브 반지름 */
export const FRAME_OUT = 22;
export const FRAME_IN = 16.8;
export const CUBE_R = 14.6;

/** 티어 차례(아이언부터). table.ts의 TIER_IDS와 같다(이 파일은 import를 하지 않는다) */
const ORDER = [
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
type Tier = (typeof ORDER)[number];

/** 몸 크기: 장식이 없는 낮은 티어는 크게, 실루엣이 커지는 위 티어는 조금 작게 */
const SCALE = [1.24, 1.22, 1.2, 1.08, 1.04, 1.0, 0.98, 0.96, 0.94, 0.92];

export function levelOf(tier: string): number {
  return ORDER.indexOf(tier as Tier);
}
export function coreScale(tier: string): number {
  return SCALE[levelOf(tier)] ?? 1;
}
/** 그 티어 큐브의 바깥 육각형(위·오른위·오른아래·아래·왼아래·왼위) */
export function cubeHex(tier: string): Pt[] {
  return hexAround(CENTER, CUBE_R * coreScale(tier));
}

/** 큐브 세 면(윗면·왼면·오른면)의 꼭짓점 넷. 윗면은 뒤 꼭짓점부터, 옆면은 위 왼쪽부터 돈다 */
export function cubeFaces(tier: string): Pt[][] {
  const [t, ur, lr, b, ll, ul] = cubeHex(tier) as [Pt, Pt, Pt, Pt, Pt, Pt];
  return [
    [t, ur, CENTER, ul],
    [ul, CENTER, b, ll],
    [CENTER, ur, lr, b],
  ];
}

/** 면 가운데(깎인 면 넷이 모이는 점) */
export function faceMid(q: readonly Pt[]): Pt {
  const a = q[0] as Pt;
  const c = q[2] as Pt;
  return [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
}

/**
 * 깎인 면 사이 모서리(면 가운데 → 네 꼭짓점)와 그 모서리가 빛을 받는 정도(0~1). 빛은 왼위에서 와서 윗면이 가장 밝다.
 * SVG(보통 화면)의 가는 빛줄과 HDR 그림(늘 은은하게 켜 두는 면 모서리 빛)이 같은 선을 쓴다.
 */
export function facetEdges(tier: string): { a: Pt; b: Pt; lit: number }[] {
  const lit = [
    [1, 0.75, 0.45, 0.9],
    [0.7, 0.3, 0.2, 0.5],
    [0.35, 0.6, 0.15, 0.2],
  ];
  return cubeFaces(tier).flatMap((q, f) =>
    q.map((v, i) => ({ a: faceMid(q), b: v, lit: lit[f]?.[i] ?? 0 })),
  );
}

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

/** 위 티어의 볏 보석 가운데(틀 위 꼭짓점 바로 위) */
export function crestAt(tier: string): Pt {
  return [CENTER[0], CENTER[1] - FRAME_OUT * coreScale(tier) - 1.2];
}

/**
 * 반짝임 자리. SVG(보통 화면)와 HDR 그림이 같은 자리에 그린다. 큐브 윗면 뒤 꼭짓점(빛이 위에서 온다)과 오른쪽 모서리,
 * 그리고 위 티어일수록 볏·아래 보석·왕관에 하나씩 는다.
 */
export function glintsFor(tier: string): Glint[] {
  const lv = levelOf(tier);
  if (lv < 6) return [];
  const [t, ur, , , ll] = cubeHex(tier) as [Pt, Pt, Pt, Pt, Pt, Pt];
  const out: Glint[] = [
    { x: t[0], y: t[1] + 2.2, r: 6.5 },
    { x: ur[0] - 1.6, y: ur[1] + 1.2, r: 3.4 },
  ];
  if (lv >= 7) out.push({ x: ll[0] + 2, y: ll[1] - 1, r: 3 });
  const crest = crestAt(tier);
  if (lv >= 8) out.push({ x: crest[0], y: crest[1] - 6.5, r: 3.6 });
  else out.push({ x: crest[0], y: crest[1], r: 3 });
  return out;
}

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
 * 값은 가운데에서 띠 가운데까지의 x(큐브 반지름 비율), 띠는 왼아래에서 오른위로 기운다.
 */
export const BAND_FRAMES = [-0.68, 0, 0.68] as const;
/** 띠 기울기(x가 y 1만큼 바뀔 때 옮겨 가는 양)와 반폭(큐브 반지름 비율) */
export const BAND_SLANT = 0.55;
export const BAND_HALF = 0.22;

/** HDR 그림 경로(public 아래) */
export function hdrGlintSrc(tier: HdrTier): string {
  return `/cube/tiers/hdr-${tier}-glint.avif`;
}
/** 늘 은은하게 켜 두는 HDR 그림: 깎인 면 모서리·윗면 바깥 모서리 빛과 작은 반짝임 점 */
export function hdrFacetSrc(tier: HdrTier): string {
  return `/cube/tiers/hdr-${tier}-facet.avif`;
}
export function hdrBandSrc(tier: HdrTier, frame: number): string {
  return `/cube/tiers/hdr-${tier}-band${frame}.avif`;
}
