/**
 * 섞기 씨앗: 모두 약속 → 모두 모이면 공개 → 공개값으로 씨앗(docs/46 3-1).
 * 누구도 혼자 씨앗을 고를 수 없다. 해시는 숫자야구 약속과 같은 동기 SHA-256을 쓴다.
 */
import { sha256Hex } from "@game/baseball-engine";

/** 약속 = sha256(nonce‖salt). 판·시도·사람을 함께 넣어 다른 판의 약속을 베껴 쓰지 못하게 한다 */
export function raceCommitment(
  race: string,
  attempt: number,
  id: string,
  nonce: string,
  salt: string,
): string {
  return sha256Hex(`race-commit|${race}|${attempt}|${id}|${nonce}|${salt}`);
}

/** 씨앗 = sha256(사람 아이디 순으로 정렬한 공개값을 이어 붙인 것) */
export function raceSeed(
  race: string,
  attempt: number,
  nonces: Record<string, string>,
): string {
  const ids = Object.keys(nonces).sort();
  return sha256Hex(
    // JSON으로 이어 붙여 공개값 안의 구분 글자로 다른 조합과 겹치게 만들 수 없게 한다
    `race-seed|${race}|${attempt}|${JSON.stringify(ids.map((id) => [id, nonces[id]]))}`,
  );
}
