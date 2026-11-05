import {
  type GameEvent,
  HAND_SIZE,
  type NyrongppongView,
} from "@game/nyrongppong-engine";

import type { FlipMove, FlipSpots } from "@/components/card-fx";
import { dealCounts, fanSource, hwatuDealMs } from "@/hwatu/card-fx";

/*
 * 나이롱뽕 장면 연출(docs/30, docs/05 4.12): 더미에서 한 장 가져오기, 손패에서 버린 패로 버리기, 뽕(버린 패와
 * 손패 두 장을 내 앞 뽕 묶음으로). 남의 손패는 뒷면 부채에서 나오고 부채로 들어간다. 일어난 차례대로 한 걸음씩.
 * 컴퓨터는 행동 사이를 BOT_PACE_MS(450)만큼 쉬므로 한 걸음은 그보다 짧게 둔다
 */

/** 나이롱뽕 한 걸음(ms) */
export const NYRONGPPONG_STEP_MS = 380;

/** 나이롱뽕 나눠 주기 묶음: 석 장, 두 장 */
export const NYRONGPPONG_DEAL_PATTERN = [3, 2] as const;

/** 판 시작 나눠 주기 장수(선부터 손패만, 바닥은 없다) */
export function nyrongppongDealCounts(players: number): number[] {
  return dealCounts(players, HAND_SIZE, 0);
}

/** 판 시작 나눠 주기 시간(움직임 줄이기면 0) */
export function nyrongppongDealMs(players: number): number {
  return hwatuDealMs(nyrongppongDealCounts(players), NYRONGPPONG_DEAL_PATTERN);
}

/** 이 장면의 움직임(`useCardFlip`의 `moves`) */
export function nyrongppongMoves(
  prev: FlipSpots,
  next: FlipSpots,
  events: readonly GameEvent[],
  view: NyrongppongView,
  offsetOf: (seat: number) => number,
): FlipMove[] {
  const moves: FlipMove[] = [];
  let step = 0;
  for (const e of events) {
    if (e.type === "drew") {
      const o = offsetOf(e.seat);
      // 내 손패에 새로 든 카드, 남이면 부채 맨 끝 뒷면이 더미에서 온다
      const id =
        o === 0
          ? (view.drawn ?? undefined)
          : [...next.keys()]
              .filter((k) => k.startsWith(`fan-${o}-`) && !prev.has(k))
              .at(-1);
      if (id) moves.push({ id, step, from: "deck" });
      step += 1;
    } else if (e.type === "discarded") {
      const o = offsetOf(e.seat);
      const from = o === 0 ? undefined : fanSource(prev, o);
      moves.push({ id: e.card, step, ...(from ? { from } : {}) });
      step += 1;
    } else if (e.type === "ppong") {
      const o = offsetOf(e.seat);
      const meld = (view.melds[e.seat] ?? []).find((m) => m.includes(e.card));
      for (const id of meld ?? []) {
        // 버린 패(맨 위)는 그 자리에서, 손패 두 장은 내 손패(남이면 부채)에서
        const from = id === e.card || o === 0 ? undefined : fanSource(prev, o);
        moves.push({ id, step, ...(from ? { from } : {}) });
      }
      step += 1;
    }
  }
  return moves;
}
