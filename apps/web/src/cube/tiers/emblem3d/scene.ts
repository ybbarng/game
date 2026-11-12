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
import { TIER_IDS, type TierId } from "../table";
import { FUSED_CUBIE } from "./cubeTrace";
import type { GemPhysics, GemShape } from "./gem";
import {
  type GemSee,
  gemMaterialGL,
  gemMaterialNode,
  gemNodeEmissive,
  hasTsl,
} from "./gemMaterial";
import { GEM_STYLE_LOOK, type GemStyle, type GemStyleLook } from "./gemStyle";

/**
 * 3D 티어 엠블럼 시안의 장면(docs/47 14-7). 지금 SVG 엠블럼(14-6)의 구도를 3D로 옮긴다: 베벨 금속 육각 고리 틀,
 * 그 두께 한가운데에 박힌 등각 큐브(조각 27개), 큐브 면 조각 날개, 위 티어의 볏·왕관·빛살.
 *
 * - 틀은 앞뒤가 뚫린 고리다(뒤 판·우물 바닥 없음). 뒤 배경과 빛이 보석 조각을 지나 굴절돼 비친다. 앞뒤가 같은 꼴이라
 *   뒤로 돌려도 자연스럽다.
 * - 모든 티어가 같은 틀·큐브·비례를 쓰고 재질만 다르다. 조각은 네모 상자에 아주 얕은 두 단 베벨(사각 보석의 계단 면).
 * - 금속 티어(아이언~플래티넘): 불투명 금속(metalness 1), 티어마다 다른 금속.
 * - 보석 티어(에메랄드~챌린저): 맑은 보석. three 투과 대신 조각마다 안의 빛길(굴절·전반사·흡수·분산)을 따라가는
 *   재질(`gemMaterial.ts`, 계산은 `gem.ts`). 굴절률은 실제 보석 값, 다이아몬드·챌린저는 무색.
 * - 빛: 보석 사진 스튜디오처럼 코드로 만든 방(소프트박스·띠 조명·작은 점 조명)을 반사 지도로 쓴다(바깥 파일 없음).
 *
 * WebGL(`three`)과 WebGPU(`three/webgpu`) 묶음이 서로 다른 클래스 사본을 가지므로, 쓰는 쪽 이름공간을 `T`로 받는다.
 * 그래서 `three/examples`의 도우미를 쓰지 않고 기본 클래스로만 만든다.
 */

export type Three = typeof THREE_NS;

/** 시안 티어: 열 티어 모두 */
export const DRAFT_TIERS = TIER_IDS;
export type DraftTier = TierId;

/** 보석 티어(에메랄드부터) */
export function isGem(tier: DraftTier): boolean {
  return levelOf(tier) >= 5;
}

const SIN60 = Math.sqrt(3) / 2;
/** 큐브 조각 간격과 크기(조각 사이 틈 = 1 - CUBIE) */
const CUBIE = 0.92;
/** 조각 베벨 폭(두 단). 큐브 조각처럼 아주 작게 */
const CUBIE_BEVEL = 0.05;
/** 큐브 한 변 3을 몸통 대각선으로 볼 때 실루엣 육각형 반지름 */
const CUBE_SIL = 3 * Math.sqrt(2 / 3);
/** 틀 바깥 띠·안 띠(능선) 반두께. 큐브 가운데가 틀 두께의 한가운데(z 0)에 온다 */
const BAND_OUT = 0.42;
const BAND_IN = 0.6;
/** 카메라 거리(다이아몬드 기준). 티어마다 SVG 한 단위 길이에 맞춰 늘이고 줄인다 */
const CAMERA_Z = 43;
const U_REF = CUBE_SIL / (CUBE_R * 0.98);

/** 장면을 짓는 데 고르는 것 */
export interface BuildOptions {
  /** 뒤 배경판(보석이 굴절해 비출 것)과 드리운 그림자 */
  backdrop: boolean;
  /** 배경판 가장자리 색(페이지 바탕과 같게) */
  pageColor: string;
  /** 빛 세기 배수(HDR 길은 흰색보다 밝은 값을 그대로 보낸다) */
  hdr: boolean;
  /** 뒤 조명 세기 배수(찍은 그림은 작게 보여 대비가 커야 해서 줄인다). 기본 1 */
  backGlow?: number;
  /** 에메랄드 시안(docs/47 14-7 「다섯째 시안」). 에메랄드에만 쓰고 다른 티어는 무시한다 */
  gemStyle?: GemStyle | null | undefined;
}

/** 이 티어·옵션에 쓸 에메랄드 시안(에메랄드가 아니거나 고르지 않았으면 null) */
export function styleFor(
  tier: DraftTier,
  style: GemStyle | null | undefined,
): GemStyle | null {
  return tier === "emerald" && style ? style : null;
}

export interface EmblemScene {
  scene: THREE_NS.Scene;
  camera: THREE_NS.PerspectiveCamera;
  /** 끌어 돌리는 몸(틀·큐브·날개·볏) */
  spin: THREE_NS.Group;
  /** 몸이 아닌 뒤(배경판·그림자·후광). 찍은 그림의 테두리 본을 뜰 때 숨긴다 */
  behind: THREE_NS.Object3D[];
  /** 반사 지도로 구울 스튜디오 방(PMREM에 넘긴 뒤 버린다) */
  studio: THREE_NS.Scene;
  /** 그리기 전에 부른다(돌린 뒤 보석 계산에 쓰는 값을 고친다) */
  update(): void;
  /** 구운 반사 지도를 장면에 건다(보석 빛길도 이것을 읽는다) */
  applyEnvironment(env: THREE_NS.Texture): void;
  /** 번짐 값(시안마다 다를 수 있다) */
  bloom: { strength: number; radius: number; threshold: number };
  dispose(): void;
}

type Rgb = readonly [number, number, number];

/** 금속 하나(선형 색) */
interface MetalLook {
  color: Rgb;
  roughness: number;
}

interface TierLook {
  frame: MetalLook;
  /** 금속 티어의 큐브 조각 */
  block?: MetalLook;
  /** 보석 티어의 큐브 조각 */
  gem?: GemPhysics;
  /** 틀 꼭짓점 작은 보석·볏 보석(플래티넘). 보석 티어는 몸 보석을 그대로 쓴다 */
  accent?: GemPhysics;
  /** 티어 색: 후광·림 라이트에 살짝 */
  tint: string;
  /** 배경판 가운데 색 */
  backdrop: string;
  /** 보석 티어: 큐브 바로 뒤의 뒤 조명 색 */
  glow?: string;
}

/** 흡수: 조각 한 변(0.92)을 지난 뒤 남는 빛(선형 RGB)에서 단위 길이당 흡수를 구한다 */
function absorbFor(left: Rgb): Rgb {
  return [
    -Math.log(left[0]) / 0.92,
    -Math.log(left[1]) / 0.92,
    -Math.log(left[2]) / 0.92,
  ];
}

/**
 * 보석 안에서 되튀어 나간 빛이 읽는 스튜디오 반사 지도 세기. 반사 지도는 금속과 같은 방이라 1이 물리 그대로다. 예전
 * 2는 나가는 빛이 모두 반사 지도를 읽던 때라 보석이 밝은 스튜디오를 비추는 거울(금속)처럼 보였다
 */
export const GEM_GAIN = 1.3;
/**
 * 보석이 꿰뚫어 본 뒤 배경판 세기. 배경판은 톤 매핑 없이 그리는데 보석 빛은 톤 매핑을 거쳐 조금 어두워지고, 실제
 * 보석도 둘레 빛을 모아 뒤 배경보다 조금 밝게 보인다
 */
export const GEM_BACK_GAIN = 1.8;
/**
 * 보석 스튜디오의 큰 빛판 세기(금속 1 기준). 큰 빛판이 밝으면 안에서 되튄 빛이 면 전체를 고르게 밝혀 닦은 금속판처럼
 * 보였다(2026-11-12). 줄이면 되튄 빛은 가는 띠 조명·점 조명의 반짝임으로 남고, 면은 꿰뚫어 본 배경의 빛으로 산다
 */
export const GEM_BIG_PANEL = 0.35;
/** 배경판 자리(z)와 한 변(돌지 않는다) */
export const BACKDROP_Z = -14;
export const BACKDROP_SIZE = 40;
/** 큐브 바로 뒤 뒤 조명(라이트 박스) 세기: 색 보석, 무색 보석 */
const GLOW = 0.6;
const GLOW_CLEAR = 0.7;

/** 배경판 가운데 색: 어두운 바탕은 티어 색 그대로, 밝은 바탕은 바탕에 가깝게 옅게 */
function backdropCenter(center: string, page: string): string {
  const hex = (s: string) => Number.parseInt(s.slice(1), 16);
  const rgb = (n: number): [number, number, number] => [
    (n >> 16) & 255,
    (n >> 8) & 255,
    n & 255,
  ];
  const p = rgb(hex(page));
  const light = (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255 > 0.5;
  if (!light) return center;
  const c = rgb(hex(center));
  const mixed = p.map((v, i) => Math.round(v * 0.78 + (c[i] as number) * 0.22));
  return `#${mixed.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** 티어마다 재질(시안에서 고른 값, 보고·문서에 그대로 적는다) */
export const LOOK: Readonly<Record<DraftTier, TierLook>> = {
  iron: {
    frame: { color: [0.3, 0.31, 0.33], roughness: 0.55 },
    block: { color: [0.36, 0.37, 0.39], roughness: 0.5 },
    tint: "#9aa3ad",
    backdrop: "#2c2f33",
  },
  bronze: {
    frame: { color: [0.8, 0.4, 0.22], roughness: 0.36 },
    block: { color: [0.86, 0.46, 0.26], roughness: 0.34 },
    tint: "#e9a070",
    backdrop: "#3a2a22",
  },
  silver: {
    frame: { color: [0.86, 0.88, 0.9], roughness: 0.24 },
    block: { color: [0.9, 0.91, 0.93], roughness: 0.26 },
    tint: "#dfe7f0",
    backdrop: "#2e333a",
  },
  gold: {
    frame: { color: [1.0, 0.72, 0.29], roughness: 0.2 },
    block: { color: [1.0, 0.72, 0.29], roughness: 0.32 },
    tint: "#ffd27a",
    backdrop: "#3a3426",
  },
  platinum: {
    frame: { color: [0.84, 0.93, 0.92], roughness: 0.18 },
    block: { color: [0.8, 0.93, 0.91], roughness: 0.24 },
    // 청록 보석(파라이바 토르말린 굴절률 약 1.62)
    accent: { ior: 1.62, spread: 0, absorb: absorbFor([0.35, 0.86, 0.78]) },
    tint: "#9ff0e2",
    backdrop: "#22363a",
  },
  emerald: {
    frame: { color: [0.92, 0.93, 0.94], roughness: 0.26 },
    // 에메랄드 굴절률 1.577, 분산이 작아(0.014) 따로 따라가지 않는다
    gem: { ior: 1.577, spread: 0, absorb: absorbFor([0.3, 0.86, 0.5]) },
    tint: "#7dffbd",
    backdrop: "#1d3a2e",
    glow: "#9ef0c4",
  },
  diamond: {
    frame: { color: [0.9, 0.92, 0.96], roughness: 0.26 },
    // 다이아몬드 굴절률 2.417, 분산 0.044(화면에서 보이게 키움), 무색
    gem: { ior: 2.417, spread: 0.08, absorb: absorbFor([0.99, 0.99, 0.995]) },
    tint: "#9fd4ff",
    backdrop: "#24344c",
    glow: "#d2e6ff",
  },
  master: {
    frame: { color: [0.82, 0.8, 0.88], roughness: 0.26 },
    // 자수정(수정) 굴절률 1.544
    gem: { ior: 1.544, spread: 0, absorb: absorbFor([0.62, 0.3, 0.86]) },
    tint: "#e2a8ff",
    backdrop: "#2e2242",
    glow: "#e2c4ff",
  },
  grandmaster: {
    frame: { color: [0.3, 0.3, 0.33], roughness: 0.24 },
    // 루비(커런덤) 굴절률 1.77
    gem: { ior: 1.77, spread: 0, absorb: absorbFor([0.9, 0.05, 0.1]) },
    tint: "#ff8c8c",
    backdrop: "#3a1e22",
    glow: "#ffc0c0",
  },
  challenger: {
    frame: { color: [1.0, 0.74, 0.32], roughness: 0.22 },
    // 다이아몬드에 분산을 크게 키운 무지개 보석
    gem: { ior: 2.417, spread: 0.45, absorb: absorbFor([0.99, 0.99, 0.995]) },
    tint: "#ffe27a",
    backdrop: "#2a2e44",
    glow: "#fff0cc",
  },
};

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

/** 육각 띠(바깥 rOut, 안 rIn)를 z -half에서 half까지, 모서리 베벨(앞뒤 같은 꼴) */
function hexRing(
  T: Three,
  rOut: number,
  rIn: number,
  half: number,
  bevel: number,
) {
  const shape = shapeOf(T, hexPoints(rOut - bevel));
  shape.holes.push(pathOf(T, hexPoints(rIn + bevel)));
  const depth = Math.max(0.001, 2 * half - 2 * bevel);
  const g = new T.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 1,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/**
 * 큐브 조각: 한 변 s인 네모 상자의 열두 모서리를 폭 b로 두 단 깎는다(사각 보석의 얕은 계단 면). 네 옆 모서리는 바닥
 * 모양에서, 앞뒤 여덟 모서리는 돌출 베벨(두 단)에서 같은 꼴로 깎는다.
 */
function stepBox(T: Three, s: number, b: number) {
  const h = s / 2 - b;
  const k = 0.293 * b;
  const pts: [number, number][] = [];
  for (const [sx, sy] of [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ] as const) {
    // 꼭짓점 (sx·h, sy·h) 둘레를 두 단으로: 한 벽 → 45° 가운데 → 다른 벽(반시계 방향)
    const corner: [number, number][] = [
      [h, h - b],
      [h - k, h - k],
      [h - b, h],
    ];
    const list =
      sx * sy > 0 ? corner : corner.map(([x, y]) => [y, x] as [number, number]);
    for (const [x, y] of list) pts.push([x * sx, y * sy]);
  }
  const g = new T.ExtrudeGeometry(shapeOf(T, pts), {
    depth: s - 2 * b,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    curveSegments: 1,
  });
  g.translate(0, 0, -(s - 2 * b) / 2);
  return g;
}

/** 평평한 다각형 판(두께 d, 베벨 b). z는 -d/2-b ~ d/2+b */
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
  g.translate(0, 0, -d / 2);
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
 * 배경판: 가운데가 조금 밝은 은은한 그라데이션과 빛점 몇 개. 보석 조각을 지나 굴절돼 보일 것이다. 어수선하지 않게
 * 빛점은 엠블럼 뒤쪽에만 아홉 개, 씨앗을 고정해 늘 같은 그림.
 */
function backdropTexture(
  T: Three,
  center: string,
  page: string,
  glow: string | null,
  glowAlpha = 0.6,
  /** 작은 빛점(유리 시안 j~l은 뺀다: 안에 굴절돼 따로 떠 보인다) */
  dots = true,
) {
  const gem = glow !== null && dots;
  const size = 1024;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (ctx) {
    const h = size / 2;
    const g = ctx.createRadialGradient(h, h * 0.94, 0, h, h, h);
    g.addColorStop(0, center);
    g.addColorStop(0.3, center);
    g.addColorStop(1, page);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    if (glow) {
      // 큐브 바로 뒤의 뒤 조명(보석 사진의 라이트 박스): 조각을 지나 굴절돼 보석이 안에서 맑게 빛난다
      const back = ctx.createRadialGradient(h, h, 0, h, h, h * 0.17);
      back.addColorStop(0, glow);
      back.addColorStop(0.45, glow);
      back.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = glowAlpha;
      ctx.fillStyle = back;
      ctx.fillRect(0, 0, size, size);
      ctx.globalAlpha = 1;
    }
    if (gem) {
      let seed = 11;
      const rnd = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + rnd() * 0.5;
        const r = size * (0.035 + rnd() * 0.1);
        const x = h + Math.cos(a) * r;
        const y = h + Math.sin(a) * r;
        const rad = size * (0.006 + rnd() * 0.01);
        const dot = ctx.createRadialGradient(x, y, 0, x, y, rad);
        dot.addColorStop(0, "rgba(255,255,255,0.95)");
        dot.addColorStop(0.35, "rgba(235,245,255,0.35)");
        dot.addColorStop(1, "rgba(220,235,255,0)");
        ctx.fillStyle = dot;
        ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    }
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}

/**
 * 보석 사진 스튜디오 방(반사 지도용). 어두운 방에 큰 소프트박스, 양옆 띠 조명(림 라이트), 앞 약한 채움 빛,
 * 작은 점 조명 여럿(조각 모서리마다 또렷한 반짝임). 색 값이 1을 넘는 것은 조명 세기다.
 */
function studioScene(
  T: Three,
  hdr: boolean,
  tint: string,
  gem: boolean,
  kind: GemStyleLook["studio"] = "now",
  /** 방 벽 색(유리 시안: 배경판 가운데 색. 맑은 유리는 둘레를 그대로 비춘다) */
  roomColor?: string,
): THREE_NS.Scene {
  const s = new T.Scene();
  const k = hdr ? 1.4 : 1;
  const tc = new T.Color(tint);
  const room = new T.Mesh(
    new T.BoxGeometry(24, 24, 24),
    new T.MeshBasicMaterial({
      color: roomColor ?? (gem ? 0x050608 : 0x0e1014),
      side: T.BackSide,
    }),
  );
  s.add(room);
  const panel = (
    w: number,
    h: number,
    power: number,
    pos: [number, number, number],
    tintRgb: readonly [number, number, number] = [1, 1, 1],
  ) => {
    // 세기 0은 끈 조명: 판을 두지 않는다(검은 판으로 남으면 그 뒤 방을 가린다)
    if (power <= 0) return;
    const m = new T.Mesh(
      new T.PlaneGeometry(w, h),
      new T.MeshBasicMaterial({
        color: new T.Color(
          tintRgb[0] * power * k,
          tintRgb[1] * power * k,
          tintRgb[2] * power * k,
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
  // 보석은 큰 소프트박스를 줄인다: 면 전체가 밝게 비치면 뿌옇게(얼음처럼) 보였다. 대신 가는 띠 조명으로 또렷한 대비를 낸다
  // 에메랄드 시안 b(반짝임 무늬)는 큰 빛판을 거의 끄고 가는 띠를 늘린다: 깎은 면마다 띠를 비추거나 검은 방을 비춰
  // 검고 흰 조각 무늬가 또렷해진다. c(점빛)는 큰 빛판을 조금 줄이고 점 조명을 작고 세게
  const big = gem
    ? kind === "contrast"
      ? 0.1
      : kind === "sparkle"
        ? 0.25
        : kind === "glass"
          ? 0.2
          : GEM_BIG_PANEL
    : 1;
  panel(12, 6, 3.4 * big, [0, 9, -6]);
  panel(6, 8, 2.1 * big, [-9, -4, -6], [0.94, 0.98, 1]);
  panel(6, 8, 1.2 * big, [9, -4, -6], [1, 0.97, 0.93]);
  if (gem) {
    panel(10, 0.35, 7, [0, 8, -8]);
    panel(0.35, 9, 6, [-7, -3, -8]);
    panel(0.35, 9, 4, [7, -3, -8]);
    panel(6, 0.3, 5, [-2, -8, -7]);
    // 보석 사진의 뒤 라이트 박스: 보석을 곧게 지나 뒤를 보는 빛길(얇은 날개 조각, 정면 조각 가운데)이 검게 막히지 않게
    panel(
      14,
      14,
      // 유리는 끈다: 흰 라이트 박스를 비춘 칸이 어두운 바탕에서 회색(금속처럼)으로 보였다
      kind === "contrast" ? 0.12 : kind === "glass" ? 0 : 0.3,
      [0, 0, -11],
    );
  }
  if (gem && kind === "glass") {
    // 유리(시안 e~g): 앞쪽에 길고 가는 띠 조명 넷. 매끈한 면에 깨끗하고 가는 반사선으로 비친다(창문이 비친 유리)
    panel(16, 0.18, 9, [0, 9, 6]);
    panel(16, 0.14, 6, [0, -8, 7]);
    panel(0.18, 16, 8, [-9, 0, 7]);
    panel(0.14, 16, 6, [9, 1, 6]);
  }
  if (gem && kind === "contrast")
    // 사방에 가는 띠 열둘(앞·옆·뒤): 면마다 띠 하나가 걸리거나 어두운 틈이 걸린다
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const zf = i % 3 === 0 ? 6 : i % 3 === 1 ? -2 : -9;
      const along = i % 2 === 0;
      panel(along ? 0.25 : 5, along ? 5 : 0.25, 9, [
        Math.cos(a) * 10,
        Math.sin(a) * 10,
        zf,
      ]);
    }
  // 위 앞 소프트박스(약하게): 틀의 위로 기운 베벨
  panel(12, 3, 1.4 * big, [0, 10, 4]);
  // 양옆 띠 조명: 돌릴 때 옆면·모서리를 따라 흐르는 긴 반사(림). 왼쪽은 티어 색을 살짝
  panel(
    1.2,
    12,
    gem ? 4 : 8,
    [-10, 1, 2],
    [0.75 + 0.25 * tc.r, 0.75 + 0.25 * tc.g, 0.75 + 0.25 * tc.b],
  );
  panel(1.2, 12, 6, [10, 0, -1], [1, 0.97, 0.92]);
  // 뒤 위 림: 테두리에 가는 빛
  panel(10, 1, 6, [0, 6, -10]);
  // 앞 약한 채움 빛(틀 앞면이 비추는 곳)
  panel(8, 4, 0.8, [0, -1, 11]);
  // 아래 바닥에서 올라오는 아주 약한 반사
  panel(16, 16, 0.12, [0, -11, 0]);
  // 작은 점 조명: 조각마다 다른 자리에서 또렷하게 반짝인다(뒤로 돌려도 보이게 뒤쪽에도)
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
    [-7, -5, -7],
    [4, -8, -8],
  ];
  if (gem)
    // 보석은 작은 점 조명을 더: 돌릴 때 조각 모서리마다 또렷한 반짝 점이 옮겨 다닌다
    spots.push(
      [-9, 5, 3],
      [9, -1, 6],
      [-2, 9, 5],
      [4, 2, 11],
      [-6, -7, 5],
      [6, 9, 2],
      [0, -9, 4],
      [-10, 0, -3],
    );
  const spot = !gem ? 0.9 : kind === "sparkle" ? 0.32 : 0.6;
  // c의 점빛: 넓이는 1/3.5, 세기는 2.1배(더 세게 하면 은빛 틀 윗변이 비춰 하얗게 번졌다)
  // 유리(e~g)는 점 조명을 약하게: 반짝 점보다 가는 반사선이 앞서게
  const spotPower = !gem
    ? 45
    : kind === "sparkle"
      ? 150
      : kind === "glass"
        ? 35
        : 70;
  for (const p of spots) panel(spot, spot, spotPower, p);
  return s;
}

function linear(T: Three, rgb: Rgb): THREE_NS.Color {
  return new T.Color().setRGB(rgb[0], rgb[1], rgb[2], T.LinearSRGBColorSpace);
}

/** 보석 재질 하나와 그 빛길 정보(WebGPU는 반사 지도가 생긴 뒤 빛길을 붙인다) */
interface GemMat {
  mat: THREE_NS.Material;
  g: GemPhysics;
  shape: GemShape;
  inCube: boolean;
}

/** 엠블럼 장면을 짓는다 */
export function buildEmblemScene(
  T: Three,
  tier: DraftTier,
  opt: BuildOptions,
): EmblemScene {
  const styleId = styleFor(tier, opt.gemStyle);
  const sl = styleId ? GEM_STYLE_LOOK[styleId] : null;
  const look: TierLook = sl
    ? {
        ...LOOK[tier],
        gem: { ior: 1.577, spread: sl.spread, absorb: absorbFor(sl.left) },
      }
    : LOOK[tier];
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
  const behind: THREE_NS.Object3D[] = [];

  // ---- 재질
  const metal = mat(
    new T.MeshStandardMaterial({
      color: linear(T, look.frame.color),
      metalness: 1,
      roughness: look.frame.roughness,
      // 보석 티어는 틀이 보석보다 튀지 않게(밝은 반사가 번짐으로 퍼졌다)
      envMapIntensity: gem ? 0.7 : 1,
    }),
  );
  // 배경판 그림: 장면 뒤에 깔고(opt.backdrop), 보석이 꿰뚫어 볼 때도 같은 그림을 읽는다
  const bgTex = backdropTexture(
    T,
    backdropCenter(look.backdrop, opt.pageColor),
    opt.pageColor,
    look.glow ?? null,
    (sl
      ? sl.glow
      : look.gem && Math.max(...look.gem.absorb) < 0.05
        ? GLOW_CLEAR
        : GLOW) * (opt.backGlow ?? 1),
    !sl?.tint,
  );
  texs.push(bgTex);
  const see: GemSee = {
    back: bgTex,
    backZ: BACKDROP_Z,
    backSize: BACKDROP_SIZE,
    backGain: sl ? sl.backGain : GEM_BACK_GAIN,
    envGain: sl ? sl.envGain : GEM_GAIN,
    cubeInv: new T.Matrix4(),
    cube: new T.Matrix4(),
  };
  const node = hasTsl(T);
  const gems: GemMat[] = [];
  const gemMat = (g: GemPhysics, shape: GemShape, inCube = false) => {
    const m = mat(
      node
        ? gemMaterialNode(T, g)
        : gemMaterialGL(
            T,
            g,
            shape,
            see,
            inCube,
            sl ?? undefined,
            styleId ?? "now",
          ),
    );
    gems.push({ mat: m, g, shape, inCube });
    return m;
  };
  const metalBlock = mat(
    new T.MeshStandardMaterial({
      color: linear(T, (look.block ?? look.frame).color),
      metalness: 1,
      roughness: (look.block ?? look.frame).roughness,
      envMapIntensity: 1.3,
    }),
  );
  /** 큐브 조각(상자 보석, 꿰뚫어 본 빛이 뒤쪽 조각들을 지나며 더 흡수된다) */
  const blockMat = look.gem ? gemMat(look.gem, "box", true) : metalBlock;
  /** 왕관 상자(홀로 놓인 상자 보석) */
  const crownMat = look.gem ? gemMat(look.gem, "box") : metalBlock;
  /** 날개 조각(얇은 판 보석) */
  const plateMat = look.gem ? gemMat(look.gem, "slab") : metalBlock;
  /** 팔면체 작은 보석(틀 꼭짓점·볏·아래 보석): 보석 티어는 몸 보석, 플래티넘은 그 색 보석 */
  const accentGem = look.gem ?? look.accent;
  const octaMat = accentGem ? gemMat(accentGem, "octa") : metalBlock;

  // ---- 틀: 앞뒤가 뚫린 고리. 바깥 띠와 안 띠가 다른 두께(능선), 앞뒤 같은 꼴
  const add = (geo: THREE_NS.BufferGeometry, m: THREE_NS.Material) => {
    const mesh = new T.Mesh(keep(geo), m);
    body.add(mesh);
    return mesh;
  };
  add(hexRing(T, Ro, Rm, BAND_OUT, 0.12), metal);
  add(hexRing(T, Rm + 0.02, Ri, BAND_IN, 0.1), metal);
  // 실버부터: 틀 바깥에 한 겹 더(가는 고리)
  if (lv >= 2) {
    const r = Ro + 1.7 * u;
    add(hexRing(T, r + 0.45 * u, r - 0.45 * u, 0.2, 0.04), metal);
  }

  // ---- 큐브: 조각 27개를 몸통 대각선이 앞을 보게(윗면·왼면·오른면이 보이는 등각), 틀 두께 한가운데에
  const cube = new T.Group();
  cube.rotation.set(Math.atan(1 / Math.SQRT2), -Math.PI / 4, 0, "XYZ");
  const cubieGeo = keep(stepBox(T, CUBIE, CUBIE_BEVEL));
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) {
        const m = new T.Mesh(cubieGeo, blockMat);
        m.position.set(x, y, z);
        // 시안 g: 조각을 키워 틈을 거의 없앤다(빛길은 물체 좌표로 셈해 그대로 맞다)
        if (sl?.fused) m.scale.setScalar(FUSED_CUBIE / CUBIE);
        cube.add(m);
      }
  if (!gem) {
    // 조각 사이 틈이 어둡게 보이게 속을 채운다
    const core = new T.Mesh(
      keep(new T.BoxGeometry(2.9, 2.9, 2.9)),
      mat(
        new T.MeshStandardMaterial({
          color: 0x0c0a08,
          roughness: 0.7,
          metalness: 0.2,
        }),
      ),
    );
    cube.add(core);
  }
  body.add(cube);

  // ---- 날개: 큐브 면 조각 판(골드부터, 티어가 오를수록 늘어난다). 금속 판 앞뒤에 조각 재질 판
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
      const zp = -k * 0.03;
      const plate = add(plateGeo(T, w, 0.18, 0.05), metal);
      plate.position.z = zp;
      const ins = inset(q).map((p) => {
        const [x, y] = toWorld(p, u);
        return [x * side, y] as [number, number];
      });
      const inGeo = keep(plateGeo(T, ins, 0.04, 0.03));
      for (const face of [1, -1]) {
        const st = new T.Mesh(inGeo, plateMat);
        st.position.z = zp + face * (0.09 + 0.05 + 0.035);
        body.add(st);
      }
    }
  });

  // ---- 틀 꼭짓점 장식: 브론즈~골드는 금속 징, 플래티넘부터 작은 보석(앞뒤 모두)
  if (lv >= 1) {
    const rv = (Ro + Rm) / 2;
    // 보석 빛길은 팔면체 반지름 1로 셈하므로 보석 징은 반지름 1로 만들고 배율로 키운다
    const ro = 1.3 * s * u;
    const studGeo =
      lv >= 4
        ? keep(new T.OctahedronGeometry(1, 0))
        : keep(new T.SphereGeometry(1.1 * s * u, 16, 8));
    for (const [x, y] of hexPoints(rv))
      for (const face of [1, -1]) {
        const st = new T.Mesh(studGeo, lv >= 4 ? octaMat : metal);
        if (lv >= 4) st.scale.set(0.8 * ro, ro, 0.45 * ro);
        else st.scale.set(1, 1, 0.45);
        st.position.set(x, y, face * BAND_OUT);
        body.add(st);
      }
  }

  // ---- 볏 보석(플래티넘~마스터), 아래 보석(마스터부터)
  const crest = toWorld(crestAt(tier), u);
  if (lv >= 4 && lv <= 7) {
    const r = (lv >= 6 ? 3.6 : lv === 5 ? 3.3 : 2.6) * u;
    const g = new T.Mesh(keep(new T.OctahedronGeometry(1, 0)), octaMat);
    g.scale.set(0.8 * r, 1.15 * r, 0.8 * r);
    g.position.set(crest[0], crest[1] + r * 0.2, 0);
    body.add(g);
    const seat = add(
      new T.CylinderGeometry(r * 0.6, r * 0.7, BAND_OUT * 1.2, 6),
      metal,
    );
    seat.rotation.x = Math.PI / 2;
    seat.position.set(crest[0], crest[1] - r * 0.85, 0);
  }
  if (lv >= 7) {
    const r = 2.5 * u;
    const [bx, by] = toWorld([C[0], C[1] + FRAME_OUT * s + 1.6], u);
    const g = new T.Mesh(keep(new T.OctahedronGeometry(1, 0)), octaMat);
    g.scale.set(0.8 * r, 1.1 * r, 0.8 * r);
    g.position.set(bx, by, 0);
    body.add(g);
  }

  // ---- 왕관(그랜드마스터부터): 작은 등각 큐브를 쌓는다(SVG cubelet 자리 그대로)
  if (lv >= 8) {
    const cp = crestAt(tier);
    const cubes: [Pt, number][] = [
      [[cp[0], cp[1] - 4.4], lv >= 9 ? 4.2 : 3.8],
      [[cp[0] + 6.2, cp[1] - 0.8], 3.0],
      [[cp[0] - 6.2, cp[1] - 0.8], 3.0],
    ];
    if (lv >= 9)
      cubes.push(
        [[cp[0] + 11, cp[1] + 2.2], 2.4],
        [[cp[0] - 11, cp[1] + 2.2], 2.4],
      );
    for (const [p, r] of cubes) {
      // r은 실루엣 육각형 반지름 → 한 변 = r / √(2/3)
      const edge = (r * u) / Math.sqrt(2 / 3);
      const box = new T.Mesh(cubieGeo, crownMat);
      box.scale.setScalar(edge / CUBIE);
      box.rotation.set(Math.atan(1 / Math.SQRT2), -Math.PI / 4, 0, "XYZ");
      const [x, y] = toWorld(p, u);
      box.position.set(x, y, 0);
      body.add(box);
    }
  }

  // ---- 빛살(챌린저): 큐브 면 조각이 틀 뒤로 퍼진다(틀 밖에서 시작해 뚫린 가운데로 비치지 않게)
  if (lv >= 9) {
    for (const deg of [-90, -38, -142, 34, 146, 90]) {
      const a = (deg * Math.PI) / 180;
      const dir: Pt = [Math.cos(a), Math.sin(a)];
      const n: Pt = [-dir[1], dir[0]];
      const len = deg === -90 ? 31.5 : deg === 90 ? 29.5 : 31;
      const at = (d: number, w: number): [number, number] =>
        toWorld(
          [C[0] + dir[0] * d + n[0] * w, C[1] + dir[1] * d + n[1] * w],
          u,
        );
      const base = FRAME_OUT * s - 1;
      const mid = base + (len - base) * 0.45;
      add(
        plateGeo(
          T,
          [at(base, 0), at(mid, 2.4), at(len, 0), at(mid, -2.4)],
          0.1,
          0.03,
        ),
        metal,
      );
    }
  }

  // 몸을 가운데로(볏·날개 때문에 위로 치우친 만큼 내린다)
  const box = new T.Box3().setFromObject(body);
  const mid = box.getCenter(new T.Vector3());
  body.position.set(-mid.x, -mid.y, 0);
  scene.add(spin);

  // ---- 뒤: 후광(다이아몬드부터), 배경판, 드리운 그림자(돌지 않는다)
  if (lv >= 6) {
    const hex = Number.parseInt(look.tint.slice(1), 16);
    const rgb = `${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255}`;
    const haloTex = radialTexture(T, [
      [0, `rgba(${rgb},${lv >= 9 ? 0.4 : 0.28})`],
      [0.4, `rgba(${rgb},0.1)`],
      [1, `rgba(${rgb},0)`],
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
    behind.push(halo);
  }
  if (opt.backdrop) {
    const bg = new T.Mesh(
      keep(new T.PlaneGeometry(BACKDROP_SIZE, BACKDROP_SIZE)),
      mat(new T.MeshBasicMaterial({ map: bgTex, toneMapped: false })),
    );
    bg.position.z = BACKDROP_Z;
    scene.add(bg);
    behind.push(bg);
    const shadowTex = radialTexture(T, [
      [0, "rgba(0,0,0,0.5)"],
      [0.5, "rgba(0,0,0,0.22)"],
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
    shadow.position.set(0.4, -5.2, -9);
    scene.add(shadow);
    behind.push(shadow);
  }

  // ---- 직접 빛: 키(왼위 앞), 뒤 양옆 림(돌릴 때 테두리를 따라 빛난다, 왼쪽은 티어 색을 살짝)
  const key = new T.DirectionalLight(0xffffff, gem ? 1.4 : 2.4);
  key.position.set(-5, 7, 9);
  const rimL = new T.DirectionalLight(
    new T.Color(0xffffff).lerp(new T.Color(look.tint), 0.35),
    2.2,
  );
  rimL.position.set(-8, 2, -6);
  const rimR = new T.DirectionalLight(0xfff4e6, 2.4);
  rimR.position.set(8, 3, -5);
  const fill = new T.HemisphereLight(0xffffff, 0x202020, 0.35);
  scene.add(key, rimL, rimR, fill);
  if (gem) {
    // 보는 사람 쪽 점 조명 셋: 매끈한 보석의 모서리마다 아주 작고 또렷한 반짝 점
    for (const [x, y, z, p] of [
      [-7, 9, 16, 150],
      [8, 6, 14, 140],
      [1, -7, 15, 70],
    ] as const) {
      const l = new T.PointLight(
        0xffffff,
        p * 0.6 * (opt.hdr ? 1.6 : 1) * (sl?.frontLights ?? 1),
        0,
        2,
      );
      l.position.set(x, y, z);
      scene.add(l);
    }
  }

  // 티어마다 몸 크기가 달라(SVG coreScale) 카메라 거리를 SVG 한 단위 길이에 맞춘다
  const camera = new T.PerspectiveCamera(16, 1, 1, 100);
  camera.position.set(0, 0, (CAMERA_Z * u) / U_REF);
  camera.lookAt(0, 0, 0);

  // 유리 시안은 방 벽을 배경판 가운데 색으로: 앞·옆으로 나간 빛이 검은 방을 읽어 검은 칸이 생겼다(여섯째 시안 첫 판)
  const studio = studioScene(
    T,
    opt.hdr,
    look.tint,
    gem,
    sl?.studio,
    sl?.studio === "glass"
      ? backdropCenter(look.backdrop, opt.pageColor)
      : undefined,
  );

  return {
    scene,
    camera,
    spin,
    behind,
    studio,
    bloom: sl ? sl.bloom : GEM_STYLE_LOOK.now.bloom,
    update() {
      // 꿰뚫어 보는 빛이 큐브 전체 두께를 셀 수 있게 월드 → 큐브 좌표를 매 장 고친다
      scene.updateMatrixWorld();
      see.cube.copy(cube.matrixWorld);
      see.cubeInv.copy(cube.matrixWorld).invert();
    },
    applyEnvironment(env) {
      scene.environment = env;
      // WebGPU: 보석 빛길 노드는 반사 지도를 직접 읽으므로 지도가 생긴 뒤 붙인다(WebGL은 셰이더가 envMap을 읽는다)
      if (node)
        for (const x of gems) {
          (
            x.mat as THREE_NS.Material & { emissiveNode: unknown }
          ).emissiveNode = gemNodeEmissive(T, env, x.g, x.shape, see, x.inCube);
          x.mat.needsUpdate = true;
        }
    },
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
