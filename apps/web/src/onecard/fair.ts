import type { OnecardTableSpec } from "@game/fair-play";
import {
  type Action,
  createFairMatch,
  type GameEvent,
  movesOf,
  type OnecardCard,
  type OnecardRules,
  type OnecardState,
  type OnecardView,
  pendingSeats,
  sortOnecards,
  step,
  viewOf,
  withRefill,
} from "@game/onecard-engine";

/**
 * 원카드 멘탈 포커(암호화방, docs/42 16절). 엔진 멘탈 포커 판(`createFairMatch`)을 fair-play
 * `OnecardHostTable`·`OnecardGuestSeat`에 잇는 연결 코드.
 * - 한 게임이 한 판이다(판 번호 1, `withPreset`은 쓸 일이 없다)
 * - 다시 섞기는 방장이 알린 버린 더미(공개)를 새 섞기 사슬로 섞고, 엔진에는 그 조각의 자리 표를 넣는다(`withRefill`)
 * - 이 걸음에 더미에서 먹은 카드마다 먹은 자리(`drawsOf`). 모두에게 펼치는 뽑기는 판을 만들 때(처음 카드 다시 펴기)뿐이다
 */
export const onecardFair: OnecardTableSpec<
  OnecardRules,
  OnecardState,
  OnecardView,
  Action,
  GameEvent
> = {
  kind: "onecard",
  handSizes: (rules) =>
    Array.from({ length: rules.players }, () => rules.handSize),
  createMatch: (rules, _seed, preset) => createFairMatch(rules, preset),
  step,
  viewOf,
  pendingSeats,
  roundOf: () => 1,
  withPreset: (state) => state,
  withRefill,
  reshufflesOf: (state) => state.reshuffles ?? 0,
  reshufflePool: (state) => state.pile.slice(0, -1),
  drawsOf: (events) =>
    events.flatMap((e) =>
      e.type === "drew"
        ? Array.from({ length: e.count }, () => e.seat as number | null)
        : [],
    ),
  revealsOf: (action) => (action.type === "play" ? [action.card] : []),
  gameOver: (state) => state.phase === "over",
  reshuffling: (state) => state.phase === "reshuffle",
  isReshuffle: (action) => action.type === "reshuffle",
  refreshView: (view) => {
    const hand = sortOnecards(view.hand);
    const top = view.pile.at(-1) as OnecardCard;
    const mine = view.phase === "play" && view.turn === view.mySeat;
    return {
      ...view,
      hand,
      moves: mine
        ? movesOf(
            {
              rules: view.rules,
              top,
              suit: view.suit,
              attack: view.attack,
            },
            hand,
          )
        : [],
    };
  },
};
