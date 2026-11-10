"use client";

import {
  TIME_PRESET_NAMES,
  TIME_PRESETS,
  type TimePreset,
} from "@game/mighty-engine";

import { cn } from "@/lib/cn";

const ORDER: readonly TimePreset[] = ["none", "fast", "normal"];

/** 고른 시간 규칙을 한 줄로(첫 화면 안내 등). 시간 없음이면 null */
export function timePresetLabel(preset: TimePreset | undefined): string | null {
  return !preset || preset === "none" ? null : TIME_PRESET_NAMES[preset];
}

/** 시간 규칙 설명. 옵션 화면의 말투에 맞춘다(대부분 「~한다」, 은하는 「~해요」) */
export function timePresetHelp(
  preset: TimePreset,
  tone: "plain" | "polite" = "plain",
): string {
  const polite = tone === "polite";
  if (preset === "none")
    return polite ? "시간 제한 없이 둬요." : "시간 제한 없이 둔다.";
  const { base, byoyomi, periods } = TIME_PRESETS[preset];
  const min = base / 60_000;
  const sec = byoyomi / 1000;
  return polite
    ? `한 사람에게 기본 ${min}분을 줘요. 기본 시간을 다 쓰면 차례마다 ${sec}초 안에 끝내야 하고, 이것을 초읽기라 해요. ${sec}초를 넘길 때마다 초읽기 ${periods}번 가운데 한 번이 줄고, ${periods}번을 다 쓰면 시간이 다 되어 져요(시간패).`
    : `한 사람에게 기본 ${min}분을 준다. 기본 시간을 다 쓰면 차례마다 ${sec}초 안에 끝내야 하고, 이것을 초읽기라 한다. ${sec}초를 넘길 때마다 초읽기 ${periods}번 가운데 한 번이 줄고, ${periods}번을 다 쓰면 시간이 다 되어 진다(시간패).`;
}

/**
 * 판 게임 옵션의 개인 시간 고르기(docs/24). 오목·장기 등 여러 게임이 같이 쓴다.
 * 혼자 하기는 내 시계만 의미가 있고(컴퓨터는 금방 둔다), 다함께는 두 사람 모두 잰다.
 * 설명 말투는 그 옵션 화면을 따른다(`tone`, 기본 「~한다」)
 */
export function TimePresetPicker({
  value,
  onChange,
  tone = "plain",
}: {
  value: TimePreset;
  onChange: (preset: TimePreset) => void;
  tone?: "plain" | "polite";
}) {
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {ORDER.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={value === preset}
            onClick={() => onChange(preset)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              value === preset
                ? "border-amber-300 bg-white text-black"
                : "border-white/15 bg-white/5",
            )}
          >
            {TIME_PRESET_NAMES[preset]}
          </button>
        ))}
      </div>
      <p className="text-xs opacity-60">{timePresetHelp(value, tone)}</p>
    </>
  );
}
