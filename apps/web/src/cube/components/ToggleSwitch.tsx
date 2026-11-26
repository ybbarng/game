"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * 켜고 끄는 단추(스위치). 한 번 누르는 단추(「처음으로」 등)와 한눈에 갈리게, 이름 옆에 작은 밀대를 둔다.
 * 켜면 밀대가 오른쪽으로 가고 바탕이 노랗게 바뀐다. 상태는 `role="switch"` + `aria-checked`로 알린다.
 * 밀대 크기는 별 따기 「진동」 스위치와 같다(노란 바탕 위 손잡이는 어둡게). 이름은 켜도 꺼도 그대로 둔다(「보기/숨기기」처럼 바꾸지 않는다).
 *
 * - 마우스로 누르면 초점을 놓는다(남은 초점이 큐브 키를 가로채지 않게). 키보드(Tab → Space·Enter)로 누르면 초점을 둔다.
 * - Space·Enter는 큐브 키로 넘기지 않는다(큐브 화면은 창에서 키를 듣는다).
 */
export function ToggleSwitch({
  on,
  onChange,
  children,
  disabled,
  className,
  ...rest
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  children: ReactNode;
  disabled?: boolean | undefined;
  /** 단추 겉에 더할 모양(글 크기·높이 등) */
  className?: string | undefined;
  [data: `data-${string}`]: string | boolean | undefined;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      data-toggle-switch={on ? "on" : "off"}
      onClick={(e) => {
        onChange(!on);
        // detail 0 = 키보드로 누름
        if (e.detail > 0) e.currentTarget.blur();
      }}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") e.stopPropagation();
      }}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-amber-300 disabled:opacity-40",
        on ? "text-white" : "text-white/75",
        className,
      )}
      {...rest}
    >
      {children}
      <span
        aria-hidden="true"
        data-toggle-track
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          on ? "bg-amber-300" : "bg-white/20",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full shadow transition-[left] motion-reduce:transition-none",
            on ? "left-[18px] bg-black/80" : "left-0.5 bg-white",
          )}
        />
      </span>
    </button>
  );
}
