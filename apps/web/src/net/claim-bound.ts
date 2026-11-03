/**
 * 반응 시간 청구의 아래 경계와 깎기(docs/43 1-2, docs/44 1절 "4 아래 경계"와 같은 식). 시제품이라 웹 앱에 두고,
 * 공통 장치로 옮길 때 `packages/fair-play`로 간다.
 *
 * 정직하면 `a − s ≈ 편도(방장→손님) + 그리기 + rt + 편도(손님→방장) ≤ rt + RTT_min + 흔들림 + 그리기`이므로
 *   rt_보고 ≥ (a − s) − RTT_min − 여유
 * 를 지켜야 한다. 어기면 버리지 않고 `rt_인정 = max(rt_보고, 아래 경계)`로 깎는다.
 *
 * - 손님 청구를 방장이 확인: `elapsedMs = a − s`(방장 시계: 자극을 보낸 시각 s, 청구가 닿은 시각 a),
 *   `rttMinMs` = 그 손님과의 RTT_min(앱 핑 또는 getStats).
 * - 방장 청구를 손님이 확인: `elapsedMs = a_G − r_G`(손님 시계: 자극을 받은 시각, 방장 청구가 닿은 시각), `rttMinMs = 0`.
 *
 * 빈틈(docs/43 1-2 끝): `rttMinMs`(손님이 핑 답만 늦춤)와 s·r_G(방장이 자극을 늦게 보냄)를 청구하는 쪽이
 * 늦출 수 있으면 경계가 그만큼 느슨해진다. 그래서 재료의 출처를 함께 적어 두 기준을 나란히 본다.
 */
export interface ClaimBoundInput {
  /** 확인하는 기기 시계로 잰 "자극 기준 시각 → 청구 도착" 길이(ms) */
  elapsedMs: number;
  /** 왕복 최소(ms). 방장 청구를 손님이 확인할 때는 0 */
  rttMinMs: number;
  /** 청구가 보고한 반응 시간(ms) */
  rtReportedMs: number;
  /** 흔들림 여유 + 그리기 여유(ms) */
  slackMs: number;
}

export interface ClaimBound {
  /** 아래 경계 = elapsed − RTT_min − 여유 */
  lowerMs: number;
  /** 정직하면 여유 안에 드는 여분 = elapsed − RTT_min − rt_보고 */
  excessMs: number;
  /** 인정하는 반응 시간 = max(rt_보고, 아래 경계) */
  allowedRtMs: number;
  /** 깎인 양(늦춘 양) = allowedRt − rt_보고, 0 이상 */
  clippedMs: number;
  /** 경계를 어겼나(깎였나) */
  violated: boolean;
}

export function claimBound({
  elapsedMs,
  rttMinMs,
  rtReportedMs,
  slackMs,
}: ClaimBoundInput): ClaimBound {
  const lowerMs = elapsedMs - rttMinMs - slackMs;
  const excessMs = elapsedMs - rttMinMs - rtReportedMs;
  const allowedRtMs = Math.max(rtReportedMs, lowerMs);
  const clippedMs = allowedRtMs - rtReportedMs;
  return {
    lowerMs,
    excessMs,
    allowedRtMs,
    clippedMs,
    violated: clippedMs > 0,
  };
}

/**
 * 이미 지난 판에 대한 청구를 언제까지 받나(docs/43 2-2): 다음 판을 그 사람에게 보낸 시각부터
 * `RTT_min + 여유` 안에 닿은 `seen = 지난 판` 청구만 받는다. 그 뒤는 "새 판을 받았으면서 못 본 척"일 수 있어
 * 벌칙 없이 버린다. 같은 시계(방장)로 잰 값만 넣는다.
 */
export function lateClaimAccepted({
  nextSentAtMs,
  arrivedAtMs,
  rttMinMs,
  slackMs,
}: {
  nextSentAtMs: number;
  arrivedAtMs: number;
  rttMinMs: number;
  slackMs: number;
}): boolean {
  return arrivedAtMs <= nextSentAtMs + rttMinMs + slackMs;
}
