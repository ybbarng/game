// @vitest-environment node

import { FRIEND_ANSWERED, FRIEND_HIDDEN } from "@game/fair-play";
import { type Card, presetRules } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";
import {
  type Cheat,
  hostBidsTop,
  playRounds,
  setup,
  until,
} from "./fair-room-fixture";
import { dropFirstYes } from "./fair-room-host-hides-fixture";

/**
 * 이 씨앗의 경기 5마 첫 판(참가자 둘): 방장(0번)이 주공, 0번 참가자 첫 카드를 프렌드로 부르면 그 참가자가 그 카드를
 * 내기 전에 점수 턴을 이긴다(시험 난수원으로 패와 흐름이 실행마다 같다, docs/13 8절 「시험」)
 */
const HOST_HIDES_FRIEND_SEED = "c";

// 한 판을 끝까지 두어야 드러나 오래 걸려, 다른 부정 시험과 파일을 나눠 동시에 돈다
describe("멘탈 포커 온라인 대전", () => {
  describe("고친 프로그램으로 부정하는 방장(참가자는 정상)", () => {
    it("프렌드 숨기기: 정직한 프렌드가 「맞다」고 답했는데 방장이 숨기면 그 프렌드 기기는 방장을, 다른 참가자 기기는 그 프렌드를 짚는다", async () => {
      const { host, guests, incidents } = await setup(
        presetRules("gyeonggi5"),
        2,
        undefined,
        undefined,
        HOST_HIDES_FRIEND_SEED,
      );
      const [friend, other] = guests;
      if (!friend || !other) throw new Error("참가자가 없다");
      let friendCard: Card | null = null;
      await host.start();
      await until(() => guests.every((g) => g.match !== null));
      // 방장 프로그램: 프렌드 물음에 온 첫 「맞다」를 「아니다」로 받는다.
      const dropped = dropFirstYes(host, friend.seat as number, "friend");
      // 방장이 공약을 가장 높게 걸어 주공이 되고, 0번 참가자의 첫 카드를 프렌드로 부른다.
      const cheat: Cheat = (view, key) => {
        const bid = hostBidsTop(view, key);
        if (bid) return bid;
        if (key !== "host" || view.decision?.kind !== "friend") return null;
        friendCard = friend.match?.current().hand[0] ?? null;
        return friendCard
          ? { type: "friend", friend: { kind: "card", card: friendCard } }
          : null;
      };
      await playRounds(host, guests, 1, incidents, cheat);
      expect(dropped()).toBe(true);
      const friendSeat = friend.seat as number;
      const otherSeat = other.seat as number;
      const verdicts = async (reporter: number) => {
        await until(() =>
          incidents.some((i) => i.own && i.reporter === reporter),
        );
        return incidents
          .filter((i) => i.own && i.reporter === reporter)
          .map((i) => [i.seat, i.reason.replace(/^.*: /, "")]);
      };
      // 프렌드 본인 기기는 자기가 「맞다」고 답한 것을 안다: 방장 탓이다.
      expect(await verdicts(friendSeat)).toEqual([[0, FRIEND_ANSWERED]]);
      // 다른 기기는 받은 화면만 보아 가리지 못한다(docs/13 8절 「남은 한계」): 지금처럼 그 프렌드를 짚는다.
      expect(await verdicts(otherSeat)).toEqual([[friendSeat, FRIEND_HIDDEN]]);
    });
  });
});
