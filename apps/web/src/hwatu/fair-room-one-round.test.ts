// @vitest-environment node
// 화투 암호화방 시험은 판을 섞고 증명하느라 무거워, 시험마다 파일을 나눠 동시에 돈다
// (fair-room-extra.test.ts 방장 새로고침, fair-room-vote.test.ts 끊긴 사람 투표)
import {
  minhwatuBeginnerBot,
  minhwatuIntermediateBot,
} from "@game/minhwatu-ai";
import { type MinhwatuView, STANDARD_RULES } from "@game/minhwatu-engine";
import { describe, expect, it } from "vitest";

import { minhwatuRoomKit } from "@/minhwatu/fair-table";
import { GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";

import { playHwatu, setupHwatu, until } from "./fair-room-fixture";

describe("화투 암호화방: 새로고침과 끊긴 사람", () => {
  it("한 판짜리 게임도 마지막 판 카드가 열린 뒤에 게임 끝 검증을 통과한다", async () => {
    const { host, guests, incidents, audits, verified } = await setupHwatu({
      kit: minhwatuRoomKit,
      rules: { ...STANDARD_RULES, rounds: 1 },
      guests: 2,
      bot: minhwatuIntermediateBot,
      botLevel: 1,
      HostRoom: HostRoom as never,
      GuestRoom: GuestRoom as never,
    });
    await host.start();
    await playHwatu({
      host,
      guests,
      bot: minhwatuBeginnerBot,
      incidents,
      done: () =>
        (host.match?.current() as MinhwatuView | undefined)?.phase ===
        "gameOver",
    });
    await until(() => audits.length === 2, "판 끝 검증");
    expect(audits).toEqual([{ ok: true }, { ok: true }]);
    await until(() => verified.length === 2, "판마다 검증");
    expect(incidents).toEqual([]);
  });
});
