"use client";

import { useState } from "react";

import { BOT_LEVELS } from "@/game/bots";
import { useSettings } from "@/game/settings";

import { GameSettingsMenu, SettingRow } from "./GameSettingsMenu";
import { Chips } from "./options/Chip";
import { GlossarySheet } from "./tutorial/GlossarySheet";

const ON_OFF = [
  { value: true, label: "켜기" },
  { value: false, label: "끄기" },
] as const;

/** 마이티 판 중 설정: 공통 메뉴에 마이티 은어·용어 사전을 더한다 */
export function SettingsMenu({
  onClose,
  onQuit,
}: {
  onClose: () => void;
  /** 혼자 하기 도중 게임 전체 끝내기(온라인이면 넘기지 않는다) */
  onQuit?: (() => void) | undefined;
}) {
  const slangTerms = useSettings((s) => s.slangTerms);
  const setSlangTerms = useSettings((s) => s.setSlangTerms);
  const botLevel = useSettings((s) => s.botLevel);
  const setBotLevel = useSettings((s) => s.setBotLevel);
  const [glossary, setGlossary] = useState(false);
  if (glossary) return <GlossarySheet onClose={onClose} />;
  return (
    <GameSettingsMenu
      onClose={onClose}
      speed
      cards
      extra={
        <SettingRow label="마이티 은어 (셋트·기아·삽컴)">
          <Chips options={ON_OFF} value={slangTerms} onChange={setSlangTerms} />
        </SettingRow>
      }
      levels={{ options: BOT_LEVELS, value: botLevel, onChange: setBotLevel }}
      footer={
        <button
          type="button"
          onClick={() => setGlossary(true)}
          className="min-h-11 rounded-xl bg-white/10 px-3 py-2 text-left text-sm hover:bg-white/15"
        >
          📖 용어 사전
        </button>
      }
      onQuit={onQuit}
    />
  );
}
