// Cubie 앱 아이콘 그림(브라우저 쪽). 사이트의 3D 큐브(apps/web/src/cube/view/cube-view.ts)로 큐브를 그리고,
// 2D 캔버스에서 맥 아이콘 판과 합친다. make-art.mjs가 이 파일을 묶어 시스템 Chrome에서 돌린다.
//
//   window.drawIcon(id, px) → PNG data URL(px × px, 투명 바탕)
//
// 시안(OPTIONS)마다 큐브 크기·상태·보는 각·판 색·기울기를 정한다. 사이트 화면에는 넣지 않는다.
import { Quaternion } from "three";
import { CubeView } from "../../../web/src/cube/view/cube-view";
import type { CubeMove } from "../../../web/src/cube/view/types";

type Rgb = string;

export interface IconOption {
  id: string;
  /** 비교판에 적는 짧은 이름 */
  name: string;
  n: number;
  /** 맞춘 큐브에서 둔 수(다 돈 뒤 모습) */
  moves: CubeMove[];
  /** 그 뒤 반쯤 돌아가는 중인 수 하나와 돈 정도(0~1) */
  turning?: { move: CubeMove; t: number };
  yaw: number;
  pitch: number;
  stickerless?: boolean;
  colors?: number[];
  /** 판: 위·아래 색(옅은 세로 그라데이션) */
  plate: [Rgb, Rgb];
  /** 판 안쪽 위 테두리 빛의 세기(0~1) */
  rim: number;
  /** 큐브 폭(1024 기준 px), 가운데 높이, 기울기(도, 시계 방향 +) */
  width: number;
  cy: number;
  tilt?: number;
  /** 바닥 그림자: 큐브 아래와의 틈(px), 진하기 */
  shadowGap: number;
  shadowAlpha: number;
  /** 32px 아래에서 바꿀 값(기본은 SMALL) */
  small?: Partial<IconOption>;
}

const M = (axis: "x" | "y" | "z", from: number, to: number, turns: 1 | 2 | 3) =>
  ({ axis, from, to, turns }) as CubeMove;
// 3×3: R = x 1층, U = y 1층, F = z 1층. turns 3 = 반대 방향
const R = M("x", 1, 1, 1);
const U = M("y", 1, 1, 1);
const Ui = M("y", 1, 1, 3);
const F = M("z", 1, 1, 1);

/** 조금 밝고 부드러운 여섯 색(흰 빨 초 노 주 파). 귀여운 쪽 시안 */
const SOFT = [0xfdfdfb, 0xf0525c, 0x2fbf71, 0xffd23f, 0xff8a3d, 0x3a7bea];

export const OPTIONS: IconOption[] = [
  {
    id: "a-clean",
    name: "단정: 사이트 큐브 그대로, 어두운 판",
    n: 3,
    moves: [R, Ui],
    yaw: 38,
    pitch: 28,
    plate: ["#2b3038", "#181b21"],
    rim: 0.18,
    width: 610,
    cy: 500,
    shadowGap: 18,
    shadowAlpha: 0.32,
  },
  {
    id: "b-bounce",
    name: "통통: 살짝 기울어 떠오른 큐브, 민트 판",
    n: 3,
    moves: [U, R],
    yaw: 34,
    pitch: 30,
    colors: SOFT,
    plate: ["#e6f7f1", "#bfe9dc"],
    rim: 0.6,
    width: 560,
    cy: 470,
    tilt: -9,
    shadowGap: 60,
    shadowAlpha: 0.16,
  },
  {
    id: "c-turning",
    name: "도는 중: 윗줄이 돌아가는 큐브, 크림 판",
    n: 3,
    moves: [R],
    turning: { move: U, t: 0.22 },
    yaw: 36,
    pitch: 30,
    colors: SOFT,
    plate: ["#fff6e8", "#ffe4c2"],
    rim: 0.6,
    width: 600,
    cy: 505,
    shadowGap: 16,
    shadowAlpha: 0.18,
  },
  {
    id: "d-pocket",
    name: "작은 2×2: 통통한 조각 넷씩, 하늘 판",
    n: 2,
    moves: [M("x", 1, 1, 1), M("y", 1, 1, 3)],
    yaw: 38,
    pitch: 30,
    colors: SOFT,
    plate: ["#e8f3ff", "#c4defb"],
    rim: 0.6,
    width: 560,
    cy: 495,
    tilt: 6,
    shadowGap: 22,
    shadowAlpha: 0.18,
    // 2×2는 칸이 커서 16px에서도 섞인 색이 읽힌다. 맞춘 큐브는 흰 윗면이 하늘색 판에 묻혀 큰 그림과 같은 상태로 둔다
    small: { moves: [M("x", 1, 1, 1), M("y", 1, 1, 3)], width: 760, cy: 512 },
  },
  {
    id: "e-candy",
    name: "사탕: 스티커 없는 색 조각 큐브, 밝은 판",
    n: 3,
    moves: [F, U],
    yaw: 36,
    pitch: 28,
    stickerless: true,
    colors: SOFT,
    plate: ["#ffffff", "#e9ecf2"],
    rim: 0.8,
    width: 600,
    cy: 500,
    shadowGap: 18,
    shadowAlpha: 0.2,
  },
];

/** 큐브만 투명 바탕에 그린다(정사각형, side px). 큐브가 차지하는 사각형도 돌려준다 */
function renderCube(
  o: IconOption,
  side: number,
): { img: HTMLCanvasElement; box: DOMRect } {
  const gl = document.createElement("canvas");
  // CSS 크기 = side / dpr. 렌더러가 기기 배율(최대 2)을 곱한다
  const css = side / Math.min(2, window.devicePixelRatio || 1);
  gl.style.width = `${css}px`;
  gl.style.height = `${css}px`;
  document.body.appendChild(gl);
  const view = CubeView.create(gl, {
    n: o.n,
    quality: "high",
    interactive: false,
    shadow: false,
    stickerless: o.stickerless ?? false,
    ...(o.colors ? { colors: o.colors } : {}),
  });
  view.resize(css, css);
  view.setView(o.yaw, o.pitch);
  for (const m of o.moves) view.enqueue(m);
  view.flush();
  // 반쯤 돈 층: 렌더러 안쪽(회전 시작·조각 행렬 쓰기)을 그대로 쓴다. 아이콘 그림에서만
  const inner = view as unknown as {
    start(
      m: CubeMove,
      now: number,
      d: number,
    ): { cubies: number[]; axis: import("three").Vector3; angle: number };
    writeCubie(i: number, q?: Quaternion): void;
    placeCamera(): void;
    renderer: import("three").WebGLRenderer;
    scene: import("three").Scene;
    camera: import("three").Camera;
  };
  if (o.turning) {
    const r = inner.start(o.turning.move, 0, 1);
    const q = new Quaternion().setFromAxisAngle(r.axis, r.angle * o.turning.t);
    for (const i of r.cubies) inner.writeCubie(i, q);
  }
  inner.placeCamera();
  inner.renderer.render(inner.scene, inner.camera);
  // 같은 작업 안에서 옮겨야 WebGL 그림판이 비워지기 전에 읽힌다
  const img = document.createElement("canvas");
  img.width = gl.width;
  img.height = gl.height;
  const g = img.getContext("2d", {
    willReadFrequently: true,
  }) as CanvasRenderingContext2D;
  g.drawImage(gl, 0, 0);
  view.dispose();
  gl.remove();
  const data = g.getImageData(0, 0, img.width, img.height).data;
  let x0 = img.width;
  let y0 = img.height;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if ((data[(y * img.width + x) * 4 + 3] ?? 0) > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return { img, box: new DOMRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1) };
}

const cubes = new Map<string, { img: HTMLCanvasElement; box: DOMRect }>();

function cubeOf(o: IconOption) {
  let c = cubes.get(o.id);
  if (!c) {
    c = renderCube(o, 2048);
    cubes.set(o.id, c);
  }
  return c;
}

function plate(g: CanvasRenderingContext2D, o: IconOption) {
  // macOS 11 아이콘 격자: 1024 안 824×824, 모서리 반지름 약 185
  const path = new Path2D();
  path.roundRect(100, 100, 824, 824, 185);
  // 아주 옅은 판 그림자
  g.save();
  g.shadowColor = "rgba(0,0,0,0.22)";
  g.shadowBlur = 24;
  g.shadowOffsetY = 8;
  g.fillStyle = o.plate[1];
  g.fill(path);
  g.restore();
  const grad = g.createLinearGradient(0, 100, 0, 924);
  grad.addColorStop(0, o.plate[0]);
  grad.addColorStop(1, o.plate[1]);
  g.fillStyle = grad;
  g.fill(path);
  if (o.rim > 0) {
    const rim = new Path2D();
    rim.roundRect(101.5, 101.5, 821, 821, 183.5);
    const rg = g.createLinearGradient(0, 100, 0, 600);
    rg.addColorStop(0, `rgba(255,255,255,${o.rim})`);
    rg.addColorStop(1, "rgba(255,255,255,0)");
    g.strokeStyle = rg;
    g.lineWidth = 3;
    g.stroke(rim);
  }
  return path;
}

/** 1024 기준 그림 한 장 */
function master(o: IconOption): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  plate(g, o);
  const { img, box } = cubeOf(o);
  const s = o.width / box.width;
  const h = box.height * s;
  // 바닥 그림자: 큐브 아래 납작한 타원
  const floor = o.cy + h / 2 + o.shadowGap;
  g.save();
  g.translate(512, floor);
  g.scale(1, 0.16);
  const sg = g.createRadialGradient(0, 0, 0, 0, 0, o.width * 0.5);
  sg.addColorStop(0, `rgba(0,0,0,${o.shadowAlpha})`);
  sg.addColorStop(0.6, `rgba(0,0,0,${o.shadowAlpha * 0.45})`);
  sg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = sg;
  g.fillRect(-o.width, -o.width, o.width * 2, o.width * 2);
  g.restore();
  g.save();
  g.translate(512, o.cy);
  if (o.tilt) g.rotate((o.tilt * Math.PI) / 180);
  g.imageSmoothingQuality = "high";
  g.drawImage(
    img,
    box.x,
    box.y,
    box.width,
    box.height,
    -o.width / 2,
    -h / 2,
    o.width,
    h,
  );
  g.restore();
  return c;
}

/** 반씩 줄여 가며 px로(한 번에 크게 줄이면 칸 선이 깨진다) */
function shrink(src: HTMLCanvasElement, px: number): HTMLCanvasElement {
  let cur = src;
  while (cur.width / 2 >= px) {
    const n = document.createElement("canvas");
    n.width = cur.width / 2;
    n.height = cur.height / 2;
    const g = n.getContext("2d") as CanvasRenderingContext2D;
    g.imageSmoothingQuality = "high";
    g.drawImage(cur, 0, 0, n.width, n.height);
    cur = n;
  }
  if (cur.width === px) return cur;
  const n = document.createElement("canvas");
  n.width = px;
  n.height = px;
  const g = n.getContext("2d") as CanvasRenderingContext2D;
  g.imageSmoothingQuality = "high";
  g.drawImage(cur, 0, 0, px, px);
  return n;
}

const masters = new Map<string, HTMLCanvasElement>();

/**
 * 32px 아래 판: 칸이 2~3픽셀이라 섞인 색은 얼룩이 된다. 맞춘 큐브(면마다 한 색)를 돌아가는 층·기울기 없이
 * 판을 더 채우게 그리고, 바닥 그림자는 뺀다
 */
const SMALL: Partial<IconOption> = {
  moves: [],
  turning: undefined,
  tilt: 0,
  width: 700,
  cy: 505,
  shadowAlpha: 0,
};

function drawIcon(id: string, px: number): string {
  const base = OPTIONS.find((x) => x.id === id);
  if (!base) throw new Error(`없는 시안: ${id}`);
  const o: IconOption =
    px <= 32 ? { ...base, ...SMALL, ...base.small, id: `${id}-small` } : base;
  let m = masters.get(o.id);
  if (!m) {
    m = master(o);
    masters.set(o.id, m);
  }
  return shrink(m, px).toDataURL("image/png");
}

Object.assign(window, {
  drawIcon,
  iconOptions: OPTIONS.map((o) => ({ id: o.id, name: o.name })),
});
