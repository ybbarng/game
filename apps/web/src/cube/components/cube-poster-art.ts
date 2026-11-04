import { normalVec, type Vec3 } from "../view/geometry";
import type { Normal, Sticker } from "../view/types";

/**
 * 비스듬히 본 큐브 그림(SVG)의 모양 계산. 3D 장면(`view/cube-view.ts`)과 같은 카메라·같은 조각 크기로
 * 원근 투영해, 3D가 뜨기 전·못 뜰 때 그 자리에 같은 모습으로 놓는다(첫 화면 `CubeHero`).
 * three.js를 싣지 않으려고 장면의 값을 여기 따로 적었다. 장면 값이 바뀌면 `cube-poster-art.test.ts`가 알린다.
 */

/** 3D 장면의 기본 보기(cube-view.ts DEFAULT_YAW·DEFAULT_PITCH, PerspectiveCamera fov) */
export const SCENE_CAMERA = { yaw: 32, pitch: 26, fov: 30 } as const;
/** 조각 한 변(cube-view.ts CUBIE)과 모서리 둥글기(CUBIE_RADIUS) */
export const SCENE_CUBIE = 0.97;
export const SCENE_CUBIE_RADIUS = 0.1;
/** 스티커 한 변·둥글기(cube-view.ts stickerGeometry) */
export const SCENE_STICKER = { size: 0.8, radius: 0.1 } as const;
export const SCENE_STICKERLESS = {
  size: SCENE_CUBIE - 0.035,
  radius: SCENE_CUBIE_RADIUS * 0.9,
} as const;

export interface PosterCamera {
  eye: Vec3;
  /** 카메라 오른쪽·위·뒤(three.js lookAt과 같은 축) */
  x: Vec3;
  y: Vec3;
  z: Vec3;
  tanHalf: number;
  aspect: number;
  width: number;
  height: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const rad = (d: number) => (d * Math.PI) / 180;

/** 3D 장면의 카메라(cube-view.ts placeCamera와 같은 계산): 큐브를 감싸는 공이 화면 짧은 쪽에 들어가는 거리 */
export function posterCamera(
  n: number,
  width: number,
  height: number,
): PosterCamera {
  const aspect = width / height;
  const yaw = rad(SCENE_CAMERA.yaw);
  const pitch = rad(SCENE_CAMERA.pitch);
  const radius = (n * Math.sqrt(3)) / 2;
  const vFov = rad(SCENE_CAMERA.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const dist = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.02;
  const eye: Vec3 = [
    dist * Math.cos(pitch) * Math.sin(yaw),
    dist * Math.sin(pitch),
    dist * Math.cos(pitch) * Math.cos(yaw),
  ];
  const z = norm(eye);
  const x = norm(cross([0, 1, 0], z));
  const y = cross(z, x);
  return { eye, x, y, z, tanHalf: Math.tan(vFov / 2), aspect, width, height };
}

/** 세계 좌표 → 그림 좌표(왼쪽 위가 0,0) */
export function project(cam: PosterCamera, p: Vec3): [number, number] {
  const d = sub(p, cam.eye);
  const vx = dot(d, cam.x);
  const vy = dot(d, cam.y);
  const vz = -dot(d, cam.z);
  const nx = vx / vz / (cam.tanHalf * cam.aspect);
  const ny = vy / vz / cam.tanHalf;
  return [((nx + 1) / 2) * cam.width, ((1 - ny) / 2) * cam.height];
}

/** 면 위의 두 축(면 안의 오른쪽·위 같은 방향, 크기 1) */
function faceAxes(nv: Vec3): [Vec3, Vec3] {
  if (nv[1] !== 0)
    return [
      [1, 0, 0],
      [0, 0, 1],
    ];
  if (nv[0] !== 0)
    return [
      [0, 0, 1],
      [0, 1, 0],
    ];
  return [
    [1, 0, 0],
    [0, 1, 0],
  ];
}

/** 면 위 둥근 사각형의 둘레 점(가운데 c, 한 변 size, 둥글기 r) */
function roundedSquare(
  c: Vec3,
  nv: Vec3,
  size: number,
  r: number,
  steps = 4,
): Vec3[] {
  const [u, v] = faceAxes(nv);
  const h = size / 2;
  const k = h - r;
  const out: Vec3[] = [];
  const corners: [number, number, number][] = [
    [k, k, 0],
    [-k, k, 90],
    [-k, -k, 180],
    [k, -k, 270],
  ];
  for (const [cx, cy, start] of corners)
    for (let i = 0; i <= steps; i++) {
      const a = rad(start + (90 * i) / steps);
      const px = cx + r * Math.cos(a);
      const py = cy + r * Math.sin(a);
      out.push([
        c[0] + u[0] * px + v[0] * py,
        c[1] + u[1] * px + v[1] * py,
        c[2] + u[2] * px + v[2] * py,
      ]);
    }
  return out;
}

const pts = (cam: PosterCamera, ps: Vec3[]): string =>
  ps
    .map((p) => {
      const [x, y] = project(cam, p);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

/** 면이 카메라 쪽을 보는지 */
export function faceVisible(cam: PosterCamera, n: number, normal: Normal) {
  const nv = normalVec(normal);
  const h = n / 2;
  return dot(nv, sub(cam.eye, [nv[0] * h, nv[1] * h, nv[2] * h])) > 0;
}

export interface PosterShapes {
  /** 보이는 면마다 검은 몸통(바깥 면) */
  body: { normal: Normal; points: string }[];
  /** 보이는 스티커(색 번호, null = 가림) */
  stickers: { normal: Normal; points: string; color: number | null }[];
  /** 바닥 그림자(타원) */
  shadow: { cx: number; cy: number; rx: number; ry: number };
}

/** 그릴 모양 전부. 보이는 면의 스티커만 고른다 */
export function posterShapes(
  n: number,
  stickers: readonly Sticker[],
  width: number,
  height: number,
  stickerless = false,
): PosterShapes {
  const cam = posterCamera(n, width, height);
  const h = n / 2;
  const edge = h - (1 - SCENE_CUBIE) / 2;
  const normals: Normal[] = ["+x", "-x", "+y", "-y", "+z", "-z"];
  const visible = normals.filter((nm) => faceVisible(cam, n, nm));
  const body = visible.map((normal) => {
    const nv = normalVec(normal);
    return {
      normal,
      points: pts(
        cam,
        roundedSquare(
          [nv[0] * edge, nv[1] * edge, nv[2] * edge],
          nv,
          edge * 2,
          SCENE_CUBIE_RADIUS,
        ),
      ),
    };
  });
  const look = stickerless ? SCENE_STICKERLESS : SCENE_STICKER;
  const lift = SCENE_CUBIE / 2 + 0.01;
  const shown = stickers.filter((s) => visible.includes(s.normal));
  const out = shown.map((s) => {
    const nv = normalVec(s.normal);
    const c: Vec3 = [
      s.center[0] + nv[0] * lift,
      s.center[1] + nv[1] * lift,
      s.center[2] + nv[2] * lift,
    ];
    return {
      normal: s.normal,
      points: pts(cam, roundedSquare(c, nv, look.size, look.radius, 3)),
      color: s.color,
    };
  });
  // 그림자: cube-view.ts와 같은 높이·크기의 둥근 판을 투영한 테두리 상자
  const sy = -n * 0.5 - n * 0.28;
  const sr = (n * 1.9) / 2;
  const ring: [number, number][] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ring.push(project(cam, [sr * Math.cos(a), sy, sr * Math.sin(a)]));
  }
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    body,
    stickers: out,
    shadow: {
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      rx: (maxX - minX) / 2,
      ry: (maxY - minY) / 2,
    },
  };
}
