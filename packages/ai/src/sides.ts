import type { PlayerView } from "@game/mighty-engine";

export type Relation = "me" | "partner" | "opponent" | "unknown";

/** 내가 여당(주공·프렌드)인가. 프렌드 본인은 공개 전에도 자기가 프렌드인 것을 안다 */
export function isRulingSelf(view: PlayerView): boolean {
  return view.seat === view.declarer || view.friend === view.seat;
}

/** 다른 자리가 나와 같은 편인지. 프렌드가 드러나기 전에는 모를 수 있다. */
export function relationTo(view: PlayerView, other: number): Relation {
  if (other === view.seat) return "me";
  const ruling = isRulingSelf(view);
  const friendKnown = view.friend !== null || view.friendRevealed;
  const otherRuling =
    other === view.declarer || (view.friend !== null && other === view.friend);
  if (otherRuling) return ruling ? "partner" : "opponent";
  if (!friendKnown) return "unknown";
  return ruling ? "opponent" : "partner";
}
