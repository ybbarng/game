import type { AuditResult } from "./guest-room";

/**
 * 판 끝 검증 결과를 채팅에 남길 한 줄(모든 게임 온라인 화면 공통). `own`이면 내 기기의 검증이고(`who`는 「나」),
 * 다른 사람이 알린 실패는 그 사람의 주장으로만 보인다(모의 침투 B3). 내 검증인지는 이름으로 가리지 않는다:
 * 참가자가 이름을 「나」로 지으면 그 사람의 주장이 내 검증처럼 보인다. `unchecked`는 통과했지만 맞춰 보지 못한 것
 */
export function auditChatText(
  who: string,
  own: boolean,
  ok: boolean,
  reason?: string,
  unchecked?: string,
): string {
  if (ok)
    return unchecked
      ? `${who} — 문제없음 ✓ (확인 못 함: ${unchecked})`
      : `${who} — 문제없음 ✓`;
  return own
    ? `${who} — 실패 ⚠ ${reason ?? ""}`
    : `${who}의 주장 — 실패 ⚠ ${reason ?? ""} (내 검증과 따로 봐요)`;
}

/** 판 끝 검증 결과 알림. `label`은 「공정성 확인」·「기록 확인」, `fine`은 통과했을 때 덧붙이는 문장(마침표까지). `unchecked`도 마침표로 끝나는 문장이다 */
export function auditNotice(
  result: AuditResult,
  label: string,
  fine: string,
): string {
  if (!result.ok) return `${label} 실패: ${result.reason}`;
  return result.unchecked
    ? `${label}: ${fine} 다만 ${result.unchecked}`
    : `${label}: ${fine}`;
}
