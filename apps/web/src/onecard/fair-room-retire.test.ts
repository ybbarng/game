// @vitest-environment node
// 원카드 암호화방 시험은 판을 섞고 증명하느라 무거워, 시험마다 파일을 나눠 동시에 돈다(fair-room.test.ts 끝까지 둔 판)
import { type OnecardView, STANDARD_ONECARD_RULES } from "@game/onecard-engine";
import { describe, expect, it } from "vitest";

import { setupHwatu, until } from "@/hwatu/fair-room-fixture";
import { GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";

import { onecardBotFor, toKitBot } from "./bots";
import { onecardKit } from "./kit";

describe("원카드 암호화방: 도중에 그만하기", () => {
  it("덱을 열기 전에 방장이 끝내도 참가자 게임 끝 검증은 통과한다(끝까지 치지 않은 판은 결과 없음)", async () => {
    const { host, guests, incidents, audits, clock } = await setupHwatu({
      kit: onecardKit,
      rules: { ...STANDARD_ONECARD_RULES, players: 2 },
      guests: 1,
      bot: toKitBot(onecardBotFor(1)),
      botLevel: 1,
      HostRoom: HostRoom as never,
      GuestRoom: GuestRoom as never,
    });
    await host.start();
    await until(() => guests.every((g) => g.match !== null), "첫 화면");
    host.abandon();
    // 방장은 청구 통로가 닫히길(유예 시간의 절반) 기다린 뒤 게임 끝 기록을 보낸다. 그 시계를 옮긴다.
    const end = () => guests[0]?.match?.current() as OnecardView | undefined;
    await until(() => {
      if (audits.length === 1 && end()?.phase === "over") return true;
      clock.advance(500);
      return false;
    }, "게임 끝 검증");
    // 끝 화면: 내 손패는 진짜 카드, 열지 못한 방장 손패는 가린다(뒷면).
    const view = end() as OnecardView;
    const me = guests[0]?.seat as number;
    expect(view.retired).toBe(true);
    expect(view.result?.hands[1 - me]).toBeNull();
    expect(view.result?.hands[me]?.some((c) => c.startsWith("?_"))).toBe(false);
    expect(audits).toEqual([{ ok: true }]);
    expect(incidents).toEqual([]);
  });
});
