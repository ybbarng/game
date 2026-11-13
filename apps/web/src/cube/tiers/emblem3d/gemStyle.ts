import type { Vec3 } from "./gem";

/**
 * 보석 티어의 생김새(docs/47 14-7 「열째 시안 확정」, 2026-11-13 사용자 「응 지금 정도가 좋아 보여 이대로 진행해 줘」).
 * 티어가 오를수록 화려해지는 사다리다(사용자 「에메랄드, 다이아몬드는 과한 것 같아. 등급상 더 하위 등급이니까」):
 *
 * - 에메랄드 `calm` 차분한 보석: 매끈한 네모 조각, 깎은 면·결정 없음, 반짝 점·번짐 약하게. 뒤가 비치고 몸 색이 짙어
 *   금속·탁한 유리로 보이지 않게.
 * - 다이아몬드 `soft` 얕은 계단: 겉면만 얕게 깎은 두 단, 불꽃은 분산 흉내로 약하게.
 * - 마스터 `o1` 결정 구조: 조각 안 3D 보로노이 칸 경계에서 빛이 잘게 쪼개진다.
 * - 그랜드마스터 `n` 계단 컷: 조각마다 실제로 모서리·꼭짓점을 깎은 다면체, 깎은 띠마다 흰 쐐기 반사.
 * - 챌린저 `o1`: 마스터와 같은 결정 구조에 무지개 분산(세 번 추적). 사용자 「지금 챌린저 좋아 보여」
 *
 * 구조(모양·깎은 면·결정 구조·스튜디오)는 여기서, 색·굴절률·분산은 티어 보석 값(`scene.ts` `LOOK`)에서 가져온다.
 * 에메랄드만 여기 적은 색(`left`)을 쓴다.
 */

export const GEM_STYLES = ["calm", "soft", "o1", "n"] as const;
export type GemStyle = (typeof GEM_STYLES)[number];

/** 보석 티어(에메랄드부터, `isGem`과 같다) */
export const GEM_TIERS = [
  "emerald",
  "diamond",
  "master",
  "grandmaster",
  "challenger",
] as const;

/** 티어마다 생김새(화려함 사다리) */
export const TIER_STYLE: Readonly<
  Record<(typeof GEM_TIERS)[number], GemStyle>
> = {
  emerald: "calm",
  diamond: "soft",
  master: "o1",
  grandmaster: "n",
  challenger: "o1",
};

/** 보석 티어의 생김새, 금속 티어는 null */
export function styleOfTier(tier: string): GemStyle | null {
  return (TIER_STYLE as Record<string, GemStyle>)[tier] ?? null;
}

/** 면 깎기: 0 없음(평평한 네모), 1 계단(테이블 둘레 네모 고리) */
export type FacetKind = 0 | 1;

/** 깎은 면 하나의 띠: 면 가운데에서 이만큼(면 반 변 기준, 0~1) 밖에서 시작하고, 이만큼(도) 기운다 */
export interface FacetRing {
  from: number;
  tilt: number;
}

export interface FacetCut {
  kind: FacetKind;
  rings: readonly FacetRing[];
}

/** 깎지 않음 */
const FLAT: FacetCut = { kind: 0, rings: [] };
/** 다이아몬드 얕은 계단: 넓은 테이블 둘레에 얕은 두 단 */
const SOFT_STEP: FacetCut = {
  kind: 1,
  rings: [
    { from: 0.7, tilt: 16 },
    { from: 0.88, tilt: 32 },
  ],
};

type Rgb = readonly [number, number, number];

export interface GemStyleLook {
  cut: FacetCut;
  /** 조각 한 변(0.92)을 지난 뒤 남는 빛(선형 RGB). 에메랄드만 쓴다 */
  left: Rgb;
  /** 빨강–파랑 굴절률 차(에메랄드만, 0이면 한 번만 따라간다) */
  spread: number;
  /** 스튜디오 방: 보석 기본 / 계단 컷(위 큰 빛판을 밝혀 깎은 띠에 흰 쐐기 반사) */
  studio: "now" | "step";
  /** 꿰뚫어 본 뒤 배경 세기, 되튄 빛이 읽는 스튜디오 세기 */
  backGain: number;
  envGain: number;
  /** 큐브 바로 뒤 라이트 박스 세기 */
  glow: number;
  /** 보는 사람 쪽 점 조명 배수 */
  frontLights: number;
  /** 번짐(세기, 반지름, 문턱) */
  bloom: { strength: number; radius: number; threshold: number };
  /** 꿰뚫어 본 빛이 뒤쪽 조각들을 지나며 더 흡수되는 몫(큐브 전체 두께 × 이 값) */
  cubeFill: number;
  /** 조각의 실제 모양: `poly`는 모서리·꼭짓점을 깎은 계단 컷 다면체(그물과 빛길 벽이 같은 평면) */
  shape?: "poly";
  /** 안의 빛길에서 벽에 닿는 횟수(기본 5) */
  steps?: number;
  /** 조각 안 결정 구조: 칸 수, 경계 면 반사 몫, 꺾임 */
  voro?: { count: number; reflect: number; bend: number };
  /** 겉 반사 세기(반사 지도, 기본 1): 깎은 면에 조명이 흰 쐐기로 비치게 */
  frontEnv?: number;
  /**
   * 분산 흉내: 빛길을 빨강·초록·파랑 세 번 따라가는 대신 한 번 따라가고, 나가는 방향에 따라 스펙트럼 색을 이만큼
   * 곱한다(평균 밝기는 그대로). 계산이 약 1/3
   */
  fire?: number;
}

/** 번짐 기본값(넷째 시안부터): 반짝이는 점에만 작게 */
export const BASE_BLOOM = {
  strength: 0.4,
  radius: 0.12,
  threshold: 3,
} as const;

/** 공통: 진한 에메랄드(조각 한 변을 지나 빨강 14%·초록 74%·파랑 44%), 조각별 추적 */
const DEEP: GemStyleLook = {
  cut: FLAT,
  left: [0.14, 0.74, 0.44],
  spread: 0,
  cubeFill: 0.5,
  studio: "now",
  backGain: 1.6,
  envGain: 1.5,
  glow: 0.6,
  frontLights: 1.2,
  bloom: BASE_BLOOM,
};

/** 생김새마다 값(문서·보고에 그대로 적는다) */
export const GEM_STYLE_LOOK: Readonly<Record<GemStyle, GemStyleLook>> = {
  calm: {
    ...DEEP,
    cubeFill: 0.6,
    backGain: 1.7,
    envGain: 1.3,
    frontLights: 0.7,
    bloom: { strength: 0.3, radius: 0.1, threshold: 3.5 },
  },
  soft: {
    ...DEEP,
    cut: SOFT_STEP,
    fire: 0.18,
    envGain: 1.4,
    frontLights: 1,
    bloom: { strength: 0.32, radius: 0.1, threshold: 3.4 },
  },
  o1: {
    ...DEEP,
    voro: { count: 6, reflect: 0.28, bend: 0.18 },
    steps: 12,
  },
  n: { ...DEEP, shape: "poly", steps: 7, studio: "step", frontEnv: 1.8 },
};

const DEG = Math.PI / 180;
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** 상자 면의 바깥 법선(축)과 면 위 두 축 */
export function faceAxes(n: Vec3): { n: Vec3; u: Vec3; v: Vec3 } {
  const a = n.map(Math.abs) as unknown as Vec3;
  if (a[0] >= a[1] && a[0] >= a[2])
    return { n: [Math.sign(n[0]) || 1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] };
  if (a[1] >= a[2])
    return { n: [0, Math.sign(n[1]) || 1, 0], u: [1, 0, 0], v: [0, 0, 1] };
  return { n: [0, 0, Math.sign(n[2]) || 1], u: [1, 0, 0], v: [0, 1, 0] };
}

/**
 * 깎은 면의 법선(물체 좌표). 실제 모양(그림자 윤곽)은 네모 상자 그대로 두고 면의 기울기만 바꾼다(노멀 맵처럼).
 * 그래서 큐브는 큐브로 읽히고, 빛은 면마다 다른 곳을 비춘다. `p`는 상자 겉면 위 점, `n`은 그 면의 바깥 법선,
 * `half`는 상자 반 변. 셰이더(`gemMaterial.ts` `gemFacet`)와 같은 계산이다.
 */
export function facetNormal(
  cut: FacetCut,
  p: Vec3,
  n: Vec3,
  half: number,
): Vec3 {
  const f = faceAxes(n);
  if (cut.kind === 0) return f.n;
  const u = dot(p, f.u) / half;
  const v = dot(p, f.v) / half;
  const r = Math.max(Math.abs(u), Math.abs(v));
  let ring: FacetRing | null = null;
  for (const x of cut.rings) if (r >= x.from) ring = x;
  if (!ring) return f.n;
  // 가까운 변 쪽으로 기운다(꼭짓점에서 45° 맞붙는 선이 생긴다)
  const e =
    Math.abs(u) >= Math.abs(v)
      ? (f.u.map((x) => x * Math.sign(u)) as unknown as Vec3)
      : (f.v.map((x) => x * Math.sign(v)) as unknown as Vec3);
  const t = ring.tilt * DEG;
  const out: Vec3 = [
    f.n[0] * Math.cos(t) + e[0] * Math.sin(t),
    f.n[1] * Math.cos(t) + e[1] * Math.sin(t),
    f.n[2] * Math.cos(t) + e[2] * Math.sin(t),
  ];
  const l = Math.hypot(out[0], out[1], out[2]);
  return [out[0] / l, out[1] / l, out[2] / l];
}
