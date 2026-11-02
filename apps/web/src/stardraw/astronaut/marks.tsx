"use client";

import { useId } from "react";
import {
  CARINA_LINES,
  CARINA_STARS,
  type CarinaStar,
  starPath,
} from "./carina";
import { SEAL_GLYPHS } from "./seal-glyphs";

/** 주홍빛 인주 색과, 획 가장자리에 고이는 조금 짙은 색 */
const INK = "#cf3b26";
const INK_POOL = "#a5281a";

/**
 * 글자를 칸마다 꽉 채워 늘인다(인장체처럼). 글자 윤곽이 없는 글자가 섞이면 굵은 글꼴 글자로 대신한다.
 * 칸은 [x, y, 너비, 높이], 글자 사이는 gap.
 */
function SealText({
  text,
  box: [x, y, w, h],
  gap,
}: {
  text: string;
  box: [number, number, number, number];
  gap: number;
}) {
  const glyphs = [...text].map((c) => SEAL_GLYPHS[c]);
  if (!glyphs.every((g) => g !== undefined)) {
    return (
      <text
        x={x + w / 2}
        y={y + h * 0.88}
        textAnchor="middle"
        fontFamily="'Black Han Sans','Noto Sans KR',sans-serif"
        fontWeight="900"
        fontSize={h}
        textLength={w}
        lengthAdjust="spacingAndGlyphs"
        stroke="none"
      >
        {text}
      </text>
    );
  }
  const cw = (w - gap * (glyphs.length - 1)) / glyphs.length;
  return (
    <>
      {glyphs.map((g, i) => {
        return (
          <path
            // 같은 글자가 두 번 나와도 자리로 구분한다
            // biome-ignore lint/suspicious/noArrayIndexKey: 글자 자리가 곧 열쇠다
            key={i}
            d={g.d}
            transform={`translate(${x + i * (cw + gap)} ${y}) scale(${cw / g.w} ${h / g.h})`}
            stroke="none"
          />
        );
      })}
    </>
  );
}

/**
 * 발급 기관 직인: 용골자리(카노푸스가 속한 별자리)의 별과 선, 아래에 칸을 꽉 채운 굵은 글자를 새긴 주홍 인주 네모 도장.
 * 지어낸 기관 "카노푸스 우주국장"의 것이다. 별 자리는 실제 적경·적위를 동쪽이 왼쪽이 되게 펴서 인장 위쪽에 맞췄다.
 *
 * 인주 자국은 SVG 필터 하나로 낸다. 노이즈 씨앗을 모두 고정해 어느 화면에서나 같은 모양이다(스크린샷이 흔들리지 않게).
 * - 가장자리: 느린 노이즈로 크게 살짝 휘고, 중간 노이즈로 잘게 거칠게 한다(예전처럼 촘촘한 노이즈로 크게 흔들면 실밥처럼 보인다)
 * - 덜 묻은 곳: 큰 얼룩 노이즈의 낮은 곳만 비우고, 잔 구멍은 드물게만 낸다
 * - 눌린 느낌: 획 가장자리는 인주가 고여 조금 짙고, 안쪽은 농도가 고르지 않다
 * 종이(밝은 바탕) 위에 둘 때는 `className`에 `mix-blend-multiply`를 더하면 종이 결에 스며든다.
 */
export function Seal({
  className,
  text = "우주국장",
  label = "카노푸스 우주국장 직인",
}: {
  className?: string;
  /** 아래 글자(등록증은 "우주국장", 당첨 직인은 "당첨") */
  text?: string;
  label?: string;
}) {
  const id = useId().replace(/:/g, "");
  const at = CARINA_STARS;
  const lines = CARINA_LINES;
  const star = starPath;
  const short = [...text].length <= 2;
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={label}
      data-seal
    >
      <defs>
        <filter
          id={`${id}-ink`}
          x="-6%"
          y="-6%"
          width="112%"
          height="112%"
          colorInterpolationFilters="sRGB"
        >
          {/* 가장자리: 크게 살짝 휘기 */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.05"
            numOctaves="2"
            seed="11"
            result="warp"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="warp"
            scale="2"
            xChannelSelector="R"
            yChannelSelector="G"
            result="bent"
          />
          {/* 가장자리: 잘게 거칠게 */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.4"
            numOctaves="2"
            seed="5"
            result="grit"
          />
          <feDisplacementMap
            in="bent"
            in2="grit"
            scale="0.8"
            xChannelSelector="R"
            yChannelSelector="G"
            result="shape"
          />
          {/* 덜 묻은 큰 얼룩: 노이즈가 낮은 곳만 비운다 */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.06"
            numOctaves="3"
            seed="8"
            result="blot"
          />
          <feColorMatrix
            in="blot"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  30 0 0 0 -8"
            result="blots"
          />
          {/* 글자 띠에는 큰 얼룩을 두지 않는다(획이 지워지면 "우"가 "부"로 읽힌다) */}
          <feFlood x="13" y="56" width="74" height="31" result="textBand" />
          {/* 카노푸스(α) 둘레도 늘 또렷하게: 우주국 이름의 별이라 덜 찍힌 얼룩이 걸치면 안 된다(2026-11-02 사용자) */}
          <feFlood x="73" y="7" width="22" height="22" result="canopus" />
          <feMerge result="voids">
            <feMergeNode in="blots" />
            <feMergeNode in="textBand" />
            <feMergeNode in="canopus" />
          </feMerge>
          {/* 잔 구멍: 드물게 */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.7"
            numOctaves="1"
            seed="41"
            result="fine"
          />
          <feColorMatrix
            in="fine"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  24 0 0 0 -5"
            result="pits"
          />
          <feComposite
            in="voids"
            in2="pits"
            operator="arithmetic"
            k1="1"
            result="holes"
          />
          <feComposite in="shape" in2="holes" operator="in" result="inked" />
          {/* 인주가 고인 가장자리(짙게)와 농도가 고르지 않은 안쪽 */}
          <feFlood floodColor={INK_POOL} result="poolColor" />
          <feComposite in="poolColor" in2="inked" operator="in" result="pool" />
          <feMorphology
            in="inked"
            operator="erode"
            radius="0.55"
            result="core"
          />
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.035"
            numOctaves="2"
            seed="2"
            result="press"
          />
          <feColorMatrix
            in="press"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.6 0 0 0 0.05"
            result="density"
          />
          <feComposite in="core" in2="density" operator="in" result="coreInk" />
          <feMerge>
            <feMergeNode in="pool" />
            <feMergeNode in="coreInk" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#${id}-ink)`} fill={INK} stroke={INK}>
        <rect
          x="4.5"
          y="4.5"
          width="91"
          height="91"
          rx="4"
          fill="none"
          strokeWidth="7"
        />
        <rect
          x="12"
          y="12"
          width="76"
          height="76"
          rx="1.5"
          fill="none"
          strokeWidth="1.8"
        />
        {lines.map((l) => (
          <polyline
            key={l.join("-")}
            points={l.map((k) => at[k].join(",")).join(" ")}
            fill="none"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
        ))}
        {(Object.keys(at) as CarinaStar[]).map((k) => (
          <path
            key={k}
            d={star(at[k][0], at[k][1], k === "alpha" ? 8 : 4.5)}
            stroke="none"
          />
        ))}
        <SealText
          text={text}
          box={short ? [17, 59, 66, 25] : [16, 62, 68, 21]}
          gap={short ? 5 : 2.2}
        />
      </g>
    </svg>
  );
}

/**
 * 패스키 마크(직접 그림): 열쇠 머리에 지문 물결. 모바일 신분증의 작은 표시처럼 카드 구석에 둔다.
 * FIDO Alliance의 패스키 아이콘은 상표 사용 계약 조건이 분명하지 않아 쓰지 않았다(2026-10-30).
 */
export function PasskeyMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.6"
    >
      <circle cx="8.5" cy="9" r="5.5" />
      <path d="M6 9.2a2.5 2.5 0 0 1 5 0c0 1.4-.4 2.4-1 3.2" />
      <path d="M8.5 8.6v1.2c0 .9-.2 1.7-.6 2.3" />
      <path d="M13.2 12.2 20 19l-1.6 1.6M17.6 16.6l-1.5 1.5" />
    </svg>
  );
}
