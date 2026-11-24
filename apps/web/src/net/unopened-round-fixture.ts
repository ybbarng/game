/** 시험 도우미: 고친 방장 기기·열리지 않는 판을 흉내 낸다(게임 끝 검증 시험, docs/13 4절) */

/**
 * 고친 방장 기기. 참가자에게 나가는 화면(`snapshot`)을 `rewrite`로 바꾼다. null을 돌려주면 그 화면을 보내지 않는다
 * (판 끝 화면 숨기기). 방장 메시지는 서명 없이 통로로 나가므로 통로의 `send`를 감싼다
 */
export function forgeHostViews(
  host: { transport: { send(message: unknown, to?: string): void } },
  rewrite: (view: Record<string, unknown>) => Record<string, unknown> | null,
): void {
  const transport = host.transport;
  const send = transport.send.bind(transport);
  transport.send = (message, to) => {
    const m = message as { t?: unknown; view?: Record<string, unknown> };
    if (m.t !== "snapshot" || !m.view) return send(message, to);
    const view = rewrite(m.view);
    if (view) send({ ...m, view }, to);
  };
}

/**
 * 참가자 기기에서 그 판의 패가 끝내 열리지 않게 한다(방장이 판 끝 열쇠를 숨긴 것과 같은 결과).
 * 판이 다 열리면 멘탈 포커 자리가 판의 진짜 패를 `deals`에 넣는데, 그 판만 넣지 않는다. 네 게임(마이티·하트·
 * 화투·원카드)의 참가자 자리가 모두 `deals` Map을 쓴다. 게임 끝 검증이 그 판을 다시 계산하지 못한다
 */
export function neverOpens(guest: { fair: unknown }, round: number): void {
  const deals = (guest.fair as { deals?: Map<number, unknown> } | null)?.deals;
  if (!deals) throw new Error("멘탈 포커 자리가 아직 없다");
  const set = deals.set.bind(deals);
  deals.set = (key, value) => (key === round ? deals : set(key, value));
}
