import { gostopBotFor } from "@game/gostop-ai";
import type {
  Action,
  GameEvent,
  GostopRules,
  GostopState,
  GostopView,
} from "@game/gostop-engine";
import type { PresetDeal } from "@game/hwatu";

import { TABLE_ROOM } from "@/components/card-room";
import type { RoomGame } from "@/components/RoomScreen";

import { gostopKit } from "./kit";
import { gostopSession } from "./session";
import { GUKJIN_INFO } from "./settings";
import { useGostop } from "./store";

/** 친구와 고스톱(`RoomScreen`)에서 고스톱만 다른 것. 빈자리는 컴퓨터가 앉는다 */
export const gostopRoom: RoomGame<
  GostopRules,
  GostopState,
  GostopView,
  Action,
  GameEvent,
  PresetDeal
> = {
  ...TABLE_ROOM,
  kit: gostopKit,
  name: "고스톱",
  shareTitle: "고스톱 한 판 치자",
  session: gostopSession,
  useStore: useGostop,
  attach: (match, { seatNames, stats, archive }) =>
    useGostop.getState().attachOnline(match, seatNames, stats, archive),
  botFor: gostopBotFor,
  rulesSummary: (rules) =>
    `${rules.players === 2 ? "맞고(2명)" : "고스톱(3명)"} · ${rules.rounds}판 · ${GUKJIN_INFO.find((v) => v.value === rules.gukjin)?.label ?? ""}`,
  botSeatLabel: "친구를 기다리는 중",
  footnote:
    "서버 없이 기기를 바로 이어요. 연결 문제를 고치려고 연결에 걸린 시간을 서버에 보내요(패·이름·채팅은 보내지 않아요).",
};
