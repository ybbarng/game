import { GEM_BOX_HALF, type Vec3 } from "./gem";

/**
 * 보석 조각의 실제 기하(docs/47 14-7, 사용자 참고 사진 「계단 컷 루비 큐브」·「안쪽 결정 구조 루비」).
 *
 * - `stepCutPlanes`(그랜드마스터 계단 컷): 조각 하나를 평면들의 교집합(볼록 다면체)으로 둔다. 면마다 넓은 테이블 둘레에 네 변 쪽으로 기운 계단
 *   띠 두 단, 꼭짓점 여덟은 비스듬히 깎는다. 빛길 셰이더는 이 평면들을 실제 벽으로 따라가고(`GEM_SHAPE == 3`), 장면은
 *   같은 평면으로 그물(`polyFromPlanes`)을 지어 실루엣·겉 반사도 깎인 모양 그대로다.
 * - `voronoiSeeds`(마스터·챌린저 결정 구조): 안쪽 결정 조각(3D 보로노이 칸)의 씨앗. 이웃 씨앗 사이 이등분 면이 안쪽 경계 면이다.
 */

export interface Plane {
  /** 바깥 법선(길이 1) */
  n: Vec3;
  /** n·x ≤ h 가 안쪽 */
  h: number;
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** 계단 띠: 면 반 변의 이만큼 밖에서 시작해 이만큼(도) 기운다 */
export const STEP_BANDS = [
  { from: 0.6, tilt: 24 },
  { from: 0.82, tilt: 50 },
] as const;
/** 꼭짓점을 깎는 깊이(꼭짓점 (s,s,s)에서 몸통 대각선 쪽으로 이만큼 들어간 곳) */
export const CORNER_CUT = 0.86;

/** 계단 컷 조각의 평면들(축 면 6, 띠 2단 × 면 6 × 변 4, 꼭짓점 8 = 62) */
export function stepCutPlanes(s = GEM_BOX_HALF): Plane[] {
  const planes: Plane[] = [];
  const axes: Vec3[] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  for (const a of axes) planes.push({ n: a, h: s });
  for (const a of axes)
    for (const e of axes) {
      if (Math.abs(dot(a, e)) > 0.5) continue;
      for (const b of STEP_BANDS) {
        const t = (b.tilt * Math.PI) / 180;
        const n = norm([
          a[0] * Math.cos(t) + e[0] * Math.sin(t),
          a[1] * Math.cos(t) + e[1] * Math.sin(t),
          a[2] * Math.cos(t) + e[2] * Math.sin(t),
        ]);
        // 면 위 점(테이블 가장자리에서 변 쪽으로 from만큼)을 지나는 평면
        const q: Vec3 = [
          a[0] * s + e[0] * b.from * s,
          a[1] * s + e[1] * b.from * s,
          a[2] * s + e[2] * b.from * s,
        ];
        planes.push({ n, h: dot(n, q) });
      }
    }
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1]) {
        const n = norm([x, y, z]);
        planes.push({ n, h: dot(n, [x * s, y * s, z * s]) * CORNER_CUT });
      }
  return planes;
}

function solve3(a: Plane, b: Plane, c: Plane): Vec3 | null {
  const [a0, a1, a2] = a.n;
  const [b0, b1, b2] = b.n;
  const [c0, c1, c2] = c.n;
  const det =
    a0 * (b1 * c2 - b2 * c1) -
    a1 * (b0 * c2 - b2 * c0) +
    a2 * (b0 * c1 - b1 * c0);
  if (Math.abs(det) < 1e-9) return null;
  const x =
    (a.h * (b1 * c2 - b2 * c1) -
      a1 * (b.h * c2 - b2 * c.h) +
      a2 * (b.h * c1 - b1 * c.h)) /
    det;
  const y =
    (a0 * (b.h * c2 - b2 * c.h) -
      a.h * (b0 * c2 - b2 * c0) +
      a2 * (b0 * c.h - b.h * c0)) /
    det;
  const z =
    (a0 * (b1 * c.h - b.h * c1) -
      a1 * (b0 * c.h - b.h * c0) +
      a.h * (b0 * c1 - b1 * c0)) /
    det;
  return [x, y, z];
}

/**
 * 평면들의 교집합(볼록 다면체)을 삼각형 목록으로. 면마다 평평한 법선(깎은 면이 또렷하게). 위치·법선은 세 값씩 이어 붙인
 * 배열이고, 면 수(실제로 남은 평면 수)도 돌려준다.
 */
export function polyFromPlanes(planes: readonly Plane[]): {
  positions: number[];
  normals: number[];
  faces: number;
} {
  const verts: Vec3[] = [];
  const eps = 1e-6;
  for (let i = 0; i < planes.length; i++)
    for (let j = i + 1; j < planes.length; j++)
      for (let k = j + 1; k < planes.length; k++) {
        const v = solve3(
          planes[i] as Plane,
          planes[j] as Plane,
          planes[k] as Plane,
        );
        if (!v) continue;
        if (planes.some((p) => dot(p.n, v) > p.h + eps)) continue;
        if (
          verts.some(
            (w) => Math.hypot(w[0] - v[0], w[1] - v[1], w[2] - v[2]) < 1e-5,
          )
        )
          continue;
        verts.push(v);
      }
  const positions: number[] = [];
  const normals: number[] = [];
  let faces = 0;
  for (const p of planes) {
    const on = verts.filter((v) => Math.abs(dot(p.n, v) - p.h) < 1e-5);
    if (on.length < 3) continue;
    faces++;
    const c: [number, number, number] = [0, 0, 0];
    for (const v of on)
      for (let a = 0; a < 3; a++)
        c[a] = (c[a] as number) + (v[a] as number) / on.length;
    // 면 위 두 축
    const ref: Vec3 = Math.abs(p.n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = norm([
      p.n[1] * ref[2] - p.n[2] * ref[1],
      p.n[2] * ref[0] - p.n[0] * ref[2],
      p.n[0] * ref[1] - p.n[1] * ref[0],
    ]);
    const w: Vec3 = [
      p.n[1] * u[2] - p.n[2] * u[1],
      p.n[2] * u[0] - p.n[0] * u[2],
      p.n[0] * u[1] - p.n[1] * u[0],
    ];
    const ang = (v: Vec3) => {
      const d: Vec3 = [v[0] - c[0], v[1] - c[1], v[2] - c[2]];
      return Math.atan2(dot(d, w), dot(d, u));
    };
    const ring = [...on].sort((a, b) => ang(a) - ang(b));
    for (let t = 1; t + 1 < ring.length; t++)
      for (const v of [ring[0], ring[t], ring[t + 1]] as Vec3[]) {
        positions.push(...v);
        normals.push(...p.n);
      }
  }
  return { positions, normals, faces };
}

/** 씨앗을 고정한 결정적 난수(0~1) */
function rand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** 반 변 `half` 상자 안에 고르게 흩은 보로노이 씨앗 `count`개(씨앗 고정) */
export function voronoiSeeds(
  count: number,
  half: number,
  seed: number,
): Vec3[] {
  const r = rand(seed);
  const out: Vec3[] = [];
  for (let i = 0; i < count; i++)
    out.push([
      (r() * 2 - 1) * half * 0.92,
      (r() * 2 - 1) * half * 0.92,
      (r() * 2 - 1) * half * 0.92,
    ]);
  return out;
}

/** 점에 가장 가까운 씨앗 번호 */
export function nearestSeed(seeds: readonly Vec3[], p: Vec3): number {
  let best = 0;
  let bd = Number.POSITIVE_INFINITY;
  seeds.forEach((s, i) => {
    const d = (s[0] - p[0]) ** 2 + (s[1] - p[1]) ** 2 + (s[2] - p[2]) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}
