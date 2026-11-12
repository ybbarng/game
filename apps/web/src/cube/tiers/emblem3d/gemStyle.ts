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
 * 다른 티어는 바꾸지 않는다. 시안은 WebGL 길로만 그린다(HDR 길의 TSL 셰이더는 사용자가 하나를 고른 뒤 옮긴다).
 */

export const GEM_STYLES = ["now", "a", "b", "c", "d"] as const;
export type GemStyle = (typeof GEM_STYLES)[number];

/** 미리보기 단추 이름 */
export const GEM_STYLE_LABEL: Record<GemStyle, string> = {
  now: "넷째 시안",
  a: "a 계단 컷",
  b: "b 반짝임 무늬",
  c: "c 진한 몸·불꽃",
  d: "d 맑은 녹색·내포물",
};

/** 주소의 `?gem=a|b|c|d|now`. 없거나 모르는 값이면 null(시안 고르기 없이 지금 모습) */
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
  /** 스튜디오 방: 지금 / 검고 가는 띠(b) / 작은 점빛(c) */
  studio: "now" | "contrast" | "sparkle";
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

/** 시안마다 값(문서·보고에 그대로 적는다) */
export const GEM_STYLE_LOOK: Readonly<Record<GemStyle, GemStyleLook>> = {
  now: {
    cut: FLAT,
    left: [0.3, 0.86, 0.5],
    spread: 0,
    jardin: false,
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
    studio: "now",
    backGain: 1.7,
    envGain: 1.3,
    glow: 0.6,
    frontLights: 1,
    bloom: NOW_BLOOM,
  },
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
