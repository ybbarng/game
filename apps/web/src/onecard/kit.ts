import {
  type Action,
  createMatch,
  decodeOnecardRules,
  encodeOnecardRules,
  type GameEvent,
  type OnecardCard,
  type OnecardRules,
  type OnecardSetup,
  type OnecardState,
  type OnecardView,
  pendingSeat,
  replay,
  seededReshuffle,
  shoutWindows,
  shuffledOnecardDeck,
  sortOnecards,
  step,
  viewOf,
} from "@game/onecard-engine";

import type { Commentary, GameKit, KitStats } from "@/game/kit";
import type { GameRecord, RoundRecord } from "@/stats/records";

import { onecardBotFor, toKitBot } from "./bots";
import { cardName, SUIT_NAMES } from "./cards";

/**
 * 원카드 키트. `Extra`는 판 시작 재료(`OnecardSetup`, 섞인 덱). 없으면 씨앗으로 섞는다.
 * 온라인 멘탈 포커 판은 섞은 순서를 바깥에서 넣을 자리로 쓴다(아직 잇지 않았다)
 */
export type OnecardKit = GameKit<
  OnecardRules,
  OnecardState,
  OnecardView,
  Action,
  GameEvent,
  OnecardSetup
>;

/** 씨앗으로 섞은 덱(혼자 하기·일반방) */
export function setupOf(seed: number, extra?: OnecardSetup): OnecardSetup {
  return extra ?? { deck: shuffledOnecardDeck(seed) };
}

/** 판 기록(내 자리에서 본 것). 원카드는 한 판이 한 게임이다 */
export interface OnecardRound {
  players: number;
  /** 내 등수(1부터) */
  rank: number;
  /** 남은 손패 장 수(다 냈으면 0, 파산은 파산할 때 장 수) */
  score: number;
  /** 다 냈다 */
  out: boolean;
  bankrupt: boolean;
  /** 내가 남을 잡은 횟수 */
  catches: number;
  /** 내가 잡힌 횟수 */
  caught: number;
  /** 내 헛외침 */
  falseShouts: number;
}

export interface OnecardGame {
  players: number;
  rank: number;
  won: boolean;
  retired: boolean;
}

export const onecardStats: KitStats<OnecardView, GameEvent> = {
  roundStarted: (events) => events.some((e) => e.type === "dealt"),
  roundEnded: (events) => events.some((e) => e.type === "ended"),
  gameEnded: (events) => events.some((e) => e.type === "ended"),
  roundNumber: () => 1,
  round(_start, end, events): OnecardRound | null {
    const result = end.result;
    if (!result) return null;
    const me = end.mySeat;
    return {
      players: end.rules.players,
      rank: result.ranks[me] ?? end.rules.players,
      score: result.scores[me] ?? 0,
      out: end.finished.includes(me),
      bankrupt: end.bankrupt.includes(me),
      catches: events.filter((e) => e.type === "caught" && e.seat === me)
        .length,
      caught: events.filter((e) => e.type === "caught" && e.target === me)
        .length,
      falseShouts: events.filter(
        (e) => e.type === "falseShout" && e.seat === me,
      ).length,
    };
  },
  game(view): OnecardGame {
    const rank = view.result?.ranks[view.mySeat] ?? view.rules.players;
    return {
      players: view.rules.players,
      rank,
      won: !view.retired && rank === 1,
      retired: view.retired === true,
    };
  },
};

/** 행동 한 줄 설명(복기) */
export function describeAction(action: Action): string {
  switch (action.type) {
    case "play":
      return action.suit
        ? `${cardName(action.card)} 냄, ${SUIT_NAMES[action.suit]}로 바꿈`
        : `${cardName(action.card)} 냄`;
    case "draw":
      return "먹음";
    case "shout":
      return "원카드!";
    case "timeout":
      return action.kind === "selfWindow" ? "본인 시간 끝" : "잡기 시간 끝";
    case "reshuffle":
      return "버린 더미를 다시 섞음";
    case "retire":
      return "게임 끝냄";
  }
}

/** 다시 보기 해설: 지금은 상황만(고수 컴퓨터가 생기면 견준다) */
function explainOnecard(
  state: OnecardState,
  next: { seat: number; action: unknown },
  _after: OnecardState | null,
  _seed: number,
  name: (seat: number) => string,
): Commentary {
  const counts = state.hands.map((h, s) => `${name(s)} ${h.length}장`);
  return {
    situation: [
      `${name(next.seat)}: ${describeAction(next.action as Action)}`,
      counts.join(", "),
    ],
    verdict: null,
    reasons: [],
  };
}

export const onecardKit: OnecardKit = {
  id: "onecard",
  createMatch: (rules, seed, extra) => createMatch(rules, setupOf(seed, extra)),
  step,
  viewOf,
  replay: (rules, seed, log, extra) => replay(rules, setupOf(seed, extra), log),
  pendingSeats: (state) => {
    const seat = pendingSeat(state);
    return seat === null ? [] : [seat];
  },
  playerCount: (rules) => rules.players,
  encodeRules: encodeOnecardRules,
  decodeRules: decodeOnecardRules,
  startEvents: (view) => [
    {
      type: "dealt",
      first: view.turn,
      top: view.pile[0] as OnecardCard,
    },
  ],
  isOver: (view) => view.phase === "over",
  // 시간 끝·다시 섞기는 대국을 돌리는 기기(방장)만 넣는다.
  guestMayAct: (action) =>
    action.type !== "retire" &&
    action.type !== "timeout" &&
    action.type !== "reshuffle",
  // "원카드!"는 누구나 언제든 친다(docs/42 B안 1번).
  offTurn: (_view, action) => action.type === "shout",
  retireAction: { type: "retire" },
  stats: onecardStats,
  botCanAct: (view) => view.phase === "play",
  review: {
    firstExtra: () => undefined,
    prepare: (state) => state,
    cleanup: (state) => state,
    realAction: (action) => action,
    situation: (state) => ({
      voids: state.hands.map(() => []),
      tally: state.hands.map((hand, seat) => ({
        seat,
        label: "",
        value: `${hand.length}장`,
      })),
    }),
    describe: (action) => describeAction(action as Action),
    sortHand: (_state, cards) => sortOnecards(cards as OnecardCard[]),
    explain: explainOnecard,
  },
  botFor: (level) => toKitBot(onecardBotFor(level)),
  /**
   * 외침 창(본인 시간 P·잡기 창 T, docs/42 B안 4·5·7번). 엔진은 시간을 재지 않고 열린 창만 알려 준다.
   * 대국을 돌리는 기기가 창 번호마다 시계를 걸고 다 되면 `timeout`을 넣는다. 창 번호는 P가 T로 바뀌면 새로 바뀐다
   */
  timers: (state) =>
    shoutWindows(state).map((w) => ({
      key: `w${w.id}`,
      seat: w.seat,
      ms: w.ms,
      action: { type: "timeout", kind: w.kind, target: w.seat },
    })),
  /** 더미가 바닥나면 버린 더미를 씨앗으로 다시 섞는다(혼자 하기·일반방). 멘탈 포커 판은 섞기 사슬로 바꾼다 */
  autoAction: (state, seed) => {
    const action = seededReshuffle(state, seed);
    return action ? { seat: state.turn, action } : null;
  },
};

/* ---------- 지표(내 기록) ---------- */

export interface OnecardSummary {
  games: number;
  wins: number;
  averageRank: number;
  outs: number;
  bankrupts: number;
  catches: number;
  caught: number;
  falseShouts: number;
  /** 최근 판(오래된 것부터, 1등 1·아니면 −1) */
  recent: number[];
}

export function summarizeOnecard(
  rounds: readonly RoundRecord[],
  _games: readonly GameRecord[],
): OnecardSummary {
  const all = rounds
    .filter((r) => r.game === "onecard")
    .map((r) => r.data as OnecardRound);
  const sum = (f: (r: OnecardRound) => number) =>
    all.reduce((n, r) => n + f(r), 0);
  return {
    games: all.length,
    wins: all.filter((r) => r.rank === 1).length,
    averageRank: all.length === 0 ? 0 : sum((r) => r.rank) / all.length,
    outs: all.filter((r) => r.out).length,
    bankrupts: all.filter((r) => r.bankrupt).length,
    catches: sum((r) => r.catches),
    caught: sum((r) => r.caught),
    falseShouts: sum((r) => r.falseShouts),
    recent: all.slice(-30).map((r) => (r.rank === 1 ? 1 : -1)),
  };
}
