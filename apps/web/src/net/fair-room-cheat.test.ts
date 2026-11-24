// @vitest-environment node

import { FairGuestSeat, Party } from "@game/fair-play";
import { presetRules, suitOf } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";
import {
  type Cheat,
  hostBidsTop,
  playRounds,
  setup,
  until,
} from "./fair-room-fixture";
import type { GuestRoom } from "./guest-room";

/** 기기가 기다리는 시간(증명 미루기 10초, 응답 30초의 두 배)을 넉넉히 넘긴다 */
const _PROOF_WAIT_MS = 120_000;

describe("멘탈 포커 온라인 대전", () => {
  describe("고친 프로그램으로 부정하는 참가자(나머지는 정상)", () => {
    it("무늬 안 따르기: 그 무늬 카드가 나중에 드러나는 순간 모두의 화면에 그 자리가 찍힌다", async () => {
      const { host, guests, incidents } = await setup(
        presetRules("standard5"),
        2,
      );
      const cheater = guests[0]?.seat as number;
      let done = false;
      // 따라 낼 무늬가 있는데 다른 무늬를 한 번 낸다(정상 화면은 막지만 고친 프로그램은 그냥 보낸다).
      const cheat: Cheat = (view, key) => {
        // 방장이 공약을 가장 높게 걸어 다시 나누기(멘탈 포커로 다시 섞기, 몇 번일지 운)가 없게 한다
        const bid = hostBidsTop(view, key);
        if (bid) return bid;
        const d = view.decision;
        const lead = view.trick?.plays[0]?.card;
        if (done || d?.kind !== "play" || !lead || view.trickIndex === 0)
          return null;
        if (key !== "g0") return null;
        const suit = suitOf(lead);
        const kiruda = view.goal?.kiruda;
        if (!suit || !view.hand.some((c) => suitOf(c) === suit)) return null;
        const off = view.hand.find(
          (c) =>
            suitOf(c) !== null &&
            suitOf(c) !== suit &&
            suitOf(c) !== kiruda &&
            !d.cards.includes(c),
        );
        if (!off) return null;
        done = true;
        return { type: "play", card: off };
      };
      await host.start();
      await until(() => guests.every((g) => g.match !== null));
      await playRounds(host, guests, 3, incidents, cheat);
      expect(done).toBe(true);
      await until(() => incidents.length > 0);
      const own = incidents.filter((i) => i.own);
      expect(own.every((i) => i.seat === cheater)).toBe(true);
      // 모든 기기(방장·참가자 둘)가 스스로 찾았다.
      expect([...new Set(own.map((i) => i.reporter))].sort()).toEqual(
        [0, ...guests.map((g) => g.seat)].sort(),
      );
      // 드러나는 순간 잡는 감시(RenegeWatch)의 문구다. 판 끝 다시 계산이 잡으면 「규칙에 맞지 않는 행동」이 된다.
      for (const i of own)
        expect(i.reason).toMatch(/선 무늬가 있었는데 따라 내지 않았어요\./);
      // 방장 대국도 멈췄다.
      expect(host.match?.halted).not.toBeNull();
    });

    it("틀린 열쇠: 나눠 줄 때 남의 자리에 잠글 때와 다른 열쇠를 공개하면 받은 사람들이 열쇠 증명으로 그 자리를 짚는다", async () => {
      const { host, guests, incidents } = await setup(
        presetRules("standard5"),
        2,
      );
      const cheater = (guests[0] as GuestRoom).seat as number;
      // 0번 참가자 프로그램(기기 번호는 자리 번호): 남에게 주는 자리 열쇠를 바꿔 낸다.
      const real = Party.prototype.revealKey;
      Party.prototype.revealKey = function (this: Party, slot, why) {
        const key = real.call(this, slot, why);
        return this.id === cheater && why === "deal" ? key + 1n : key;
      };
      try {
        await host.start();
        await until(() => incidents.filter((i) => i.own).length >= 2);
      } finally {
        Party.prototype.revealKey = real;
      }
      const own = incidents.filter((i) => i.own);
      expect(own.every((i) => i.seat === cheater)).toBe(true);
      expect(own.map((i) => i.reporter).sort()).toEqual(
        [0, (guests[1] as GuestRoom).seat].sort(),
      );
      expect(own[0]?.reason).toMatch(/열쇠 증명 실패/);
    });

    it("가짜 카드: 다른 자리 열쇠로 다른 카드를 낸다고 하면 방장이 바로 잡는다", async () => {
      const { host, guests, incidents } = await setup(
        presetRules("standard5"),
        2,
      );
      const guest = guests[0] as GuestRoom;
      const cheater = guest.seat as number;
      await host.start();
      await until(() => guests.every((g) => g.match !== null));
      // 0번 참가자 프로그램: 처음 낼 때 열쇠는 진짜로 낼 카드 자리 것을 공개하고, 카드 이름만 마이티로
      // 바꿔 보낸다(진짜 카드가 마이티면 D2). 가짜 행동 하나만 보내고 진짜 행동은 보내지 않는다.
      // 낸다고 한 카드는 늘 연 카드와 달라야 한다. 예전에는 따로 보낸 가짜 뒤에 진짜 행동까지 나갔고,
      // 가짜가 우연히 진짜와 같으면(손에 SA, 첫 카드 D2) 방장이 받아들여, 자기가 보낸 기록과 다르다며
      // 부정한 기기가 방장을 짚었다.
      const fair = guest.fair;
      if (!(fair instanceof FairGuestSeat))
        throw new Error("참가자 멘탈 포커 진행이 없다");
      const honest = fair.outgoing.bind(fair);
      let faked = false;
      fair.outgoing = (action) => {
        const out = honest(action);
        if (faked || out?.type !== "play" || action.type !== "play") return out;
        faked = true;
        return { ...out, card: action.card === "SA" ? "D2" : "SA" };
      };
      await playRounds(host, guests, 1, incidents);
      await until(() => incidents.length > 0);
      expect(faked).toBe(true);
      const own = incidents.find((i) => i.own);
      expect(own?.reporter).toBe(0);
      expect(own?.seat).toBe(cheater);
      expect(own?.reason).toMatch(/열쇠로 연 카드/);
    });
  });
});
