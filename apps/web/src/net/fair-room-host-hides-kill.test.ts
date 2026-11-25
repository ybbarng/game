// @vitest-environment node

import { presetRules } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";
import { type Cheat, playRounds, setup, until } from "./fair-room-fixture";
import { dropFirstYes } from "./fair-room-host-hides-fixture";
import type { GuestRoom } from "./guest-room";

// 한 판을 끝까지 두어야 드러나 오래 걸려, 다른 부정 시험과 파일을 나눠 동시에 돈다
describe("멘탈 포커 온라인 대전", () => {
  describe("고친 프로그램으로 부정하는 방장(참가자는 정상)", () => {
    it("6마 죽이기 숨기기: 불린 카드를 「갖고 있다」고 답했는데 방장이 실패로 하면 그 참가자 기기는 방장을, 다른 참가자 기기는 그 참가자를 짚는다", async () => {
      // 판의 패는 시험 난수원(기본 씨앗)으로 정해져 첫 판에서 죽이기 물음이 온다(docs/13 8절 「시험」).
      const { host, guests, incidents } = await setup(
        presetRules("standard6"),
        2,
      );
      const [victim, other] = guests as [GuestRoom, GuestRoom];
      await host.start();
      await until(() => guests.every((g) => g.match !== null));
      // 방장 프로그램: 죽이기 물음에 온 0번 참가자의 첫 「있다」를 「없다」로 받는다.
      const dropped = dropFirstYes(host, victim.seat as number, "kill");
      // 사람 주공은 0번 참가자가 가진 카드를 부른다. 주공이 사람이도록 0번 참가자 말고는 공약을 가장 높게 건다.
      const killer: Cheat = (view, key) => {
        if (view.decision?.kind === "election" && key !== "g0") {
          const top = view.decision.bids.at(-1);
          return top ? { type: "bid", goal: top } : null;
        }
        if (view.decision?.kind !== "kill" || key === "g0") return null;
        const card = victim.match
          ?.current()
          .hand.find((c) => !view.killFailed.includes(c));
        return card ? { type: "kill", card } : null;
      };
      await playRounds(host, guests, 1, incidents, killer);
      expect(dropped()).toBe(true);
      const victimSeat = victim.seat as number;
      const verdicts = async (reporter: number) => {
        await until(() =>
          incidents.some((i) => i.own && i.reporter === reporter),
        );
        return incidents
          .filter((i) => i.own && i.reporter === reporter)
          .map((i) => [i.seat, i.reason.replace(/^.*: /, "")]);
      };
      // 0번 참가자 본인 기기는 자기가 「있다」고 답한 것을 안다: 방장 탓이다.
      expect(await verdicts(victimSeat)).toEqual([
        [
          0,
          expect.stringMatching(
            /가졌다고 답했는데 방장이 죽이기를 실패로 했어요\.$/,
          ),
        ],
      ]);
      // 다른 기기는 가리지 못한다(docs/13 8절 「남은 한계」): 지금처럼 0번 참가자를 짚는다.
      expect(await verdicts(other.seat as number)).toEqual([
        [victimSeat, expect.stringMatching(/갖고 있으면서 없다고 했어요\.$/)],
      ]);
    });
  });
});
