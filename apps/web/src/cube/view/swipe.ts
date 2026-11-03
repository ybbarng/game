import { layerOfCoord, normalOf, normalVec, type Vec3 } from "./geometry";
import type { Axis, CubeMove, Normal } from "./types";

/**
 * 휴대폰 밀어서 돌리기의 계산(three.js 없이, 시험한다).
 *
 * - 칸 위를 밀면: 민 방향을 그 면의 두 축(면 위의 오른쪽·아래 같은 두 방향)에 투영해 더 큰 쪽을 고르고,
 *   그 칸이 든 층을 민 방향으로 돌린다. 면의 바깥 방향 N과 고른 방향 A에서 도는 축은 N × A다
 *   (축 N × A를 오른손 법칙으로 +90° 돌리면 면 N 위의 점이 A 쪽으로 간다).
 * - 빈 곳을 밀면: 큐브 전체를 민 방향으로 돌린다(x·y·z). 도는 축은 (보는 쪽) × (민 방향)에 가장 가까운 축.
 */

export interface SwipeHit {
  /** 민 칸이 붙은 조각의 중심(큐브 가운데가 원점, 간격 1) */
  center: Vec3;
  /** 민 칸이 향하는 쪽 */
  normal: Normal;
}

const AXES: readonly Axis[] = ["x", "y", "z"];

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function unit(index: 0 | 1 | 2, sign: 1 | -1): Vec3 {
  return [
    index === 0 ? sign : 0,
    index === 1 ? sign : 0,
    index === 2 ? sign : 0,
  ];
}

/** 가장 큰 성분의 축과 부호. 모두 거의 0이면 null */
function dominant(v: Vec3): { index: 0 | 1 | 2; sign: 1 | -1 } | null {
  let index: 0 | 1 | 2 = 0;
  for (const i of [1, 2] as const)
    if (Math.abs(v[i]) > Math.abs(v[index])) index = i;
  if (Math.abs(v[index]) < 1e-9) return null;
  return { index, sign: v[index] > 0 ? 1 : -1 };
}

/**
 * 큐브 겉(한 변 n, 가운데가 원점) 위의 점 → 그 점이 든 칸.
 * 면은 가장 바깥으로 나온 축으로, 조각은 나머지 두 축의 칸 번호로 정한다.
 */
export function cellOfPoint(n: number, p: Vec3): SwipeHit {
  const face = dominant(p) ?? { index: 0, sign: 1 };
  const h = (n - 1) / 2;
  const coord = (i: 0 | 1 | 2): number => {
    if (i === face.index) return face.sign * h;
    const cell = Math.min(n - 1, Math.max(0, Math.floor(p[i] + n / 2)));
    return cell - h;
  };
  return {
    center: [coord(0), coord(1), coord(2)],
    normal: normalOf(unit(face.index, face.sign)),
  };
}

/**
 * 밀기 하나 → 수. `swipe`는 민 방향(세계 좌표, 크기 상관없음), `toward`는 큐브에서 보는 사람 쪽 방향.
 * `hit`이 없으면 큐브 전체 돌리기. 방향을 정할 수 없으면 null.
 */
export function swipeToMove(
  n: number,
  hit: SwipeHit | null,
  swipe: Vec3,
  toward: Vec3,
): CubeMove | null {
  let rotation: Vec3;
  if (hit) {
    const N = normalVec(hit.normal);
    // 면 위로 투영한 뒤 면의 두 축 가운데 더 큰 쪽
    const along = swipe[0] * N[0] + swipe[1] * N[1] + swipe[2] * N[2];
    const flat: Vec3 = [
      swipe[0] - along * N[0],
      swipe[1] - along * N[1],
      swipe[2] - along * N[2],
    ];
    const d = dominant(flat);
    if (!d) return null;
    rotation = cross(N, unit(d.index, d.sign));
  } else {
    rotation = cross(toward, swipe);
  }
  const r = dominant(rotation);
  if (!r) return null;
  const axis = AXES[r.index] as Axis;
  // +축으로 +90°(반시계)는 turns 3, -축으로 +90°는 +축으로 -90°(시계)라 turns 1
  const turns = r.sign > 0 ? 3 : 1;
  if (!hit) return { axis, from: 1, to: n, turns };
  const layer = layerOfCoord(n, hit.center[r.index]);
  return { axis, from: layer, to: layer, turns };
}
