import type { Vec3 } from "./geometry";
import type { SwipeHit } from "./swipe";
import type { MarkTone, Normal, Sticker } from "./types";

/**
 * 뒷면 거울 판(docs/47 5절, 2026-11-04). three.js 없이 계산만 한다(3D 장면과 시험이 함께 쓴다).
 *
 * 기본 각(위-앞-오른쪽)에서 안 보이는 세 면(세계 좌표로 -z 뒤, -x 왼쪽, -y 아래)을 큐브 바깥 빈자리에
 * 납작한 n×n 판으로 띄운다. 판에 보이는 모습은 **거울상**이다: 그 면 앞(큐브 바깥)에 거울을 세웠을 때처럼,
 * 스티커는 큐브에서의 세계 좌표(면 위 두 축)를 그대로 판 위 자리로 쓴다. 그래서 큐브의 위-오른쪽-뒤 꼭짓점에
 * 붙은 뒷면 칸은 뒤 판의 위-오른쪽에 온다(모서리와 판의 자리가 바로 이어진다).
 *
 * 판은 늘 그때 세계의 -x·-y·-z를 향한 칸을 보이므로, 큐브 전체 돌리기(x·y·z) 뒤에는 저절로 다른 면이 온다.
 * 판은 그 면과 **평행**하게 둔다(2026-11-05). 판의 칸 줄이 큐브 테두리 선과 나란해, 화면에서 판이 그 면을 옮겨 놓은
 * 것처럼 보이고 칸 하나하나를 큐브 칸으로 따라가기 쉽다(카메라 쪽으로 기울였던 판은 화면에서 제각각 돌아 보여 헷갈렸다).
 */

export type BackNormal = "-z" | "-x" | "-y";

/** 판 차례: 뒤, 왼쪽, 아래 */
export const BACK_NORMALS: readonly BackNormal[] = ["-z", "-x", "-y"];

/** 판을 놓을 기준 각(큐브 화면의 기본 보기와 같다) */
export const MIRROR_YAW = 32;
export const MIRROR_PITCH = 26;

/** 판 위 칸 간격(큐브 칸 간격 1에 대해). 판을 큐브보다 작게 두어야 큐브가 화면에서 작아지지 않는다 */
export const MIRROR_CELL = 0.6;

/** 판 테두리 여백(판 칸 단위, 한 변 n + 2·PAD 칸) */
export const MIRROR_PAD = 0.28;

/** 판의 오른쪽·위(그 면의 두 세계 축. 카메라에서 볼 때 화면의 오른쪽·위 쪽을 향한다) */
const FLAT: Record<BackNormal, { right: Vec3; up: Vec3 }> = {
  "-z": { right: [1, 0, 0], up: [0, 1, 0] },
  "-x": { right: [0, 0, -1], up: [0, 1, 0] },
  "-y": { right: [1, 0, 0], up: [0, 0, -1] },
};

const OUT: Record<BackNormal, Vec3> = {
  "-z": [0, 0, -1],
  "-x": [-1, 0, 0],
  "-y": [0, -1, 0],
};

export interface MirrorPanel {
  normal: BackNormal;
  /** 판 가운데(세계 좌표) */
  center: Vec3;
  /** 판 위 오른쪽·위 방향(단위 벡터) */
  right: Vec3;
  up: Vec3;
  /** 판이 보는 쪽(단위 벡터, 카메라 쪽) */
  facing: Vec3;
}

export interface MirrorCell {
  panel: BackNormal;
  /** 판 위 자리(칸 가운데, 판 가운데가 0, 간격 1, -h..h) */
  u: number;
  v: number;
  color: number | null;
  mark: MarkTone | null;
  /** 이 칸이 비추는 큐브의 칸(조각 중심·향하는 쪽). 누르면 큐브의 그 칸을 누른 것과 같다 */
  hit: SwipeHit;
}

// ---------------------------------------------------------------- 벡터

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: Vec3, b: Vec3, s = 1): Vec3 => [
  a[0] + b[0] * s,
  a[1] + b[1] * s,
  a[2] + b[2] * s,
];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const rad = (deg: number) => (deg * Math.PI) / 180;

/** 보는 쪽(원점에서 카메라로, 단위 벡터). cube-view의 카메라 자리와 같은 식 */
export function viewDir(yaw: number, pitch: number): Vec3 {
  const y = rad(yaw);
  const p = rad(pitch);
  return [Math.cos(p) * Math.sin(y), Math.sin(p), Math.cos(p) * Math.cos(y)];
}

/** 카메라의 화면 오른쪽·위(세계 좌표, 단위 벡터) */
export function viewBasis(
  yaw: number,
  pitch: number,
): { right: Vec3; up: Vec3; toward: Vec3 } {
  const y = rad(yaw);
  const p = rad(pitch);
  return {
    right: [Math.cos(y), 0, -Math.sin(y)],
    up: [-Math.sin(p) * Math.sin(y), Math.cos(p), -Math.sin(p) * Math.cos(y)],
    toward: viewDir(yaw, pitch),
  };
}

// ---------------------------------------------------------------- 2D 겹침

type P2 = readonly [number, number];

function hull(points: readonly P2[]): P2[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const turn = (o: P2, a: P2, b: P2) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P2[] = [];
  for (const q of p) {
    while (
      lower.length >= 2 &&
      turn(lower[lower.length - 2] as P2, lower[lower.length - 1] as P2, q) <= 0
    )
      lower.pop();
    lower.push(q);
  }
  const upper: P2[] = [];
  for (const q of [...p].reverse()) {
    while (
      upper.length >= 2 &&
      turn(upper[upper.length - 2] as P2, upper[upper.length - 1] as P2, q) <= 0
    )
      upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * 두 볼록 다각형 사이의 틈(분리축). 양수면 그만큼 떨어져 있고, 0 이하면 겹친다
 */
export function polygonGap(a: readonly P2[], b: readonly P2[]): number {
  let best = Number.NEGATIVE_INFINITY;
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i] as P2;
      const q = poly[(i + 1) % poly.length] as P2;
      const ex = q[0] - p[0];
      const ey = q[1] - p[1];
      const l = Math.hypot(ex, ey);
      if (l < 1e-9) continue;
      const nx = -ey / l;
      const ny = ex / l;
      const proj = (pts: readonly P2[]) =>
        pts.map((r) => r[0] * nx + r[1] * ny);
      const pa = proj(a);
      const pb = proj(b);
      const gap = Math.max(
        Math.min(...pb) - Math.max(...pa),
        Math.min(...pa) - Math.max(...pb),
      );
      best = Math.max(best, gap);
    }
  return best;
}

/** 큐브 모서리 8개 */
function cubeCorners(n: number): Vec3[] {
  const h = n / 2;
  const out: Vec3[] = [];
  for (const x of [-h, h])
    for (const y of [-h, h]) for (const z of [-h, h]) out.push([x, y, z]);
  return out;
}

/** 판 테두리 네 꼭짓점(세계 좌표) */
export function panelCorners(n: number, p: MirrorPanel): Vec3[] {
  const s = (n / 2 + MIRROR_PAD) * MIRROR_CELL;
  return [
    [-s, -s],
    [s, -s],
    [s, s],
    [-s, s],
  ].map(([u, v]) => add(add(p.center, p.right, u), p.up, v));
}

/** 세계 점들을 기준 각의 화면(정사영)으로 */
export function projectAll(
  points: readonly Vec3[],
  yaw = MIRROR_YAW,
  pitch = MIRROR_PITCH,
): P2[] {
  const b = viewBasis(yaw, pitch);
  return points.map((q) => [dot(q, b.right), dot(q, b.up)] as const);
}

/** 화면에서 큐브와 판 사이에 두는 틈(큐브 한 변 기준) */
function marginFor(n: number): number {
  return 0.3 + 0.06 * n;
}

/**
 * 판 셋의 자리. 판은 그 면 바깥으로 조금 띄우고, 기준 각의 화면에서 그 면이 있는 쪽(뒤는 위-오른쪽, 왼쪽은 왼쪽,
 * 아래는 아래)으로 큐브와 겹치지 않을 만큼 옮긴다. 판 위 칸의 차례는 그 면 앞에 거울을 세운 것과 같다
 */
export function mirrorPanels(
  n: number,
  yaw = MIRROR_YAW,
  pitch = MIRROR_PITCH,
): MirrorPanel[] {
  const toward = viewDir(yaw, pitch);
  const cube = hull(projectAll(cubeCorners(n), yaw, pitch));
  const margin = marginFor(n);
  return BACK_NORMALS.map((normal) => {
    const out = OUT[normal];
    // 판은 그 면과 평행하고 큐브 쪽(카메라 쪽)을 본다. 칸 줄이 큐브 테두리 선과 나란하다
    const facing = scale(out, -1);
    const { right, up } = FLAT[normal];
    // 면 바깥으로 조금 띄운 뒤, 그 면이 화면에 비칠 쪽(바깥 방향을 화면에 놓은 쪽)으로 화면과 나란히 옮긴다.
    // 뒤로만 밀면 화면에서 조금씩만 움직여(뒤 판은 한 칸 밀 때 0.65칸) 큐브가 작아졌다
    const base = scale(out, n / 2 + 0.35);
    const side = norm(add(out, toward, -dot(out, toward)));
    const make = (s: number): MirrorPanel => ({
      normal,
      center: add(base, side, s),
      right,
      up,
      facing,
    });
    let s = 0;
    for (let i = 0; i < 400; i++) {
      const poly = hull(projectAll(panelCorners(n, make(s)), yaw, pitch));
      if (polygonGap(cube, poly) >= margin) break;
      s += 0.05;
    }
    return make(s);
  });
}

// ---------------------------------------------------------------- 칸

/**
 * 스티커 목록(세계 좌표) → 판 위 칸. 지금 세계의 -x·-y·-z를 향한 칸만 판에 오른다.
 * 스티커의 `center`는 조각 중심, 판 위 자리는 그 중심을 기울이기 전 판의 두 축에 놓은 값이다(거울상)
 */
export function mirrorCells(stickers: readonly Sticker[]): MirrorCell[] {
  const out: MirrorCell[] = [];
  for (const s of stickers) {
    const panel = s.normal as Normal as BackNormal;
    if (!BACK_NORMALS.includes(panel)) continue;
    const f = FLAT[panel];
    out.push({
      panel,
      u: dot(s.center, f.right) + 0,
      v: dot(s.center, f.up) + 0,
      color: s.color,
      mark: s.mark ?? null,
      hit: { center: s.center, normal: s.normal },
    });
  }
  return out;
}

/** 판 위 칸 가운데의 세계 좌표(u·v는 칸 단위) */
export function cellPoint(p: MirrorPanel, u: number, v: number): Vec3 {
  return add(add(p.center, p.right, u * MIRROR_CELL), p.up, v * MIRROR_CELL);
}

/**
 * 판 평면 위의 점 → 그 점이 든 칸이 비추는 큐브 칸. 판 바깥(테두리 여백 포함)이면 null
 */
export function mirrorHitAt(
  n: number,
  p: MirrorPanel,
  point: Vec3,
): SwipeHit | null {
  const rel = add(point, p.center, -1);
  const lu = dot(rel, p.right) / MIRROR_CELL;
  const lv = dot(rel, p.up) / MIRROR_CELL;
  const half = n / 2;
  if (Math.abs(lu) > half || Math.abs(lv) > half) return null;
  const h = (n - 1) / 2;
  const cell = (c: number) =>
    Math.min(n - 1, Math.max(0, Math.floor(c + half))) - h;
  const u = cell(lu);
  const v = cell(lv);
  const f = FLAT[p.normal];
  const c = add(add(scale(OUT[p.normal], h), f.right, u), f.up, v);
  return {
    center: [c[0] + 0, c[1] + 0, c[2] + 0],
    normal: p.normal,
  };
}

/**
 * 판 평면과 광선이 만나는 점(광선 시작 o, 방향 d). 판 앞쪽(보는 쪽)에서 오는 광선만 받는다
 */
export function rayPanel(
  p: MirrorPanel,
  o: Vec3,
  d: Vec3,
): { t: number; point: Vec3 } | null {
  const denom = dot(d, p.facing);
  if (denom > -1e-6) return null;
  const t = dot(add(p.center, o, -1), p.facing) / denom;
  if (t <= 0) return null;
  return { t, point: add(o, d, t) };
}

// ---------------------------------------------------------------- 보기

/**
 * 판이 얼마나 보일지(0~1). 기준 각에서 1, 둘러보거나 살짝 보기로 각이 멀어질수록 흐려지다 사라진다
 * (뒤에서 보면 판이 큐브 앞을 가린다)
 */
export function mirrorAlpha(yaw: number, pitch: number): number {
  const dy = ((((yaw - MIRROR_YAW) % 360) + 540) % 360) - 180;
  const dev = Math.hypot(dy, pitch - MIRROR_PITCH);
  if (dev <= 3) return 1;
  if (dev >= 60) return 0;
  return Math.max(0, 1 - (dev - 3) / 40) ** 1.5;
}

export interface Frame {
  /** 카메라가 바라보는 점 */
  target: Vec3;
  /** 바라보는 점에서 카메라까지 */
  dist: number;
}

/**
 * 큐브와 판 셋이 화면에 다 들어오는 카메라(기준 각). `fovDeg`는 세로 시야각
 */
export function mirrorFrame(
  n: number,
  panels: readonly MirrorPanel[],
  aspect: number,
  fovDeg = 30,
  yaw = MIRROR_YAW,
  pitch = MIRROR_PITCH,
): Frame {
  const b = viewBasis(yaw, pitch);
  const pts = [...cubeCorners(n), ...panels.flatMap((p) => panelCorners(n, p))];
  const xs = pts.map((q) => dot(q, b.right));
  const ys = pts.map((q) => dot(q, b.up));
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const target = add(scale(b.right, cx), b.up, cy);
  const tanV = Math.tan(rad(fovDeg) / 2);
  const tanH = tanV * aspect;
  let dist = 0;
  for (const q of pts) {
    const r = add(q, target, -1);
    const z = dot(r, b.toward);
    dist = Math.max(
      dist,
      Math.abs(dot(r, b.right)) / tanH + z,
      Math.abs(dot(r, b.up)) / tanV + z,
    );
  }
  return { target, dist: dist * 1.04 };
}
