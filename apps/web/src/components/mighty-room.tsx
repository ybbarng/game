"use client";

import {
  type Action,
  decodeRuleString,
  encodeRuleString,
  type GameEvent,
  type MatchState,
  type PlayerView,
  type PresetDeal,
  RULE_PRESETS,
  type RuleSet,
} from "@game/mighty-engine";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import type { RoomGame, RoomLobbyProps } from "@/components/RoomScreen";
import { RuleEditor } from "@/components/rules/RuleEditor";
import { botFor } from "@/game/bots";
import { mightyKit } from "@/game/mighty-kit";
import { browserPace } from "@/game/pace";
import { ruleLabel, useSettings } from "@/game/settings";
import { useGame } from "@/game/store";
import { cn } from "@/lib/cn";
import { type AuditRecord, loadAuditHistory } from "@/net/audit-history";
import { onlineSession } from "@/net/session";

/** 내 규칙과 같으면 그 이름(참가자에게 보인다) */
function customName(code: string): string | undefined {
  return useSettings.getState().customRules.find((r) => r.code === code)?.name;
}

/** 대기실 규칙 줄: 방장은 기본 규칙·내 규칙을 고르거나 자세히 고치고, 참가자는 규칙 이름을 본다 */
function MightyLobbyRules({ lobby, isHost, rules }: RoomLobbyProps<RuleSet>) {
  const customRules = useSettings((s) => s.customRules);
  const [editingRules, setEditingRules] = useState(false);
  if (!isHost)
    return (
      <p className="text-xs opacity-60">
        {lobby.ruleName ?? ruleLabel(lobby.ruleCode, customRules)} ·{" "}
        {lobby.seats.length}명
      </p>
    );
  return (
    <div className="flex flex-wrap items-center gap-1">
      {[
        ...RULE_PRESETS.map((p) => ({
          key: p.id,
          name: p.name,
          code: p.code,
          custom: false,
        })),
        ...customRules.map((r) => ({
          key: `custom-${r.name}`,
          name: r.name,
          code: r.code,
          custom: true,
        })),
      ].map((r) => (
        <button
          key={r.key}
          type="button"
          aria-pressed={r.code === lobby.ruleCode}
          onClick={() => {
            const decoded = decodeRuleString(r.code);
            if (decoded.ok)
              onlineSession.host?.setRules(
                decoded.rules,
                r.custom ? r.name : undefined,
              );
          }}
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px]",
            r.code === lobby.ruleCode
              ? "border-amber-300 bg-white text-black"
              : "border-white/15 bg-white/5",
          )}
        >
          {r.name}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setEditingRules(true)}
        className="rounded-full border border-white/30 border-dashed px-2 py-0.5 text-[11px]"
      >
        자세히 고치기
      </button>
      {editingRules && (
        <RuleEditor
          initial={(() => {
            const decoded = decodeRuleString(lobby.ruleCode);
            return decoded.ok ? decoded.rules : rules;
          })()}
          onClose={() => setEditingRules(false)}
          onApply={(next) => {
            onlineSession.host?.setRules(
              next,
              customName(encodeRuleString(next)),
            );
            setEditingRules(false);
          }}
        />
      )}
    </div>
  );
}

/** 방 만들기 아래: 지난 게임 공정성 검증 기록(이 기기에 남은 것만) */
function AuditHistory() {
  // 저장소는 브라우저에만 있으므로 그린 뒤에 읽는다.
  const [history, setHistory] = useState<AuditRecord[]>([]);
  useEffect(() => setHistory(loadAuditHistory()), []);
  if (history.length === 0) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer opacity-70">
        지난 게임 공정성 검증 기록
      </summary>
      <ul className="mt-1.5 flex flex-col gap-1">
        {history.slice(0, 5).map((r) => (
          <li key={`${r.room}-${r.at}`} className="flex gap-2">
            <span className="tabular-nums opacity-60">
              {new Date(r.at).toLocaleString("ko-KR", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className={r.ok ? "text-emerald-300" : "text-rose-300"}>
              {r.ok ? "문제없음" : `무효 — ${r.failures.join(", ")}`}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** 친구와 마이티(`RoomScreen`)에서 마이티만 다른 것. 빈자리는 컴퓨터가 앉고, 방장은 대기실에서 규칙을 바꾼다 */
export const mightyRoom: RoomGame<
  RuleSet,
  MatchState,
  PlayerView,
  Action,
  GameEvent,
  PresetDeal
> = {
  kit: mightyKit,
  name: "마이티",
  title: { host: "방 만들기", guest: "초대받은 방에 들어가기" },
  shareTitle: "마이티 한 판 하자",
  session: onlineSession,
  useStore: useGame,
  attach: (match, { seatNames, stats, archive }) =>
    useGame.getState().attachOnline(match, seatNames, {
      network: true,
      stats,
      ...(archive ? { archive } : {}),
    }),
  botFor,
  botLevel: () => useSettings.getState().botLevel,
  pace: browserPace,
  ruleName: (rules) => customName(encodeRuleString(rules)),
  rulesSummary: (rules) =>
    `규칙: ${ruleLabel(encodeRuleString(rules), useSettings.getState().customRules)} · ${rules.playerCount}명`,
  botSeatLabel: "빈자리 · 컴퓨터",
  kickedText: "방장이 대기실에서 내보냈어요.",
  footnote:
    "연결 문제를 고치려고 연결에 걸린 시간을 서버에 보내요(패·이름·채팅은 보내지 않아요).",
  namePlaceholder: "친구들에게 보일 이름",
  theme: {
    background:
      "bg-[radial-gradient(ellipse_at_center,#166534_0%,#0a3622_75%)]",
  },
  header: (
    <div className="flex justify-center">
      <Logo size={160} />
    </div>
  ),
  fair: true,
  auditNotice: { title: "공정성 확인", ok: "섞기와 진행에 문제가 없어요." },
  onAudit: (audit) => useGame.setState({ audit }),
  showRuleCode: true,
  LobbyRules: MightyLobbyRules,
  NameExtra: AuditHistory,
};
