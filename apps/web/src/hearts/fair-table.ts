import {
  checkHeartsReplay,
  HeartsGuestSeat,
  HeartsHostTable,
  realHeartsAction,
} from "@game/fair-play";
import {
  type Action,
  createMatch,
  type GameEvent,
  type HeartsRules,
  type MatchState,
  type PlayerView,
  viewOf,
} from "@game/hearts-engine";
import type { Card } from "@game/mighty-engine";

import type { KitFairTable } from "@/net/fair-table";
import {
  type FairReplayGame,
  finishedRoundOf,
  pickStanding,
  STANDING_KEYS,
} from "@/net/fair-verify";
import { heartsKit } from "./kit";

/** 하트 판 끝 다시 계산하기 */
const HEARTS_REPLAY: FairReplayGame = {
  check: (rules, seed, log, deals) =>
    checkHeartsReplay(rules as HeartsRules, seed, log as never, deals as never),
  viewOf: (state, seat) => viewOf(state as MatchState, seat),
  standing: pickStanding(STANDING_KEYS.hearts ?? []),
  initial: (rules, seed) =>
    createMatch({ rules: rules as HeartsRules, seed }).state,
  realAction: (action, cards) =>
    realHeartsAction(action as never, cards as never),
  annotate: (view, action) =>
    heartsKit.annotateBotAction
      ? heartsKit.annotateBotAction(view as PlayerView, action as Action)
      : action,
};

/**
 * 하트 멘탈 포커 판: 방장은 `HeartsHostTable`, 참가자는 `HeartsGuestSeat`. 넘긴 카드 열쇠는 받는 기기에게만 직접
 * 보낸다(`sendTo`). 온라인 방을 열 때만 불러온다(`heartsKit.loadFairTable`)
 */
export const heartsFairTable: KitFairTable<
  HeartsRules,
  MatchState,
  PlayerView,
  Action,
  GameEvent,
  Card[][]
> = {
  host: (options) => {
    const table = new HeartsHostTable(options);
    return {
      table,
      presetDeal: () => table.presetHands(),
      maskView: (view) => ({
        ...view,
        hand: [],
        myPass: null,
        received: [],
        decision: null,
      }),
      pendingSeats: (state) =>
        table.pendingSeats(state, heartsKit.pendingSeats),
    };
  },
  guest: (options) => new HeartsGuestSeat(options),
  replay: HEARTS_REPLAY,
  finishedRound: (view) => finishedRoundOf("hearts", view),
};

/** 멘탈 포커 판을 채운 하트 킷(시험이 방을 바로 만들 때. 화면은 `withFairTable`로 불러 채운다) */
export const heartsRoomKit = { ...heartsKit, fairTable: heartsFairTable };
