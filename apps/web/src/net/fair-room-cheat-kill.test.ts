// @vitest-environment node

import { presetRules } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";
import { type Cheat, playRounds, setup, until } from "./fair-room-fixture";
import type { GuestRoom } from "./guest-room";

// 6마 죽이기는 한 판을 끝까지 두어야 드러나 오래 걸려, 다른 부정 시험(fair-room-cheat.test.ts)과 파일을 나눠 동시에 돈다
describe("멘탈 포커 온라인 대전", () => {
  describe("고친 프로그램으로 부정하는 참가자(나머지는 정상)", () => {
    it("6마 죽이기 거짓말: 불린 카드를 갖고도 없다고 하면 마지막 턴에 그 자리가 찍힌다", async () => {
      const { host, guests, incidents } = await setup(
        presetRules("standard6"),
        1,
      );
      // 6마 죽이기를 보는 자리라 참가자는 거짓말하는 하나만 둔다(나머지는 방장 기기의 컴퓨터, 방장이 주공).
      // 사람 기기가 늘면 섞기 증명 확인만 늘어난다.
      // 0번 참가자 프로그램: 죽이기 물음에 늘 "없다"고 답한다.
      let lied = false;
      const patchLiar = () => {
        const fair = guests[0]?.fair as unknown as {
          onQuery: (id: string, q: { kind: string; card?: string }) => void;
          answer: (id: string, have: boolean) => void;
          mySlotOf: (card: string) => number | null;
        } | null;
        if (!fair || (fair as { patched?: boolean }).patched) return;
        (fair as { patched?: boolean }).patched = true;
        const original = fair.onQuery.bind(fair);
        fair.onQuery = (id, q) => {
          if (q.kind === "kill" && q.card && fair.mySlotOf(q.card) !== null) {
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
      // 사람 주공은 0번 참가자가 가진 카드를 부른다. 주공이 사람이도록 방장은 공약을 가장 높게 건다.
      // 판의 패는 시험 난수원으로 정해져(fair-room-fixture) 첫 판에서 죽이기 물음이 온다.
      const victim = guests[0] as GuestRoom;
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
      expect(lied).toBe(true);
      // 방장 기기는 자리 표로 진행할 때 나온 걸음별 사건과 진짜 카드로 다시 계산한 사건을 견주어 짚고, 참가자
      // 기기는 걸음별 사건 없이 짚는다(audit.ts). 거짓말 프로그램도 검증 코드는 그대로라 참가자 길은 그 기기가 본다.
      const liar = guests[0]?.seat as number;
      for (const reporter of [0, liar]) {
        await until(() =>
          incidents.some((i) => i.own && i.reporter === reporter),
        );
        const found = incidents.filter((i) => i.own && i.reporter === reporter);
        expect(found.map((i) => i.seat)).toEqual(found.map(() => liar));
        for (const i of found) expect(i.reason).toMatch(/없다고 했어요/);
      }
    });
  });
});
