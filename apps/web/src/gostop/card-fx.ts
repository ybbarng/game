import {
  dealSizes,
  type GameEvent,
  type GostopRules,
} from "@game/gostop-engine";

import type { FlipMove, FlipSpots } from "@/components/card-fx";
import {
  dealCounts,
  type HwatuPlay,
  hwatuDealMs,
  hwatuPlayMoves,
  hwatuStepsMs,
} from "@/hwatu/card-fx";

/*
 * 고스톱 장면 연출(docs/28 2절, docs/05 4.12): 낸 카드(또는 폭탄 석 장) → 뒤집은 카드 → 먹은 패 가져가기 →
 * 피 빼앗기, 한 걸음씩. 낸 카드·뒤집은 카드가 짝을 맞췄으면 그 바닥 카드 위에 놓였다가 함께 가져간다
 */

/** 판 시작 나눠 주기 장수(선부터 손패, 마지막 바닥) */
export function gostopDealCounts(rules: GostopRules): number[] {
  const { hand, floor } = dealSizes(rules);
  return dealCounts(rules.players, hand, floor);
}

interface Plan {
  plays: HwatuPlay[];
  /** 함께 먹은 바닥 카드(낸·뒤집은 카드 밖) */
  others: string[];
  stolen: string[];
  takeAt: number;
}

function planOf(
  events: readonly GameEvent[],
  offsetOf: (seat: number) => number,
): Plan {
  const captured = new Set(
    events.flatMap((e) => (e.type === "captured" ? e.cards : [])),
  );
  const all = [...captured];
  const raw: { card: string; source: "hand" | "deck"; offset: number }[] = [];
  for (const e of events) {
    if (e.type === "played")
      raw.push({ card: e.card, source: "hand", offset: offsetOf(e.seat) });
    else if (e.type === "bombed")
      for (const card of e.cards)
        raw.push({ card, source: "hand", offset: offsetOf(e.seat) });
    else if (e.type === "flipped")
      raw.push({ card: e.card, source: "deck", offset: 0 });
  }
  const takeAt = raw.length;
  const plays = raw.map((r) => ({
    ...r,
    took: captured.has(r.card) ? all : [],
    takeAt,
  }));
  const moving = new Set(raw.map((r) => r.card));
  return {
    plays,
    others: all.filter((c) => !moving.has(c)),
    stolen: events.flatMap((e) => (e.type === "stolen" ? [e.card] : [])),
    takeAt,
  };
}

/** 이 장면의 움직임(`useCardFlip`의 `moves`) */
export function gostopMoves(
  prev: FlipSpots,
  events: readonly GameEvent[],
  offsetOf: (seat: number) => number,
): FlipMove[] {
  const plan = planOf(events, offsetOf);
  const { moves } = hwatuPlayMoves(prev, plan.plays);
  for (const id of plan.others) moves.push({ id, step: plan.takeAt });
  const stealAt =
    plan.takeAt +
    (plan.others.length > 0 || plan.plays.some((p) => p.took.length > 0)
      ? 1
      : 0);
  for (const id of plan.stolen) moves.push({ id, step: stealAt });
  return moves;
}

/** 이 장면 연출 시간. 다음 장면은 이만큼 늦게 보인다(움직임 줄이기면 0) */
export function gostopSceneMs(
  events: readonly GameEvent[],
  rules: GostopRules,
): number {
  if (events.some((e) => e.type === "roundStarted"))
    return hwatuDealMs(gostopDealCounts(rules));
  const plan = planOf(events, () => 0);
  const took =
    plan.others.length > 0 || plan.plays.some((p) => p.took.length > 0);
  return hwatuStepsMs(
    plan.takeAt + (took ? 1 : 0) + (plan.stolen.length > 0 ? 1 : 0),
  );
}
