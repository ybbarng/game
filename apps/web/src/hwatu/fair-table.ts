import {
  checkHwatuReplay,
  type HwatuFairSpec,
  HwatuGuestSeat,
  HwatuHostTable,
  realHwatuAction,
} from "@game/fair-play";
import type { PresetDeal } from "@game/hwatu";

import {
  type KitFairTable,
  type KitHostTable,
  whenEndRoundOpened,
} from "@/net/fair-table";
import {
  finishedRoundOf,
  pickStanding,
  STANDING_KEYS,
} from "@/net/fair-verify";

// biome-ignore lint/suspicious/noExplicitAny: 화면 모양은 게임마다 다르다(손패·결정·판 번호만 쓴다)
type AnyHwatuSeat = HwatuGuestSeat<any, any, any, any, any>;

/**
 * 화투 셋(고스톱·민화투·나이롱뽕)의 멘탈 포커 판: 방장은 `HwatuHostTable`, 참가자는 `HwatuGuestSeat`. 판을 시드로
 * 정한다(판마다의 선·손패 장수, `seeded`). 게임마다 다른 것은 카드 표 약속(`HwatuFairSpec`, `<게임>/fair.ts`)이다.
 * 온라인 방을 열 때만 불러온다(`<게임>Kit.loadFairTable`)
 */
export function hwatuFairTable<Rules, State, View, Action, Event>(
  // biome-ignore lint/suspicious/noExplicitAny: 화면 모양은 게임마다 다르다(손패·결정·판 번호만 쓴다)
  spec: HwatuFairSpec<Rules, State, any, Action, Event>,
): KitFairTable<Rules, State, View, Action, Event, PresetDeal> {
  return {
    seeded: true,
    host: ({ hooks, ...options }) => {
      const table = new HwatuHostTable({
        ...options,
        spec,
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
        table: table as KitHostTable<State, View, Action, Event>,
        presetDeal: () => table.firstDeal(),
        // 첫 판이 바로 끝날 수 있다(고스톱 총통): 다음 판 섞기를 시작한다.
        begin: (events) => table.after(hooks.state(), events),
        maskView: (view) => ({ ...view, hand: [], decision: null }),
        pendingSeats: (state) => table.pendingSeats(state),
        ready: (message, from) => table.receive(message, from),
      };
    },
    guest: ({ sendTo: _, seed, ...options }) =>
      new HwatuGuestSeat({ ...options, spec, seed: seed as number }),
    // 진짜 패로 돌리며 방장이 더미를 엔진대로만 열었는지도 본다.
    replay: ({ kit, seat }) => {
      const fair = seat as AnyHwatuSeat;
      return {
        check: (rules, seed, log, deals) =>
          checkHwatuReplay(
            spec,
            rules as Rules,
            seed,
            log as never,
            deals as never,
            {
              of: (round) => fair.coordinator.requestsOf(round),
              deviceOf: (s) => fair.deviceOf(s),
            },
          ) as never,
        viewOf: (state, s) => spec.refreshView(spec.viewOf(state as State, s)),
        ...(STANDING_KEYS[kit.id]
          ? {
              standing: pickStanding(STANDING_KEYS[kit.id] ?? []),
              // 시작할 때 점수는 패와 상관없다(엔진이 시드로 섞은 패로 만든다).
              initial: (rules: unknown, seed: number) =>
                spec.createMatch(rules as Rules, seed, undefined as never)
                  .state,
            }
          : {}),
        // 방장이 실은 쓴 시간(응답 창)도 떼고 견준다.
        realAction: (action) => {
          const bare = realHwatuAction(action) as Action;
          return kit.timing ? (kit.timing.strip(bare) ?? bare) : bare;
        },
        // 방장이 실은 쓴 시간(`spent`)만 뗀다(내가 보낸 연 자리는 그대로 둔다).
        sentForm: (action) => {
          if (!kit.timing || typeof action !== "object" || action === null)
            return action;
          const { spent: _, ...rest } = action as { spent?: unknown };
          return rest;
        },
        byClock: (action) =>
          (kit.timing ? kit.timing.strip(action as Action) === null : false) ||
          kit.hostAction?.(action as Action) === true,
        annotate: (view, action) =>
          kit.annotateBotAction
            ? kit.annotateBotAction(view as View, action as Action)
            : action,
      };
    },
    finishedRound: (view) => finishedRoundOf(spec, view),
    whenEndOpened: (seat, end) =>
      whenEndRoundOpened(seat as AnyHwatuSeat, end, null),
  };
}
