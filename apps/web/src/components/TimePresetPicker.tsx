"use client";

import {
  TIME_PRESET_NAMES,
  TIME_PRESETS,
  type TimePreset,
} from "@game/mighty-engine";

import { Chips } from "./options/Chip";

const ORDER: readonly TimePreset[] = ["none", "fast", "normal"];

/** 고른 시간 규칙을 한 줄로(첫 화면 안내 등). 시간 없음이면 null */
export function timePresetLabel(preset: TimePreset | undefined): string | null {
  return !preset || preset === "none" ? null : TIME_PRESET_NAMES[preset];
}

/** 시간 규칙 설명(해요체, docs/standing-rules.md 3절) */
export function timePresetHelp(preset: TimePreset): string {
  if (preset === "none") return "시간 제한 없이 둬요.";
  const { base, byoyomi, periods } = TIME_PRESETS[preset];
  const min = base / 60_000;
  const sec = byoyomi / 1000;
  return `한 사람에게 기본 ${min}분을 줘요. 기본 시간을 다 쓰면 차례마다 ${sec}초 안에 끝내야 하고, 이것을 초읽기라 해요. ${sec}초를 넘길 때마다 초읽기 ${periods}번 가운데 한 번이 줄고, ${periods}번을 다 쓰면 시간이 다 돼서 져요(시간패).`;
}

/**
 * 판 게임 옵션의 개인 시간 고르기(docs/24). 오목·장기 등 여러 게임이 같이 쓴다.
 * 혼자 하기는 내 시계만 의미가 있고(컴퓨터는 금방 둔다), 다함께는 두 사람 모두 잰다.
 */
export function TimePresetPicker({
  value,
  onChange,
}: {
  value: TimePreset;
  onChange: (preset: TimePreset) => void;
}) {
  return (
    <>
      <Chips
        options={ORDER.map((preset) => ({
          value: preset,
          label: TIME_PRESET_NAMES[preset],
        }))}
        value={value}
        onChange={onChange}
      />
      <p className="text-xs opacity-60">{timePresetHelp(value)}</p>
    </>
  );
}
