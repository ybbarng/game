/*
 * 화면(`OnecardView`)에서 읽는 판 사정. 컴퓨터는 자기 화면만 본다.
 */
import {
  type Action,
  type OnecardCard,
  type OnecardView,
  type Suit,
  suitOf,
} from "@game/onecard-engine";

export type PlayAction = Extract<Action, { type: "play" }>;

export function playMoves(view: OnecardView): PlayAction[] {
  return view.moves.filter((m): m is PlayAction => m.type === "play");
}

export function isActiveSeat(view: OnecardView, seat: number): boolean {
  return !view.finished.includes(seat) && !view.bankrupt.includes(seat);
}

/** `from`에서 `direction` 쪽으로 `steps`번 건너간 판에 있는 자리 */
export function seatAfter(
  view: OnecardView,
  from: number,
  steps = 1,
  direction: 1 | -1 = view.direction,
): number {
  const n = view.rules.players;
  let seat = from;
  for (let k = 0; k < steps; k++) {
    let probe = seat;
    for (let i = 0; i < n; i++) {
      probe = (probe + direction + n) % n;
      if (isActiveSeat(view, probe)) break;
    }
    seat = probe;
  }
  return seat;
}

export function activeCount(view: OnecardView): number {
  return view.handCounts.filter((_, s) => isActiveSeat(view, s)).length;
}

/** 손패에서 무늬별 장 수 */
export function suitCounts(cards: readonly OnecardCard[]): Map<Suit, number> {
  const counts = new Map<Suit, number>();
  for (const card of cards) {
    const suit = suitOf(card);
    if (suit) counts.set(suit, (counts.get(suit) ?? 0) + 1);
  }
  return counts;
}
