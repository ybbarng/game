"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";

import { cn } from "@/lib/cn";
import {
  BAND_FRAMES,
  CENTER,
  CUBE_R,
  coreScale,
  crestAt,
  EMBLEM_BOX,
  EMBLEM_BOX_PIPS,
  FRAME_IN,
  FRAME_OUT,
  type Glint,
  glintsFor,
  HDR_TIERS,
  type HdrTier,
  hdrBandSrc,
  hdrFacetSrc,
  hdrGlintSrc,
  hexAround,
  levelOf,
  type Pt,
} from "./emblemArt";
import { watchShine } from "./emblemShine";
import { DIVISIONS, type Division, TIER_LABEL, type TierId } from "./table";

/**
 * 큐브 티어 엠블럼(docs/47 14-6). 베벨 금속 육각 틀에 박힌 등각 큐브(면마다 3×3 스티커)에 티어의 재질 색을 입히고,
 * 위 티어로 갈수록 바깥 실루엣이 커진다: 아이언 틀 하나 → 브론즈 징 → 실버 겹 틀 → 골드 큐브 조각 날개 → 플래티넘 날개
 * 둘·볏 → 에메랄드 날개 셋·에메랄드 볏 → 다이아몬드 날개 넷·깎인 보석 면·후광 → 마스터 궤도·아래 보석 → 그랜드마스터
 * 두 궤도·큐브 조각 왕관·뿔 → 챌린저 파편 빛살·큰 왕관. 구간(IV~I)은 아래 마름모 넷 가운데 켜진 개수(IV 하나 … I 넷).
 *
 * - 인라인 SVG 하나라 바깥 그림·글꼴이 없고 크기는 `size`(px)로 정한다. 필터 없이 미리 정한 그라데이션과 면 밝기로만
 *   입체를 낸다. 28px 아래는 스티커·징 같은 잔 선을 뺀다.
 * - 플래티넘부터 위는 가끔 빛 띠가 한 번 지나간다(화면에 여러 개 있어도 한 번에 하나, 높은 티어부터, 보이는 것만,
 *   emblemShine.ts). 움직임 줄이기나 `still`, 28px 아래면 움직이지 않는다.
 * - 다이아몬드부터 위는 HDR 화면이면 흰색보다 밝은 반짝임 그림(BT.2020 PQ AVIF)을 겹친다. 깎인 면 모서리 빛은 늘
 *   은은하게 켜 두고, 빛 띠가 지나갈 때 띠·반짝임 점이 더 밝게 켜진다. 움직임 줄이기·`still`·28px 아래면 반짝임 점도
 *   멈춘 채 켜 둔다. SDR 화면·HDR을 모르는 브라우저는 그림을 받지도 않는다.
 * - 넓은 색역(P3) 화면이면 위 티어의 보석 색이 더 짙어진다(globals.css의 `--emb-*`).
 */

interface Palette {
  /** 윗면(밝은 쪽 → 어두운 쪽) */
  top: readonly [string, string];
  left: readonly [string, string];
  right: readonly [string, string];
  /** 모서리 빛 */
  hi: string;
  /** 바깥 선·스티커 틈 */
  dark: string;
  /** 틀 금속(밝은 쪽 → 어두운 쪽) */
  ring: readonly [string, string];
  /** 징·보석·구간 표시 */
  accent: string;
  /** 볏 보석(짙은 쪽, 밝은 쪽) */
  gem: readonly [string, string];
}

/** 지금 표의 이름 색(TIER_TONE)과 같은 계열의 재질 색 */
const PALETTE: Readonly<Record<TierId, Palette>> = {
  iron: {
    top: ["#c3c9d1", "#858b94"],
    left: ["#737a83", "#4d525a"],
    right: ["#50555d", "#33373d"],
    hi: "#e6eaef",
    dark: "#16181b",
    ring: ["#a3a9b1", "#4f545b"],
    accent: "#c3c8cf",
    gem: ["#6b7078", "#c3c8cf"],
  },
  bronze: {
    top: ["#f8c99a", "#d08a4f"],
    left: ["#c27a42", "#8f5128"],
    right: ["#8f5129", "#5c3217"],
    hi: "#ffe4c7",
    dark: "#2a1608",
    ring: ["#eab07a", "#8a4f28"],
    accent: "#f3bc8a",
    gem: ["#a85d2c", "#f3bc8a"],
  },
  silver: {
    top: ["#ffffff", "#d3dae4"],
    left: ["#c4ccd8", "#8e98a8"],
    right: ["#94a0b2", "#5f6979"],
    hi: "#ffffff",
    dark: "#1f232a",
    ring: ["#f4f7fb", "#7f8a9a"],
    accent: "#ffffff",
    gem: ["#8d97a6", "#ffffff"],
  },
  gold: {
    top: ["#fff4b8", "#ffd24a"],
    left: ["#f5b82e", "#c48409"],
    right: ["#c4860f", "#845404"],
    hi: "#fffbe0",
    dark: "#3a2500",
    ring: ["#fff0a8", "#b97b0a"],
    accent: "#fff1a8",
    gem: ["#d99a12", "#fff3b0"],
  },
  platinum: {
    top: ["#effffb", "#a6eee0"],
    left: ["#7fdccb", "#3aa396"],
    right: ["#3a9e93", "#1f6560"],
    hi: "#f2fffc",
    dark: "#0a2c2a",
    ring: ["#e3fff8", "#4aa89c"],
    accent: "#d6fff6",
    gem: ["#2fa596", "#c9fff3"],
  },
  emerald: {
    top: ["#b0ffd5", "#3fe08f"],
    left: ["#1fc27a", "#0a8450"],
    right: ["#0a8450", "#044f2f"],
    hi: "#dcffec",
    dark: "#022818",
    ring: ["#b8f5d6", "#2f8a64"],
    accent: "#b9ffd9",
    gem: ["#08955a", "#7dffbd"],
  },
  diamond: {
    top: ["#ffffff", "#bfe7ff"],
    left: ["#9ad8ff", "#4aa6ef"],
    right: ["#4b9fe6", "#275db0"],
    hi: "#ffffff",
    dark: "#0a2246",
    ring: ["#eef8ff", "#5d8fc4"],
    accent: "#e8f7ff",
    gem: ["#7cc6ff", "#ffffff"],
  },
  master: {
    top: ["#fbe3ff", "#e09cff"],
    left: ["#c46cf2", "#8a33c4"],
    right: ["#8a33c4", "#55188a"],
    hi: "#fff0ff",
    dark: "#22073a",
    ring: ["#f6dcff", "#8b4cb8"],
    accent: "#f6d8ff",
    gem: ["#a63fe6", "#f3c8ff"],
  },
  grandmaster: {
    top: ["#ffe0e0", "#ff8c8c"],
    left: ["#f0474c", "#b51a22"],
    right: ["#b5161f", "#6e0a10"],
    hi: "#ffecec",
    dark: "#330407",
    ring: ["#ffd0d0", "#b0303a"],
    accent: "#ffd0d0",
    gem: ["#e0252e", "#ffc2c2"],
  },
  challenger: {
    top: ["#f2fbff", "#a9dcff"],
    left: ["#5fb2ff", "#2a73d9"],
    right: ["#2a6fd1", "#153a86"],
    hi: "#ffffff",
    dark: "#0a1a40",
    ring: ["#fff3b8", "#c98a0c"],
    accent: "#ffe27a",
    gem: ["#2f8cff", "#bfe4ff"],
  },
};

/** 빛 띠가 지나가는 티어(플래티넘부터) */
export function canShine(tier: TierId): boolean {
  return levelOf(tier) >= 4;
}

export function isHdrTier(tier: TierId): tier is HdrTier {
  return (HDR_TIERS as readonly string[]).includes(tier);
}

/** 구간 → 켜진 표시 개수(IV 하나 … I 넷) */
export function divisionPips(d: Division): number {
  return DIVISIONS.indexOf(d) + 1;
}

const f2 = (v: number) => v.toFixed(2);
const pts = (list: readonly Pt[]) =>
  list.map(([x, y]) => `${f2(x)},${f2(y)}`).join(" ");
const lerp = (a: Pt, b: Pt, t: number): Pt => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];

/** 두 #rrggbb 색 사이(t=0이면 a) */
function mix(a: string, b: string, t: number): string {
  const p = (h: string, i: number) => Number.parseInt(h.slice(i, i + 2), 16);
  const c = [1, 3, 5].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const SIN60 = Math.sqrt(3) / 2;
/** 빛은 왼위에서 온다(각도, 라디안) */
const LIGHT = (-118 * Math.PI) / 180;

/** 육각 틀 변 i(꼭짓점 i → i+1)의 바깥 방향이 빛을 받는 정도(-1~1) */
function edgeLit(i: number): number {
  const a = ((-60 + 60 * i) * Math.PI) / 180;
  return Math.cos(a - LIGHT);
}

/** 작은 등각 큐브 조각(날개·왕관). 가운데(앞 꼭짓점이 아니라 실루엣 가운데)와 반지름 */
function cubelet(
  key: string,
  c: Pt,
  r: number,
  p: Palette,
  fine: boolean,
): ReactNode {
  const [t, ur, lr, b, ll, ul] = hexAround(c, r) as [Pt, Pt, Pt, Pt, Pt, Pt];
  return (
    <g key={key} strokeLinejoin="round">
      <polygon points={pts([t, ur, c, ul])} fill={p.top[0]} />
      <polygon points={pts([ul, c, b, ll])} fill={p.left[0]} />
      <polygon points={pts([c, ur, lr, b])} fill={p.right[1]} />
      {fine && (
        <polyline
          points={pts([ul, c, ur])}
          fill="none"
          stroke={p.hi}
          strokeWidth="0.45"
          opacity="0.8"
        />
      )}
      <polygon
        points={pts([t, ur, lr, b, ll, ul])}
        fill="none"
        stroke={p.dark}
        strokeWidth={fine ? 0.55 : 0.8}
      />
    </g>
  );
}

/**
 * 날개(골드부터): 큐브 면 조각(등각 30° 평행사변형 판)이 틀 옆에서 깃털처럼 겹쳐 위로 펼쳐진다. 티어마다 판 수와 길이.
 * 판 k는 아래(0)부터 위로, 위 판일수록 길다.
 */
const WING_PLATES = [0, 0, 0, 1, 2, 3, 3, 4, 4, 4];
const WING_LEN = [0, 0, 0, 7, 7, 7.2, 7.8, 8.2, 8.6, 9];
const TAN30 = Math.tan(Math.PI / 6);

/** 오른쪽 날개 판 넷(왼쪽은 x를 뒤집는다). x0: 틀 옆 변, y0: 가장 아랫판 윗변 */
function wingPlates(lv: number, x0: number, y0: number): Pt[][] {
  const out: Pt[][] = [];
  const n = WING_PLATES[lv] ?? 0;
  const base = WING_LEN[lv] ?? 0;
  for (let k = n - 1; k >= 0; k--) {
    const len = base + k * 1.9;
    const y = y0 - k * 4.6;
    const h = 3.6;
    const rise = len * TAN30;
    out.push([
      [x0, y],
      [x0 + len, y - rise],
      [x0 + len, y - rise + h],
      [x0, y + h],
    ]);
  }
  return out;
}

export interface TierEmblemProps {
  tier: TierId;
  /** 있으면 아래에 구간 표시(28px 아래에서는 그리지 않는다) */
  division?: Division | null;
  /** 너비(px). 높이는 구간 표시가 있으면 조금 더 길다 */
  size?: number;
  /** 움직이지 않는다(성능을 아끼는 곳, 예: Cubie 미니 모드) */
  still?: boolean;
  /** HDR 반짝임 그림을 쓰지 않는다 */
  noHdr?: boolean;
  /** 주면 이름이 있는 그림(읽어 주기)으로, 없으면 장식(옆 글자가 이름을 말한다) */
  label?: string;
  className?: string;
}

export function TierEmblem({
  tier,
  division = null,
  size = 32,
  still = false,
  noHdr = false,
  label,
  className,
}: TierEmblemProps) {
  const p = PALETTE[tier];
  const lv = levelOf(tier);
  const fine = size >= 28;
  const pips = division !== null && fine;
  const H = pips ? EMBLEM_BOX_PIPS : EMBLEM_BOX;
  const id = `emb${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const ref = useRef<HTMLSpanElement>(null);
  // 28px 아래(기록 칸의 작은 표시)는 빛 띠가 거의 보이지 않아 차례에 넣지 않는다(위 티어 차례가 늦어진다)
  const shine = canShine(tier) && !still && fine;
  const hdr = isHdrTier(tier) && !noHdr ? tier : null;

  useEffect(() => {
    if (!shine || !ref.current) return;
    return watchShine(ref.current, lv);
  }, [shine, lv]);

  const C = CENTER;
  const s = coreScale(tier);
  const Ro = FRAME_OUT * s;
  const Ri = FRAME_IN * s;
  const Rm = Ri + (Ro - Ri) * 0.48;
  const Rc = CUBE_R * s;
  const O = hexAround(C, Ro);
  const M = hexAround(C, Rm);
  const I = hexAround(C, Ri);
  const K = hexAround(C, Rc);
  const [T, UR, LR, B, LL, UL] = K as [Pt, Pt, Pt, Pt, Pt, Pt];
  const faces = {
    top: { quad: [T, UR, C, UL] as const, o: T, a: sub(UR, T), b: sub(UL, T) },
    left: {
      quad: [UL, C, B, LL] as const,
      o: UL,
      a: sub(C, UL),
      b: sub(LL, UL),
    },
    right: { quad: [C, UR, LR, B] as const, o: C, a: sub(UR, C), b: sub(B, C) },
  };
  type FaceKey = keyof typeof faces;
  const FACE_KEYS: FaceKey[] = ["top", "left", "right"];

  /** 색 하나: 넓은 색역 화면이면 globals.css의 `--emb-<티어>-<이름>`이 덮는다 */
  const col = (name: string, hex: string) =>
    `var(--emb-${tier}-${name}, ${hex})`;
  const url = (key: string) => `url(#${id}-${key})`;

  // 틀 금속: 변마다 빛을 받는 정도로 밝게·어둡게(바깥 띠는 바깥으로, 안 띠는 안으로 기운 면)
  const fMid = mix(p.ring[0], p.ring[1], 0.42);
  const fHi = mix(p.ring[0], "#ffffff", 0.5);
  const fLo = mix(p.ring[1], p.dark, 0.5);
  const shade = (b: number) =>
    b >= 0 ? mix(fMid, fHi, Math.min(1, b)) : mix(fMid, fLo, Math.min(1, -b));

  /** 한 면의 스티커 아홉(칸 안쪽으로 조금 들인 평행사변형) */
  const stickers = (k: FaceKey) => {
    const f = faces[k];
    const t = 0.1;
    const out: Pt[][] = [];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        const at = (u: number, v: number) =>
          add(add(f.o, f.a, (i + u) / 3), f.b, (j + v) / 3);
        out.push([at(t, t), at(1 - t, t), at(1 - t, 1 - t), at(t, 1 - t)]);
      }
    return out;
  };
  /** 면 가운데에서 네 변으로 나눈 깎인 면 넷 */
  const facets = (k: FaceKey) => {
    const q = faces[k].quad;
    const mid = lerp(q[0], q[2], 0.5);
    return [0, 1, 2, 3].map((i) => [q[i] as Pt, q[(i + 1) % 4] as Pt, mid]);
  };

  const crest = crestAt(tier);
  const glints = isHdrTier(tier) ? glintsFor(tier) : [];
  const plates = wingPlates(lv, C[0] + Ro * SIN60 - 1.2, C[1] + 3.2);
  const mirror = (q: Pt[]): Pt[] => q.map(([x, y]) => [2 * C[0] - x, y]);
  /** 날개 판 하나: 금속 판 위에 그 티어 색 스티커 */
  const plate = (key: string, q: Pt[], k: number) => {
    const inset = [
      lerp(
        lerp(q[0] as Pt, q[1] as Pt, 0.16),
        lerp(q[3] as Pt, q[2] as Pt, 0.16),
        0.24,
      ),
      lerp(
        lerp(q[0] as Pt, q[1] as Pt, 0.9),
        lerp(q[3] as Pt, q[2] as Pt, 0.9),
        0.24,
      ),
      lerp(
        lerp(q[0] as Pt, q[1] as Pt, 0.9),
        lerp(q[3] as Pt, q[2] as Pt, 0.9),
        0.76,
      ),
      lerp(
        lerp(q[0] as Pt, q[1] as Pt, 0.16),
        lerp(q[3] as Pt, q[2] as Pt, 0.16),
        0.76,
      ),
    ];
    return (
      <g key={key} strokeLinejoin="round">
        <polygon
          points={pts(q)}
          fill={shade(0.5 - k * 0.22)}
          stroke={p.dark}
          strokeWidth={fine ? 0.6 : 0.9}
        />
        {fine && (
          <>
            <polygon
              points={pts(inset)}
              fill={mix(p.left[0], p.top[0], 0.35 - k * 0.1)}
            />
            <line
              x1={f2((q[0] as Pt)[0])}
              y1={f2((q[0] as Pt)[1] + 0.3)}
              x2={f2((q[1] as Pt)[0])}
              y2={f2((q[1] as Pt)[1] + 0.3)}
              stroke={fHi}
              strokeWidth="0.45"
              opacity="0.9"
            />
          </>
        )}
      </g>
    );
  };

  return (
    <span
      ref={ref}
      data-cube-emblem={tier}
      {...(pips && division ? { "data-cube-emblem-division": division } : {})}
      className={cn(
        "cube-emblem relative inline-block shrink-0 align-middle",
        className,
      )}
      style={{ width: size, height: (size * H) / EMBLEM_BOX }}
      {...(label
        ? { role: "img", "aria-label": label }
        : { "aria-hidden": true })}
    >
      <svg
        viewBox={`0 0 ${EMBLEM_BOX} ${H}`}
        width="100%"
        height="100%"
        className="block overflow-visible"
        aria-hidden="true"
      >
        <defs>
          {/* 큐브 면: 면 전체에 걸친 한 그라데이션(스티커가 이어져 보인다) */}
          {(
            [
              ["top", T, C],
              ["left", UL, LL],
              ["right", UR, B],
            ] as const
          ).map(([k, a, b]) => (
            <linearGradient
              key={k}
              id={`${id}-${k}`}
              gradientUnits="userSpaceOnUse"
              x1={f2(a[0])}
              y1={f2(a[1])}
              x2={f2(b[0])}
              y2={f2(b[1])}
            >
              <stop offset="0" style={{ stopColor: col(`${k}0`, p[k][0]) }} />
              <stop offset="1" style={{ stopColor: col(`${k}1`, p[k][1]) }} />
            </linearGradient>
          ))}
          {/* 틀 안 우물: 가운데가 조금 밝고 가장자리가 어둡다(큐브가 박혀 보인다) */}
          <radialGradient id={`${id}-well`} cx="0.5" cy="0.42" r="0.6">
            <stop offset="0" stopColor={mix(p.right[1], "#000000", 0.25)} />
            <stop offset="1" stopColor={mix(p.dark, "#000000", 0.55)} />
          </radialGradient>
          {/* 윗면 반사: 뒤 꼭짓점에서 앞으로 옅어진다 */}
          <linearGradient
            id={`${id}-sheen`}
            gradientUnits="userSpaceOnUse"
            x1={f2(T[0])}
            y1={f2(T[1])}
            x2={f2(C[0])}
            y2={f2(C[1])}
          >
            <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
            <stop offset="0.55" stopColor="#fff" stopOpacity="0.08" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0" stopColor={fHi} />
            <stop offset="0.5" stopColor={fMid} />
            <stop offset="1" stopColor={fLo} />
          </linearGradient>
          <linearGradient id={`${id}-gem`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: col("gem2", p.gem[1]) }} />
            <stop offset="1" style={{ stopColor: col("gem", p.gem[0]) }} />
          </linearGradient>
          {lv >= 6 && (
            <radialGradient id={`${id}-halo`} cx="0.5" cy="0.5" r="0.5">
              <stop
                offset="0.3"
                style={{ stopColor: col("halo", p.accent) }}
                stopOpacity={lv >= 9 ? 0.48 : lv >= 7 ? 0.3 : 0.24}
              />
              <stop
                offset="1"
                style={{ stopColor: col("halo", p.accent) }}
                stopOpacity="0"
              />
            </radialGradient>
          )}
          {lv >= 6 && (
            <radialGradient id={`${id}-inner`} cx="0.5" cy="0.4" r="0.5">
              <stop offset="0" stopColor="#fff" stopOpacity="0.32" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
          )}
          {lv >= 9 && (
            <linearGradient id={`${id}-ray`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: col("ray", p.accent) }} />
              <stop offset="1" stopColor={fLo} />
            </linearGradient>
          )}
          <clipPath id={`${id}-cube`}>
            <polygon points={pts(K)} />
          </clipPath>
          <linearGradient id={`${id}-band`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.85" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 후광(다이아몬드부터): 어두운 바탕에서 엠블럼 둘레가 은은하게 빛난다 */}
        {lv >= 6 && <circle cx={C[0]} cy={C[1]} r="31.5" fill={url("halo")} />}

        {/* 챌린저: 큐브 면 조각이 뒤로 퍼지는 빛살 */}
        {lv >= 9 && (
          <g fill={url("ray")} stroke={p.dark} strokeWidth="0.5">
            {[-90, -38, -142, 34, 146, 90].map((deg) => {
              const a = (deg * Math.PI) / 180;
              const dir: Pt = [Math.cos(a), Math.sin(a)];
              const n: Pt = [-dir[1], dir[0]];
              const len = deg === -90 ? 31.5 : deg === 90 ? 29.5 : 31;
              const base = add(C, dir, 12);
              const mid = add(C, dir, len * 0.62);
              return (
                <polygon
                  key={deg}
                  points={pts([
                    base,
                    add(mid, n, 2.4),
                    add(C, dir, len),
                    add(mid, n, -2.4),
                  ])}
                />
              );
            })}
          </g>
        )}

        {/* 그림자: 몸이 바탕에서 조금 떠 보이게 */}
        <polygon
          points={pts(O.map((v) => add(v, [0, 1.6])))}
          fill="#000"
          opacity="0.45"
        />

        {/* 날개(골드부터): 큐브 면 조각 판이 틀 옆에서 위로 펼쳐진다 */}
        {plates.flatMap((q, i) => {
          const k = plates.length - 1 - i;
          return [plate(`wr${k}`, q, k), plate(`wl${k}`, mirror(q), k)];
        })}

        {/* 실버부터: 틀 바깥에 한 겹 더 */}
        {lv >= 2 && (
          <polygon
            points={pts(hexAround(C, Ro + 1.7))}
            fill="none"
            stroke={url("metal")}
            strokeWidth={fine ? 0.9 : 1.2}
            strokeLinejoin="round"
          />
        )}

        {/* 베벨 금속 틀: 변마다 바깥 띠와 안 띠(빛 받는 쪽 밝게, 반대쪽 어둡게) */}
        <g strokeLinejoin="round">
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const j = (i + 1) % 6;
            const lit = edgeLit(i);
            return (
              <g key={i}>
                <polygon
                  points={pts([O[i] as Pt, O[j] as Pt, M[j] as Pt, M[i] as Pt])}
                  fill={shade(lit)}
                />
                <polygon
                  points={pts([M[i] as Pt, M[j] as Pt, I[j] as Pt, I[i] as Pt])}
                  fill={shade(-lit * 0.75)}
                />
              </g>
            );
          })}
          <polygon
            points={pts(O)}
            fill="none"
            stroke={p.dark}
            strokeWidth={fine ? 0.8 : 1.2}
          />
          {fine && (
            <polygon
              points={pts(M)}
              fill="none"
              stroke={fHi}
              strokeWidth="0.3"
              opacity="0.5"
            />
          )}
          {/* 우물 */}
          <polygon
            points={pts(I)}
            fill={url("well")}
            stroke={p.dark}
            strokeWidth="0.6"
          />
        </g>

        {/* 브론즈부터: 틀 꼭짓점의 징. 플래티넘부터 마름모 보석 */}
        {lv >= 1 && fine && (
          <g>
            {M.map((v) =>
              lv >= 4 ? (
                <polygon
                  key={pts([v])}
                  points={pts([
                    [v[0], v[1] - 1.7 * s],
                    [v[0] + 1.3 * s, v[1]],
                    [v[0], v[1] + 1.7 * s],
                    [v[0] - 1.3 * s, v[1]],
                  ])}
                  fill={url("gem")}
                  stroke={p.dark}
                  strokeWidth="0.4"
                />
              ) : (
                <g key={pts([v])}>
                  <circle cx={v[0]} cy={v[1]} r={1.25 * s} fill={fLo} />
                  <circle
                    cx={v[0] - 0.3 * s}
                    cy={v[1] - 0.3 * s}
                    r={0.85 * s}
                    fill={fHi}
                  />
                </g>
              ),
            )}
          </g>
        )}

        {/* 큐브 */}
        <g strokeLinejoin="round">
          {fine ? (
            <>
              {/* 몸(스티커 사이 틈 색) 위에 스티커 */}
              <polygon points={pts(K)} fill={p.dark} />
              {FACE_KEYS.flatMap((k) =>
                stickers(k).map((q) => (
                  <polygon key={pts(q)} points={pts(q)} fill={url(k)} />
                )),
              )}
            </>
          ) : (
            FACE_KEYS.map((k) => (
              <polygon key={k} points={pts(faces[k].quad)} fill={url(k)} />
            ))
          )}

          {/* 보석처럼 깎인 면(다이아몬드부터): 면마다 네 조각의 밝기를 다르게, 안쪽에서 빛 */}
          {lv >= 6 && (
            <>
              <g fill="#fff">
                {FACE_KEYS.flatMap((k, fi) =>
                  facets(k).map((tri, i) => (
                    <polygon
                      key={pts(tri)}
                      points={pts(tri)}
                      opacity={
                        [
                          [0.26, 0.06, 0, 0.14],
                          [0.12, 0, 0.09, 0.03],
                          [0.08, 0.16, 0.02, 0],
                        ][fi]?.[i]
                      }
                    />
                  )),
                )}
              </g>
              <polygon points={pts(K)} fill={url("inner")} />
            </>
          )}

          {/* 윗면 반사 */}
          <polygon points={pts(faces.top.quad)} fill={url("sheen")} />

          {/* 모서리 빛: 윗면 바깥 두 변과 앞의 세 모서리 */}
          <g fill="none" stroke={p.hi} strokeLinecap="round">
            <polyline
              points={pts([UL, T, UR])}
              strokeWidth={fine ? 0.9 : 1.4}
              opacity="0.9"
            />
            <polyline
              points={pts([UL, C, UR])}
              strokeWidth={fine ? 0.7 : 1.2}
              opacity="0.65"
            />
            <line
              x1={C[0]}
              y1={C[1]}
              x2={B[0]}
              y2={B[1]}
              strokeWidth={fine ? 0.6 : 1}
              opacity="0.4"
            />
          </g>
          <polygon
            points={pts(K)}
            fill="none"
            stroke={p.dark}
            strokeWidth={fine ? 0.9 : 1.4}
          />
        </g>

        {/* 볏(플래티넘~마스터): 틀 위 꼭짓점의 보석. 에메랄드는 계단식, 다이아몬드부터 깎인 보석 */}
        {lv >= 4 && lv <= 7 && (
          <Gem
            c={crest}
            r={lv >= 6 ? 3.6 : lv === 5 ? 3.3 : 2.6}
            cut={lv >= 6}
            id={id}
            dark={p.dark}
          />
        )}
        {/* 아래 보석(마스터부터) */}
        {lv >= 7 && (
          <Gem c={[C[0], C[1] + Ro + 1.6]} r={2.5} cut id={id} dark={p.dark} />
        )}

        {/* 왕관(그랜드마스터부터): 큐브 조각을 쌓은 왕관 */}
        {lv >= 8 && (
          <g>
            {lv >= 9 &&
              [1, -1].map((k) =>
                cubelet(
                  `cr2${k}`,
                  [crest[0] + k * 11, crest[1] + 2.2],
                  2.4,
                  p,
                  fine,
                ),
              )}
            {[1, -1].map((k) =>
              cubelet(
                `cr1${k}`,
                [crest[0] + k * 6.2, crest[1] - 0.8],
                3.0,
                p,
                fine,
              ),
            )}
            {cubelet(
              "cr0",
              [crest[0], crest[1] - 4.4],
              lv >= 9 ? 4.2 : 3.8,
              p,
              fine,
            )}
          </g>
        )}

        {/* 빛 띠: 가끔 한 번 큐브 위를 지나간다(평소에는 보이지 않는다) */}
        {canShine(tier) && (
          <g clipPath={`url(#${id}-cube)`}>
            <g className="emb-band">
              <polygon
                points={pts([
                  [C[0] - Rc * 0.45 - Rc * 0.55, C[1] + Rc],
                  [C[0] + Rc * 0.45 - Rc * 0.55, C[1] + Rc],
                  [C[0] + Rc * 0.45 + Rc * 0.55, C[1] - Rc],
                  [C[0] - Rc * 0.45 + Rc * 0.55, C[1] - Rc],
                ])}
                fill={`url(#${id}-band)`}
              />
            </g>
          </g>
        )}

        {/* 반짝임 점(다이아몬드부터) */}
        {glints.length > 0 && (
          <g fill="#fff" className="emb-glints">
            {glints.map((g) => (
              <path
                key={`${g.x}-${g.y}`}
                d={glintPath(g)}
                className="emb-glint"
              />
            ))}
          </g>
        )}

        {/* 구간: 마름모 넷 가운데 켜진 개수 */}
        {pips &&
          division &&
          [0, 1, 2, 3].map((i) => {
            const x = 32 + (i - 1.5) * 9;
            const on = i < divisionPips(division);
            return (
              <polygon
                key={i}
                points={pts([
                  [x, 65.6],
                  [x + 3.2, 69],
                  [x, 72.4],
                  [x - 3.2, 69],
                ])}
                fill={on ? p.accent : "#ffffff"}
                fillOpacity={on ? 1 : 0.16}
                stroke={on ? p.dark : "none"}
                strokeWidth="0.6"
              />
            );
          })}
      </svg>

      {hdr && <HdrLayer tier={hdr} still={!shine} pips={pips} />}
    </span>
  );
}

/** 볏·아래 보석: 마름모 보석. `cut`이면 깎인 면 넷의 밝기를 다르게 */
function Gem({
  c,
  r,
  cut,
  id,
  dark,
}: {
  c: Pt;
  r: number;
  cut: boolean;
  id: string;
  dark: string;
}) {
  const t: Pt = [c[0], c[1] - r];
  const rt: Pt = [c[0] + r * 0.78, c[1]];
  const b: Pt = [c[0], c[1] + r];
  const lt: Pt = [c[0] - r * 0.78, c[1]];
  return (
    <g strokeLinejoin="round">
      <polygon points={pts([t, rt, b, lt])} fill={`url(#${id}-gem)`} />
      {cut && (
        <g fill="#fff">
          <polygon points={pts([t, rt, c])} opacity="0.45" />
          <polygon points={pts([lt, t, c])} opacity="0.2" />
          <polygon points={pts([b, lt, c])} opacity="0.05" />
        </g>
      )}
      <polygon
        points={pts([t, rt, b, lt])}
        fill="none"
        stroke={dark}
        strokeWidth="0.55"
      />
    </g>
  );
}

/** 네 갈래 반짝임(가로세로 줄기, 가운데가 굵다) */
function glintPath(g: Glint): string {
  const { x, y, r } = g;
  const w = r * 0.2;
  const n = (v: number) => f2(v);
  return `M${n(x)} ${n(y - r)}Q${n(x + w)} ${n(y - w)} ${n(x + r)} ${n(y)}Q${n(x + w)} ${n(y + w)} ${n(x)} ${n(y + r)}Q${n(x - w)} ${n(y + w)} ${n(x - r)} ${n(y)}Q${n(x - w)} ${n(y - w)} ${n(x)} ${n(y - r)}Z`;
}

/**
 * HDR 반짝임 그림(HDR 화면 + `dynamic-range-limit`을 아는 브라우저에서만 CSS가 보인다. 안 보이는 img는 lazy라 받지 않는다).
 * img에는 위치·변형을 걸지 않고 감싸는 칸만 놓는다(Safari가 위치·변형 걸린 HDR 그림을 SDR로 그린 적이 있다, docs/36).
 */
function HdrLayer({
  tier,
  still,
  pips,
}: {
  tier: HdrTier;
  still: boolean;
  pips: boolean;
}) {
  const h = pips ? `${(EMBLEM_BOX / EMBLEM_BOX_PIPS) * 100}%` : "100%";
  const img = (src: string, cls: string) => (
    <span
      key={src}
      className="absolute top-0 left-0 block w-full"
      style={{ height: h }}
    >
      {/* biome-ignore lint/performance/noImgElement: 정적 내보내기의 작은 HDR 그림이라 next/image가 필요 없다 */}
      <img
        src={src}
        alt=""
        draggable={false}
        loading="lazy"
        decoding="async"
        className={`emb-hdr ${cls} block h-full w-full`}
      />
    </span>
  );
  return (
    <span
      className="emb-hdr-layer pointer-events-none"
      data-still={still ? "" : undefined}
    >
      {img(hdrFacetSrc(tier), "emb-hdr-facet")}
      {!still &&
        BAND_FRAMES.map((_, i) =>
          img(hdrBandSrc(tier, i), `emb-hdr-band emb-hdr-band${i}`),
        )}
      {img(hdrGlintSrc(tier), "emb-hdr-glint")}
    </span>
  );
}

/** 이름과 엠블럼 이름표(읽어 주기용) */
export function emblemLabel(tier: TierId, division?: Division | null): string {
  return division ? `${TIER_LABEL[tier]} ${division}` : TIER_LABEL[tier];
}
