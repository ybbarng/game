import type { PresetDeal } from "@game/hwatu";
import { minhwatuBotFor } from "@game/minhwatu-ai";
import type {
  Action,
  GameEvent,
  MinhwatuRules,
  MinhwatuState,
  MinhwatuView,
} from "@game/minhwatu-engine";

import { TABLE_ROOM } from "@/components/card-room";
import type { RoomGame } from "@/components/RoomScreen";

import { minhwatuKit } from "./kit";
import { describeRules } from "./rules-text";
import { minhwatuSession } from "./session";
import { useMinhwatu } from "./store";

/** 친구와 민화투(`RoomScreen`)에서 민화투만 다른 것. 빈자리는 컴퓨터가 앉는다 */
export const minhwatuRoom: RoomGame<
  MinhwatuRules,
  MinhwatuState,
  MinhwatuView,
  Action,
  GameEvent,
  PresetDeal
> = {
  ...TABLE_ROOM,
  kit: minhwatuKit,
  name: "민화투",
  shareTitle: "민화투 한 판 치자",
  session: minhwatuSession,
  useStore: useMinhwatu,
  attach: (match, { seatNames, stats, archive }) =>
    useMinhwatu.getState().attachOnline(match, seatNames, stats, archive),
  botFor: minhwatuBotFor,
  rulesSummary: describeRules,
  botSeatLabel: "컴퓨터(친구가 들어오면 바뀜)",
  footnote:
    "서버 없이 기기끼리 바로 이어요. 연결 문제를 고치려고 연결에 걸린 시간을 서버에 보내요(패·이름·채팅은 보내지 않아요).",
};
