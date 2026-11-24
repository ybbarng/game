"use client";

import { type ReactNode, useState } from "react";

import { SPEEDS, useSettings } from "@/game/settings";
import { cn } from "@/lib/cn";
import { ConfirmButton } from "./ConfirmButton";
import { CARD_THEMES } from "./card-art/themes";
import { Dialog } from "./Dialog";
import { HIT_AREA } from "./hit-area";
import { Chips } from "./options/Chip";
import { SoundSetting } from "./options/SoundSetting";
import { SuitStylePicker } from "./SuitStylePicker";

/** 위쪽 막대 단추(채팅·설정·점수판·나가기): 작은 겉모습, 누르는 자리는 44px */
export const BAR_BUTTON = cn(
  HIT_AREA,
  "shrink-0 rounded-lg bg-white/10 px-1.5 py-1 text-xs hover:bg-white/20",
);

/** 판 중 설정의 한 줄: 작은 이름과 고르는 것 */
export function SettingRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs opacity-70">{label}</span>
      {children}
    </div>
  );
}

/** 컴퓨터 단계 고르기(새 게임부터 바뀐다) */
export type LevelSetting<T extends string | number> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
};

/**
 * 모든 게임의 판 중 설정 메뉴. 효과음(켜기·크기)은 늘 있고, 게임마다 해당되는 것만 켠다:
 * 진행 속도(`speed`), 카드 디자인·무늬 표기(`cards`), 그 게임만의 줄(`extra`), 컴퓨터 단계(`levels`),
 * 맨 아래 덧붙일 것(`footer`), 혼자 하기 도중 게임 전체 끝내기(`onQuit`, 「그만하기」).
 * 위쪽 막대 오른쪽 「설정」 단추 바로 아래에 뜬다.
 */
export function GameSettingsMenu<T extends string | number>({
  onClose,
  tone = "bg-felt-dark/95",
  speed = false,
  cards = false,
  levels,
  extra,
  footer,
  onQuit,
}: {
  onClose: () => void;
  /** 상자 바탕(게임 판 색) */
  tone?: string;
  speed?: boolean;
  cards?: boolean;
  levels?: LevelSetting<T> | undefined;
  extra?: ReactNode;
  footer?: ReactNode;
  onQuit?: (() => void) | undefined;
}) {
  const speedValue = useSettings((s) => s.speed);
  const setSpeed = useSettings((s) => s.setSpeed);
  const cardThemeId = useSettings((s) => s.cardThemeId);
  const setCardTheme = useSettings((s) => s.setCardTheme);
  return (
    <Dialog
      label="설정"
      onClose={onClose}
      data-settings-menu
      className={cn(
        "absolute top-[calc(3.5rem+env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] flex max-h-[calc(100dvh-4.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-64 flex-col gap-2 overflow-y-auto rounded-2xl border border-white/15 p-4 text-white shadow-2xl backdrop-blur",
        tone,
      )}
    >
      {speed && (
        <SettingRow label="진행 속도">
          <Chips options={SPEEDS} value={speedValue} onChange={setSpeed} />
        </SettingRow>
      )}
      <SettingRow label="효과음">
        <SoundSetting />
      </SettingRow>
      {cards && (
        <>
          <SettingRow label="카드">
            <Chips
              options={CARD_THEMES.map((t) => ({ value: t.id, label: t.name }))}
              value={cardThemeId}
              onChange={setCardTheme}
            />
          </SettingRow>
          <SettingRow label="무늬 표기">
            <SuitStylePicker />
          </SettingRow>
        </>
      )}
      {extra}
      {levels && (
        <SettingRow label="컴퓨터 실력 (새 게임부터)">
          <Chips
            options={levels.options}
            value={levels.value}
            onChange={levels.onChange}
          />
        </SettingRow>
      )}
      {footer}
      {onQuit && (
        <div className="flex min-h-11 items-center border-white/10 border-t pt-2">
          <ConfirmButton
            question="정말 그만할까요?"
            confirmLabel="그만하기"
            onConfirm={() => {
              onClose();
              onQuit();
            }}
            className={cn(
              HIT_AREA,
              "rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15",
            )}
          >
            그만하기
          </ConfirmButton>
        </div>
      )}
    </Dialog>
  );
}

/**
 * 위쪽 막대의 「설정」 단추와 판 중 설정 메뉴. 모든 게임이 같은 이름·같은 모양으로 막대 오른쪽에 둔다.
 * 단추 모양은 막대 단추 공통(`BAR_BUTTON`).
 */
export function GameSettingsButton<T extends string | number>(
  props: Omit<Parameters<typeof GameSettingsMenu<T>>[0], "onClose"> & {
    className?: string;
  },
) {
  const [open, setOpen] = useState(false);
  const { className, ...menu } = props;
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={cn(BAR_BUTTON, className)}
      >
        설정
      </button>
      {open && <GameSettingsMenu {...menu} onClose={() => setOpen(false)} />}
    </>
  );
}
