import type { GameEvent } from "@game/galaxy-engine";

import type { ReactionKind } from "@/net/chat";

/** 이만큼 넘는 이용료를 내면 컴퓨터가 아쉬워한다 */
const BIG_RENT = 200;

/**
 * 혼자 하기에서 컴퓨터가 보내는 반응(docs/48 15-5 6번). 사건에서 결정적으로 정해 같은 판이면 늘 같다.
 * - 큰 이용료(✦200 넘게)를 낸 사람에게 아쉬움
 * - 별자리를 완성한 사람에게 박수
 * 보내는 컴퓨터는 받는 사람 다음 자리부터, 그 일에 얽힌 자리(내는 사람·받는 사람)와 사람 자리(`me`)를 빼고 고른다
 */
export function botReactions(
  events: readonly GameEvent[],
  { players, me }: { players: number; me: number },
): { from: number; to: number; kind: ReactionKind }[] {
  const out: { from: number; to: number; kind: ReactionKind }[] = [];
  const sender = (to: number, involved: readonly number[]) => {
    for (let k = 1; k < players; k++) {
      const seat = (to + k) % players;
      if (seat !== me && !involved.includes(seat)) return seat;
    }
    return null;
  };
  for (const e of events) {
    if (e.type === "pay" && e.reason === "rent" && e.amount > BIG_RENT) {
      const from = sender(e.from, [e.from, e.to]);
      if (from !== null) out.push({ from, to: e.from, kind: "aww" });
    } else if (e.type === "linked" && e.owned >= e.size) {
      const from = sender(e.seat, [e.seat]);
      if (from !== null) out.push({ from, to: e.seat, kind: "clap" });
    }
  }
  return out;
}
