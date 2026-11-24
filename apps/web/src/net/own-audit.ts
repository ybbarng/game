import { markArchiveInvalid } from "@/review/archive";
import { settleStats } from "@/stats/pending";

/**
 * 참가자: 이 기기의 게임 끝 검증 결과를 내 기록과 복기에 반영한다. 모든 게임이 방 화면(`RoomScreen`)에서 부른다.
 * 통과하면 기다리던 판·게임 기록을 내 기록에 넣는다. 실패하면(이 게임은 무효) 그 기록을 버리고, 복기 기록이 있으면
 * 증거로 남기되 무효 표시를 단다. `key`는 내 기록·복기 기록의 대국 키(`online:방`)
 */
export async function settleOwnAudit(
  key: string,
  failure: string | null,
): Promise<void> {
  settleStats(key, failure === null);
  if (failure !== null) await markArchiveInvalid(key, failure);
}
