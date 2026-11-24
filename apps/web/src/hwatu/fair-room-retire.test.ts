// @vitest-environment node
// 화투 암호화방 시험은 판을 섞고 증명하느라 무거워, 시험마다 파일을 나눠 동시에 돈다
// (fair-room-vote.test.ts 끊긴 사람 투표, fair-room-one-round.test.ts 한 판짜리 게임 끝 검증)
import type { HwatuGuestSeat } from "@game/fair-play";
import {
  minhwatuBeginnerBot,
  minhwatuIntermediateBot,
} from "@game/minhwatu-ai";
import { type MinhwatuView, STANDARD_RULES } from "@game/minhwatu-engine";
import { describe, expect, it } from "vitest";

import { minhwatuKit } from "@/minhwatu/kit";
import { GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";

import {
  type AnyGuest,
  playHwatu,
  setupHwatu,
  until,
} from "./fair-room-fixture";

describe("화투 암호화방: 첫 판 도중에 그만하기", () => {
  it("첫 판 카드를 다 열기 전에 방장이 끝내도 참가자 게임 끝 검증은 통과한다(끝까지 치지 않은 판은 결과 없음)", async () => {
    const { host, guests, incidents, audits } = await setupHwatu({
      kit: minhwatuKit,
      rules: { ...STANDARD_RULES, rounds: 2 },
      guests: 2,
      bot: minhwatuIntermediateBot,
      botLevel: 1,
      HostRoom: HostRoom as never,
      GuestRoom: GuestRoom as never,
    });
    await host.start();
    await until(() => guests.every((g) => g.match !== null), "첫 화면");
    // 몇 수를 둔 뒤에 끝낸다(이미 연 카드·이미 둔 수가 있는 판).
    await playHwatu({
      host,
      guests,
      bot: minhwatuBeginnerBot,
      incidents,
      done: () => (host.match?.actionLog().length ?? 0) >= 4,
    });
    host.abandon();
    await until(
      () =>
        guests.every(
          (g) =>
            (g.match?.current() as MinhwatuView | undefined)?.phase ===
            "gameOver",
        ),
      "참가자 게임 끝",
    );
    await until(() => audits.length === 2, "게임 끝 검증");
    expect(audits).toEqual([{ ok: true }, { ok: true }]);
    expect(incidents).toEqual([]);
  });

  it("그만한 첫 판에서도 낸다고 한 카드와 열쇠로 연 카드가 다르면 그 자리를 짚고, 끝내도 그 알림은 남는다", async () => {
    const { host, guests, incidents } = await setupHwatu({
      kit: minhwatuKit,
      rules: { ...STANDARD_RULES, rounds: 2 },
      guests: 1,
      bot: minhwatuIntermediateBot,
      botLevel: 1,
      HostRoom: HostRoom as never,
      GuestRoom: GuestRoom as never,
    });
    await host.start();
    await until(() => guests[0]?.fair !== null, "참가자 진행");
    const guest = guests[0] as AnyGuest;
    const seat = guest.fair as HwatuGuestSeat<
      unknown,
      unknown,
      MinhwatuView,
      { type: string; card?: string },
      unknown
    >;
    const cheater = guest.seat as number;
    const honest = seat.outgoing.bind(seat);
    // 참가자 프로그램: 낼 카드 열쇠는 그대로 공개하고, 낸다고 하는 카드만 손패의 다른 카드로 바꾼다.
    seat.outgoing = (action) => {
      const out = honest(action);
      if (out?.type !== "play") return out;
      const hand = (guest.match as { current(): MinhwatuView }).current().hand;
      const other = hand.find((c) => c !== action.card);
      return other ? { ...out, card: other } : out;
    };
    await playHwatu({
      host,
      guests,
      bot: minhwatuBeginnerBot,
      incidents,
      done: () => incidents.length > 0,
    });
    host.abandon();
    const end = host.match?.current() as MinhwatuView | undefined;
    expect(end?.roundNumber).toBe(1);
    expect(incidents[0]?.seat).toBe(cheater);
    expect(incidents[0]?.reason).toMatch(/열쇠로 연 카드가 달라요/);
  });
});
