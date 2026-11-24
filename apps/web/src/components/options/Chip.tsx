"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** 칩 겉모습(둥근 알약). 고른 칩은 흰 바탕 */
export function chipLook(active: boolean, activeClassName?: string): string {
  return cn(
    "inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs",
    active
      ? (activeClassName ?? "border-amber-300 bg-white text-black")
      : "border-white/15 bg-white/5",
  );
}

/**
 * 옵션·설정에서 하나를 고르는 칩. 모든 게임이 같은 크기·같은 누르는 자리(높이 44px)를 쓴다.
 * 단추 자체는 44px 높이로 투명하고, 안쪽 알약이 겉모습이다. 고른 것은 `aria-pressed`로 알린다.
 */
export function Chip({
  active,
  onClick,
  children,
  disabled,
  className,
  activeClassName,
  ...rest
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean | undefined;
  /** 안쪽 알약에 더할 모양 */
  className?: string | undefined;
  /** 고른 알약의 색(게임 색에 맞출 때만) */
  activeClassName?: string | undefined;
  "aria-label"?: string | undefined;
  [data: `data-${string}`]: string | boolean | undefined;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex min-h-11 items-center disabled:opacity-40"
      {...rest}
    >
      <span className={cn(chipLook(active, activeClassName), className)}>
        {children}
      </span>
    </button>
  );
}

/** 칩 여러 개 중 하나 고르기 */
export function Chips<T extends string | number | boolean>({
  options,
  value,
  onChange,
  activeClassName,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  activeClassName?: string | undefined;
}) {
  return (
    <div className="flex flex-wrap gap-x-1.5">
      {options.map((o) => (
        <Chip
          key={String(o.value)}
          active={o.value === value}
          onClick={() => onChange(o.value)}
          activeClassName={activeClassName}
        >
          {o.label}
        </Chip>
      ))}
    </div>
  );
}
