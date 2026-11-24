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

import { minhwatuRoomKit } from "@/minhwatu/fair-table";
import { STANDING_MISMATCH } from "@/net/fair-verify";
import { GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";
import { forgeHostViews, neverOpens } from "@/net/unopened-round-fixture";

import {
  type AnyGuest,
  playHwatu,
  setupHwatu,
  until,
} from "./fair-room-fixture";

describe("화투 암호화방: 첫 판 도중에 그만하기", () => {
  it("첫 판 카드를 다 열기 전에 방장이 끝내도 참가자 게임 끝 검증은 통과한다(끝까지 치지 않은 판은 결과 없음)", async () => {
    const { host, guests, incidents, audits } = await setupHwatu({
      kit: minhwatuRoomKit,
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

  it("첫 판을 끝까지 쳐 정산한 직후 다음 판 전에 그만두면, 그 판 패가 열리지 않은 참가자는 게임 끝 검증에서 그 판을 짚는다", async () => {
    const { host, guests, incidents, audits, clock } = await setupHwatu({
      kit: minhwatuRoomKit,
      rules: { ...STANDARD_RULES, rounds: 2 },
      guests: 1,
      bot: minhwatuIntermediateBot,
      botLevel: 1,
      HostRoom: HostRoom as never,
      GuestRoom: GuestRoom as never,
    });
    await host.start();
    await until(() => guests.every((g) => g.fair !== null), "참가자 진행");
    // 방장이 판 끝 열쇠를 숨긴 것과 같다: 참가자 기기에서 첫 판 패가 끝내 열리지 않는다.
    neverOpens(guests[0] as AnyGuest, 1);
    const view = () => host.match?.current() as MinhwatuView | undefined;
    await playHwatu({
      host,
      guests,
      bot: minhwatuBeginnerBot,
      incidents,
      done: () => view()?.phase === "roundEnd",
    });
    expect(view()?.roundNumber).toBe(1);
    host.abandon();
    // 참가자는 판 끝까지 간 판이 열리길(상한 30초) 기다린 뒤 검증한다.
    await until(() => {
      if (audits.length === 1) return true;
      clock.advance(1_000);
      return false;
    }, "게임 끝 검증");
    expect(audits).toEqual([
      {
        ok: false,
        reason: "1판은 끝났는데 카드가 다 열리지 않아 다시 계산하지 못했어요.",
      },
    ]);
  });

  it("판을 끝내고 다음 판 도중에 그만두면 참가자 게임 끝 검증은 통과한다(끝 화면 점수 = 앞 판까지 점수)", async () => {
    const { host, guests, incidents, audits } = await setupHwatu({
      kit: minhwatuRoomKit,
      // 섞기는 멘탈 포커의 진짜 난수라 판 결과를 고정할 수 없다. 첫 판이 0점으로 끝나는 패도 나와(14번에 한 번쯤)
      // 점수가 생긴 판 뒤에 그만두도록 판을 넉넉히 둔다.
      rules: { ...STANDARD_RULES, rounds: 6 },
      guests: 1,
      bot: minhwatuIntermediateBot,
      botLevel: 1,
      HostRoom: HostRoom as never,
      GuestRoom: GuestRoom as never,
    });
    await host.start();
    const view = () => host.match?.current() as MinhwatuView | undefined;
    const steps = () => host.match?.actionLog().length ?? 0;
    // 점수가 생긴 판 뒤 다음 판의 몇 수째에서 그만둔다.
    let roundFrom: { round: number; step: number } | null = null;
    await playHwatu({
      host,
      guests,
      bot: minhwatuBeginnerBot,
      incidents,
      done: () => {
        const v = view();
        if (!v || v.roundNumber < 2 || v.phase === "roundEnd") return false;
        if (roundFrom?.round !== v.roundNumber)
          roundFrom = { round: v.roundNumber, step: steps() };
        return v.totals.some((t) => t !== 0) && steps() >= roundFrom.step + 3;
      },
    });
    expect(view()?.totals.some((t) => t !== 0)).toBe(true);
    host.abandon();
    await until(() => audits.length === 1, "게임 끝 검증");
    expect(audits).toEqual([{ ok: true }]);
    expect(incidents).toEqual([]);
  });

  it("고친 방장 기기가 판 끝 화면을 보내지 않고 그만둔 끝 화면의 점수를 부풀리면, 참가자 게임 끝 검증이 짚는다", async () => {
    const { host, guests, incidents, audits, clock } = await setupHwatu({
      kit: minhwatuRoomKit,
      rules: { ...STANDARD_RULES, rounds: 2 },
      guests: 1,
      bot: minhwatuIntermediateBot,
      botLevel: 1,
      HostRoom: HostRoom as never,
      GuestRoom: GuestRoom as never,
    });
    await host.start();
    await until(() => guests.every((g) => g.fair !== null), "참가자 진행");
    neverOpens(guests[0] as AnyGuest, 1);
    // 판 끝 화면은 보내지 않고(참가자는 판이 끝난 줄 모른다), 그만둔 끝 화면에서 방장 점수를 부풀린다.
    forgeHostViews(host, (v) => {
      if (v.phase === "roundEnd") return null;
      if (v.retired !== true) return v;
      const totals = [...(v.totals as number[])];
      totals[0] = (totals[0] ?? 0) + 50;
      return { ...v, totals };
    });
    const view = () => host.match?.current() as MinhwatuView | undefined;
    await playHwatu({
      host,
      guests,
      bot: minhwatuBeginnerBot,
      incidents,
      done: () => view()?.phase === "roundEnd",
    });
    host.abandon();
    await until(() => {
      if (audits.length === 1) return true;
      clock.advance(1_000);
      return false;
    }, "게임 끝 검증");
    expect(audits).toEqual([{ ok: false, reason: STANDING_MISMATCH }]);
  });

  it("그만한 첫 판에서도 낸다고 한 카드와 열쇠로 연 카드가 다르면 그 자리를 짚고, 끝내도 그 알림은 남는다", async () => {
    const { host, guests, incidents } = await setupHwatu({
      kit: minhwatuRoomKit,
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
