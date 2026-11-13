/**
 * 티어 엠블럼의 모양·색. 평면 엠블럼(TierEmblem.tsx, 마지막 대체)과 3D 엠블럼(emblem3d/scene.ts)이 함께 쓴다.
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

/** 스티커(블럭)를 칸 안쪽으로 들인 비율(칸 한 변 1 기준) */
export const STICKER_INSET = 0.1;

/**
 * 면 q의 칸 (i, j) 안 (u, v) 자리(칸 단위 0~1). 칸 원점(u=v=0)은 면의 위쪽 꼭짓점 쪽이라 세 면 모두 빛을 받는 쪽이다.
 * 면 꼭짓점 q[0]에서 q[1] 쪽이 i·u, q[3] 쪽이 j·v.
 */
export function cellAt(
  q: readonly Pt[],
  i: number,
  j: number,
  u: number,
  v: number,
): Pt {
  const [o, a, , b] = q as [Pt, Pt, Pt, Pt];
  const s = (i + u) / 3;
  const t = (j + v) / 3;
  return [
    o[0] + (a[0] - o[0]) * s + (b[0] - o[0]) * t,
    o[1] + (a[1] - o[1]) * s + (b[1] - o[1]) * t,
  ];
}

/** 블럭 하나의 반사 자리(칸 단위): 빛 받는 쪽 테이블 모서리 근처. SVG가 쓴다 */
export const BLOCK_SPARK: Pt = [0.34, 0.31];
/** 면마다 블럭이 빛을 받는 정도(윗면·왼면·오른면) */
export const FACE_LIT = [1, 0.62, 0.4] as const;

/** 면 가운데(깎인 면 넷이 모이는 점) */
export function faceMid(q: readonly Pt[]): Pt {
  const a = q[0] as Pt;
  const c = q[2] as Pt;
  return [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
}

/**
 * 깎인 면 사이 모서리(면 가운데 → 네 꼭짓점)와 그 모서리가 빛을 받는 정도(0~1). 빛은 왼위에서 와서 윗면이 가장 밝다.
 * SVG의 가는 빛줄이 쓴다.
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

/** 반짝임 점이 있는 티어(위 넷) */
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
 * 반짝임 자리. 큐브 윗면 뒤 꼭짓점(빛이 위에서 온다)과 윗면 오른쪽 끝,
 * 그리고 위 티어일수록 빛 받는 틀 꼭짓점·볏·왕관에 하나씩 는다.
 *
 * 그늘진 왼면·오른면 안에는 두지 않는다(2026-11-10 사용자 「FLB 위치에 있는 코너 조각 혼자 유독 그 면에서 밝다」).
 * 예전에는 마스터부터 왼면 앞-왼-아래 코너 블럭에, 모든 HDR 티어가 오른면 위 코너 블럭에 반짝임을 얹어 그 블럭 하나만
 * 튀었다. 빛은 왼위에서 오므로 반짝임은 윗면(가장 밝은 면)과 빛을 받는 틀 꼭짓점에만 둔다.
 */
export function glintsFor(tier: string): Glint[] {
  const lv = levelOf(tier);
  if (lv < 6) return [];
  const [t, ur] = cubeHex(tier) as [Pt, Pt, Pt, Pt, Pt, Pt];
  const out: Glint[] = [
    { x: t[0], y: t[1] + 0.9, r: 3.6 },
    { x: ur[0] - 1.6, y: ur[1] - 0.4, r: 2.6 },
  ];
  if (lv >= 7) {
    // 틀 왼위 꼭짓점(바깥 띠에서 빛을 가장 많이 받는 두 변이 만나는 곳)
    const ul = hexAround(CENTER, FRAME_OUT * coreScale(tier))[5] as Pt;
    out.push({ x: ul[0] + 0.6, y: ul[1] + 0.4, r: 3 });
  }
  const crest = crestAt(tier);
  if (lv >= 8) out.push({ x: crest[0], y: crest[1] - 6.5, r: 3.6 });
  else out.push({ x: crest[0], y: crest[1], r: 3 });
  return out;
}

/** 미리보기 「HDR 확인」의 1000 nit 흰 네모 */
export const HDR_CHECK_WHITE_SRC = "/cube/tiers/hdr-check-white.avif";
