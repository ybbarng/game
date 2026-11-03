/*
 * 원카드 임시 컴퓨터(docs/42 B안 8번). 컴퓨터 패키지 `@game/onecard-ai`가 생기면 `onecardBotFor`만 바꿔 끼운다.
 * 모양은 그 패키지와 맞춘다: 차례 수 `chooseAction(view, rng)`, 외침 계획 `planShout(view, rng)`.
 * 외침은 판에 보이지 않는 것(누가 외쳤나)을 기억해야 해서 `hear(events, view)`로 모두에게 가는 사건을 듣는다.
 */
import { nextFloat, type RngState } from "@game/mighty-engine";
import {
  type Action,
  type GameEvent,
  isAttackCard,
  isJoker,
  type OnecardCard,
  type OnecardView,
  rankOf,
  SUITS,
  type Suit,
  suitOf,
} from "@game/onecard-engine";

import type { KitBot } from "@/game/kit";

export interface OnecardBot {
  readonly name: string;
  /** 차례 수(내기·먹기). `view.moves`에서 고른다 */
  chooseAction(view: OnecardView, rng: RngState): Action;
  /**
   * "원카드!"를 칠지와 언제 칠지. null이면 치지 않는다. 판이 바뀔 때마다 불린다.
   * 칠 때는 그 순간 화면의 판 번호(`view.turnNo`)를 `seen`으로 보낸다(부르는 쪽이 채운다)
   */
  planShout(view: OnecardView, rng: RngState): { delayMs: number } | null;
  /** 모두에게 가는 사건을 듣는다(누가 외쳤나 기억). 없어도 된다 */
  hear?(events: readonly GameEvent[], view: OnecardView): void;
}

/** 단계(지금은 "보통" 하나. 컴퓨터 패키지가 생기면 셋으로) */
export interface OnecardBotLevel {
  /** 미리 외칠 확률(내 차례 두 장) */
  preCall: number;
  /** 미리 외치지 못하고 한 장이 됐을 때 본인 시간 안에 알아챌 확률 */
  selfCall: number;
  /** 남이 외치지 않은 것을 알아채 잡을 확률 */
  catchChance: number;
  /** 잡을 때 본인 시간이 끝난 뒤 더 기다리는 시간(ms) 범위 */
  catchDelay: [number, number];
}

export const NORMAL_LEVEL: OnecardBotLevel = {
  preCall: 0.85,
  selfCall: 0.5,
  catchChance: 0.6,
  catchDelay: [250, 1600],
};

interface Memory {
  /** 지난번에 본 자리별 손패 장 수 */
  counts: number[];
  /** 자리별로 한 장(또는 두 장)이 된 뒤 외침을 들은 자리 */
  heard: Set<number>;
  /** 자리별 "한 장이 된 횟수"(같은 한 장 상태를 두 번 따지지 않는다) */
  episode: number[];
  /** 이미 따져 본 일 */
  considered: Set<string>;
}

function between(rng: RngState, [lo, hi]: [number, number]): number {
  return lo + nextFloat(rng) * (hi - lo);
}

/** 손패에서 가장 많은 무늬(7을 낼 때 바꿀 무늬) */
function bestSuit(hand: readonly OnecardCard[], played: OnecardCard): Suit {
  const count = new Map<Suit, number>(SUITS.map((s) => [s, 0]));
  for (const card of hand) {
    if (card === played || isJoker(card)) continue;
    const suit = suitOf(card) as Suit;
    count.set(suit, (count.get(suit) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "S";
}

/** 낼 카드를 아끼는 정도(작을수록 먼저 낸다) */
function keepScore(card: OnecardCard): number {
  if (isJoker(card)) return 50;
  if (isAttackCard(card)) return 30;
  const rank = rankOf(card);
  if (rank === "7") return 20;
  if (rank === "J" || rank === "Q" || rank === "K") return 5;
  return 0;
}

/** 규칙 몇 개로 고르는 임시 컴퓨터. 자리마다 기억을 따로 둔다(한 대국에 하나씩 만든다) */
export function createOnecardBot(
  level: OnecardBotLevel = NORMAL_LEVEL,
): OnecardBot {
  const memories = new Map<number, Memory>();
  const memoryOf = (view: OnecardView): Memory => {
    let m = memories.get(view.mySeat);
    if (!m) {
      m = {
        counts: [...view.handCounts],
        heard: new Set(),
        episode: view.handCounts.map(() => 0),
        considered: new Set(),
      };
      memories.set(view.mySeat, m);
    }
    return m;
  };

  return {
    name: "onecard-normal",

    chooseAction(view, rng) {
      const plays = view.moves.filter(
        (a): a is Extract<Action, { type: "play" }> => a.type === "play",
      );
      if (plays.length === 0) return { type: "draw" };
      // 아끼는 카드는 뒤로. 공격을 받았으면 받아치는 것이 먹는 것보다 낫다.
      const scored = plays.map((a) => ({
        a,
        score: keepScore(a.card) + nextFloat(rng) * 0.5,
      }));
      scored.sort((x, y) => x.score - y.score);
      const pick = scored[0]?.a as Extract<Action, { type: "play" }>;
      if (rankOf(pick.card) === "7")
        return {
          type: "play",
          card: pick.card,
          suit: bestSuit(view.hand, pick.card),
        };
      return pick;
    },

    hear(events, view) {
      const m = memoryOf(view);
      for (const e of events) {
        if (e.type === "shouted") m.heard.add(e.seat);
        if (e.type === "caught") m.heard.add(e.target);
      }
      view.handCounts.forEach((count, seat) => {
        if (count !== 1 && count !== 2) m.heard.delete(seat);
        if (count === 1 && m.counts[seat] !== 1)
          m.episode[seat] = (m.episode[seat] ?? 0) + 1;
      });
      m.counts = [...view.handCounts];
    },

    planShout(view, rng) {
      if (view.phase === "over") return null;
      const me = view.mySeat;
      const m = memoryOf(view);
      const once = (key: string) => {
        if (m.considered.has(key)) return false;
        m.considered.add(key);
        return true;
      };
      const out = (seat: number) =>
        view.finished.includes(seat) || view.bankrupt.includes(seat);
      if (out(me)) return null;
      const mine = view.hand.length;
      // 내 차례에 두 장이고 낼 카드가 있으면 미리 외친다(차례 수보다 먼저 나가게 짧게).
      if (
        view.phase === "play" &&
        view.turn === me &&
        mine === 2 &&
        !m.heard.has(me) &&
        view.moves.some((a) => a.type === "play") &&
        once(`pre:${view.turnNo}`)
      )
        return nextFloat(rng) < level.preCall
          ? { delayMs: between(rng, [80, 250]) }
          : null;
      // 미리 외치지 못하고 한 장이 됐다: 본인 시간 안에 알아채면 외친다.
      if (mine === 1 && !m.heard.has(me) && once(`self:${m.episode[me]}`))
        return nextFloat(rng) < level.selfCall
          ? {
              delayMs: between(rng, [
                200,
                Math.max(300, view.rules.selfWindowMs - 150),
              ]),
            }
          : null;
      // 외치지 않은 한 장짜리 남을 잡는다(본인 시간이 끝난 뒤).
      for (let seat = 0; seat < view.handCounts.length; seat++) {
        if (seat === me || out(seat)) continue;
        if (view.handCounts[seat] !== 1 || m.heard.has(seat)) continue;
        if (!once(`catch:${seat}:${m.episode[seat]}`)) continue;
        if (nextFloat(rng) >= level.catchChance) continue;
        return {
          delayMs: view.rules.selfWindowMs + between(rng, level.catchDelay),
        };
      }
      return null;
    },
  };
}

/** 단계에 맞는 컴퓨터. 지금은 단계와 상관없이 "보통" 하나 */
export function onecardBotFor(_level: number): OnecardBot {
  return createOnecardBot();
}

/** 대국 진행(LocalMatch)에 넘기는 모양으로 바꾼다. 외침은 그 순간 화면의 판 번호를 싣는다 */
export function toKitBot(
  bot: OnecardBot,
): KitBot<OnecardView, Action, GameEvent> {
  return {
    name: bot.name,
    decide: (view, rng) => bot.chooseAction(view, rng),
    react(view, events, rng) {
      bot.hear?.(events, view);
      const plan = bot.planShout(view, rng);
      return plan
        ? {
            delayMs: plan.delayMs,
            action: { type: "shout", seen: view.turnNo },
          }
        : null;
    },
  };
}
