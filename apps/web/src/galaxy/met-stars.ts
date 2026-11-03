import type { GalaxyView, GameEvent } from "@game/galaxy-engine";

import { metSquares } from "./kit";

/**
 * 별 도감(docs/48 2-12 6번, 5-5): 이 기기에서 지금까지 만난 별(별 id). 지식 기록일 뿐 게임 안 이득은 없다.
 * 내 기록의 「만난 별 n/24」와 판 끝 「처음」 표시에 쓴다
 */
export const MET_KEY = "galaxy-met-stars";

export function loadMet(): string[] {
  try {
    const raw = localStorage.getItem(MET_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list)
      ? list.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

/** 이번 판에서 만난 별을 도감에 더하고, 이 기기에서 처음 만난 별을 돌려준다 */
export function rememberMet(
  view: GalaxyView,
  events: readonly GameEvent[],
): string[] {
  const met = metSquares(view, events).flatMap((sq) => {
    const id = view.board.squares[sq]?.star?.star.id;
    return id ? [id] : [];
  });
  const known = new Set(loadMet());
  const first = met.filter((id) => !known.has(id));
  if (first.length > 0)
    try {
      localStorage.setItem(MET_KEY, JSON.stringify([...known, ...first]));
    } catch {
      // 남기지 못하면 다음에 다시 「처음」으로 보일 뿐이다.
    }
  return first;
}
