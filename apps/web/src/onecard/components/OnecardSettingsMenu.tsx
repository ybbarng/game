"use client";

import { CARD_THEMES } from "@/components/card-art/themes";
import { SuitStylePicker } from "@/components/SuitStylePicker";
import { useSettings } from "@/game/settings";
import { cn } from "@/lib/cn";

function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "whitespace-nowrap rounded-full border px-3 py-1 text-xs",
            o.value === value
              ? "border-amber-300 bg-white text-black"
              : "border-white/15 bg-white/5",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * 게임 중 설정(원카드): 효과음, 카드, 무늬 표기. 하트 설정 메뉴와 같은 자리·모양이다.
 * 컴퓨터 단계·인원은 새 판 옵션에서 고른다
 */
export function OnecardSettingsMenu({ onClose }: { onClose: () => void }) {
  const sound = useSettings((s) => s.sound);
  const setSound = useSettings((s) => s.setSound);
  const cardThemeId = useSettings((s) => s.cardThemeId);
  const setCardTheme = useSettings((s) => s.setCardTheme);
  return (
    <div className="fixed inset-0 z-[400]" onPointerDown={onClose}>
      <div
        className="absolute top-14 right-3 flex max-h-[calc(100dvh-4.5rem)] w-64 flex-col gap-3 overflow-y-auto rounded-2xl border border-white/15 bg-[#0b1533]/95 p-4 shadow-2xl backdrop-blur"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1.5">
          <span className="text-xs opacity-70">효과음</span>
          <Chips
            options={[
              { value: "on", label: "켜기" },
              { value: "off", label: "끄기" },
            ]}
            value={sound ? "on" : "off"}
            onChange={(v) => setSound(v === "on")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs opacity-70">카드</span>
          <Chips
            options={CARD_THEMES.map((t) => ({ value: t.id, label: t.name }))}
            value={cardThemeId}
            onChange={setCardTheme}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs opacity-70">무늬 표기</span>
          <SuitStylePicker />
        </div>
      </div>
    </div>
  );
}
