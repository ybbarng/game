import {
  type Action,
  type ClaimedShout,
  HUMAN_RT_FLOOR_MS,
  type OnecardView,
  RACE_TIE_MS,
  STALE_SEEN,
} from "@game/onecard-engine";

import type { KitClaims } from "@/game/kit";

import { HOLD_MS } from "./shout-press";

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
 * - **o2 겨루기(2층, docs/42 17절)**: 청구에 반응 시간(`rtMs`)을 싣고, 방장은 첫 청구 뒤 모으는 시간을 기다렸다가
 *   인정 반응 시간(경계·하한 100ms)으로 줄 세워 발표한다(`race`). 동점은 그 판에서 한 장이던 사람(본인)이 이기고,
 *   잡는 사람끼리는 함께 뽑기로 가른다. 본인인지는 모두에게 보이는 장 수(`board.ones`)로 정한다.
 *   엔진 행동 `claims`에는 그 순서 그대로, 인정 반응 시간을 함께 싣는다
 */
export type OnecardClaimBody = Record<string, never>;

/** 1층 판정 값: 늘 같다(뜻은 엔진이 정한다) */
export type OnecardClaimVerdict = "shout";

/** 판 번호마다 남기는 공개 판: 판 번호와 그 판에서 한 장이던 자리 */
export interface OnecardClaimBoard {
  turnNo: number;
  ones: number[];
}

export const onecardClaims: KitClaims<
  OnecardView,
  Action,
  OnecardClaimBody,
  OnecardClaimBoard,
  OnecardClaimVerdict
> = {
  stimulusOf: (view) => view.turnNo,
  board: (view) => ({
    turnNo: view.turnNo,
    ones: view.handCounts.flatMap((n, s) =>
      n === 1 && !view.finished.includes(s) && !view.bankrupt.includes(s)
        ? [s]
        : [],
    ),
  }),
  isBody: (body): body is OnecardClaimBody =>
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    Object.keys(body).length === 0,
  judge: () => "shout",
  action: (resolved) => {
    const shouts: ClaimedShout[] = resolved.entries.flatMap((e, i) => {
      if (e.outcome.status !== "judged") return [];
      const rt = resolved.race?.rt[i];
      return [
        {
          seat: e.claim.seat,
          seen: e.claim.seen,
          id: e.claim.claimId,
          ...(rt !== undefined ? { rt } : {}),
        },
      ];
    });
    return shouts.length === 0
      ? null
      : { type: "claims", batch: resolved.batch, shouts };
  },
  recorded: (action) => action.type === "claims",
  direct: (action) => action.type === "shout",
  rules: { windowMs: 100, staleBoards: STALE_SEEN },
  race: {
    isOwner: (board, claim) => board.ones.includes(claim.seat),
    floorMs: HUMAN_RT_FLOOR_MS,
    tieMs: RACE_TIE_MS,
    // 더미 치기는 누르고 있기 확인(스페이스도 같은 시간)을 거친 뒤에 청구를 보낸다
    sendDelayMs: HOLD_MS,
  },
};
