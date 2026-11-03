import {
  type Action,
  type ClaimedShout,
  type OnecardView,
  STALE_SEEN,
} from "@game/onecard-engine";

import type { KitClaims } from "@/game/kit";

/**
 * 원카드 "원카드!"를 공정한 동시 판정 1층(docs/43 7-1)에 얹는다.
 *
 * - 더미 치기는 청구(`room.claims.claim({}, {seen})`)로 방 안 **모두에게 직접** 간다. 방장은 묶음을 닫아
 *   `(seen, 자리, 청구 아이디)` 순서로 발표하고, 그 순서 그대로 엔진 행동 `claims`(청구 원문만)를 넣는다.
 *   방장이 청구를 빼거나 순서를 바꾸면 청구를 직접 받은 참가자가 이의를 낸다(기존 경찰관 팝업).
 * - **판정의 뜻(미리 외침·본인 외침·잡기·헛외침)은 엔진이 `judgeShout`로 정한다.** 그 판정에는 숨긴 정보(누가 외치지
 *   않았나, 본인 시간 P와 잡기 창 T 중 어디인가)가 필요해, 모든 자리에 같은 공개 판(`board`)으로는 다시 계산할 수 없다
 *   (공개하면 "누가 잊었나"가 드러난다, docs/42 B안 6번). 그래서 1층의 `judge`는 "엔진에 넣을 청구"라는 같은 값만 내고,
 *   참가자는 발표의 빠짐·순서·내용·판 번호를 맞춰 본다. 뜻은 판 끝 검증이 기록의 `claims` 행동(청구 원문)으로
 *   엔진을 다시 돌려 확인한다(일반방은 시드로, 암호화방은 진짜 카드로).
 * - 옛 판 경계는 엔진과 같게(`STALE_SEEN`) 둔다. 원카드 청구끼리는 겨루지 않으므로(잡는 사람끼리 결과가 같다)
 *   묶음 창을 짧게 둔다(본인 시간 P를 덜 깎게).
 */
export type OnecardClaimBody = Record<string, never>;

/** 1층 판정 값: 늘 같다(뜻은 엔진이 정한다) */
export type OnecardClaimVerdict = "shout";

export const onecardClaims: KitClaims<
  OnecardView,
  Action,
  OnecardClaimBody,
  number,
  OnecardClaimVerdict
> = {
  stimulusOf: (view) => view.turnNo,
  board: (view) => view.turnNo,
  isBody: (body): body is OnecardClaimBody =>
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    Object.keys(body).length === 0,
  judge: () => "shout",
  action: (resolved) => {
    const shouts: ClaimedShout[] = resolved.entries.flatMap((e) =>
      e.outcome.status === "judged"
        ? [{ seat: e.claim.seat, seen: e.claim.seen, id: e.claim.claimId }]
        : [],
    );
    return shouts.length === 0
      ? null
      : { type: "claims", batch: resolved.batch, shouts };
  },
  rules: { windowMs: 100, staleBoards: STALE_SEEN },
};
