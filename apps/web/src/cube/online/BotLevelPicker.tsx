"use client";

import { botChoices } from "./bot-choices";

/**
 * 컴퓨터 단계 단추 줄(컴퓨터와 대결·오늘의 섞기·제한 도전). 단추마다 예상 평균 시간을 작게 붙인다.
 * 단추 이름(읽어 주는 이름)은 단계 이름만이고 시간은 `title`에도 둔다.
 */
export function BotLevelPicker({
  n,
  average,
  value,
  onChange,
  disabled = false,
  times = true,
}: {
  n: number;
  average: number | null | undefined;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** 예상 맞추기 시간을 붙인다(공식 연습 대결은 맞추기 시간이 아니라 빼고 단계 이름만) */
  times?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-1 text-sm" disabled={disabled}>
      <legend className="mb-1">컴퓨터 단계</legend>
      <div className="flex flex-wrap gap-1">
        {botChoices(n, average).map((c) => (
          <button
            key={c.value}
            type="button"
            data-cube-bot-level={c.value}
            aria-pressed={value === c.value}
            title={times ? `${c.people} · 평균 ${c.time}` : c.people}
            onClick={() => onChange(c.value)}
            className={`flex flex-col items-center rounded-lg px-3 py-1 leading-tight disabled:opacity-50 ${value === c.value ? "bg-amber-400 text-black" : "bg-white/10"}`}
          >
            <span>{c.label}</span>
            {times && (
              <span
                aria-hidden
                className={`text-[11px] ${value === c.value ? "text-black/70" : "text-white/55"}`}
              >
                {c.time}
              </span>
            )}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
