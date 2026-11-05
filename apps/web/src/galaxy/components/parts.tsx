"use client";

import type { CSSProperties, ReactNode } from "react";
import { Seal } from "@/stardraw/astronaut/marks";
import { BureauLogo } from "@/stardraw/components/BureauMarks";

export { ShipToken } from "./Ship";

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [26, 26],
    [50, 50],
    [74, 74],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [27, 27],
    [73, 27],
    [50, 50],
    [27, 73],
    [73, 73],
  ],
  6: [
    [28, 24],
    [72, 24],
    [28, 50],
    [72, 50],
    [28, 76],
    [72, 76],
  ],
};

/** 주사위 한 면(유리 같은 밝은 면에 눈) */
export function DiceFace({
  value,
  className,
  decorative = false,
}: {
  value: number;
  className?: string;
  /** 정육면체의 한 면(읽는 이름은 정육면체가 갖는다). 모서리를 덜 둥글게 해 면끼리 맞닿게 하고 가장자리를 살짝 어둡게 */
  decorative?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={`주사위 ${value}`}
      data-die={decorative ? undefined : value}
    >
      {decorative && (
        <defs>
          <radialGradient id="galaxy-die-face" cx="40%" cy="35%" r="75%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="75%" stopColor="#eef2f7" />
            <stop offset="100%" stopColor="#c8d0dc" />
          </radialGradient>
        </defs>
      )}
      {/* 정육면체 면은 둘레 1.5를 비운다. 3D로 돌린 층의 가장자리는 브라우저가 부드럽게 다듬지 않아(특히 휴대폰)
          계단이 지는데, 층 끝이 투명하면 보이는 가장자리는 SVG가 직접 부드럽게 그린 선이 된다 */}
      <rect
        x={decorative ? 1.5 : 4}
        y={decorative ? 1.5 : 4}
        width={decorative ? 97 : 92}
        height={decorative ? 97 : 92}
        rx={decorative ? 14 : 20}
        fill={decorative ? "url(#galaxy-die-face)" : "#f8fafc"}
        stroke="#cbd5e1"
        strokeWidth="3"
      />
      {(PIPS[value] ?? []).map(([x, y]) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r="9"
          fill={value === 1 ? "#dc2626" : "#1e293b"}
        />
      ))}
    </svg>
  );
}

/**
 * 우주국 공문 종이: 위에서 내려와 펴지고 붉은 직인이 찍힌다(별 따기 편지와 같은 결).
 * `dur` 동안 머물다 걷힌다. 움직임 줄이기에서는 연출 자체가 없다(fx.ts)
 */
export function NoticePaper({
  heading,
  title,
  children,
  dur,
}: {
  heading: string;
  title: string;
  children: ReactNode;
  dur: number;
}) {
  return (
    <div
      role="note"
      data-notice-paper
      className="galaxy-paper pointer-events-none relative w-[86%] max-w-80 rounded-md border border-amber-900/20 bg-[#f6efe0] px-4 pt-3 pb-4 text-slate-900 shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
      style={{ "--galaxy-paper-ms": `${dur}ms` } as CSSProperties}
    >
      <p className="flex items-center justify-center gap-1 border-amber-900/25 border-b pb-1 font-semibold text-[10px] text-amber-950/70 tracking-[0.2em]">
        <BureauLogo className="size-3.5 shrink-0" />
        {heading}
      </p>
      <p className="mt-2 font-black text-base leading-tight">{title}</p>
      <div className="mt-1 pr-12 text-[13px] leading-snug">{children}</div>
      <span className="galaxy-stamp absolute right-2 bottom-2 block">
        <Seal text="우주국" label="카노푸스 우주국 직인" className="size-11" />
      </span>
    </div>
  );
}
