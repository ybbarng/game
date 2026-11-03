"use client";

import { useId, useMemo } from "react";

import { cn } from "@/lib/cn";

import {
  type FingerMarkDef,
  FM_H,
  FM_W,
  fingermarkOf,
  fingerStrokes,
  PAD,
} from "./finger-pattern";

/** 별 하나(꼭짓점 n개)의 polygon 점 */
function starPoints(
  cx: number,
  cy: number,
  r: number,
  inner: number,
  n: number,
  rot: number,
): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = ((rot - 90) * Math.PI) / 180 + (Math.PI * i) / n;
    const rr = i % 2 === 0 ? r : inner;
    pts.push(
      `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`,
    );
  }
  return pts.join(" ");
}

/**
 * 지문 도장(docs/36 11-64): 공개 열쇠에서 정한 무늬를 붉은 인주로 찍은 모습. SVG 하나라 크기는 부모가 정한다
 * (`className="h-12"` 등, 판은 세로로 긴 100×120). 색은 `currentColor`라 `text-*`로 바꿀 수 있다(기본 rose-700, 신청서 「패스키 서명」 도장과 같은 인주).
 * 진짜 지문으로 보이지 않게 가운데에 별 하나(둘레 골을 비운다), 골 사이에 별 점 몇 개를 둔다. 연출은 없다(찍히는 모습은 쓰는 쪽이 맡는다).
 * `label`을 주면 그림으로 읽히고, 없으면 꾸밈으로 숨긴다.
 */
export function FingerMark({
  pub,
  def,
  className,
  label,
}: {
  /** 공개 열쇠(65바이트). `def`를 주면 쓰지 않는다 */
  pub?: Uint8Array;
  def?: FingerMarkDef;
  className?: string;
  label?: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const mark = useMemo(
    () => def ?? (pub ? fingermarkOf(pub) : null),
    [def, pub],
  );
  const strokes = useMemo(() => (mark ? fingerStrokes(mark) : null), [mark]);
  if (!mark || !strokes) return null;
  const sw = (mark.gap * 0.37).toFixed(2);
  const press = (mark.ink.press * Math.PI) / 180;
  const px = Math.cos(press) * 0.5;
  const py = Math.sin(press) * 0.5;
  const { core } = mark;
  return (
    <svg
      viewBox={`0 0 ${FM_W} ${FM_H}`}
      className={cn("text-rose-700", className)}
      data-fingermark={mark.kind}
      role="img"
      aria-label={label ?? "지문 도장"}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <clipPath id={`${id}-pad`}>
          <ellipse cx={PAD.cx} cy={PAD.cy} rx={PAD.rx} ry={PAD.ry} />
        </clipPath>
        {/* 가장자리는 옅게 */}
        <radialGradient
          id={`${id}-edge`}
          gradientUnits="userSpaceOnUse"
          cx={PAD.cx}
          cy={PAD.cy}
          r={PAD.ry}
          gradientTransform={`translate(${PAD.cx} ${PAD.cy}) scale(${PAD.rx / PAD.ry} 1) translate(${-PAD.cx} ${-PAD.cy})`}
        >
          <stop offset="0.45" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity={mark.ink.edge} />
        </radialGradient>
        {/* 한쪽은 진하게 눌리고 반대쪽은 덜 묻는다 */}
        <linearGradient
          id={`${id}-press`}
          x1={0.5 - px}
          y1={0.5 - py}
          x2={0.5 + px}
          y2={0.5 + py}
        >
          <stop offset="0" stopColor="#000" stopOpacity={mark.ink.fade} />
          <stop offset="0.7" stopColor="#000" stopOpacity="0" />
        </linearGradient>
        <mask
          id={`${id}-ink`}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width={FM_W}
          height={FM_H}
        >
          <rect width={FM_W} height={FM_H} fill={`url(#${id}-edge)`} />
          <rect width={FM_W} height={FM_H} fill={`url(#${id}-press)`} />
        </mask>
        {/* 인주 결: 골이 살짝 떨리고 가볍게 번진다 */}
        <filter
          id={`${id}-bleed`}
          filterUnits="userSpaceOnUse"
          x="-5"
          y="-5"
          width={FM_W + 10}
          height={FM_H + 10}
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.16"
            numOctaves="2"
            seed={mark.ink.noise}
            result="grain"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="grain"
            scale="1.6"
            xChannelSelector="R"
            yChannelSelector="G"
            result="shaky"
          />
          <feGaussianBlur in="shaky" stdDeviation="0.3" />
        </filter>
      </defs>
      <g
        transform={`rotate(${mark.tilt.toFixed(2)} ${PAD.cx} ${PAD.cy})`}
        opacity="0.9"
      >
        <g clipPath={`url(#${id}-pad)`}>
          <g mask={`url(#${id}-ink)`}>
            {/* 인주 결은 골에만: 별까지 떨리면 작은 크기에서 얼룩으로 뭉개진다 */}
            <g
              filter={`url(#${id}-bleed)`}
              fill="none"
              stroke="currentColor"
              strokeWidth={sw}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {strokes.ridges.map((r) =>
                r.chain ? (
                  // 별 사슬: 둥근 끝의 길이 0 점선이라 골을 따라 구슬처럼 찍힌다
                  <path
                    key={r.d}
                    d={r.d}
                    data-chain
                    strokeWidth={(mark.gap * 0.5).toFixed(2)}
                    strokeDasharray={`0 ${(mark.gap * 0.95).toFixed(2)}`}
                  />
                ) : (
                  <path key={r.d} d={r.d} />
                ),
              )}
              {strokes.forks.map((d) => (
                <path key={d} d={d} data-fork />
              ))}
            </g>
            <g fill="currentColor">
              {mark.stars.map((s) => (
                <polygon
                  key={`${s.x}-${s.y}`}
                  data-ink-star
                  points={starPoints(s.x, s.y, s.r, s.r * 0.42, 4, s.rot)}
                />
              ))}
            </g>
          </g>
          <polygon
            data-core-star
            fill="currentColor"
            points={starPoints(
              core.x,
              core.y,
              mark.gap * 0.85,
              mark.gap * 0.36,
              5,
              0,
            )}
          />
        </g>
      </g>
    </svg>
  );
}
