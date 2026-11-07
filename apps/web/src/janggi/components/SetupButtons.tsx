"use client";

import { SETUPS, type Setup } from "@game/janggi-engine";

import { cn } from "@/lib/cn";

/**
 * 상차림 단추 넷(마상마상·상마상마·마상상마·상마마상). 대국 화면의 상차림 고르기와
 * 배우기의 차림 바꿔 보기·상대 차림 보고 고르기가 같은 단추를 쓴다
 */
export function SetupButtons({
  legend,
  onPick,
  picked = null,
  disabled = false,
  tone,
  mark,
}: {
  /** 화면 읽기 프로그램용 묶음 이름 */
  legend: string;
  onPick: (setup: Setup) => void;
  /** 고른 차림(눌린 단추) */
  picked?: Setup | null;
  disabled?: boolean;
  /** 단추마다 색을 바꿀 때(반복 문제의 맞힘·틀림). 없으면 기본 색 */
  tone?: (setup: Setup) => string | undefined;
  /** 이름 뒤에 붙이는 표시(◎ 등) */
  mark?: (setup: Setup) => string | undefined;
}) {
  return (
    <fieldset className="grid w-full grid-cols-2 gap-2">
      <legend className="sr-only">{legend}</legend>
      {SETUPS.map((s) => {
        const extra = mark?.(s.value);
        return (
          <button
            key={s.value}
            type="button"
            aria-pressed={picked === s.value}
            disabled={disabled}
            onClick={() => onPick(s.value)}
            className={cn(
              "rounded-xl border px-3 py-2 font-semibold text-sm",
              tone?.(s.value) ??
                (picked === s.value
                  ? "border-amber-300 bg-amber-300/25"
                  : "border-amber-300/60 bg-amber-300/10 hover:bg-amber-300/20"),
            )}
          >
            {s.label}
            {extra && ` ${extra}`}
          </button>
        );
      })}
    </fieldset>
  );
}
