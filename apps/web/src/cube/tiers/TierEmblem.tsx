"use client";

import { useEffect, useId, useRef } from "react";

import { cn } from "@/lib/cn";
import {
  BAND_FRAMES,
  BAND_HALF,
  BAND_SLANT,
  CUBE_C,
  CUBE_HEX,
  EMBLEM_BOX,
  EMBLEM_BOX_PIPS,
  GLINTS,
  type Glint,
  HDR_TIERS,
  type HdrTier,
  hdrBandSrc,
  hdrGlintSrc,
  hexAround,
  type Pt,
  RING_R,
} from "./emblemArt";
import { watchShine } from "./emblemShine";
import {
  DIVISIONS,
  type Division,
  TIER_IDS,
  TIER_LABEL,
  type TierId,
} from "./table";

/**
 * 큐브 티어 엠블럼(docs/47 14절). 등각 큐브(면마다 3×3 스티커 격자)에 티어의 재질 색을 입히고, 위 티어로 갈수록 장식이
 * 하나씩 는다: 테두리 → 테두리 징 → 두 줄 테두리·윗면 별 → 보석 징·면 깎임 → 에메랄드 보석·옆 가시 → 보석처럼 깎인 면·
 * 반짝임 → 궤도 고리 → 두 궤도·작은 왕관 → 빛살·큰 왕관. 구간(IV~I)은 아래 마름모 넷 가운데 켜진 개수(IV 하나 … I 넷).
 *
 * - 인라인 SVG 하나라 바깥 그림·글꼴이 없고 크기는 `size`(px)로 정한다. 28px 아래는 격자·징 같은 잔 선을 뺀다.
 * - 플래티넘부터 위는 가끔 빛 띠가 한 번 지나간다(화면에 여러 개 있어도 한 번에 하나, 보이는 것만, emblemShine.ts).
 *   움직임 줄이기나 `still`이면 움직이지 않는다.
 * - 다이아몬드부터 위는 HDR 화면이면 흰색보다 밝은 반짝임 그림(BT.2020 PQ AVIF)을 겹친다. 빛이 지나갈 때만 켜지고,
 *   움직임 줄이기·`still`이면 반짝임 점만 멈춘 채 켜 둔다. SDR 화면·HDR을 모르는 브라우저는 그림을 받지도 않는다.
 * - 넓은 색역(P3) 화면이면 위 티어의 보석 색이 더 짙어진다(globals.css의 `--emb-*`).
 */

interface Palette {
  /** 윗면(밝은 쪽 → 어두운 쪽) */
  top: readonly [string, string];
  left: readonly [string, string];
  right: readonly [string, string];
  /** 모서리 빛 */
  hi: string;
  /** 바깥 선·격자 */
  dark: string;
  /** 테두리(밝은 쪽 → 어두운 쪽) */
  ring: readonly [string, string];
  /** 징·보석·구간 표시 */
  accent: string;
}

/** 지금 표의 이름 색(TIER_TONE)과 같은 계열의 재질 색 */
const PALETTE: Readonly<Record<TierId, Palette>> = {
  // 무쇠: 푸른 기 도는 짙은 회색, 모서리는 갓 깎은 쇠처럼 밝게
  iron: {
    top: ["#b4bac2", "#7d838c"],
    left: ["#6c727b", "#4a4f57"],
    right: ["#4c5159", "#33373d"],
    hi: "#dfe4ea",
    dark: "#1f2226",
    ring: ["#9aa0a8", "#5a5f67"],
    accent: "#c3c8cf",
  },
  // 청동: 붉은 갈색
  bronze: {
    top: ["#f6c391", "#d08a4f"],
    left: ["#c27a42", "#95552a"],
    right: ["#8f5129", "#62361a"],
    hi: "#ffe1c2",
    dark: "#3a1f0e",
    ring: ["#e3a36c", "#9a5b30"],
    accent: "#f3bc8a",
  },
  // 은: 푸른빛이 살짝 도는 밝은 은
  silver: {
    top: ["#ffffff", "#d3dae4"],
    left: ["#c4ccd8", "#8e98a8"],
    right: ["#94a0b2", "#636d7d"],
    hi: "#ffffff",
    dark: "#2b3038",
    ring: ["#eef2f7", "#8d97a6"],
    accent: "#ffffff",
  },
  // 금
  gold: {
    top: ["#fff3b0", "#ffd24a"],
    left: ["#f5b82e", "#c98a0e"],
    right: ["#c4860f", "#8a5a06"],
    hi: "#fffbe0",
    dark: "#4a3000",
    ring: ["#ffe58a", "#c58a12"],
    accent: "#fff1a8",
  },
  // 백금: 청록빛 흰 금속
  platinum: {
    top: ["#e9fffa", "#a6eee0"],
    left: ["#7fdccb", "#3fa99c"],
    right: ["#3a9e93", "#226b66"],
    hi: "#f2fffc",
    dark: "#0d3533",
    ring: ["#c9f7ee", "#4fb3a6"],
    accent: "#d6fff6",
  },
  // 에메랄드
  emerald: {
    top: ["#a8ffd0", "#3fe08f"],
    left: ["#1fc27a", "#0b8a52"],
    right: ["#0a8450", "#055532"],
    hi: "#dcffec",
    dark: "#03301c",
    ring: ["#7bf0b4", "#109a5e"],
    accent: "#b9ffd9",
  },
  // 다이아몬드: 청백 보석
  diamond: {
    top: ["#ffffff", "#bfe7ff"],
    left: ["#9ad8ff", "#4aa6ef"],
    right: ["#4b9fe6", "#2a63b8"],
    hi: "#ffffff",
    dark: "#0d2a52",
    ring: ["#e3f5ff", "#5bb2f0"],
    accent: "#e8f7ff",
  },
  // 마스터: 보라 보석
  master: {
    top: ["#fbe3ff", "#e09cff"],
    left: ["#c46cf2", "#8d36c9"],
    right: ["#8a33c4", "#5a1a8c"],
    hi: "#fff0ff",
    dark: "#2c0a47",
    ring: ["#f1c4ff", "#a24fd9"],
    accent: "#f6d8ff",
  },
  // 그랜드마스터: 붉은 보석(루비)
  grandmaster: {
    top: ["#ffd9d9", "#ff8c8c"],
    left: ["#f0474c", "#b81d24"],
    right: ["#b5161f", "#760b12"],
    hi: "#ffecec",
    dark: "#3d0508",
    ring: ["#ffb3b3", "#c92a31"],
    accent: "#ffd0d0",
  },
  // 챌린저: 금빛 테두리에 맑은 푸른 큐브
  challenger: {
    top: ["#f2fbff", "#a9dcff"],
    left: ["#5fb2ff", "#2a73d9"],
    right: ["#2a6fd1", "#173f8f"],
    hi: "#ffffff",
    dark: "#0b1d45",
    ring: ["#fff0a6", "#d79a12"],
    accent: "#ffe27a",
  },
};

/** 티어 자리(0 = 아이언) */
function levelOf(tier: TierId): number {
  return TIER_IDS.indexOf(tier);
}

/** 빛 띠가 지나가는 티어(플래티넘부터) */
export function canShine(tier: TierId): boolean {
  return levelOf(tier) >= 4;
}

export function isHdrTier(tier: TierId): tier is HdrTier {
  return (HDR_TIERS as readonly string[]).includes(tier);
}

const pts = (list: readonly Pt[]) =>
  list.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
const lerp = (a: Pt, b: Pt, t: number): Pt => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];

const [T, UR, LR, B, LL, UL] = CUBE_HEX as [Pt, Pt, Pt, Pt, Pt, Pt];
const C = CUBE_C;

/** 세 면(꼭짓점 넷, 격자 축 둘) */
const FACES = {
  top: { quad: [T, UR, C, UL] as const, o: T, a: sub(UR, T), b: sub(UL, T) },
  left: { quad: [UL, C, B, LL] as const, o: UL, a: sub(C, UL), b: sub(LL, UL) },
  right: { quad: [C, UR, LR, B] as const, o: C, a: sub(UR, C), b: sub(B, C) },
};
type FaceKey = keyof typeof FACES;

/** 한 면의 3×3 격자 선(안쪽 넷) */
function gridLines(f: (typeof FACES)[FaceKey]): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  for (const t of [1 / 3, 2 / 3]) {
    out.push([add(f.o, f.a, t), add(add(f.o, f.a, t), f.b)]);
    out.push([add(f.o, f.b, t), add(add(f.o, f.b, t), f.a)]);
  }
  return out;
}

/** 면 가운데에서 네 변으로 나눈 깎인 면 넷 */
function facets(f: (typeof FACES)[FaceKey]): Pt[][] {
  const q = f.quad;
  const mid = lerp(q[0], q[2], 0.5);
  return [0, 1, 2, 3].map((i) => [q[i] as Pt, q[(i + 1) % 4] as Pt, mid]);
}

/** 윗면을 가운데 쪽으로 k배 줄인 마름모 */
function topInset(k: number): Pt[] {
  const mid = lerp(T, C, 0.5);
  return FACES.top.quad.map((q) => lerp(mid, q, k));
}

/** 네 갈래 반짝임(가로세로 줄기, 가운데가 굵다) */
function glintPath(g: Glint): string {
  const { x, y, r } = g;
  const w = r * 0.2;
  return `M${x} ${y - r}Q${x + w} ${y - w} ${x + r} ${y}Q${x + w} ${y + w} ${x} ${y + r}Q${x - w} ${y + w} ${x - r} ${y}Q${x - w} ${y - w} ${x} ${y - r}Z`;
}

const RING = hexAround(C, RING_R);
const RING_IN = hexAround(C, RING_R - 3);

/** 왕관(작은 것: 봉우리 셋, 큰 것: 다섯) */
function crownPath(big: boolean): string {
  if (!big)
    return "M25 12.2L24.4 5.6L28.4 8.6L32 3.4L35.6 8.6L39.6 5.6L39 12.2Z";
  return "M23.4 12.4L22.2 4.6L26.2 8L28.4 3.4L32 7.4L35.6 3.4L37.8 8L41.8 4.6L40.6 12.4Z";
}

/** 구간 → 켜진 표시 개수(IV 하나 … I 넷) */
export function divisionPips(d: Division): number {
  return DIVISIONS.indexOf(d) + 1;
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
  const shine = canShine(tier) && !still;
  const hdr = isHdrTier(tier) && !noHdr ? tier : null;

  useEffect(() => {
    if (!shine || !ref.current) return;
    return watchShine(ref.current);
  }, [shine]);

  /** 색 하나: 넓은 색역 화면이면 globals.css의 `--emb-<티어>-<이름>`이 덮는다 */
  const col = (name: string, hex: string) =>
    `var(--emb-${tier}-${name}, ${hex})`;
  const grad = (key: string, from: string, to: string, x2 = 0, y2 = 1) => (
    <linearGradient id={`${id}-${key}`} x1="0" y1="0" x2={x2} y2={y2}>
      <stop offset="0" style={{ stopColor: col(`${key}0`, from) }} />
      <stop offset="1" style={{ stopColor: col(`${key}1`, to) }} />
    </linearGradient>
  );
  const url = (key: string) => `url(#${id}-${key})`;

  const ringW = lv >= 3 ? 2.6 : lv >= 2 ? 2.2 : lv >= 1 ? 1.8 : 1.3;
  const glints = isHdrTier(tier) ? GLINTS[tier] : [];
  const sideSpikes = lv >= 5;
  const orbits = lv >= 8 ? 2 : lv >= 7 ? 1 : 0;

  const orbit = (rot: number, half: "back" | "front", k: number) => (
    <path
      key={`${rot}-${half}`}
      d={`M${C[0] - 23} ${C[1]}A23 6.6 0 0 ${half === "back" ? 1 : 0} ${C[0] + 23} ${C[1]}`}
      transform={`rotate(${rot} ${C[0]} ${C[1]})`}
      fill="none"
      stroke={url("ring")}
      strokeWidth={fine ? 1.3 : 2}
      strokeLinecap="round"
      opacity={half === "back" ? 0.45 * k : k}
    />
  );
  const orbitRots = orbits === 2 ? [-20, 20] : orbits === 1 ? [-20] : [];

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
          {grad("top", p.top[0], p.top[1], 1, 1)}
          {grad("left", p.left[0], p.left[1])}
          {grad("right", p.right[0], p.right[1])}
          {grad("ring", p.ring[0], p.ring[1], 0.4, 1)}
          <clipPath id={`${id}-cube`}>
            <polygon points={pts(CUBE_HEX)} />
          </clipPath>
          <linearGradient id={`${id}-band`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.85" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 바닥: 어두운 바탕에서도 모양이 뜨게 옅은 그림자 판 */}
        <polygon
          points={pts(hexAround(C, RING_R + 1))}
          fill="#000"
          opacity="0.22"
        />

        {/* 챌린저: 테두리 변 가운데마다 바깥으로 뻗는 빛살(꼭짓점의 가시와 엇갈려 별 모양이 된다) */}
        {lv >= 9 && (
          <g
            style={{ fill: col("ray", p.accent) }}
            stroke={p.dark}
            strokeWidth="0.6"
            strokeLinejoin="round"
          >
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const a = ((i - 1) * Math.PI) / 3;
              const dir: Pt = [Math.cos(a), Math.sin(a)];
              const side: Pt = [-dir[1], dir[0]];
              const base = add(C, dir, 21);
              const tip = add(C, dir, 31.5);
              return (
                <polygon
                  key={a}
                  points={pts([add(base, side, 3), tip, add(base, side, -3)])}
                />
              );
            })}
          </g>
        )}

        {/* 테두리. 실버부터 안쪽에 한 줄 더 */}
        {
          <g fill="none" strokeLinejoin="round">
            <polygon
              points={pts(RING)}
              stroke={p.dark}
              strokeWidth={ringW + 1.4}
              opacity="0.8"
            />
            <polygon
              points={pts(RING)}
              stroke={url("ring")}
              strokeWidth={ringW}
            />
            {lv >= 2 && fine && (
              <polygon
                points={pts(RING_IN)}
                stroke={url("ring")}
                strokeWidth="0.8"
                opacity="0.7"
              />
            )}
          </g>
        }

        {/* 옆 가시(에메랄드부터): 테두리 옆 네 꼭짓점에서 바깥으로 */}
        {sideSpikes && (
          <g
            fill={url("ring")}
            stroke={p.dark}
            strokeWidth="0.6"
            strokeLinejoin="round"
          >
            {[1, 2, 4, 5].map((i) => {
              const v = RING[i] as Pt;
              const out = v[0] > C[0] ? 1 : -1;
              const len = lv >= 6 ? 5.2 : 3.6;
              const tip: Pt = [
                v[0] + out * len,
                v[1] + (v[1] < C[1] ? -len * 0.35 : len * 0.35),
              ];
              const s1: Pt = [v[0], v[1] - 2.2];
              const s2: Pt = [v[0], v[1] + 2.2];
              return <polygon key={i} points={pts([s1, tip, s2])} />;
            })}
          </g>
        )}

        {/* 테두리 꼭짓점의 징(브론즈부터). 플래티넘부터 마름모 보석 */}
        {lv >= 1 && fine && (
          <g>
            {RING.map((v) =>
              lv >= 4 ? (
                <polygon
                  key={`${v[0]}-${v[1]}`}
                  points={pts([
                    [v[0], v[1] - 2.4],
                    [v[0] + 1.9, v[1]],
                    [v[0], v[1] + 2.4],
                    [v[0] - 1.9, v[1]],
                  ])}
                  style={{ fill: col("accent", p.accent) }}
                  stroke={p.dark}
                  strokeWidth="0.6"
                />
              ) : (
                <circle
                  key={`${v[0]}-${v[1]}`}
                  cx={v[0]}
                  cy={v[1]}
                  r="1.7"
                  fill={p.accent}
                  stroke={p.dark}
                  strokeWidth="0.6"
                />
              ),
            )}
          </g>
        )}

        {/* 궤도 고리 뒤쪽(마스터부터) */}
        {orbitRots.map((r) => orbit(r, "back", 1))}

        {/* 큐브 */}
        <g strokeLinejoin="round">
          <polygon points={pts(FACES.top.quad)} fill={url("top")} />
          <polygon points={pts(FACES.left.quad)} fill={url("left")} />
          <polygon points={pts(FACES.right.quad)} fill={url("right")} />

          {/* 보석처럼 깎인 면(다이아몬드부터): 면마다 네 조각의 밝기를 다르게 */}
          {lv >= 6 && (
            <g fill="#fff">
              {(["top", "left", "right"] as const).flatMap((k, fi) =>
                facets(FACES[k]).map((tri, i) => (
                  <polygon
                    key={pts(tri)}
                    points={pts(tri)}
                    opacity={
                      [
                        [0.28, 0.08, 0, 0.16],
                        [0.14, 0, 0.1, 0.04],
                        [0.1, 0.18, 0.02, 0],
                      ][fi]?.[i]
                    }
                  />
                )),
              )}
            </g>
          )}
          {/* 면 깎임(플래티넘·에메랄드): 윗면 앞쪽 반이 살짝 밝다 */}
          {lv >= 4 && lv < 6 && (
            <polygon points={pts([T, UR, UL])} fill="#fff" opacity="0.14" />
          )}

          {/* 스티커 격자 */}
          {fine && (
            <g
              stroke={p.dark}
              strokeWidth={lv >= 6 ? 0.7 : 0.9}
              opacity={lv >= 6 ? 0.4 : 0.55}
            >
              {(["top", "left", "right"] as const).flatMap((k) =>
                gridLines(FACES[k]).map(([a, b]) => (
                  <line
                    key={pts([a, b])}
                    x1={a[0]}
                    y1={a[1]}
                    x2={b[0]}
                    y2={b[1]}
                  />
                )),
              )}
            </g>
          )}

          {/* 모서리 빛: 윗면 바깥 두 변과 앞의 세 모서리 */}
          <g fill="none" stroke={p.hi} strokeLinecap="round">
            <polyline
              points={pts([UL, T, UR])}
              strokeWidth={fine ? 1 : 1.6}
              opacity="0.85"
            />
            <polyline
              points={pts([UL, C, UR])}
              strokeWidth={fine ? 0.9 : 1.4}
              opacity="0.7"
            />
            <line
              x1={C[0]}
              y1={C[1]}
              x2={B[0]}
              y2={B[1]}
              strokeWidth={fine ? 0.8 : 1.2}
              opacity="0.45"
            />
          </g>
          {/* 바깥 선 */}
          <polygon
            points={pts(CUBE_HEX)}
            fill="none"
            stroke={p.dark}
            strokeWidth={fine ? 1.2 : 1.8}
          />
        </g>

        {/* 윗면 가운데 장식: 골드·플래티넘은 별 스티커, 에메랄드는 계단식으로 깎은 보석 */}
        {lv === 3 || lv === 4 ? (
          <path
            d="M32 19.2L33.5 23.1L38.4 24L33.5 24.9L32 28.8L30.5 24.9L25.6 24L30.5 23.1Z"
            fill={p.hi}
            stroke={p.dark}
            strokeWidth="0.5"
            opacity="0.95"
          />
        ) : lv === 5 ? (
          <g stroke={p.dark} strokeWidth="0.5" strokeLinejoin="round">
            {/* 윗면에 박힌 계단식 보석: 윗면을 가운데로 줄인 마름모 셋 */}
            <polygon
              points={pts(topInset(0.46))}
              style={{ fill: col("gem", "#0f9d5c") }}
            />
            <polygon
              points={pts(topInset(0.3))}
              style={{ fill: col("gem2", "#5cf2a6") }}
            />
            <polygon points={pts(topInset(0.14))} fill="#eafff3" />
          </g>
        ) : null}

        {/* 궤도 고리 앞쪽 */}
        {orbitRots.map((r) => orbit(r, "front", 1))}

        {/* 왕관: 그랜드마스터는 작은 것, 챌린저는 큰 것(가운데 보석) */}
        {lv >= 8 && (
          <g strokeLinejoin="round">
            <path
              d={crownPath(lv >= 9)}
              fill={url("ring")}
              stroke={p.dark}
              strokeWidth="0.8"
            />
            {lv >= 9 && (
              <circle
                cx="32"
                cy="9.6"
                r="1.5"
                style={{ fill: col("gem", "#3fa3ff") }}
                stroke={p.dark}
                strokeWidth="0.4"
              />
            )}
          </g>
        )}

        {/* 빛 띠: 가끔 한 번 큐브 위를 지나간다(평소에는 보이지 않는다) */}
        {canShine(tier) && (
          <g clipPath={`url(#${id}-cube)`}>
            <g className="emb-band">
              <polygon
                points={pts([
                  [C[0] - BAND_HALF * 2 - 20 * BAND_SLANT, 54],
                  [C[0] + BAND_HALF * 2 - 20 * BAND_SLANT, 54],
                  [C[0] + BAND_HALF * 2 + 20 * BAND_SLANT, 14],
                  [C[0] - BAND_HALF * 2 + 20 * BAND_SLANT, 14],
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

      {hdr && <HdrLayer tier={hdr} still={still} pips={pips} />}
    </span>
  );
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
