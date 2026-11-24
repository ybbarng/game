import type {
  Action,
  GameEvent,
  OnecardRules,
  OnecardState,
  OnecardView,
} from "@game/onecard-engine";

import { TABLE_ROOM } from "@/components/card-room";
import type { RoomGame } from "@/components/RoomScreen";

import { onecardBotFor, toKitBot } from "./bots";
import { type OnecardExtra, onecardKit } from "./kit";
import { onecardSession } from "./session";
import { botPace, useOnecard } from "./store";

/**
 * 친구와 원카드(`RoomScreen`)에서 원카드만 다른 것. 대국은 방장 기기가 엔진을 돌리고(창 시계·다시 섞기도 방장 시계),
 * "원카드!"는 방장을 거치지 않고 모두에게 직접 가는 청구다(`room.claims`, docs/43 7-1)
 */
export const onecardRoom: RoomGame<
  OnecardRules,
  OnecardState,
  OnecardView,
  Action,
  GameEvent,
  OnecardExtra
> = {
  ...TABLE_ROOM,
  kit: onecardKit,
  name: "원카드",
  shareTitle: "원카드 한 판 하자",
  session: onecardSession,
  useStore: useOnecard,
  attach: (match, { seatNames, stats, archive, claims }) =>
    useOnecard
      .getState()
      .attachOnline(
        match,
        seatNames,
        stats,
        (seen, rtMs) =>
          claims?.claim(
            {},
            { seen, ...(rtMs !== undefined ? { rtMs } : {}) },
          ) != null,
        archive,
      ),
  botFor: (level) => toKitBot(onecardBotFor(level)),
  workerBot: false,
  pace: botPace,
  rulesSummary: (rules) =>
    `${rules.players}명 · ${rules.handSize}장 · ${rules.endOnFirst ? "한 명이 다 내면 끝" : "한 사람 남을 때까지"}`,
  botSeatLabel: "친구를 기다리는 중",
  footnote:
    "서버 없이 기기끼리 바로 이어요. 연결 문제를 고치려고 연결에 걸린 시간을 서버에 보내요(카드·이름·채팅은 보내지 않아요).",
  fair: onecardKit.cardTable !== undefined,
  // 원카드는 한 판짜리 게임이다.
  roundOf: () => 1,
};
