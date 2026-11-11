import type { Vec3 } from "./geometry";
import {
  type MirrorPanel,
  mirrorAlpha,
  mirrorFrame,
  viewBasis,
} from "./mirror";
import type { Axis, Normal } from "./types";

/**
 * CSS 3D 큐브(`css-cube-view.ts`, docs/52 5-4)의 계산. three.js·DOM 없이 행렬만 다룬다(시험이 함께 쓴다).
 *
 * - 행렬은 4×4, CSS `matrix3d`와 같은 열 우선 배열 16칸이다.
 * - 계산은 세계 좌표(+x 오른쪽, +y 위, +z 앞, `types.ts`)로 하고, 마지막에 CSS 좌표(+y 아래, 길이는 px)로 바꾼다
 *   (`toCss`: y를 뒤집는 S로 앞뒤를 감싸고, 옮김은 한 칸 = `unit` px).
 * - 카메라는 3D 장면(`cube-view.ts` `placeCamera`)과 같은 식이다: 세로 시야각 30°, 큐브를 감싸는 공이 화면 짧은 쪽에
 *   들어가는 거리, 거울 판이 보이면 판까지 담는 자리(`mirrorFrame`). 그래서 같은 창에서 큐브가 같은 크기·자리에 온다.
 */

export type Mat4 = number[];

export const FOV_DEG = 30;

export function identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** a × b (b를 먼저 적용) */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++)
        s += (a[k * 4 + r] as number) * (b[c * 4 + k] as number);
      out[c * 4 + r] = s;
    }
  return out;
}

export function translation(x: number, y: number, z: number): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

export function scaling(x: number, y = x, z = x): Mat4 {
  return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
}

/** 세계 축 둘레로 `rad`만큼(오른손 법칙) */
export function rotation(axis: Axis, rad: number): Mat4 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  if (axis === "x") return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
  if (axis === "y") return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** 열 셋(오른쪽·위·앞이 갈 곳)과 옮김으로 만든 행렬 */
export function basis(x: Vec3, y: Vec3, z: Vec3, t: Vec3 = [0, 0, 0]): Mat4 {
  return [...x, 0, ...y, 0, ...z, 0, ...t, 1];
}

/** 점 하나를 옮긴다 */
export function apply(m: Mat4, p: Vec3): Vec3 {
  const g = (i: number) => m[i] as number;
  return [
    g(0) * p[0] + g(4) * p[1] + g(8) * p[2] + g(12),
    g(1) * p[0] + g(5) * p[1] + g(9) * p[2] + g(13),
    g(2) * p[0] + g(6) * p[1] + g(10) * p[2] + g(14),
  ];
}

/**
 * 회전이 끝난 조각 행렬을 격자에 다시 맞춘다: 회전 칸은 0·±1, 옮김은 0.5 단위(짝수 큐브의 ±0.5). 오차가 쌓이지 않게
 */
export function snap(m: Mat4): Mat4 {
  return m.map((v, i) => {
    if (i === 15) return 1;
    if (i === 3 || i === 7 || i === 11) return 0;
    const r = i >= 12 ? Math.round(v * 2) / 2 : Math.round(v);
    return r + 0;
  });
}

/**
 * 세계 행렬 → CSS 행렬(문자열에 넣을 숫자). CSS는 y가 아래라 S = diag(1, -1, 1)로 앞뒤를 감싸고(S·M·S), 옮김은
 * 한 칸 = `unit` px로 늘린다. 부모·자식 행렬을 따로 바꿔도 곱한 결과가 같다(S·A·S · S·B·S = S·AB·S)
 */
export function toCss(m: Mat4, unit: number): Mat4 {
  const out = [...m];
  // y 행·y 열의 부호를 바꾼다(가운데 (1,1)은 두 번 바뀌어 그대로)
  for (const i of [1, 4, 6, 9]) out[i] = -(m[i] as number);
  out[12] = (m[12] as number) * unit;
  out[13] = -(m[13] as number) * unit;
  out[14] = (m[14] as number) * unit;
  return out;
}

export function cssMatrix(m: Mat4): string {
  return `matrix3d(${m.map((v) => +v.toFixed(6)).join(",")})`;
}

/**
 * 세계 축 둘레 회전을 CSS 함수로(층 돌리기 애니메이션의 열쇠 장면). S로 감싸면 x·z 축 회전은 각이 뒤집히고 y는 같다.
 * 같은 함수끼리는 각을 숫자로 이어 그려 반 바퀴(180°)도 축 둘레로 돈다(행렬끼리 잇기는 지름길로 가로지른다)
 */
export function cssRotate(axis: Axis, rad: number): string {
  const deg = (rad * 180) / Math.PI;
  if (axis === "x") return `rotateX(${+(-deg).toFixed(4)}deg)`;
  if (axis === "y") return `rotateY(${+deg.toFixed(4)}deg)`;
  return `rotateZ(${+(-deg).toFixed(4)}deg)`;
}

/** 조각 면 하나: 앞(+z)을 그 면 쪽으로 돌린 행렬(크기·옮김 없음). `cube-view.ts`의 스티커 판과 같은 쪽을 본다 */
export function faceRotation(normal: Normal): Mat4 {
  switch (normal) {
    case "+z":
      return identity();
    case "-z":
      return rotation("y", Math.PI);
    case "+x":
      return rotation("y", Math.PI / 2);
    case "-x":
      return rotation("y", -Math.PI / 2);
    case "+y":
      return rotation("x", -Math.PI / 2);
    default:
      return rotation("x", Math.PI / 2);
  }
}

/**
 * 거울 판 하나의 놓임(판 테두리 평면, 판 쪽 앞이 카메라 쪽): 판 가운데로 옮기고 판의 오른쪽·위·보는 쪽을 축으로
 */
export function panelMatrix(p: MirrorPanel): Mat4 {
  return basis(p.right, p.up, p.facing, p.center);
}

/**
 * 판 위 거울상: 큐브의 세계 좌표 → 판 평면 좌표. 오른쪽 = 점·판 오른쪽 × 칸 간격, 위 = 점·판 위 × 칸 간격(`mirrorCells`와
 * 같은 자리), 깊이 = 점·바깥 방향(그 면에 붙은 칸이 가장 앞). 판(평평한 상자)이 깊이를 버려 거울상이 판에 눌린다
 */
export function mirrorFlatten(p: MirrorPanel, cell: number): Mat4 {
  const out: Vec3 = [-p.facing[0], -p.facing[1], -p.facing[2]];
  // 행으로 적은 선형 사상: 결과 x = right·p × cell, y = up·p × cell, z = out·p
  return [
    p.right[0] * cell,
    p.up[0] * cell,
    out[0],
    0,
    p.right[1] * cell,
    p.up[1] * cell,
    out[1],
    0,
    p.right[2] * cell,
    p.up[2] * cell,
    out[2],
    0,
    0,
    0,
    0,
    1,
  ];
}

// ---------------------------------------------------------------- 카메라

export interface Camera {
  yaw: number;
  pitch: number;
  target: Vec3;
  dist: number;
}

/** 큐브만 담는 거리(3D 장면의 `placeCamera`와 같다) */
export function cubeDist(n: number, aspect: number): number {
  const radius = (n * Math.sqrt(3)) / 2;
  const v = (FOV_DEG * Math.PI) / 180;
  const h = 2 * Math.atan(Math.tan(v / 2) * aspect);
  return (radius / Math.sin(Math.min(v, h) / 2)) * 1.02;
}

/**
 * 보는 각과 거울 판이 보이는 정도(`fade`, 0~1)로 카메라를 정한다. 판이 보일수록 판까지 담는 자리로 물러난다
 */
export function cameraFor(
  n: number,
  aspect: number,
  yaw: number,
  pitch: number,
  panels: readonly MirrorPanel[] | null,
  fade: number,
): Camera {
  let dist = cubeDist(n, aspect);
  let target: Vec3 = [0, 0, 0];
  const shown = panels ? mirrorAlpha(yaw, pitch) * fade : 0;
  if (panels && shown > 0) {
    const f = mirrorFrame(n, panels, aspect, FOV_DEG);
    const e = easeInOut(shown);
    dist += (f.dist - dist) * e;
    target = [f.target[0] * e, f.target[1] * e, f.target[2] * e];
  }
  return { yaw, pitch, target, dist };
}

/** 판이 보이는 정도(0~1): 켠 정도 × 보는 각에 따른 값(`cube-view.ts`와 같다) */
export function mirrorShownAt(
  yaw: number,
  pitch: number,
  fade: number,
): number {
  return mirrorAlpha(yaw, pitch) * fade;
}

export const easeInOut = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;

/** 세계 → 카메라(카메라가 원점, -z를 본다, +y 위) */
export function viewMatrix(c: Camera): Mat4 {
  const b = viewBasis(c.yaw, c.pitch);
  const eye: Vec3 = [
    c.target[0] + b.toward[0] * c.dist,
    c.target[1] + b.toward[1] * c.dist,
    c.target[2] + b.toward[2] * c.dist,
  ];
  const d = (a: Vec3) => -(a[0] * eye[0] + a[1] * eye[1] + a[2] * eye[2]);
  const { right: r, up: u, toward: t } = b;
  return [
    r[0],
    u[0],
    t[0],
    0,
    r[1],
    u[1],
    t[1],
    0,
    r[2],
    u[2],
    t[2],
    0,
    d(r),
    d(u),
    d(t),
    1,
  ];
}

/** CSS `perspective` 값(px): 세로 시야각 30°에서 화면 높이의 절반이 보이는 거리 */
export function perspectivePx(height: number): number {
  return height / 2 / Math.tan((FOV_DEG * Math.PI) / 360);
}

/**
 * 장면 뿌리(무대 가운데, `perspective`를 건 상자의 자식)에 걸 CSS 행렬. 자식은 세계 좌표를 `unit` px로 늘려 둔다.
 * 카메라 공간 점 p는 CSS 점 (k·x, -k·y, k·z + P)로 간다(P = perspective, k = `scale`). 화면 자리는 P·x/(-z)라
 * k와 상관없이 3D 장면의 투영과 같고, k는 바라보는 점 근처가 1:1로 그려지게 고른다
 */
export function rootMatrix(
  c: Camera,
  perspective: number,
  scale: number,
  unit: number,
): Mat4 {
  return multiply(
    translation(0, 0, perspective),
    multiply(scaling(scale / unit), toCss(viewMatrix(c), unit)),
  );
}

/** 세계 점의 화면 자리(무대 왼쪽 위 기준 px). 카메라 뒤면 null */
export function project(
  c: Camera,
  width: number,
  height: number,
  p: Vec3,
): { x: number; y: number } | null {
  const q = apply(viewMatrix(c), p);
  if (q[2] >= -1e-6) return null;
  const P = perspectivePx(height);
  return {
    x: width / 2 + (P * q[0]) / -q[2],
    y: height / 2 - (P * q[1]) / -q[2],
  };
}
