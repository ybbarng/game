import { fresnel, GEM_BOX_HALF, reflect, refract, type Vec3 } from "./gem";

/**
 * 큐브 전체 빛길(docs/47 14-7 「일곱째 시안」, 2026-11-12 사용자 「내부에 사각형 공간이 따로 진하게 보이는 게 매우
 * 어색하거든. 원래 사각형 보석들을 큐브처럼 모은다면 저렇게 보이게 돼?」).
 *
 * 그때까지의 빛길(`gem.ts` `traceGem`)은 조각 하나 안에서만 따라가, 옆면으로 나간 빛이 이웃 유리에 들어가지 않고
 * 바로 방을 읽었다. 그래서 조각 둘레 띠가 실제보다 어둡고 가운데 사각형이 따로 진해 보였다. 여기서는 큐브 좌표(조각
 * 간격 1, 가운데 0)로 따라간다.
 *
 * - `whole`(시안 h): 큐브 전체를 유리 상자 하나로(반 변 `half`). 조각 경계는 겉면의 가는 틈 자국뿐이다.
 * - `grid`(시안 i): 조각 27개(반 변 `GEM_BOX_HALF`, 틈 `GRID_GAP`)를 건너간다. 이웃 조각이 있는 면에서는 전반사가
 *   아니면 틈을 지나 이웃 조각으로 곧게 들어간다(평행한 두 면이라 방향은 그대로, 틈의 얕은 반사는 넣지 않는다).
 *   전반사면 되튄다. 큐브 바깥 면에서만 프레넬로 나눠 나가는 빛이 배경·방을 읽는다.
 *
 * 셰이더(`gemMaterial.ts` `gemTraceCube`)와 같은 계산이고, 단위 시험이 「조각마다 진한 안쪽 사각형이 없다」를 이것으로 본다.
 */

export type CubeTraceMode = "whole" | "grid";

/** 붙은 유리 큐브(시안 g·h)의 조각 한 변: 틈 0.01만 남긴다 */
export const FUSED_CUBIE = 0.99;
/** 시안 h의 유리 상자 반 변(붙은 조각 바깥 면까지) */
export const CUBE_WHOLE_HALF = 1 + FUSED_CUBIE / 2;
/** 조각 사이 틈(간격 1 − 조각 한 변) */
export const GRID_GAP = 1 - 2 * GEM_BOX_HALF;
/** 시안 i의 벽 닿는 횟수(조각을 건너는 것도 한 번으로 센다) */
export const GRID_BOUNCES = 9;
/** 시안 h의 벽 닿는 횟수 */
export const WHOLE_BOUNCES = 6;

export interface CubeExit {
  dir: Vec3;
  weight: number;
  /** 나가기까지 유리 안을 지난 길이(색이 짙어지는 정도) */
  path: number;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): Vec3 => mul(a, 1 / Math.hypot(a[0], a[1], a[2]));

/** 가장 큰 성분 축 법선(겉면은 평평한 상자 면으로 본다) */
export function axisOf(n: Vec3): Vec3 {
  const a = n.map(Math.abs);
  const k =
    (a[0] as number) >= (a[1] as number) && (a[0] as number) >= (a[2] as number)
      ? 0
      : (a[1] as number) >= (a[2] as number)
        ? 1
        : 2;
  const m: [number, number, number] = [0, 0, 0];
  m[k] = Math.sign(n[k] as number) || 1;
  return m;
}

/**
 * 큐브 좌표에서 한 색 채널의 빛길. `p0`는 겉면 위 점, `v0`는 눈에서 그 점으로 가는 방향, `n0`는 그 면의 바깥 법선,
 * `cell0`은 그 점이 속한 조각 자리(정수, `whole`이면 무시), `half`는 `whole`의 상자 반 변.
 */
export function traceCube(
  mode: CubeTraceMode,
  p0: Vec3,
  v0: Vec3,
  n0: Vec3,
  ior: number,
  absorb: number,
  cell0: Vec3,
  half = CUBE_WHOLE_HALF,
  maxBounces?: number,
): {
  reflect: number;
  exits: CubeExit[];
  left: number;
  leftDir: Vec3;
  path: number;
} {
  const v = norm(v0);
  const n = axisOf(n0);
  const H = mode === "whole" ? half : GEM_BOX_HALF;
  let cell: Vec3 = mode === "whole" ? [0, 0, 0] : cell0;
  const cosI = Math.min(1, Math.max(0, -dot(v, n)));
  const R = fresnel(cosI, 1, ior);
  let d = refract(v, n, 1 / ior) ?? v;
  let p = add(p0, mul(n, -1e-4));
  let thr = 1 - R;
  let path = 0;
  const exits: CubeExit[] = [];
  const bounces =
    maxBounces ?? (mode === "grid" ? GRID_BOUNCES : WHOLE_BOUNCES);
  for (let i = 0; i < bounces; i++) {
    let t = Number.POSITIVE_INFINITY;
    let k = 0;
    for (let a = 0; a < 3; a++) {
      const s = Math.sign(d[a] as number) || 1;
      const ta =
        (H - ((p[a] as number) - (cell[a] as number)) * s) /
        Math.max(Math.abs(d[a] as number), 1e-5);
      if (ta < t) {
        t = ta;
        k = a;
      }
    }
    t = Math.max(0, t);
    const m: [number, number, number] = [0, 0, 0];
    m[k] = Math.sign(d[k] as number) || 1;
    p = add(p, mul(d, t));
    path += t;
    thr *= Math.exp(-absorb * t);
    const F = fresnel(dot(d, m), ior, 1);
    if (mode === "grid") {
      const next = add(cell, m);
      if (Math.max(...next.map(Math.abs)) < 1.5) {
        if (F < 1) {
          // 틈을 지나 이웃 조각으로(평행한 두 면이라 방향은 그대로)
          p = add(p, mul(d, GRID_GAP / dot(d, m)));
          cell = next;
        } else {
          d = reflect(d, m);
          p = add(p, mul(m, -1e-4));
        }
        continue;
      }
    }
    if (F < 1) {
      const o = refract(d, mul(m, -1), ior) ?? d;
      exits.push({ dir: o, weight: thr * (1 - F), path });
    }
    thr *= F;
    d = reflect(d, m);
    p = add(p, mul(m, -1e-4));
  }
  return { reflect: R, exits, left: thr, leftDir: d, path };
}
