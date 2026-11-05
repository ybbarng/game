import {
  DEAL_SIZES,
  type GameEvent,
  type PlayerCount,
} from "@game/minhwatu-engine";

import type { FlipMove, FlipSpots } from "@/components/card-fx";
import {
  dealCounts,
  type HwatuPlay,
  hwatuDealMs,
  hwatuPlayMoves,
  hwatuStepsMs,
} from "@/hwatu/card-fx";

/*
 * 민화투 장면 연출(docs/29 2절, docs/05 4.12): 낸 패 → (먹었으면) 짝과 함께 먹은 패로 → 뒤집은 패 → (먹었으면)
 * 먹은 패로, 한 걸음씩. 같은 달 둘 중 고르기를 기다리면 뒤집은 패는 더미 옆에 머물렀다가 고른 뒤 간다
 */

/** 판 시작 나눠 주기 장수(선부터 손패, 마지막 바닥) */
export function minhwatuDealCounts(players: number): number[] {
  const sizes = DEAL_SIZES[players as PlayerCount] ?? DEAL_SIZES[3];
  return dealCounts(players, sizes.hand, sizes.floor);
}

function playsOf(
  events: readonly GameEvent[],
  offsetOf: (seat: number) => number,
): HwatuPlay[] {
  return events.flatMap((e): HwatuPlay[] => {
    if (e.type === "played")
      return [
        {
          card: e.card,
          source: "hand",
          offset: offsetOf(e.seat),
          took: e.took,
        },
      ];
    if (e.type === "flipped")
      return [{ card: e.card, source: "deck", offset: 0, took: e.took }];
    // 고르기를 기다리던 뒤집은 패: 더미 옆 자리(앞 장면)에서 출발한다
    if (e.type === "picked")
      return [{ card: e.card, source: "hand", offset: 0, took: e.took }];
    return [];
  });
}

/** 이 장면의 움직임(`useCardFlip`의 `moves`) */
export function minhwatuMoves(
  prev: FlipSpots,
  events: readonly GameEvent[],
  offsetOf: (seat: number) => number,
): FlipMove[] {
  return hwatuPlayMoves(prev, playsOf(events, offsetOf)).moves;
}

/** 이 장면 연출 시간. 다음 장면은 이만큼 늦게 보인다(움직임 줄이기면 0) */
export function minhwatuSceneMs(
  events: readonly GameEvent[],
  players: number,
): number {
  if (events.some((e) => e.type === "roundStarted"))
    return hwatuDealMs(minhwatuDealCounts(players));
  return hwatuStepsMs(
    hwatuPlayMoves(
      new Map(),
      playsOf(events, () => 0),
    ).steps,
  );
}
