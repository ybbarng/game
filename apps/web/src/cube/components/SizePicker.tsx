"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * 큐브 크기 단추(docs/47 16-28). 큐브 화면 모두가 이 모양 하나로 크기를 고른다(예전에는 드롭다운·탭·단추·칩이 섞여 있었다).
 * 화면마다 고를 수 있는 크기만 넘긴다. 차례는 늘 작은 크기부터.
 *
 * 이 부품은 고른 값을 저장하지 않는다. 하는 화면은 `onPick`에서 지금 크기를 바꾸고(`setCurrentSize`), 보는 화면은
 * 그 화면 안의 값만 바꾼다.
 *
 * 화면 시험 표시: 묶음에 `attr`(값은 `data-value`), 단추마다 `optionAttr={크기}`(없으면 `data-size-option`)와
 * `aria-pressed`. 막으면 단추마다 `disabled`.
 */
export function SizePicker({
  sizes,
  value,
  onPick,
  disabled = false,
  attr,
  optionAttr = "data-size-option",
  badge,
  className,
}: {
  sizes: readonly number[];
  value: number;
  onPick: (n: number) => void;
  disabled?: boolean;
  /** 묶음의 화면 시험 표시(예: `data-cube-size`) */
  attr?: string;
  /** 단추마다 붙일 표시 이름 */
  optionAttr?: string;
  /** 크기 옆 작은 숫자(해법 배우기의 과정 수) */
  badge?: (n: number) => ReactNode;
  className?: string;
}) {
  const ordered = [...sizes].sort((a, b) => a - b);
  return (
    <fieldset
      {...(attr ? { [attr]: "" } : {})}
      data-value={value}
      data-cube-size-picker
      className={cn(
        "m-0 inline-flex min-w-0 max-w-full flex-wrap gap-0.5 rounded-xl border-0 bg-white/5 p-0.5",
        className,
      )}
    >
      <legend className="sr-only">큐브 크기</legend>
      {ordered.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={s === value}
          disabled={disabled}
          {...{ [optionAttr]: s }}
          onClick={(e) => {
            if (s !== value) onPick(s);
            // 키보드로 큐브를 돌리는 화면에서 단추가 키를 먹지 않게
            e.currentTarget.blur();
          }}
          className={cn(
            "min-w-11 rounded-lg px-2 py-1 text-sm tabular-nums transition active:scale-[0.97] disabled:opacity-50",
            s === value
              ? "bg-sky-500 font-semibold text-black"
              : "text-white/70 hover:bg-white/10 hover:text-white",
          )}
        >
          {s}×{s}
          {badge && (
            <span
              className={cn(
                "ml-1 text-[11px]",
                s === value ? "text-black/60" : "text-white/45",
              )}
            >
              {badge(s)}
            </span>
          )}
        </button>
      ))}
    </fieldset>
  );
}
