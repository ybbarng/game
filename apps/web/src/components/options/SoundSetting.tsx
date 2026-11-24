"use client";

import { useSettings } from "@/game/settings";
import { previewVolume } from "@/game/sound";

import { Chips } from "./Chip";

const ON_OFF = [
  { value: true, label: "켜기" },
  { value: false, label: "끄기" },
] as const;

/**
 * 효과음 켜기·끄기와 크기. 모든 게임이 같은 설정(`useSettings`의 `sound`·`volume`)을 쓴다.
 * 옵션 화면과 판 중 설정 메뉴가 함께 쓴다.
 */
export function SoundSetting() {
  const sound = useSettings((s) => s.sound);
  const setSound = useSettings((s) => s.setSound);
  const volume = useSettings((s) => s.volume);
  const setVolume = useSettings((s) => s.setVolume);
  return (
    <div className="flex flex-wrap items-center gap-x-2">
      <Chips options={ON_OFF} value={sound} onChange={setSound} />
      {sound && (
        <input
          type="range"
          aria-label="효과음 크기"
          min={0}
          max={100}
          step={5}
          value={Math.round(volume * 100)}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
          // 손을 뗄 때 바뀐 크기로 한 번 들려준다.
          onPointerUp={() => previewVolume()}
          onKeyUp={() => previewVolume()}
          className="min-h-11 min-w-32 flex-1 accent-amber-400"
        />
      )}
    </div>
  );
}
