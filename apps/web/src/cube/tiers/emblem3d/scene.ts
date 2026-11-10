import type * as THREE_NS from "three";

import {
  CENTER,
  CUBE_R,
  coreScale,
  crestAt,
  FRAME_IN,
  FRAME_OUT,
  levelOf,
  type Pt,
} from "../emblemArt";
import { wingPlates } from "../TierEmblem";

/**
 * 3D 티어 엠블럼 시안의 장면(docs/47 14-7). 지금 SVG 엠블럼(14-6)의 구도를 그대로 3D로 옮긴다: 베벨 금속 육각 틀,
 * 그 안 우물에 박힌 등각 큐브(조각 27개), 큐브 면 조각 날개, 위 티어의 볏 보석.
 *
 * - 보석(다이아몬드): 조각마다 모서리를 깎은 맑은 보석. 굴절(transmission·ior)·분산·무지개 막(iridescence)·
 *   겉 코팅(clearcoat). 우물 바닥이 안에서 빛을 내 조각마다 굴절된 빛이 다르게 비친다(보석 사진의 뒤 조명).
 * - 금속(골드): 불투명한 금속(metalness 1). 조각 사이 틈은 어둡게.
 * - 빛: 보석 사진 스튜디오처럼 위 큰 소프트박스, 양옆 띠 조명(림), 작은 점 조명 여럿을 코드로 만든 방에 두고
 *   반사 지도로 쓴다(바깥 파일 없음). 돌리면 조각마다 비치는 조명이 바뀌어 반짝임이 옮겨 다닌다.
 *
 * WebGL(`three`)과 WebGPU(`three/webgpu`) 묶음이 서로 다른 클래스 사본을 가지므로, 쓰는 쪽 이름공간을 `T`로 받는다.
 * 그래서 `three/examples`의 도우미(RoundedBoxGeometry, RoomEnvironment 등)를 쓰지 않고 기본 클래스로만 만든다.
 */

export type Three = typeof THREE_NS;

/** 시안 티어 둘: 보석 하나, 금속 하나 */
export const DRAFT_TIERS = ["diamond", "gold"] as const;
export type DraftTier = (typeof DRAFT_TIERS)[number];

export function isGem(tier: DraftTier): boolean {
  return tier === "diamond";
}

const SIN60 = Math.sqrt(3) / 2;
/** 큐브 조각 간격과 크기(조각 사이 틈 = 1 - CUBIE) */
const CUBIE = 0.92;
/** 큐브 한 변 3을 몸통 대각선으로 볼 때 실루엣 육각형 반지름 */
const CUBE_SIL = 3 * Math.sqrt(2 / 3);
/**
 * 틀 앞면 z, 우물 바닥 z, 큐브 가운데 z. 메달은 얇게(두께가 너비의 약 1/5) 두고 큐브가 그 앞으로 솟는다.
 * 처음에는 큐브 전체를 깊은 우물에 넣었더니 돌릴 때 육각 통처럼 보였다. 큐브 뒤 꼭짓점은 뒤 판 두께 안에 묻힌다.
 */
const Z_FRONT = 0.4;
const Z_BACK = -0.55;
const Z_CUBE = 1.0;

/** 장면을 짓는 데 고르는 것 */
export interface BuildOptions {
  /** 뒤 배경판과 드리운 그림자(살아 있는 큰 시안). 찍은 그림(투명 바탕)에는 넣지 않는다 */
  backdrop: boolean;
  /** 배경판 가장자리 색(페이지 바탕과 같게) */
  pageColor: string;
  /** 빛 세기 배수(HDR 길은 흰색보다 밝은 값을 그대로 보낸다) */
  hdr: boolean;
}

export interface EmblemScene {
  scene: THREE_NS.Scene;
  camera: THREE_NS.PerspectiveCamera;
  /** 끌어 돌리는 몸(틀·큐브·날개·볏) */
  spin: THREE_NS.Group;
  /** 반사 지도로 구울 스튜디오 방(PMREM에 넘긴 뒤 버린다) */
  studio: THREE_NS.Scene;
  dispose(): void;
}

/** 재질 값(시안에서 고른 값, 보고·문서에 그대로 적는다) */
export const LOOK = {
  gem: {
    color: "#d4f1ff",
    attenuationColor: "#4fc6ff",
    attenuationDistance: 2.6,
    transmission: 1,
    ior: 2.33,
    thickness: 1.25,
    roughness: 0.015,
    dispersion: 6,
    iridescence: 0.08,
    iridescenceIOR: 1.5,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 2.4,
  },
  diamondMetal: { color: [0.62, 0.72, 0.86], roughness: 0.32 },
  gold: { color: [1.0, 0.72, 0.29], roughness: 0.32, frameRoughness: 0.2 },
} as const;

/** SVG 좌표(0~64, y 아래로)를 3D(가운데 0, y 위로)로 */
function toWorld(p: Pt, u: number): [number, number] {
  return [(p[0] - CENTER[0]) * u, -(p[1] - CENTER[1]) * u];
}

function hexPoints(r: number): [number, number][] {
  return [
    [0, r],
    [r * SIN60, r / 2],
    [r * SIN60, -r / 2],
    [0, -r],
    [-r * SIN60, -r / 2],
    [-r * SIN60, r / 2],
  ];
}

function shapeOf(T: Three, pts: readonly (readonly [number, number])[]) {
  const s = new T.Shape();
  pts.forEach(([x, y], i) => {
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  });
  s.closePath();
  return s;
}

function pathOf(T: Three, pts: readonly (readonly [number, number])[]) {
  const p = new T.Path();
  pts.forEach(([x, y], i) => {
    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  });
  p.closePath();
  return p;
}

/** 육각 띠(바깥 rOut, 안 rIn)를 z0에서 z1까지, 모서리 베벨 */
function hexRing(
  T: Three,
  rOut: number,
  rIn: number,
  z0: number,
  z1: number,
  bevel: number,
) {
  const shape = shapeOf(T, hexPoints(rOut - bevel));
  shape.holes.push(pathOf(T, hexPoints(rIn + bevel)));
  const depth = Math.max(0.001, z1 - z0 - 2 * bevel);
  const g = new T.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 1,
  });
  g.translate(0, 0, z0 + bevel);
  return g;
}

/** 모든 모서리를 깎은 상자(한 변 s, 깎은 폭 c). 깎은 면이 보석의 면처럼 빛을 따로 받는다 */
function chamferBox(T: Three, s: number, c: number) {
  const h = s / 2 - c;
  const k = c * 0.9;
  const shape = shapeOf(T, [
    [-h + k, -h],
    [h - k, -h],
    [h, -h + k],
    [h, h - k],
    [h - k, h],
    [-h + k, h],
    [-h, h - k],
    [-h, -h + k],
  ]);
  const g = new T.ExtrudeGeometry(shape, {
    depth: s - 2 * c,
    bevelEnabled: true,
    bevelThickness: c,
    bevelSize: c,
    bevelSegments: 1,
    curveSegments: 1,
  });
  g.translate(0, 0, -(s - 2 * c) / 2);
  return g;
}

/** 평평한 다각형 판(두께 d, 베벨 b) */
function plateGeo(
  T: Three,
  pts: readonly (readonly [number, number])[],
  d: number,
  b: number,
) {
  const g = new T.ExtrudeGeometry(shapeOf(T, pts), {
    depth: d,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 1,
    curveSegments: 1,
  });
  return g;
}

/** 가운데에서 가장자리로 번지는 둥근 그라데이션 그림 */
function radialTexture(
  T: Three,
  stops: readonly [number, string][],
  size = 256,
) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    for (const [o, col] of stops) g.addColorStop(o, col);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}

/**
 * 보석 우물 바닥: 가운데에서 뻗는 빛살과 흩어진 빛점(보석 안에서 올라오는 불꽃). 고른 번짐은 굴절해도 무늬가 없어
 * 플라스틱처럼 보였다. 밝고 어두운 조각이 섞여 있어야 조각마다 다른 조각이 비치고 돌릴 때 반짝임이 옮겨 다닌다.
 * 씨앗을 고정해 늘 같은 그림을 만든다.
 */
function fireTexture(T: Three, size = 512) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (ctx) {
    const h = size / 2;
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const base = ctx.createRadialGradient(h, h, 0, h, h, h);
    base.addColorStop(0, "#5cc4ff");
    base.addColorStop(0.18, "#1468b8");
    base.addColorStop(0.55, "#06244e");
    base.addColorStop(1, "#020a18");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = "lighter";
    const rays = 22;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + rnd() * 0.12;
      const w = 0.03 + rnd() * 0.07;
      const len = h * (0.75 + rnd() * 0.3);
      const g = ctx.createRadialGradient(h, h, 0, h, h, len);
      const tone =
        i % 3 === 0
          ? "255,255,255"
          : i % 3 === 1
            ? "190,235,255"
            : "120,200,255";
      g.addColorStop(0, `rgba(${tone},0.95)`);
      g.addColorStop(0.6, `rgba(${tone},0.35)`);
      g.addColorStop(1, `rgba(${tone},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(h, h);
      ctx.lineTo(h + Math.cos(a - w) * len, h + Math.sin(a - w) * len);
      ctx.lineTo(h + Math.cos(a + w) * len, h + Math.sin(a + w) * len);
      ctx.closePath();
      ctx.fill();
    }
    for (let i = 0; i < 70; i++) {
      const r = Math.sqrt(rnd()) * h * 0.9;
      const a = rnd() * Math.PI * 2;
      const x = h + Math.cos(a) * r;
      const y = h + Math.sin(a) * r;
      const rad = 2 + rnd() * 7;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(200,235,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}

/**
 * 보석 사진 스튜디오 방(반사 지도용). 어두운 방에 위 큰 소프트박스, 왼쪽·오른쪽 띠 조명(림 라이트), 앞 약한 채움 빛,
 * 작은 점 조명 여럿(조각 모서리마다 또렷한 반짝임). 색 값이 1을 넘는 것은 조명 세기다.
 */
function studioScene(T: Three, hdr: boolean): THREE_NS.Scene {
  const s = new T.Scene();
  const k = hdr ? 1.4 : 1;
  const room = new T.Mesh(
    new T.BoxGeometry(24, 24, 24),
    new T.MeshBasicMaterial({ color: 0x12151b, side: T.BackSide }),
  );
  s.add(room);
  const panel = (
    w: number,
    h: number,
    power: number,
    pos: [number, number, number],
    tint: [number, number, number] = [1, 1, 1],
  ) => {
    const m = new T.Mesh(
      new T.PlaneGeometry(w, h),
      new T.MeshBasicMaterial({
        color: new T.Color(
          tint[0] * power * k,
          tint[1] * power * k,
          tint[2] * power * k,
        ),
        side: T.DoubleSide,
      }),
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  // 등각 큐브의 세 면은 정면에서 볼 때 뒤쪽을 비춘다(윗면 → 위-뒤, 왼면 → 왼-아래-뒤, 오른면 → 오른-아래-뒤).
  // 그래서 큰 소프트박스는 뒤쪽에 두고 밝기를 윗면 > 왼면 > 오른면으로 갈라 SVG 엠블럼의 면 밝기(1·0.62·0.4)를 잇는다
  panel(12, 6, 3.4, [0, 9, -6]);
  panel(6, 8, 2.1, [-9, -4, -6], [0.94, 0.98, 1]);
  panel(6, 8, 1.2, [9, -4, -6], [1, 0.97, 0.93]);
  // 위 앞 소프트박스(약하게): 틀의 위로 기운 베벨
  panel(12, 3, 1.4, [0, 10, 4]);
  // 양옆 띠 조명: 돌릴 때 옆면·모서리를 따라 흐르는 긴 반사(림)
  panel(1.2, 12, 8, [-10, 1, 2], [0.92, 0.97, 1]);
  panel(1.2, 12, 6, [10, 0, -1], [1, 0.97, 0.92]);
  // 뒤 위 림: 테두리에 가는 빛
  panel(10, 1, 6, [0, 6, -10]);
  // 앞 약한 채움 빛(틀 앞면이 비추는 곳)
  panel(8, 4, 0.8, [0, -1, 11]);
  // 아래 바닥에서 올라오는 아주 약한 반사
  panel(16, 16, 0.12, [0, -11, 0]);
  // 작은 점 조명: 조각마다 다른 자리에서 또렷하게 반짝인다
  const spots: [number, number, number][] = [
    [-6, 7, 7],
    [5, 8, 6],
    [8, 3, 8],
    [-8, -2, 7],
    [2, -6, 9],
    [-3, 4, 10],
    [7, -4, 4],
    [-5, 9, -4],
    [9, 7, -5],
  ];
  for (const p of spots) panel(0.9, 0.9, 45, p);
  return s;
}

function linear(
  T: Three,
  rgb: readonly [number, number, number],
): THREE_NS.Color {
  return new T.Color().setRGB(rgb[0], rgb[1], rgb[2], T.LinearSRGBColorSpace);
}

/** 엠블럼 장면을 짓는다 */
export function buildEmblemScene(
  T: Three,
  tier: DraftTier,
  opt: BuildOptions,
): EmblemScene {
  const gem = isGem(tier);
  const lv = levelOf(tier);
  const s = coreScale(tier);
  /** SVG 한 단위의 3D 길이: 큐브 실루엣이 SVG 큐브 크기와 같게 */
  const u = CUBE_SIL / (CUBE_R * s);
  const Ro = FRAME_OUT * s * u;
  const Ri = FRAME_IN * s * u;
  const Rm = Ri + (Ro - Ri) * 0.48;

  const geos: THREE_NS.BufferGeometry[] = [];
  const mats: THREE_NS.Material[] = [];
  const texs: THREE_NS.Texture[] = [];
  const keep = <G extends THREE_NS.BufferGeometry>(g: G) => {
    geos.push(g);
    return g;
  };
  const mat = <M extends THREE_NS.Material>(m: M) => {
    mats.push(m);
    return m;
  };

  const scene = new T.Scene();
  const spin = new T.Group();
  const body = new T.Group();
  spin.add(body);

  // ---- 재질
  const metal = gem
    ? mat(
        new T.MeshStandardMaterial({
          color: linear(T, LOOK.diamondMetal.color),
          metalness: 1,
          roughness: LOOK.diamondMetal.roughness,
        }),
      )
    : mat(
        new T.MeshStandardMaterial({
          color: linear(T, LOOK.gold.color),
          metalness: 1,
          roughness: LOOK.gold.frameRoughness,
        }),
      );
  const darkMetal = mat(
    new T.MeshStandardMaterial({
      color: gem ? 0x2a3646 : 0x3a2808,
      metalness: 1,
      roughness: 0.45,
    }),
  );
  const g = LOOK.gem;
  const gemMat = mat(
    new T.MeshPhysicalMaterial({
      color: g.color,
      metalness: 0,
      roughness: g.roughness,
      transmission: g.transmission,
      ior: g.ior,
      thickness: g.thickness,
      attenuationColor: g.attenuationColor,
      attenuationDistance: g.attenuationDistance,
      dispersion: g.dispersion,
      iridescence: g.iridescence,
      iridescenceIOR: g.iridescenceIOR,
      iridescenceThicknessRange: [180, 480],
      clearcoat: g.clearcoat,
      clearcoatRoughness: g.clearcoatRoughness,
      specularIntensity: 1,
      envMapIntensity: g.envMapIntensity,
      // 뒤쪽 면까지 굴절에 넣어 안쪽 깊이가 보인다
      side: T.DoubleSide,
    }),
  );
  // 볏 보석: 뒤가 어두운 배경이라 굴절만으로는 검게 보였다. 안에서 은은히 빛나게 한다
  const crestMat = gemMat.clone();
  crestMat.emissive = new T.Color("#5fb6ff");
  crestMat.emissiveIntensity = 0.55;
  crestMat.transmission = 0.75;
  mat(crestMat);
  const goldBlock = mat(
    new T.MeshStandardMaterial({
      color: linear(T, LOOK.gold.color),
      metalness: 1,
      roughness: LOOK.gold.roughness,
      envMapIntensity: 1.3,
    }),
  );

  // ---- 틀: 바깥 띠와 안 띠가 다른 높이(능선), 옆 벽, 뒤 판, 우물 벽
  const add = (geo: THREE_NS.BufferGeometry, m: THREE_NS.Material) => {
    const mesh = new T.Mesh(keep(geo), m);
    body.add(mesh);
    return mesh;
  };
  add(hexRing(T, Ro, Rm, Z_FRONT - 0.55, Z_FRONT, 0.12), metal);
  add(hexRing(T, Rm + 0.02, Ri, Z_FRONT - 0.55, Z_FRONT + 0.22, 0.1), metal);
  add(hexRing(T, Ro - 0.02, Ro - 0.2, Z_BACK, Z_FRONT - 0.5, 0.04), metal);
  add(hexRing(T, Ri + 0.06, Ri - 0.06, Z_BACK, Z_FRONT - 0.4, 0), darkMetal);
  const back = add(plateGeo(T, hexPoints(Ro - 0.1), 0.12, 0.04), metal);
  back.position.z = Z_BACK - 0.2;
  // 뒤 육각뿔(보석 받침의 뒤): 뒤로 빠지는 큐브 꼭짓점을 덮는다
  const pyrH = 1.5;
  const pyrGeo = new T.ConeGeometry(Ri * 0.8, pyrH, 6, 1, true);
  pyrGeo.rotateY(Math.PI / 6);
  pyrGeo.rotateX(-Math.PI / 2);
  const pyr = add(pyrGeo, metal);
  pyr.position.z = Z_BACK - 0.22 - pyrH / 2;

  // 우물 바닥: 보석은 안에서 빛을 내는 판(굴절된 빛이 조각마다 다르게 비친다), 금속은 어둡게
  const wellTex = gem
    ? fireTexture(T)
    : radialTexture(T, [
        [0, "#3b2a0a"],
        [1, "#0d0800"],
      ]);
  texs.push(wellTex);
  const wellPower = gem ? (opt.hdr ? 1.9 : 1.5) : 1;
  const well = add(
    new T.CircleGeometry(Ri * 1.02, 6, Math.PI / 2),
    mat(
      new T.MeshBasicMaterial({
        map: wellTex,
        color: new T.Color(wellPower, wellPower, wellPower),
      }),
    ),
  );
  well.position.z = Z_BACK + 0.02;

  // ---- 큐브: 조각 27개를 몸통 대각선이 앞을 보게(윗면·왼면·오른면이 보이는 등각)
  const cube = new T.Group();
  cube.rotation.set(Math.atan(1 / Math.SQRT2), -Math.PI / 4, 0, "XYZ");
  cube.position.z = Z_CUBE;
  const cubieGeo = keep(chamferBox(T, CUBIE, gem ? 0.15 : 0.1));
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) {
        const m = new T.Mesh(cubieGeo, gem ? gemMat : goldBlock);
        m.position.set(x, y, z);
        cube.add(m);
      }
  if (!gem) {
    // 조각 사이 틈이 어둡게 보이게 속을 채운다
    const core = new T.Mesh(
      keep(new T.BoxGeometry(2.9, 2.9, 2.9)),
      mat(
        new T.MeshStandardMaterial({
          color: 0x140c00,
          roughness: 0.7,
          metalness: 0.2,
        }),
      ),
    );
    cube.add(core);
  }
  body.add(cube);

  // ---- 날개: 큐브 면 조각 판(골드 하나, 다이아몬드 셋씩)
  const C = CENTER;
  const plates = wingPlates(lv, C[0] + FRAME_OUT * s * SIN60 - 1.2, C[1] + 3.2);
  const inset = (q: readonly Pt[]): Pt[] => {
    const l = (a: Pt, b: Pt, t: number): Pt => [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
    ];
    const [q0, q1, q2, q3] = q as [Pt, Pt, Pt, Pt];
    const at = (i: number, j: number) => l(l(q0, q1, i), l(q3, q2, i), j);
    return [at(0.14, 0.22), at(0.92, 0.22), at(0.92, 0.78), at(0.14, 0.78)];
  };
  plates.forEach((q, k) => {
    for (const side of [1, -1]) {
      const w = q.map((p) => {
        const [x, y] = toWorld(p, u);
        return [x * side, y] as [number, number];
      });
      const zp = Z_FRONT - 0.75 - k * 0.05;
      const plate = add(plateGeo(T, w, 0.18, 0.06), metal);
      plate.position.z = zp;
      const ins = inset(q).map((p) => {
        const [x, y] = toWorld(p, u);
        return [x * side, y] as [number, number];
      });
      const st = add(
        plateGeo(T, ins, gem ? 0.16 : 0.06, gem ? 0.05 : 0.03),
        gem ? gemMat : goldBlock,
      );
      st.position.z = zp + 0.2;
    }
  });

  // ---- 볏 보석(플래티넘부터, 시안에서는 다이아몬드)
  if (lv >= 4) {
    const [cx, cy] = toWorld(crestAt(tier), u);
    const crest = new T.Mesh(
      keep(new T.OctahedronGeometry(0.62, 0)),
      gem ? crestMat : goldBlock,
    );
    crest.scale.set(0.8, 1.15, 0.8);
    crest.position.set(cx, cy + 0.15, Z_FRONT - 0.1);
    body.add(crest);
    const seat = add(new T.CylinderGeometry(0.42, 0.5, 0.28, 6), metal);
    seat.rotation.x = Math.PI / 2;
    seat.position.set(cx, cy - 0.55, Z_FRONT - 0.25);
  }

  // 몸을 가운데로(볏·날개 때문에 위로 치우친 만큼 내린다)
  const box = new T.Box3().setFromObject(body);
  const mid = box.getCenter(new T.Vector3());
  body.position.set(-mid.x, -mid.y, 0);
  scene.add(spin);

  // ---- 뒤: 보석 후광, 배경판, 드리운 그림자(돌지 않는다)
  if (gem) {
    const haloTex = radialTexture(T, [
      [0, "rgba(160,215,255,0.55)"],
      [0.35, "rgba(90,165,255,0.22)"],
      [1, "rgba(40,90,200,0)"],
    ]);
    texs.push(haloTex);
    const halo = new T.Sprite(
      mat(
        new T.SpriteMaterial({
          map: haloTex,
          transparent: true,
          depthWrite: false,
          blending: T.AdditiveBlending,
        }),
      ),
    );
    halo.scale.set(13, 13, 1);
    halo.position.z = -6;
    scene.add(halo);
  }
  if (opt.backdrop) {
    const bgTex = radialTexture(T, [
      [0, gem ? "#3a5272" : "#3a3426"],
      [0.55, gem ? "#1b2334" : "#211e17"],
      [1, opt.pageColor],
    ]);
    texs.push(bgTex);
    const bg = new T.Mesh(
      keep(new T.PlaneGeometry(40, 40)),
      mat(new T.MeshBasicMaterial({ map: bgTex, toneMapped: false })),
    );
    bg.position.z = -14;
    scene.add(bg);
    const shadowTex = radialTexture(T, [
      [0, "rgba(0,0,0,0.55)"],
      [0.5, "rgba(0,0,0,0.25)"],
      [1, "rgba(0,0,0,0)"],
    ]);
    texs.push(shadowTex);
    const shadow = new T.Mesh(
      keep(new T.PlaneGeometry(1, 1)),
      mat(
        new T.MeshBasicMaterial({
          map: shadowTex,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        }),
      ),
    );
    shadow.scale.set(12, 4.2, 1);
    shadow.position.set(0.4, -4.9, -9);
    scene.add(shadow);
  }

  // ---- 직접 빛: 키(왼위 앞), 뒤 양옆 림(돌릴 때 테두리를 따라 빛난다)
  const key = new T.DirectionalLight(0xffffff, gem ? 1.6 : 2.4);
  key.position.set(-5, 7, 9);
  const rimL = new T.DirectionalLight(0xdfeeff, 2.2);
  rimL.position.set(-8, 2, -6);
  const rimR = new T.DirectionalLight(0xfff1dc, 2.6);
  rimR.position.set(8, 3, -5);
  const fill = new T.HemisphereLight(0xffffff, 0x202020, 0.35);
  scene.add(key, rimL, rimR, fill);
  if (gem) {
    // 보는 사람 쪽 점 조명 셋: 매끈한 보석의 깎인 면마다 아주 작고 또렷한 반짝 점(번짐이 별처럼 퍼뜨린다)
    for (const [x, y, z, p] of [
      [-7, 9, 16, 150],
      [8, 6, 14, 140],
      [1, -7, 15, 70],
    ] as const) {
      const l = new T.PointLight(0xffffff, p * (opt.hdr ? 1.6 : 1), 0, 2);
      l.position.set(x, y, z);
      scene.add(l);
    }
  }

  const camera = new T.PerspectiveCamera(16, 1, 1, 100);
  camera.position.set(0, 0, 43);
  camera.lookAt(0, 0, 0);

  const studio = studioScene(T, opt.hdr);

  return {
    scene,
    camera,
    spin,
    studio,
    dispose() {
      for (const x of geos) x.dispose();
      for (const x of mats) x.dispose();
      for (const x of texs) x.dispose();
      studio.traverse((o) => {
        const m = o as THREE_NS.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (m.material as THREE_NS.Material).dispose();
        }
      });
    },
  };
}
