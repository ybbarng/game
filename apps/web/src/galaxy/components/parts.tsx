"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Seal } from "@/stardraw/astronaut/marks";
import { BureauLogo } from "@/stardraw/components/BureauMarks";

import { shipOf } from "../format";

/** 우주선 말: 자리마다 모양과 색이 둘 다 다르다(색만으로 가르지 않는다) */
export function ShipToken({
  seat,
  size = 14,
  className,
  style,
}: {
  seat: number;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ship = shipOf(seat);
  const s = size;
  const path =
    ship.shape === "circle"
      ? null
      : ship.shape === "triangle"
        ? "M50 8 L94 88 L6 88 Z"
        : ship.shape === "square"
          ? "M12 12 H88 V88 H12 Z"
          : "M50 4 L96 50 L50 96 L4 50 Z";
  return (
    <svg
      viewBox="0 0 100 100"
      width={s}
      height={s}
      aria-hidden="true"
      className={cn("drop-shadow-[0_0_4px_rgba(0,0,0,0.9)]", className)}
      style={style}
    >
      {path ? (
        <path
          d={path}
          fill={ship.color}
          stroke="#0b1020"
          strokeWidth="9"
          strokeLinejoin="round"
        />
      ) : (
        <circle
          cx="50"
          cy="50"
          r="42"
          fill={ship.color}
          stroke="#0b1020"
          strokeWidth="9"
        />
      )}
    </svg>
  );
}

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
}: {
  value: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={`주사위 ${value}`}
      data-die={value}
    >
      <rect
        x="4"
        y="4"
        width="92"
        height="92"
        rx="20"
        fill="#f8fafc"
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
