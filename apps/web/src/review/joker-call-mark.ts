import {
  type CompletedTrick,
  type JokerCallVerdict,
  trickJokerCallVerdict,
} from "@game/mighty-engine";

/** 복기 턴 표의 조커콜 카드 아래 글(효과 기준은 엔진 `judgeJokerCall`, docs/04 8.3절) */
export const JOKER_CALL_MARK: Record<JokerCallVerdict, string> = {
  effective: "조커콜\n효과 있음",
  noJoker: "조커콜\n효과 없음",
  ownJoker: "조커콜\n효과 없음",
  lostTrick: "조커콜\n효과 없음",
};

/**
 * 끝난 판의 턴마다 조커콜 판정(조커콜이 아니면 null). 편은 판이 끝난 뒤의 주공·프렌드로 본다.
 */
export function jokerCallVerdicts(
  tricks: readonly CompletedTrick[],
  declarer: number,
  friend: number | null,
): (JokerCallVerdict | null)[] {
  const ruling = (seat: number) => seat === declarer || seat === friend;
  return tricks.map((t) => trickJokerCallVerdict(t, ruling));
}
