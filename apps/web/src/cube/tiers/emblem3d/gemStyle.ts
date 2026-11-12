import type { Vec3 } from "./gem";

/**
 * 에메랄드 시안 넷(docs/47 14-7 「다섯째 시안」, 2026-11-12 사용자 「아직도 보석 느낌이 나지 않아」). 넷째 시안까지는
 * 반사·투과 값만 고쳤다. 실제 보석 사진에서 「보석」으로 읽히는 까닭을 넷으로 나눠, 시안마다 하나씩 앞세운다.
 *
 * - `now`: 넷째 시안 그대로(평평한 네모 조각, 뒤가 비침).
 * - `a` 계단 컷: 에메랄드 컷처럼 면마다 네모 고리 모양 계단 면. 면마다 기울기가 달라 띠마다 다른 밝기가 나고,
 *   안쪽 뒷면의 계단이 겹겹이 비쳐 「거울방」 같은 네모 무늬가 생긴다.
 * - `b` 반짝임 무늬: 브릴리언트 컷처럼 작은 세모·연 모양 면을 많이. 면마다 방의 다른 곳(밝은 띠 조명이나 어두운
 *   방)을 비춰 검고 흰 조각 무늬가 생기고, 돌리면 조각마다 켜졌다 꺼진다. 방은 더 어둡게, 빛은 가는 띠로.
 * - `c` 진한 몸·점빛·불꽃: 깊고 진한 푸른 녹색 몸(가운데는 짙고 가장자리는 빛남), 아주 작고 센 흰 점빛, 면 모서리에서
 *   무지개 불꽃(분산을 키움). 면은 큰 경사 면 한 단.
 * - `d` 맑은 녹색·내포물: 맑고 밝은 녹색에, 천연 에메랄드처럼 안에 옅은 결(이끼 같은 막)과 작은 알갱이가 비친다.
 *   얕은 계단 면 한 단.
 *
 * 여섯째 시안(사용자가 a~d를 보고 「다 뭔가 보석 느낌이 덜한 것 같아. 아주 연한 녹색 유리라고 생각하고 만들어
 * 볼래?」): 깎은 면 없는 매끈한 아주 연한 녹색 유리 셋.
 * - `e` 맑은 유리: 거의 무색, 큐브를 꿰뚫으면 옅은 민트.
 * - `f` 녹색 옆면 유리: 정면은 맑고 안에서 되튀어 길게 지난 가장자리·옆면만 짙은 녹색.
 * - `g` 붙은 유리 큐브: 조각 사이 틈을 거의 없앤 한 덩이 유리 문진.
 *
 * 다른 티어는 바꾸지 않는다. 시안은 WebGL 길로만 그린다(HDR 길의 TSL 셰이더는 사용자가 하나를 고른 뒤 옮긴다).
 */

export const GEM_STYLES = [
  "now",
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "m2",
  "n",
  "q",
  "p",
  "o1",
  "o2",
] as const;
export type GemStyle = (typeof GEM_STYLES)[number];

/** 미리보기 단추 이름 */
export const GEM_STYLE_LABEL: Record<GemStyle, string> = {
  now: "넷째 시안",
  a: "a 계단 컷",
  b: "b 반짝임 무늬",
  c: "c 진한 몸·불꽃",
  d: "d 맑은 녹색·내포물",
  e: "e 맑은 유리",
  f: "f 녹색 옆면 유리",
  g: "g 붙은 유리 큐브",
  h: "h 한 덩이 유리",
  i: "i 이웃까지 추적",
  j: "j 고른 옅은 녹색",
  k: "k 젖빛 유리",
  l: "l 약한 굴절",
  m: "m 틈을 통과하는 보석",
  m2: "m2 통과하는 보석·깎은 겉면",
  n: "n 계단 컷",
  q: "q 둥근 모서리",
  p: "p 브릴리언트 속",
  o1: "o1 결정 구조(조각마다)",
  o2: "o2 결정 구조(큐브 전체)",
};

/** 주소의 `?gem=now|a|…|g`. 없거나 모르는 값이면 null(시안 고르기 없이 지금 모습) */
export function gemStyleOf(search: string): GemStyle | null {
  const v = new URLSearchParams(search).get("gem");
  return GEM_STYLES.find((s) => s === v) ?? null;
}

/** 면 깎기: 0 없음(평평한 네모), 1 계단 컷, 2 브릴리언트 */
export type FacetKind = 0 | 1 | 2;

/**
 * 깎은 면 하나의 띠: 면 가운데에서 이만큼(면 반 변 기준, 0~1) 밖에서 시작하고, 이만큼(도) 기운다. 브릴리언트는 띠마다
 * 조각 수와 조각을 반 칸 어긋나게 둘지(세모가 엇갈려 맞물린다)도 적는다.
 */
export interface FacetRing {
  from: number;
  tilt: number;
  sectors?: number;
  offset?: number;
}

export interface FacetCut {
  kind: FacetKind;
  rings: readonly FacetRing[];
}

/** 깎지 않음 */
const FLAT: FacetCut = { kind: 0, rings: [] };
/** 에메랄드 컷 계단 면: 넓은 위 면(테이블) 둘레에 세 단 */
const STEP: FacetCut = {
  kind: 1,
  rings: [
    { from: 0.5, tilt: 14 },
    { from: 0.68, tilt: 28 },
    { from: 0.84, tilt: 44 },
  ],
};
/** 브릴리언트: 작은 테이블, 별 면(8), 연 면(8, 반 칸 어긋남), 거들 쪽 면(16) */
const BRILLIANT: FacetCut = {
  kind: 2,
  rings: [
    { from: 0.2, tilt: 13, sectors: 8, offset: 0 },
    { from: 0.5, tilt: 25, sectors: 8, offset: 0.5 },
    { from: 0.78, tilt: 39, sectors: 16, offset: 0 },
  ],
};
/** 큰 경사 면 한 단(c) */
const BEVEL: FacetCut = { kind: 1, rings: [{ from: 0.62, tilt: 34 }] };
/** 얕은 계단 면 한 단(d): 내포물이 잘 보이게 테이블을 넓게 */
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
  /** 조각 한 변(0.92)을 지난 뒤 남는 빛(선형 RGB) */
  left: Rgb;
  /** 빨강–파랑 굴절률 차(0이면 한 번만 따라간다) */
  spread: number;
  /** 안의 결·알갱이(d) */
  jardin: boolean;
  /** 스튜디오 방: 지금 / 검고 가는 띠(b) / 작은 점빛(c) / 유리(가늘고 긴 반사선, e~g) */
  studio: "now" | "contrast" | "sparkle" | "glass" | "step";
  /**
   * 꿰뚫어 본 빛이 뒤쪽 조각들을 지나며 더 흡수되는 몫(큐브 전체 두께 × 이 값). 0.92면 보석이 차지하는 몫 그대로라
   * 가운데가 가장 짙다. 유리처럼 가운데는 맑고 안에서 되튄 가장자리만 짙게 하려면 줄인다
   */
  cubeFill: number;
  /** 조각 사이 틈을 거의 없앤다(한 덩이 유리 큐브처럼, 조각 사이는 가는 선만) */
  fused: boolean;
  /**
   * 나가는 빛이 눈 방향과 이루는 각이 첫 값(도)보다 벌어지면 스튜디오, 둘째 값 안이면 뒤 배경을 읽는다(사이는 섞음).
   * 없으면 넷째 시안 그대로 55°·25°(`gem.ts` `throughWeight`). 유리는 거의 모든 뒤쪽 빛이 배경을 읽게 넓힌다
   */
  through?: readonly [number, number];
  /**
   * 큐브 조각의 빛길(`cubeTrace.ts`): 없으면 조각 하나 안에서만(옆으로 나간 빛이 이웃 유리를 지나지 않고 방을 읽는다),
   * `whole`은 큐브 전체를 유리 상자 하나로(h), `grid`는 조각 격자를 틈 너머 이웃까지(i)
   */
  trace?: "whole" | "grid" | "pass";
  /**
   * 고른 색(선형 RGB): 있으면 빛이 지난 길이로 흡수하지 않고(`left`는 무시) 안의 빛에 이 색을 한 번 곱한다. 길이 차로
   * 생기는 짙은 사각형을 없앤다(여덟째 시안)
   */
  tint?: Rgb;
  /** 안쪽 상을 흐리게(젖빛): 배경판 밉맵 치우침과 반사 지도 거칠기 */
  blur?: { bias: number; rough: number };
  /** 안의 빛길에만 쓰는 굴절률(겉 반사는 몸 굴절률 그대로). 낮으면 덜 꺾이고 전반사가 거의 없다 */
  traceIor?: number;
  /** 꿰뚫지 않고 나간 빛도 반사 지도 대신 큐브 바로 뒤 배경판을 흐리게 읽는다(배경판·방의 밝기 차 경계를 없앤다) */
  surround?: boolean;
  /** 고른 속빛(고른 색 `tint`에 곱해 더한다): 안에서 돌아오는 빛을 영역 차이 없이 흉내 낸다(시안 m) */
  innerGlow?: number;
  /**
   * 큐브 조각의 실제 모양(아홉째 시안): `poly`는 모서리·꼭짓점을 깎은 계단 컷 다면체(n), `round`는 둥근 모서리 상자(q).
   * 그물과 빛길 벽이 모두 그 모양이다
   */
  shape?: "poly" | "round";
  /** 안의 빛길에서 벽에 닿는 횟수(기본 5, 큐브 빛길은 9) */
  steps?: number;
  /** 깎은 면을 안쪽 벽에만(겉면은 평평, 시안 p: 평평한 큐브 안에 브릴리언트 컷이 든 것처럼) */
  facetWallOnly?: boolean;
  /** 안쪽 결정 구조(시안 o1·o2): 칸 수, 경계 면 반사 몫, 꺾임, 조각마다/큐브 전체 */
  voro?: {
    count: number;
    reflect: number;
    bend: number;
    scope: "piece" | "cube";
  };
  /** 겉 반사 세기(반사 지도, 기본 1): 깎은 면에 조명이 흰 쐐기로 비치게(시안 n) */
  frontEnv?: number;
  /** 꿰뚫어 본 뒤 배경 세기, 되튄 빛이 읽는 스튜디오 세기 */
  backGain: number;
  envGain: number;
  /** 큐브 바로 뒤 라이트 박스 세기 */
  glow: number;
  /** 보는 사람 쪽 점 조명 배수 */
  frontLights: number;
  /** 번짐(세기, 반지름, 문턱) */
  bloom: { strength: number; radius: number; threshold: number };
}

const NOW_BLOOM = { strength: 0.4, radius: 0.12, threshold: 3 } as const;
/**
 * 유리의 꿰뚫어 보기 각: 뒤로 나가는 빛은 모두 뒤 배경(배경판, 그 밖은 가장자리의 바탕색)을 읽는다. 넷째 시안
 * 각(55°·25°)이나 88°·50°이면 옆면으로 비스듬히 나간 빛이 스튜디오 큰 빛판을 읽어 조각마다 회색 칸(금속처럼)이
 * 생겼다(여섯째 시안 첫 판)
 */
const GLASS_THROUGH = [95, 75] as const;

/** 여덟째 시안의 고른 옅은 녹색(선형): 빨강 88%·초록 97%·파랑 91% */
const GLASS_TINT = [0.88, 0.97, 0.91] as const;

/** h 한 덩이 유리: 큐브 전체를 유리 상자 하나로 따라가고, 조각 경계는 겉면의 가는 틈 자국(붙은 조각)뿐. j~l은 이 위에서 바꾼다 */
const H_LOOK: GemStyleLook = {
  cut: FLAT,
  left: [0.8, 0.965, 0.84],
  spread: 0,
  jardin: false,
  cubeFill: 0,
  fused: true,
  through: GLASS_THROUGH,
  trace: "whole",
  studio: "glass",
  backGain: 1.45,
  envGain: 1.25,
  glow: 0.5,
  frontLights: 0.8,
  bloom: { strength: 0.25, radius: 0.1, threshold: 3.5 },
};

/** m 보석(조각 사이 통과): 진하고 맑은 푸른 녹색(선형), 고른 속빛 */
const M_LOOK: GemStyleLook = {
  ...H_LOOK,
  fused: false,
  trace: "pass",
  left: [1, 1, 1],
  // 첫 판(색 0.08·0.62·0.34, 속빛 0.3, 번짐 문턱 3)은 옥처럼 탁하고 밝은 바탕에서 형광 민트, 틀 윗변이 크게 번졌다
  tint: [0.03, 0.46, 0.24],
  innerGlow: 0.1,
  glow: 0,
  traceIor: 1.12,
  spread: 0.05,
  surround: true,
  studio: "sparkle",
  backGain: 1.7,
  envGain: 1.6,
  frontLights: 1.4,
  bloom: { strength: 0.35, radius: 0.06, threshold: 4.5 },
};

/** 아홉째 시안 공통: 진한 에메랄드(조각 한 변을 지나 빨강 14%·초록 74%·파랑 44%), 실제 굴절률, 조각별 추적 */
const DEEP: GemStyleLook = {
  cut: FLAT,
  left: [0.14, 0.74, 0.44],
  spread: 0,
  jardin: false,
  cubeFill: 0.5,
  fused: false,
  studio: "now",
  backGain: 1.6,
  envGain: 1.5,
  glow: 0.6,
  frontLights: 1.2,
  bloom: NOW_BLOOM,
};

/**
 * 브릴리언트 파빌리언(시안 p): 테이블 없이 바로 깊게 기운 별 면 여덟과 반 칸 어긋난 연 면 여덟. 첫 판(열여섯 조각 셋째
 * 단까지)은 무늬가 잘게 흩어져 젖빛처럼 보여 굵은 두 단으로 줄였다
 */
const PAVILION: FacetCut = {
  kind: 2,
  rings: [
    { from: 0, tilt: 42, sectors: 8, offset: 0 },
    { from: 0.55, tilt: 36, sectors: 8, offset: 0.5 },
  ],
};

/** 시안마다 값(문서·보고에 그대로 적는다) */
export const GEM_STYLE_LOOK: Readonly<Record<GemStyle, GemStyleLook>> = {
  now: {
    cut: FLAT,
    left: [0.3, 0.86, 0.5],
    spread: 0,
    jardin: false,
    cubeFill: 0.92,
    fused: false,
    studio: "now",
    backGain: 1.8,
    envGain: 1.3,
    glow: 0.6,
    frontLights: 1,
    bloom: NOW_BLOOM,
  },
  a: {
    cut: STEP,
    left: [0.3, 0.87, 0.56],
    spread: 0,
    jardin: false,
    cubeFill: 0.92,
    fused: false,
    studio: "now",
    backGain: 1.6,
    envGain: 1.5,
    glow: 0.6,
    frontLights: 1,
    bloom: NOW_BLOOM,
  },
  b: {
    cut: BRILLIANT,
    left: [0.26, 0.84, 0.5],
    spread: 0.02,
    jardin: false,
    cubeFill: 0.92,
    fused: false,
    studio: "contrast",
    backGain: 1.2,
    envGain: 1.8,
    glow: 0.45,
    frontLights: 1.3,
    bloom: { strength: 0.45, radius: 0.1, threshold: 2.6 },
  },
  c: {
    cut: BEVEL,
    left: [0.05, 0.6, 0.26],
    spread: 0.06,
    jardin: false,
    cubeFill: 0.92,
    fused: false,
    studio: "sparkle",
    backGain: 1.5,
    envGain: 1.6,
    glow: 0.75,
    // 더 세게 하면 은빛 틀 윗변이 하얗게 번졌다(시안 첫 판)
    frontLights: 1.5,
    bloom: { strength: 0.42, radius: 0.06, threshold: 3.2 },
  },
  d: {
    cut: SOFT_STEP,
    left: [0.38, 0.88, 0.56],
    spread: 0,
    jardin: true,
    cubeFill: 0.92,
    fused: false,
    studio: "now",
    backGain: 1.7,
    envGain: 1.3,
    glow: 0.6,
    frontLights: 1,
    bloom: NOW_BLOOM,
  },
  // ---- 여섯째 시안: 아주 연한 녹색 유리(2026-11-12 사용자 「아주 연한 녹색 유리라고 생각하고 만들어 볼래?」).
  // 깎은 면·분산·내포물 없이 매끈한 유리. 셋은 옅기·가장자리 짙어짐·반사 세기·조각 사이 틈으로 가른다
  e: {
    // 맑은 유리: 거의 무색(조각 한 변에 빨강 5%·파랑 4%만 흡수), 큐브를 꿰뚫으면 옅은 민트
    cut: FLAT,
    left: [0.95, 0.99, 0.96],
    spread: 0,
    jardin: false,
    cubeFill: 0.92,
    fused: false,
    through: GLASS_THROUGH,
    studio: "glass",
    backGain: 1.45,
    envGain: 1.0,
    glow: 0.5,
    frontLights: 0.7,
    bloom: { strength: 0.25, radius: 0.1, threshold: 3.5 },
  },
  f: {
    // 녹색 옆면: 한 번 지날 때 흡수는 e의 네 배쯤이지만 꿰뚫어 보는 몫은 거의 더하지 않아(0.15) 정면은 맑고,
    // 안에서 여러 번 되튀어 길게 지난 가장자리·옆면만 짙은 녹색(유리판 옆면이 녹색인 것과 같은 까닭)
    cut: FLAT,
    left: [0.8, 0.965, 0.84],
    spread: 0,
    jardin: false,
    cubeFill: 0.15,
    fused: false,
    through: GLASS_THROUGH,
    studio: "glass",
    backGain: 1.45,
    envGain: 1.25,
    glow: 0.5,
    frontLights: 0.8,
    bloom: { strength: 0.25, radius: 0.1, threshold: 3.5 },
  },
  g: {
    // 붙은 유리 큐브: 조각 사이 틈을 거의 없애 한 덩이 유리 문진처럼, 조각 사이는 가는 선만. 반사는 조금 세게
    cut: FLAT,
    left: [0.93, 0.985, 0.95],
    spread: 0,
    jardin: false,
    cubeFill: 0.92,
    fused: true,
    through: GLASS_THROUGH,
    studio: "glass",
    backGain: 1.4,
    envGain: 1.15,
    glow: 0.5,
    frontLights: 1,
    bloom: { strength: 0.3, radius: 0.1, threshold: 3.2 },
  },
  // ---- 일곱째 시안: 큐브 전체 빛길(2026-11-12 사용자 「내부에 사각형 공간이 따로 진하게 보이는 게 매우 어색하거든.
  // 원래 사각형 보석들을 큐브처럼 모은다면 저렇게 보이게 돼?」). f 값 위에서 빛길만 바꾼다
  h: H_LOOK,
  i: {
    // 이웃까지 추적: 조각 27개(틈 0.08)를 빛이 건너간다. 틈에서 전반사가 아니면 이웃 조각으로, 큐브 바깥 면에서만 나간다
    cut: FLAT,
    left: [0.8, 0.965, 0.84],
    spread: 0,
    jardin: false,
    cubeFill: 0,
    fused: false,
    through: GLASS_THROUGH,
    trace: "grid",
    studio: "glass",
    backGain: 1.45,
    envGain: 1.25,
    glow: 0.5,
    frontLights: 0.8,
    bloom: { strength: 0.25, radius: 0.1, threshold: 3.5 },
  },
  // ---- 여덟째 시안: 안쪽 사각형 경계 없애기(2026-11-12 사용자 h를 보고 「한 덩이 유리도 가운데 녹색 사각형이
  // 이상하게 생기는데?」). 셋 다 h 위에서 길이 흡수 대신 고른 옅은 녹색, 배경판의 녹색 빛 덩어리 없음
  j: { ...H_LOOK, left: [1, 1, 1], tint: GLASS_TINT, glow: 0, surround: true },
  k: {
    ...H_LOOK,
    left: [1, 1, 1],
    tint: GLASS_TINT,
    glow: 0,
    surround: true,
    blur: { bias: 4, rough: 0.5 },
  },
  l: {
    ...H_LOOK,
    left: [1, 1, 1],
    tint: GLASS_TINT,
    glow: 0,
    traceIor: 1.12,
  },
  // 사용자 제안 「보석끼리는 서로 반사하지 않고 통과하는 것처럼 해도 좋을 것 같은데」: 조각 27개(틈 0.08)를 건너가되
  // 틈은 반사·굴절 없이 곧게 통과, 큐브 바깥 면에서만 굴절·반사·전반사. 겉에는 조각 사이 틈이 그대로 보인다.
  // 유리 굴절률(1.52)이면 h와 같은 안쪽 큐브 경계가 생겨 l의 수단(약한 굴절·고른 색)을 얹었다
  // 이어 사용자 「유리 느낌이 아니라 보석 느낌이 나게」(m만): 조각 사이 통과는 지키고, 안쪽 사각형을 만들지 않는
  // 보석 요소만 얹는다. 바깥 면 굴절률을 실제로 올리면 옆면 전반사가 영역을 갈라 h와 같은 안쪽 큐브 경계가 생긴다
  // (단위 시험 0.93). 그래서 안의 빛길은 약한 굴절(1.12) 그대로, 진하고 맑은 푸른 녹색을 고르게 곱하고, 안에서
  // 돌아오는 빛은 고른 속빛으로 더해 어두운 바탕에서도 가라앉지 않게, 겉에는 작고 센 흰 점빛(점빛 스튜디오), 빨강·초록·
  // 파랑 굴절률 차로 모서리 분산 불꽃
  m: M_LOOK,
  // m2: m에 바깥 면만 얕게 깎은 면(계단 세 단). 겉 반사와 큐브 바깥 면 굴절에만 쓰고, 조각 사이 통과는 그대로
  m2: { ...M_LOOK, cut: STEP },
  // ---- 아홉째 시안: 안쪽에 의도된 구조(2026-11-12 사용자 참고 사진과 「이거나 이것처럼 구조를 좀 내부에 넣는 건 어때?」).
  // 진한 에메랄드, 실제 굴절률 1.577. 안쪽 무늬는 받아들이되 흐린 영역 대신 또렷한 구조로
  // n 계단 컷: 조각마다 실제로 깎은 다면체(테이블 둘레 계단 두 단, 꼭짓점), 조각별 추적. 위 큰 빛판을 밝혀 깎은 띠에
  // 흰 쐐기 반사가 서게
  n: { ...DEEP, shape: "poly", steps: 7, studio: "step", frontEnv: 1.8 },
  // q 둥근 모서리: 조각마다 둥근 모서리 상자(곡면을 거리 함수로 따라감), 밝고 진한 연두빛 에메랄드, 안쪽 둥근 사각 테
  q: {
    ...DEEP,
    shape: "round",
    left: [0.4, 0.86, 0.32],
    steps: 7,
    glow: 0.8,
    envGain: 1.7,
    frontEnv: 1.5,
  },
  // p 브릴리언트 속: 겉은 평평한 큐브 조각, 안쪽 벽만 브릴리언트 파빌리언 면이라 테이블 너머로 방사형 조각 무늬
  p: {
    ...DEEP,
    cut: PAVILION,
    facetWallOnly: true,
    studio: "contrast",
    steps: 6,
    envGain: 1.8,
  },
  // o1 안쪽 결정 구조(조각마다): 조각 안 보로노이 칸 여섯, 경계 면에서 28% 되비침
  o1: {
    ...DEEP,
    voro: { count: 6, reflect: 0.28, bend: 0.18, scope: "piece" },
    steps: 12,
  },
  // o2 안쪽 결정 구조(큐브 전체): 조각 사이는 통과하고 큐브 전체에 보로노이 칸 서른
  o2: {
    ...DEEP,
    trace: "pass",
    cubeFill: 0,
    voro: { count: 30, reflect: 0.25, bend: 0.15, scope: "cube" },
    steps: 16,
  },
};

const DEG = Math.PI / 180;

/** 시안의 꿰뚫어 보기 각을 셰이더가 쓰는 코사인 둘로(넓은 쪽, 좁은 쪽) */
export function throughCos(s: GemStyleLook): readonly [number, number] {
  const [lo, hi] = s.through ?? [55, 25];
  return [Math.cos(lo * DEG), Math.cos(hi * DEG)];
}
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
  let e: Vec3;
  if (cut.kind === 1) {
    // 계단: 가까운 변 쪽으로 기운다(꼭짓점에서 45° 맞붙는 선이 생긴다)
    e =
      Math.abs(u) >= Math.abs(v)
        ? (f.u.map((x) => x * Math.sign(u)) as unknown as Vec3)
        : (f.v.map((x) => x * Math.sign(v)) as unknown as Vec3);
  } else {
    // 브릴리언트: 가운데에서 바깥쪽으로, 조각마다 그 조각 가운데 방향으로 기운다
    const k = ring.sectors ?? 8;
    const off = ring.offset ?? 0;
    const step = (Math.PI * 2) / k;
    const s = Math.floor(Math.atan2(v, u) / step + off);
    const c = (s + 0.5 - off) * step;
    e = [
      f.u[0] * Math.cos(c) + f.v[0] * Math.sin(c),
      f.u[1] * Math.cos(c) + f.v[1] * Math.sin(c),
      f.u[2] * Math.cos(c) + f.v[2] * Math.sin(c),
    ];
  }
  const t = ring.tilt * DEG;
  const out: Vec3 = [
    f.n[0] * Math.cos(t) + e[0] * Math.sin(t),
    f.n[1] * Math.cos(t) + e[1] * Math.sin(t),
    f.n[2] * Math.cos(t) + e[2] * Math.sin(t),
  ];
  const l = Math.hypot(out[0], out[1], out[2]);
  return [out[0] / l, out[1] / l, out[2] / l];
}

// ---------------------------------------------------------------- 내포물(d)

/** 셰이더 `gemHash`와 같은 해시(0~1) */
export function hash3(x: number, y: number, z: number): number {
  const fr = (a: number) => a - Math.floor(a);
  const a = fr(x * 0.3183099 + 0.1) * 17;
  const b = fr(y * 0.3183099 + 0.1) * 17;
  const c = fr(z * 0.3183099 + 0.1) * 17;
  return fr(a * b * c * (a + b + c));
}

/** 셰이더 `gemNoise`와 같은 값 노이즈(0~1) */
export function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const sm = (t: number) => t * t * (3 - 2 * t);
  const fx = sm(x - ix);
  const fy = sm(y - iy);
  const fz = sm(z - iz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const h = (dx: number, dy: number, dz: number) =>
    hash3(ix + dx, iy + dy, iz + dz);
  return l(
    l(l(h(0, 0, 0), h(1, 0, 0), fx), l(h(0, 1, 0), h(1, 1, 0), fx), fy),
    l(l(h(0, 0, 1), h(1, 0, 1), fx), l(h(0, 1, 1), h(1, 1, 1), fx), fy),
    fz,
  );
}

/** 결(막) 노이즈 배율·문턱과 알갱이 배율·문턱. 셰이더가 이 값을 그대로 쓴다 */
export const JARDIN = {
  veilScale: 2.6,
  veilFine: 6.5,
  /** 결을 한 축(조각의 y)으로 늘인다: 둥근 덩어리 대신 실·이끼처럼 길게 뻗은 결(첫 판은 둥근 테두리로 보였다) */
  veilStretch: 0.35,
  veilLo: 0.6,
  veilMid: 0.68,
  veilHi: 0.76,
  speckScale: 21,
  speckLo: 0.87,
  speckHi: 0.95,
  /** 결이 흩뜨려 내는 빛 세기, 결과 알갱이가 가리는 세기 */
  veilGlow: 1.8,
  veilBlock: 0.5,
  speckBlock: 6,
  /** 한 구간에서 고르는 점 수, 따라가는 구간 수 */
  samples: 4,
  segments: 2,
} as const;

const smooth = (lo: number, hi: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

/** 한 점의 결(0~1)과 알갱이(0~1). `q`는 물체 좌표 + 조각마다 다른 씨앗 */
export function jardinAt(q: Vec3): { veil: number; speck: number } {
  const J = JARDIN;
  const y = q[1] * J.veilStretch;
  const n =
    noise3(q[0] * J.veilScale, y * J.veilScale, q[2] * J.veilScale) * 0.65 +
    noise3(q[0] * J.veilFine, y * J.veilFine, q[2] * J.veilFine) * 0.35;
  const veil =
    smooth(J.veilLo, J.veilMid, n) * (1 - smooth(J.veilMid, J.veilHi, n));
  const s = noise3(
    q[0] * J.speckScale,
    q[1] * J.speckScale,
    q[2] * J.speckScale,
  );
  return { veil, speck: smooth(J.speckLo, J.speckHi, s) };
}
