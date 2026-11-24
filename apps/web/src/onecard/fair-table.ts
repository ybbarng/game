import {
  checkOnecardTable,
  flipCount,
  OnecardGuestSeat,
  OnecardHostTable,
  type OnecardTableSpec,
  realOnecardAction,
} from "@game/fair-play";

import {
  type KitFairTable,
  type KitHostTable,
  whenEndRoundOpened,
} from "@/net/fair-table";
import { endsWithRetire, finishedRoundOf } from "@/net/fair-verify";
import { onecardFair } from "./fair";
import { type OnecardKit, onecardKit } from "./kit";

// biome-ignore lint/suspicious/noExplicitAny: 화면 모양은 게임마다 다르다
type AnyOnecardSeat = OnecardGuestSeat<any, any, any, any, any>;

/**
 * 원카드 멘탈 포커 판: 방장은 `OnecardHostTable`(판 도중 뽑기·다시 섞기 사슬), 참가자는 `OnecardGuestSeat`.
 * 판을 시드로 정한다(`seeded`). 카드 표 약속은 `onecardFair`(시험은 작은 덱으로 바꾼 약속을 넣는다).
 * 온라인 방을 열 때만 불러온다(`onecardKit.loadFairTable`)
 */
export function onecardFairTableOf<Rules, State, View, Action, Event, Extra>(
  // biome-ignore lint/suspicious/noExplicitAny: 화면 모양은 게임마다 다르다
  spec: OnecardTableSpec<Rules, State, any, Action, Event>,
): KitFairTable<Rules, State, View, Action, Event, Extra> {
  return {
    seeded: true,
    host: ({ hooks, ...options }) => {
      const table = new OnecardHostTable({
        ...options,
        spec,
        hooks: {
          state: hooks.state,
          log: hooks.log,
          refresh: hooks.refresh,
          broadcast: hooks.broadcast,
          onIncident: hooks.onIncident,
        },
      });
      return {
        table: table as unknown as KitHostTable<State, View, Action, Event>,
        presetDeal: () => table.firstDeal() as Promise<Extra | null>,
        begin: (events) => table.after(hooks.state(), events),
        maskView: (view) => ({ ...view, hand: [], decision: null }),
        pendingSeats: (state) => table.pendingSeats(state),
      };
    },
    guest: ({ sendTo: _, seed, ...options }) =>
      new OnecardGuestSeat({ ...options, spec, seed: seed as number }),
    // 처음 덱과 다시 섞은 더미의 진짜 카드로 돌리며, 방장이 더미를 엔진이 먹은 대로만(같은 차례, 같은 사람에게)
    // 열었는지, 다시 섞을 카드를 버린 더미대로 알렸는지 본다(`checkOnecardTable`).
    replay: ({ kit, seat, verifyContext: context }) => {
      const fair = seat as AnyOnecardSeat;
      return {
        ...(kit.verifyUnsigned
          ? {
              unsigned: (state, entry, index) =>
                kit.verifyUnsigned?.({
                  before: state as State,
                  seat: entry.seat,
                  action: realOnecardAction(entry.action) as Action,
                  index,
                  context,
                }) ?? null,
              unsignedDone: () => kit.verifyUnsignedDone?.(context) ?? null,
            }
          : {}),
        check: (rules, seed, log, deals) =>
          checkOnecardTable(
            spec,
            rules as Rules,
            seed,
            log as never,
            deals as never,
            {
              of: (round) => fair.deck.requestsOf(round),
              deviceOf: (s) => fair.deviceOf(s),
            },
            flipCount,
            // 그만둔 게임은 덱을 열지 않는다(끝까지 치지 않은 판, 결과 없음).
            { retired: endsWithRetire(log) },
          ) as never,
        viewOf: (state, s) => spec.refreshView(spec.viewOf(state as State, s)),
        realAction: (action) => realOnecardAction(action),
        byClock: (action) => kit.hostAction?.(action as Action) === true,
        annotate: (view, action) =>
          kit.annotateBotAction
            ? kit.annotateBotAction(view as View, action as Action)
            : action,
      };
    },
    finishedRound: (view) => finishedRoundOf("onecard", view),
    // 원카드는 한 게임이 한 판(판 번호 1)이라 화면에 판 번호가 없다.
    whenEndOpened: (seat, end) =>
      whenEndRoundOpened(seat as AnyOnecardSeat, end, 1),
  };
}

/** 원카드 멘탈 포커 판 */
export const onecardFairTable: NonNullable<OnecardKit["fairTable"]> =
  onecardFairTableOf(onecardFair);

/** 멘탈 포커 판을 채운 원카드 킷(시험이 방을 바로 만들 때. 화면은 `withFairTable`로 불러 채운다) */
export const onecardRoomKit = { ...onecardKit, fairTable: onecardFairTable };
