// @vitest-environment node
// 화투 암호화방 시험은 판을 섞고 증명하느라 무거워, 시험마다 파일을 나눠 동시에 돈다
// (fair-room-extra.test.ts 방장 새로고침, fair-room-one-round.test.ts 한 판짜리 게임 끝 검증)
import { minhwatuIntermediateBot } from "@game/minhwatu-ai";
import { type MinhwatuView, STANDARD_RULES } from "@game/minhwatu-engine";
import { describe, expect, it } from "vitest";

import { minhwatuRoomKit } from "@/minhwatu/fair-table";
import { GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";

import { type AnyHost, setupHwatu, until } from "./fair-room-fixture";

const phase = (host: AnyHost) =>
  (host.match?.current() as MinhwatuView | undefined)?.phase;

describe("화투 암호화방: 새로고침과 끊긴 사람", () => {
  it("끊긴 사람을 기다리다 투표가 열리고, 방장이 끝내기를 고르면 모두의 게임이 끝난다", async () => {
    const { net, clock, host, guests } = await setupHwatu({
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
    const seat0 = guests[0]?.seat ?? -1;
    net.disconnect("g0");
    await until(
      () => host.lobby().seats[seat0]?.connected === false,
      "끊김 알기",
    );
    expect(host.lobby().endVote).toBeUndefined();
    clock.advance(60_000);
    await until(() => host.lobby().endVote !== undefined, "투표 열림");
    host.vote(true);
    await until(() => phase(host) === "gameOver", "방장 게임 끝");
    await until(
      () =>
        (guests[1]?.match?.current() as MinhwatuView | undefined)?.phase ===
        "gameOver",
      "참가자 게임 끝",
    );
  });
});
