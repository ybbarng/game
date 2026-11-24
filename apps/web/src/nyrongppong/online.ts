import type { PresetDeal } from "@game/hwatu";
import { nyrongppongBotFor } from "@game/nyrongppong-ai";
import type {
  Action,
  GameEvent,
  NyrongppongRules,
  NyrongppongState,
  NyrongppongView,
} from "@game/nyrongppong-engine";

import { TABLE_ROOM } from "@/components/card-room";
import type { RoomGame } from "@/components/RoomScreen";

import { nyrongppongKit } from "./kit";
import { nyrongppongSession } from "./session";
import { ONLINE_CALL_SECONDS, onlineRules } from "./settings";
import { BOT_PACE_MS, useNyrongppong } from "./store";

/** 친구와 나이롱뽕(`RoomScreen`)에서 나이롱뽕만 다른 것. 빈자리는 컴퓨터가 앉는다 */
export const nyrongppongRoom: RoomGame<
  NyrongppongRules,
  NyrongppongState,
  NyrongppongView,
  Action,
  GameEvent,
  PresetDeal
> = {
  ...TABLE_ROOM,
  kit: nyrongppongKit,
  name: "나이롱뽕",
  shareTitle: "나이롱뽕 한 판 하자",
  session: nyrongppongSession,
  useStore: useNyrongppong,
  attach: (match, { seatNames, stats, archive }) =>
    useNyrongppong.getState().attachOnline(match, seatNames, stats, archive),
  botFor: nyrongppongBotFor,
  pace: (next) => setTimeout(next, BOT_PACE_MS),
  hostRules: onlineRules,
  rulesSummary: (rules) =>
    `${rules.players}명 · ${rules.rounds}판 · 스톱 ${rules.stopLimit === 0 ? "없음" : `합 ${rules.stopLimit} 이하`} · 바가지 +${rules.bagaji}`,
  rulesNote: () => `버릴 때마다 모두 ${ONLINE_CALL_SECONDS}초씩 뽕을 기다려요.`,
  botSeatLabel: "친구를 기다리는 중",
  footnote:
    "서버 없이 기기끼리 바로 이어요. 연결 문제를 고치려고 연결에 걸린 시간을 서버에 보내요(카드·이름·채팅은 보내지 않아요).",
};
