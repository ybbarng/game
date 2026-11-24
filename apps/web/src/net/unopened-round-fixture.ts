/**
 * 시험 도우미: 참가자 기기에서 그 판의 패가 끝내 열리지 않게 한다(방장이 판 끝 열쇠를 숨긴 것과 같은 결과).
 * 판이 다 열리면 멘탈 포커 자리가 판의 진짜 패를 `deals`에 넣는데, 그 판만 넣지 않는다. 네 게임(마이티·하트·
 * 화투·원카드)의 참가자 자리가 모두 `deals` Map을 쓴다. 게임 끝 검증이 그 판을 다시 계산하지 못한다
 */
export function neverOpens(guest: { fair: unknown }, round: number): void {
  const deals = (guest.fair as { deals?: Map<number, unknown> } | null)?.deals;
  if (!deals) throw new Error("멘탈 포커 자리가 아직 없다");
  const set = deals.set.bind(deals);
  deals.set = (key, value) => (key === round ? deals : set(key, value));
}
