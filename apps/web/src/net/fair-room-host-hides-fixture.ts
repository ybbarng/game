/** 방장 물음에 온 답을 숨기는 고친 방장(마이티 멘탈 포커 방 시험) */

import type { FairQuery } from "@game/fair-play";
import type { HostRoom } from "./host-room";

/**
 * 고친 방장 프로그램: `seat`가 `kind` 물음에 보낸 첫 「있다(맞다)」를 「없다」로 받는다(그 카드 열쇠는 이미 왔다).
 * 돌려주는 함수는 실제로 버렸는지
 */
export function dropFirstYes(
  host: HostRoom,
  seat: number,
  kind: FairQuery["kind"],
): () => boolean {
  const table = host.fair as unknown as {
    answer: (from: number, id: string, have: boolean, slot?: number) => void;
    hooks: { broadcast: (message: unknown) => void };
  } | null;
  if (!table) throw new Error("멘탈 포커 판이 없다");
  // 물음 번호마다 무슨 물음인지 본다(방장이 보내는 물음을 엿본다).
  const kinds = new Map<string, FairQuery["kind"]>();
  const broadcast = table.hooks.broadcast;
  table.hooks.broadcast = (message) => {
    const m = message as { k?: string; id?: string; query?: FairQuery };
    if (m.k === "query" && m.id && m.query) kinds.set(m.id, m.query.kind);
    broadcast(message);
  };
  const answer = table.answer.bind(table);
  let dropped = false;
  table.answer = (from, id, have, slot) => {
    if (!dropped && from === seat && have && kinds.get(id) === kind) {
      dropped = true;
      answer(from, id, false);
      return;
    }
    answer(from, id, have, slot);
  };
  return () => dropped;
}
