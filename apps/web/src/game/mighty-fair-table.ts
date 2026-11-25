import {
  checkReplay,
  FairGuestSeat,
  FairHostTable,
  hiddenFriend,
  type RoundDeal,
  realAction,
  type SeenFriendView,
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
  check: (rules, seed, log, deals, seen) => {
    const checked = checkReplay(
      rules as RuleSet,
      seed,
      log,
      deals as ReadonlyMap<number, RoundDeal>,
    );
    if (!checked.ok || !seen) return checked;
    // 걸음별 사건이 없는 참가자는 받은 화면으로 프렌드 숨기기를 찾는다(방장 기기는 걸음별 사건으로 찾는다).
    // 찾지 않으면 그 뒤 컴퓨터 수가 다시 계산한 것과 달라 정직한 방장을 짚는다.
    const hidden = hiddenFriend(
      checked.states,
      seen.map((v) => JSON.parse(v) as SeenFriendView),
    );
    return hidden ? { ok: false, ...hidden } : checked;
  },
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
      begin: (events) => table.begin(events),
      maskView: (view) => ({
        ...view,
        hand: [],
        discarded: null,
        decision: null,
      }),
    };
  },
  guest: ({ sendTo: _, ...options }) => new FairGuestSeat(options),
  replay: () => MIGHTY_REPLAY,
  finishedRound: (view) => finishedRoundOf("mighty", view),
  // 열쇠를 공개한 판이 다 열리길 기다린다(화면은 한 걸음 늦을 수 있어 판 번호를 화면에서 읽지 않는다).
  whenEndOpened: (seat) => (seat as FairGuestSeat).whenRevealedOpened(),
};

/** 멘탈 포커 판을 채운 마이티 킷(시험이 방을 바로 만들 때. 화면은 `withFairTable`로 불러 채운다) */
export const mightyRoomKit = { ...mightyKit, fairTable: mightyFairTable };
