import {
  checkReplay,
  FairGuestSeat,
  FairHostTable,
  type RoundDeal,
  realAction,
} from "@game/fair-play";
import {
  type Action,
  type Card,
  createMatch,
  type GameEvent,
  type MatchState,
  type PlayerView,
  type PresetDeal,
  type RuleSet,
  viewOf,
} from "@game/mighty-engine";

import type { KitFairTable } from "@/net/fair-table";
import {
  type FairReplayGame,
  finishedRoundOf,
  pickStanding,
  STANDING_KEYS,
} from "@/net/fair-verify";
import { mightyKit } from "./mighty-kit";

/** 마이티 판 끝 다시 계산하기 */
export const MIGHTY_REPLAY: FairReplayGame = {
  standing: pickStanding(STANDING_KEYS.mighty ?? []),
  initial: (rules, seed) =>
    createMatch({ rules: rules as RuleSet, seed }).state,
  check: (rules, seed, log, deals) =>
    checkReplay(
      rules as RuleSet,
      seed,
      log,
      deals as ReadonlyMap<number, RoundDeal>,
    ),
  viewOf: (state, seat) => viewOf(state as MatchState, seat),
  realAction: (action, cards) =>
    realAction(action as Action, cards as ReadonlyMap<number, Card>),
  annotate: (view, action) =>
    mightyKit.annotateBotAction
      ? mightyKit.annotateBotAction(view as PlayerView, action as Action)
      : action,
};

/**
 * 마이티 멘탈 포커 판(3~7마): 방장은 `FairHostTable`, 참가자는 `FairGuestSeat`(방장의 죽이기·프렌드 물음에 답한다).
 * 온라인 방을 열 때만 불러온다(`mightyKit.loadFairTable`)
 */
export const mightyFairTable: KitFairTable<
  RuleSet,
  MatchState,
  PlayerView,
  Action,
  GameEvent,
  PresetDeal
> = {
  host: ({ hooks, ...options }) => {
    const table = new FairHostTable({
      ...options,
      hooks: {
        patch: hooks.patch,
        state: hooks.state,
        log: hooks.log,
        refresh: hooks.refresh,
        broadcast: hooks.broadcast,
        onIncident: hooks.onIncident,
      },
    });
    return {
      table,
      presetDeal: () => table.presetDeal(),
      maskView: (view) => ({
        ...view,
        hand: [],
        discarded: null,
        decision: null,
      }),
    };
  },
  guest: ({ sendTo: _, ...options }) => new FairGuestSeat(options),
  replay: MIGHTY_REPLAY,
  finishedRound: (view) => finishedRoundOf("mighty", view),
};

/** 멘탈 포커 판을 채운 마이티 킷(시험이 방을 바로 만들 때. 화면은 `withFairTable`로 불러 채운다) */
export const mightyRoomKit = { ...mightyKit, fairTable: mightyFairTable };
