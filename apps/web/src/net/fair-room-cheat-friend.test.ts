// @vitest-environment node

import { type Card, presetRules } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";
import {
  type Cheat,
  hostBidsTop,
  playRounds,
  setup,
  until,
} from "./fair-room-fixture";

/**
 * 이 씨앗의 경기 5마 첫 판: 방장(0번)이 주공, 0번 참가자 첫 카드(♠J)를 프렌드로 부르면 그 참가자가 ♠J를 내기 전에
 * 점수 턴을 이긴다(시험 난수원으로 패와 흐름이 실행마다 같다, docs/13 8절 「시험」)
 */
const FRIEND_SEED = "a";

// 프렌드 숨기기는 한 판을 끝까지 두어야 드러나 오래 걸려, 다른 부정 시험과 파일을 나눠 동시에 돈다
describe("멘탈 포커 온라인 대전", () => {
  describe("고친 프로그램으로 부정하는 참가자(나머지는 정상)", () => {
    it("프렌드 숨기기: 점수 턴을 이기고도 프렌드 물음에 아니라고 하면 마지막 턴에 방장 기기와 그 참가자 기기가 그 자리를 찍는다", async () => {
      // 경기 5마는 프렌드가 점수를 따면 바로 드러난다(revealFriendOnScore). 방장 엔진은 누가 프렌드 카드를 가졌는지
      // 몰라, 점수 턴을 이긴 사람에게 묻는다(host-table `checkFriendOnScore`).
      const { host, guests, incidents } = await setup(
        presetRules("gyeonggi5"),
        1,
        undefined,
        undefined,
        FRIEND_SEED,
      );
      const liar = guests[0];
      if (!liar) throw new Error("참가자가 없다");
      let friendCard: Card | null = null;
      let lied = false;
      // 0번 참가자 프로그램: 프렌드 카드를 갖고도 프렌드 물음에 늘 "아니다"라고 답한다.
      const patchLiar = () => {
        const fair = liar.fair as unknown as {
          onQuery: (id: string, q: { kind: string; seat?: number }) => void;
          answer: (id: string, have: boolean) => void;
        } | null;
        if (!fair) throw new Error("멘탈 포커 자리가 없다");
        const original = fair.onQuery.bind(fair);
        fair.onQuery = (id, q) => {
          const holds =
            friendCard !== null &&
            (liar.match?.current().hand.includes(friendCard) ?? false);
          if (q.kind === "friend" && q.seat === liar.seat && holds) {
            lied = true;
            fair.answer(id, false);
            return;
          }
          original(id, q);
        };
      };
      await host.start();
      await until(() => guests.every((g) => g.match !== null));
      patchLiar();
      // 방장이 공약을 가장 높게 걸어 주공이 되고, 0번 참가자의 첫 카드를 프렌드로 부른다.
      const cheat: Cheat = (view, key) => {
        const bid = hostBidsTop(view, key);
        if (bid) return bid;
        if (key !== "host" || view.decision?.kind !== "friend") return null;
        friendCard = liar.match?.current().hand[0] ?? null;
        return friendCard
          ? { type: "friend", friend: { kind: "card", card: friendCard } }
          : null;
      };
      await playRounds(host, guests, 1, incidents, cheat);
      expect(friendCard).toBe("SJ");
      expect(lied).toBe(true);
      // 방장 기기는 걸음별 사건(blameOf), 참가자 기기는 받은 화면(hiddenFriend)으로 짚는다. 거짓말 프로그램도
      // 검증 코드는 그대로라 참가자 길은 그 기기가 본다.
      const seat = liar.seat as number;
      for (const reporter of [0, seat]) {
        await until(() =>
          incidents.some((i) => i.own && i.reporter === reporter),
        );
        const found = incidents.filter((i) => i.own && i.reporter === reporter);
        expect(found.map((i) => [i.seat, i.reason])).toEqual(
          found.map(() => [
            seat,
            expect.stringMatching(
              /프렌드인데 점수를 따고도 밝히지 않았어요\.$/,
            ),
          ]),
        );
      }
    });
  });
});
