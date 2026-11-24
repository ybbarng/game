import {
  type Action,
  type GameEvent,
  type HeartsRules,
  type MatchState,
  PLAYER_COUNT,
  type PlayerView,
} from "@game/hearts-engine";
import type { Card } from "@game/mighty-engine";

import type { RoomGame } from "@/components/RoomScreen";

import { heartsBotFor } from "./bots";
import { heartsKit } from "./kit";
import { heartsSession } from "./session";
import { type HeartsLevel, useHeartsSettings } from "./settings";
import { useHearts } from "./store";

/** 다함께 하트(`RoomScreen`)에서 하트만 다른 것. 빈자리는 컴퓨터가 앉는다 */
export const heartsRoom: RoomGame<
  HeartsRules,
  MatchState,
  PlayerView,
  Action,
  GameEvent,
  Card[][]
> = {
  kit: heartsKit,
  name: "하트",
  title: { host: "♥ 하트 방 만들기", guest: "♥ 초대받은 하트 방에 들어가기" },
  shareTitle: "하트 한 판 하자",
  session: heartsSession,
  useStore: useHearts,
  attach: (match, { seatNames, stats, archive }) =>
    useHearts.getState().attachOnline(match, seatNames, {
      network: true,
      stats,
      ...(archive ? { archive } : {}),
    }),
  botFor: (level) => heartsBotFor(level as HeartsLevel),
  botLevel: () => useHeartsSettings.getState().level,
  rulesSummary: (rules) => `${PLAYER_COUNT}명 · 끝 점수 ${rules.endScore}점`,
  botSeatLabel: "빈자리 · 컴퓨터",
  footnote:
    "연결 문제를 고치려고 연결에 걸린 시간을 서버에 보내요(패·이름·채팅은 보내지 않아요).",
  namePlaceholder: "친구들에게 보일 이름",
  theme: {
    background:
      "bg-[radial-gradient(ellipse_at_center,#7f1d1d_0%,#3b0a0a_80%)]",
  },
  fair: true,
  auditNotice: { title: "공정성 확인", ok: "섞기와 진행에 문제가 없어요." },
  onAudit: (audit) => useHearts.setState({ audit }),
  showRuleCode: true,
};
