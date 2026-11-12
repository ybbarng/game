/**
 * 엠블럼 보석의 빛길(docs/47 14-7 「셋째 시안」). three.js의 투과(transmission)는 화면에 미리 그린 불투명한 뒤 그림을
 * 한 번 굴절해 비추는 얇은 유리 흉내라, 보석 안의 전반사(빛이 안에서 튕겨 윗면으로 돌아오는 것)가 없고 이웃 보석도
 * 보지 못한다. 그래서 보석 조각마다 안에서 빛길을 직접 따라간다:
 *
 * 1. 눈에서 온 빛이 겉면에서 굴절해 들어간다(들어가지 못한 몫은 겉 반사로 재질이 그린다).
 * 2. 안에서 벽에 닿을 때마다 프레넬 식으로 나가는 몫과 되튀는 몫을 나눈다. 임계각보다 비스듬하면 모두 되튄다(전반사).
 * 3. 나가는 몫은 그 방향의 스튜디오 빛(반사 지도)을 가져온다. 지나온 길이만큼 색이 흡수된다(비어-람베르트).
 * 4. 분산: 빨강·초록·파랑의 굴절률을 조금씩 달리해 세 번 따라간다(다이아몬드·챌린저의 무지개).
 *
 * 이 파일의 `traceGem`은 셰이더(GLSL·TSL)와 같은 계산을 JS로 옮긴 기준 구현이다. 셰이더를 고치면 함께 고치고,
 * 단위 시험이 물리 성질(전반사, 에너지 보존, 흡수)을 이것으로 확인한다.
 */

import { type FacetCut, facetNormal } from "./gemStyle";

export type Vec3 = readonly [number, number, number];

/** 보석 조각 모양(물체 좌표). 상자는 큐브 조각·왕관, 팔면체는 꼭짓점·볏·아래 보석, 판은 날개 조각 */
export type GemShape = "box" | "octa" | "slab";

/** 큐브 조각 반 변(`CUBIE` 0.92의 절반) */
export const GEM_BOX_HALF = 0.46;
/** 팔면체 보석은 반지름 1로 만들고 크기는 물체 배율로 준다 */
export const GEM_OCTA_R = 1;
/** 날개 조각 판 반두께(두께 0.04 + 베벨 0.03) */
export const GEM_SLAB_HALF = 0.05;
/** 안에서 벽에 닿는 횟수 */
export const GEM_BOUNCES = 5;

/** 보석 물리 값 */
export interface GemPhysics {
  /** 굴절률(나트륨 D선). 실제 보석 값 */
  ior: number;
  /** 빨강과 파랑의 굴절률 차이(화면용으로 키운 값, 실제 값은 `realDispersion`) */
  spread: number;
  /** 단위 길이당 흡수(선형 빨강·초록·파랑). 조각 한 변 0.92 */
  absorb: Vec3;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): Vec3 => mul(a, 1 / Math.hypot(a[0], a[1], a[2]));

/** GLSL `reflect` */
export function reflect(i: Vec3, n: Vec3): Vec3 {
  return sub(i, mul(n, 2 * dot(n, i)));
}

/** GLSL `refract`(n은 i 반대쪽, eta = n1/n2). 전반사면 null */
export function refract(i: Vec3, n: Vec3, eta: number): Vec3 | null {
  const c = dot(n, i);
  const k = 1 - eta * eta * (1 - c * c);
  if (k < 0) return null;
  return sub(mul(i, eta), mul(n, eta * c + Math.sqrt(k)));
}

/** 편광 없는 빛의 프레넬 반사율(n1 쪽에서 cosI로 닿을 때). 임계각을 넘으면 1 */
export function fresnel(cosI: number, n1: number, n2: number): number {
  const s = (n1 / n2) * Math.sqrt(Math.max(0, 1 - cosI * cosI));
  if (s >= 1) return 1;
  const cosT = Math.sqrt(1 - s * s);
  const rs = (n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT + 1e-6);
  const rp = (n1 * cosT - n2 * cosI) / (n1 * cosT + n2 * cosI + 1e-6);
  return 0.5 * (rs * rs + rp * rp);
}

/** 임계각(라디안): 이보다 비스듬히 안에서 벽에 닿으면 모두 되튄다 */
export function criticalAngle(ior: number): number {
  return Math.asin(1 / ior);
}

const OCTA_N: Vec3[] = [];
for (const x of [-1, 1])
  for (const y of [-1, 1])
    for (const z of [-1, 1]) OCTA_N.push(norm([x, y, z]));

/** 안에서 나가는 벽까지 거리와 그 벽의 바깥 법선 */
export function exitOf(
  shape: GemShape,
  p: Vec3,
  d: Vec3,
): { t: number; m: Vec3 } {
  if (shape === "octa") {
    let t = Number.POSITIVE_INFINITY;
    let m: Vec3 = [0, 0, 1];
    for (const n of OCTA_N) {
      const dn = dot(n, d);
      if (dn <= 1e-6) continue;
      const tk = (GEM_OCTA_R / Math.sqrt(3) - dot(n, p)) / dn;
      if (tk < t) {
        t = tk;
        m = n;
      }
    }
    return { t: Math.max(0, t), m };
  }
  if (shape === "slab") {
    const sz = Math.sign(d[2]) || 1;
    return {
      t: Math.max(
        0,
        (GEM_SLAB_HALF - p[2] * sz) / Math.max(Math.abs(d[2]), 1e-5),
      ),
      m: [0, 0, sz],
    };
  }
  let best = 0;
  let t = Number.POSITIVE_INFINITY;
  for (let k = 0; k < 3; k++) {
    const s = Math.sign(d[k] as number);
    const tk =
      (GEM_BOX_HALF - (p[k] as number) * s) /
      Math.max(Math.abs(d[k] as number), 1e-5);
    if (tk < t) {
      t = tk;
      best = k;
    }
  }
  const m: [number, number, number] = [0, 0, 0];
  m[best] = Math.sign(d[best] as number) || 1;
  return { t: Math.max(0, t), m };
}

/**
 * 안쪽 벽의 깎은 면 법선. 기운 면이 빛줄기와 거의 나란하면(빛이 그 면을 등지면) 깎지 않은 벽으로 본다(셰이더와 같다)
 */
export function wallFacet(cut: FacetCut, p: Vec3, d: Vec3, m: Vec3): Vec3 {
  const f = facetNormal(cut, p, m, GEM_BOX_HALF);
  return dot(d, f) > 0.05 ? f : m;
}

/** 보석에서 나가는 빛 한 줄기: 나가는 방향과 그 몫(한 색 채널) */
export interface GemExit {
  dir: Vec3;
  weight: number;
  /** 전반사로 되튄 뒤 나갔는지 */
  afterTir: boolean;
  /** 나가기까지 보석 안을 지난 길이 */
  path: number;
}

/**
 * 한 색 채널의 빛길을 따라간다(셰이더와 같은 계산). `p`는 겉면 위 점, `v`는 눈에서 그 점으로 가는 방향, `n`은 그 겉면의
 * 바깥 법선. 겉 반사 몫(`reflect`)과 나가는 빛 목록, 마지막에 남은 몫(셰이더는 그 방향으로 나간다고 본다)을 돌려준다.
 */
export function traceGem(
  shape: GemShape,
  p0: Vec3,
  v0: Vec3,
  n0: Vec3,
  ior: number,
  absorb: number,
  bounces = GEM_BOUNCES,
  cut?: FacetCut,
): { reflect: number; exits: GemExit[]; left: number; path: number } {
  const v = norm(v0);
  const facet = cut && cut.kind !== 0 && shape === "box" ? cut : null;
  const n = facet ? facetNormal(facet, p0, n0, GEM_BOX_HALF) : norm(n0);
  const cosI = Math.min(1, Math.max(0, -dot(v, n)));
  const R = fresnel(cosI, 1, ior);
  let d = refract(v, n, 1 / ior) ?? v;
  let p = sub(p0, mul(n, 1e-4));
  let thr = 1 - R;
  let path = 0;
  let tir = false;
  const exits: GemExit[] = [];
  for (let i = 0; i < bounces; i++) {
    const hit = exitOf(shape, p, d);
    const t = hit.t;
    p = add(p, mul(d, t));
    const m = facet ? wallFacet(facet, p, d, hit.m) : hit.m;
    path += t;
    thr *= Math.exp(-absorb * t);
    const F = fresnel(dot(d, m), ior, 1);
    if (F < 1) {
      const o = refract(d, mul(m, -1), ior) ?? d;
      exits.push({ dir: o, weight: thr * (1 - F), afterTir: tir, path });
    } else tir = true;
    thr *= F;
    d = reflect(d, m);
    p = sub(p, mul(m, 1e-4));
  }
  return { reflect: R, exits, left: thr, path };
}

/**
 * 나가는 빛이 어디를 보는가(2026-11-12 「투명한 보석이 아니라 금속 느낌」 뒤). 예전에는 나가는 빛이 모두 스튜디오
 * 반사 지도만 읽어, 보석 너머 배경판이 전혀 비치지 않고 거울처럼(금속처럼) 보였다. 이제 눈이 보던 방향에서 크게
 * 벗어나지 않고 뒤로 나가는 빛(보석을 「꿰뚫어 보는」 빛)은 뒤 배경판을 읽고, 안에서 되튀어 옆·앞으로 나가는 빛은
 * 스튜디오 빛을 읽는다. 둘 사이는 눈 방향과 이루는 각으로 부드럽게 섞는다.
 */
export const THROUGH_LO = Math.cos((55 * Math.PI) / 180);
export const THROUGH_HI = Math.cos((25 * Math.PI) / 180);

/** GLSL `smoothstep` */
export function smoothstep(lo: number, hi: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

/** 나가는 빛 가운데 뒤 배경을 읽는 몫. `cosView`는 나가는 방향과 눈이 보는 방향(눈 → 보석)의 내적 */
export function throughWeight(cosView: number): number {
  return smoothstep(THROUGH_LO, THROUGH_HI, cosView);
}

/**
 * 큐브 전체(조각 27개, 반 변 `GEM_CUBE_HALF`)를 상자 하나로 보고, 점 p에서 d로 갈 때 상자 안을 지나는 길이. 꿰뚫어
 * 보는 빛이 뒤쪽 조각들을 지나며 더 흡수되게 해서, 두꺼운 가운데는 짙고 얇은 가장자리는 맑게 보인다.
 */
export const GEM_CUBE_HALF = 1.46;
/** 큐브 안 길이 가운데 보석이 차지하는 몫(조각 한 변 0.92, 간격 1) */
export const GEM_CUBE_FILL = 0.92;

export function boxPath(p: Vec3, d: Vec3, half: number): number {
  let t0 = 0;
  let t1 = Number.POSITIVE_INFINITY;
  for (let k = 0; k < 3; k++) {
    const pk = p[k] as number;
    const dk = d[k] as number;
    if (Math.abs(dk) < 1e-6) {
      if (Math.abs(pk) > half) return 0;
      continue;
    }
    let a = (-half - pk) / dk;
    let b = (half - pk) / dk;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
  }
  return Math.max(0, t1 - t0);
}

/** 실제 분산 값(B–G 굴절률 차, 보석학 표준 값). 문서·시험용 */
export const REAL = {
  emerald: { ior: 1.577, dispersion: 0.014 },
  amethyst: { ior: 1.544, dispersion: 0.013 },
  ruby: { ior: 1.77, dispersion: 0.018 },
  diamond: { ior: 2.417, dispersion: 0.044 },
} as const;
