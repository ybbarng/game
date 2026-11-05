/**
 * 원카드 카드 연출 계획(순수 함수). 한 걸음의 사건에서 "어느 카드가 어디서 어디로 언제 날아가나"를 정한다.
 *
 * 판 상태는 늘 바로 그린다. 연출은 그 위를 지나가는 겉그림(유령 카드)일 뿐이다. 특히 버린 더미의 맨 위 카드는
 * 판 상태가 도착한 프레임에 그려지고(더미 치기 반응 시간의 기준, `useStimulusShown`), 내기 연출은 그 위로 날아와
 * 같은 그림에 겹쳐 사라진다. 그래서 연출이 반응 시간 측정과 방장의 청구 하한(`claim-race.ts`)을 바꾸지 않는다.
 *
 * 하트·마이티처럼 손패 자리 → 가운데(내기), 덱 → 손패(먹기), 버린 더미 → 덱(다시 섞기)으로 날고,
 * 여러 장은 한 장씩 차례로 난다. 앞 연출이 끝나지 않았으면 그 뒤에 잇는다(store가 아니라 화면이 줄을 세운다).
 */
import type { GameEvent, OnecardCard } from "@game/onecard-engine";

import { FLIGHT_MS, SHUFFLE_MS } from "@/game/timing";

/** 카드 가운데 자리와 너비(px, 무대 기준) */
export interface Spot {
  x: number;
  y: number;
  w: number;
  rotate?: number;
}

export type FxStep =
  | {
      kind: "fly";
      /** null이면 뒷면 */
      card: OnecardCard | null;
      from: Spot;
      to: Spot;
      /** 이 걸음의 연출 시작부터(ms) */
      at: number;
      ms: number;
      /** 내려앉을 때까지 손패에서 가려 둘 카드(내가 먹은 카드) */
      hideCard?: OnecardCard;
      /** 내려앉을 때까지 그 자리 뒷면 부채에서 가려 둘 한 장(남이 먹은 카드) */
      hideSeat?: number;
    }
  | { kind: "shuffle"; at: number; ms: number };

/** 카드 한 장을 내는 연출(천천히, 무엇을 냈는지 알아볼 만큼) */
export const PLAY_MS = 420;
/** 먹는 카드 한 장이 덱에서 손패까지 */
export const DRAW_MS = FLIGHT_MS;
/** 여러 장 먹을 때 한 장과 다음 장의 출발 간격 */
export const DRAW_GAP_MS = 200;
/** 한 연출이 끝나고 다음 연출까지 */
export const STEP_PAUSE_MS = 80;
/** 다시 섞기 전에 버린 더미에서 덱으로 옮기는 카드 수(그림만, 실제 장 수와 상관없다) */
export const GATHER_CARDS = 4;
/** 버린 더미를 다시 섞는 연출(덱이 두 번 갈라졌다 합쳐진다) */
export const RESHUFFLE_MS = SHUFFLE_MS;

export interface FxContext {
  me: number;
  /** 걸음 전 내 손패와 걸음 뒤 내 손패 */
  prevHand: readonly OnecardCard[];
  hand: readonly OnecardCard[];
  /** 걸음 전 자리별 장 수 */
  prevCounts: readonly number[];
  deck: Spot;
  pile: Spot;
  /** 걸음 전 손패에서 그 카드가 있던 자리 */
  prevHandSpot(card: OnecardCard): Spot | null;
  /** 걸음 뒤 손패에서 그 카드가 놓일 자리 */
  handSpot(card: OnecardCard): Spot | null;
  /** 남의 뒷면 부채에서 `count`장 중 `index`번째 자리 */
  fanSpot(seat: number, index: number, count: number): Spot | null;
}

/**
 * 한 걸음의 사건으로 연출 걸음을 짠다. `duration`은 마지막 연출이 끝나는 때(ms).
 * 나눠 주기(`dealt`)는 `DealAnimation`이 따로 맡으므로 여기서는 다루지 않는다
 */
export function planFx(
  events: readonly GameEvent[],
  ctx: FxContext,
): { steps: FxStep[]; duration: number } {
  const steps: FxStep[] = [];
  let t = 0;
  const counts = [...ctx.prevCounts];
  // 내가 먹은 카드는 걸음 앞뒤 손패를 견주어 찾는다(먹은 차례대로 하나씩 꺼낸다)
  const before = new Set(ctx.prevHand);
  const drawn = ctx.hand.filter((c) => !before.has(c));
  const next = () => {
    t += STEP_PAUSE_MS;
  };
  for (const e of events) {
    if (e.type === "played") {
      const left = counts[e.seat] ?? 1;
      const from =
        e.seat === ctx.me
          ? ctx.prevHandSpot(e.card)
          : ctx.fanSpot(e.seat, Math.floor((left - 1) / 2), left);
      counts[e.seat] = Math.max(0, left - 1);
      if (!from) continue;
      steps.push({
        kind: "fly",
        card: e.card,
        from,
        to: ctx.pile,
        at: t,
        ms: PLAY_MS,
      });
      t += PLAY_MS;
      next();
    } else if (e.type === "drew") {
      const had = counts[e.seat] ?? 0;
      const total = had + e.count;
      counts[e.seat] = total;
      let any = false;
      for (let k = 0; k < e.count; k++) {
        if (e.seat === ctx.me) {
          const card = drawn.shift();
          const to = card ? ctx.handSpot(card) : null;
          if (!card || !to) continue;
          steps.push({
            kind: "fly",
            card,
            from: ctx.deck,
            to,
            at: t + k * DRAW_GAP_MS,
            ms: DRAW_MS,
            hideCard: card,
          });
        } else {
          const to = ctx.fanSpot(e.seat, had + k, total);
          if (!to) continue;
          steps.push({
            kind: "fly",
            card: null,
            from: ctx.deck,
            to,
            at: t + k * DRAW_GAP_MS,
            ms: DRAW_MS,
            hideSeat: e.seat,
          });
        }
        any = true;
      }
      if (any) {
        t += (e.count - 1) * DRAW_GAP_MS + DRAW_MS;
        next();
      }
    } else if (e.type === "reshuffleNeeded") {
      // 맨 위 한 장만 남기고 버린 더미를 덱 자리로 모은다
      const n = Math.min(GATHER_CARDS, e.count);
      for (let k = 0; k < n; k++)
        steps.push({
          kind: "fly",
          card: null,
          from: ctx.pile,
          to: ctx.deck,
          at: t + k * 90,
          ms: FLIGHT_MS,
        });
      if (n > 0) {
        t += (n - 1) * 90 + FLIGHT_MS;
        next();
      }
    } else if (e.type === "reshuffled") {
      steps.push({ kind: "shuffle", at: t, ms: RESHUFFLE_MS });
      t += RESHUFFLE_MS;
      next();
    }
  }
  return { steps, duration: Math.max(0, t - STEP_PAUSE_MS) };
}

/**
 * 앞 연출이 남아 있으면 이번 연출을 언제 시작하나. 너무 밀렸으면(`maxLagMs` 넘게) 남은 것을 버리고 바로 시작한다
 * (연출이 판 상태보다 한참 뒤처져 엉뚱한 때 날지 않게)
 */
export function fxStart(
  now: number,
  busyUntil: number,
  maxLagMs = 900,
): { delay: number; flush: boolean } {
  const lag = busyUntil - now;
  if (lag <= 0) return { delay: 0, flush: false };
  if (lag > maxLagMs) return { delay: 0, flush: true };
  return { delay: lag, flush: false };
}

/** 원카드 나눠 주기 묶음: 손패를 두 번에 나눠 준다(7장은 3·4, 5장은 2·3) */
export function onecardDealPattern(handSize: number): number[] {
  const first = Math.floor(handSize / 2);
  return [first, handSize - first];
}
