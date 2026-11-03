import { onecardDealId, onecardReshuffleMessage } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import { fairDealOf } from "./host-room";
import type { FairMessage } from "./protocol";

/** 방장이 자기 멘탈 포커 메시지를 판별로 남길 때(새로고침 뒤 다시 보내기) 쓰는 판 번호 */
describe("fairDealOf", () => {
  it("기존 메시지는 예전과 같은 판으로 모인다", () => {
    const cases: [FairMessage, number][] = [
      [{ t: "fp", k: "deck", deal: 7, slot: 3, to: 1 }, 7],
      [{ t: "fp", k: "all", deal: 4 }, 4],
      [{ t: "fp", k: "log", deal: 2, log: [] }, 2],
      [
        {
          t: "fp",
          k: "query",
          id: "q1",
          query: { kind: "kill", deal: 5, card: "SA" },
        },
        5,
      ],
      [{ t: "fp", k: "answer", id: "q1", from: 1, have: false }, 0],
    ];
    for (const [message, deal] of cases) expect(fairDealOf(message)).toBe(deal);
  });

  it("원카드 다시 섞기 알림은 0번 판이 아니라 새 조각의 판으로 모인다", () => {
    const message = onecardReshuffleMessage(3, 2, ["S2", "S3"]);
    expect(fairDealOf(message)).toBe(onecardDealId(3, 2));
    expect(fairDealOf(message)).not.toBe(0);
  });
});
