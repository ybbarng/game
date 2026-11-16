import { isJoker } from "./cards";
import type { CompletedTrick } from "./state";

/**
 * 효과적인 조커콜(docs/06 「효과적인 조커콜」, docs/04 8.3절).
 *
 * 기준: **상대 편 조커를 끌어내고, 그 턴을 우리 편이 먹었다.**
 * - 조커가 안 나왔다(주공이 버렸거나, 조커콜한 사람이 가졌거나, 마이티로 막았다) → 효과 없음
 * - 우리 편 조커를 끌어냈다 → 효과 없음(우리 편 조커만 힘을 잃었다)
 * - 상대 조커는 끌어냈지만 그 턴을 상대가 먹었다 → 효과 없음
 *
 * 편은 판이 끝난 뒤의 편(주공·프렌드 = 여당)으로 본다. 조커가 이미 나왔으면 엔진이
 * 조커콜 선언을 막으므로(`canDeclareJokerCall`) 그런 경우는 기록에 없다.
 */
export type JokerCallSide = "ruling" | "opposition";

export type JokerCallVerdict =
  /** 상대 조커를 끌어내고 그 턴을 먹었다 */
  | "effective"
  /** 조커가 나오지 않았다 */
  | "noJoker"
  /** 우리 편 조커를 끌어냈다 */
  | "ownJoker"
  /** 상대 조커는 끌어냈지만 그 턴을 상대가 먹었다 */
  | "lostTrick";

export interface JokerCallFacts {
  /** 조커콜한 사람의 편 */
  caller: JokerCallSide;
  /** 끌려 나온 조커의 편(안 나왔으면 null) */
  joker: JokerCallSide | null;
  /** 그 턴을 먹은 편 */
  winner: JokerCallSide;
}

export function judgeJokerCall(facts: JokerCallFacts): JokerCallVerdict {
  if (facts.joker === null) return "noJoker";
  if (facts.joker === facts.caller) return "ownJoker";
  return facts.winner === facts.caller ? "effective" : "lostTrick";
}

/**
 * 끝난 턴 하나를 판정한다. 조커콜이 아니었으면 null.
 * `ruling`은 판이 끝난 뒤 그 자리가 여당(주공·프렌드)인지 알려 준다.
 */
export function trickJokerCallVerdict(
  trick: CompletedTrick,
  ruling: (seat: number) => boolean,
): JokerCallVerdict | null {
  if (!trick.jokerCalled) return null;
  const side = (seat: number): JokerCallSide =>
    ruling(seat) ? "ruling" : "opposition";
  const pulled = trick.plays.find(
    (p) => p.seat !== trick.leader && isJoker(p.card),
  );
  return judgeJokerCall({
    caller: side(trick.leader),
    joker: pulled ? side(pulled.seat) : null,
    winner: side(trick.winner),
  });
}
