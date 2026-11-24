// @vitest-environment node
import { minhwatuIntermediateBot } from "@game/minhwatu-ai";
import { type MinhwatuView, STANDARD_RULES } from "@game/minhwatu-engine";
import { describe, expect, it } from "vitest";

import { minhwatuKit } from "@/minhwatu/kit";
import { GuestRoom } from "@/net/guest-room";
import type { IncidentNotice } from "@/net/host-room";
import { HostRoom } from "@/net/host-room";
import { isFairMessage } from "@/net/protocol";

import {
  type AnyGuest,
  type AnyHost,
  playHwatu,
  setupHwatu,
  until,
} from "./fair-room-fixture";

/**
 * 첫 판을 끝까지 쳐서 둘째 판이 시작할 때까지. 첫 판 카드를 다 열기 전에 그만하면 판 끝 검증이 첫 판 패를
 * 몰라 실패하므로(이 시험과 따로 있는 일) 한 판을 마친 뒤에 끝낸다
 */
async function playToSecondRound(
  host: AnyHost,
  guests: AnyGuest[],
  incidents: IncidentNotice[],
): Promise<void> {
  await playHwatu({
    host,
    guests,
    bot: minhwatuIntermediateBot,
    incidents,
    done: () =>
      ((host.match?.current() as MinhwatuView | undefined)?.roundNumber ?? 1) >=
      2,
  });
}

/** 기기 열쇠(섞기·자리 열쇠가 든 저장본) */
const keysOf = (device: { snapshotAll(): unknown } | undefined) =>
  JSON.stringify(device?.snapshotAll() ?? null);

describe("화투 암호화방: 한 판 더", () => {
  it("민화투: 새 시드·새 열쇠로 첫 판을 다시 함께 섞고, 앞 게임 메시지는 새 게임에 섞이지 않는다", async () => {
    const { host, guests, incidents, audits } = await setupHwatu({
      kit: minhwatuKit,
      rules: { ...STANDARD_RULES, rounds: 2 },
      guests: 2,
      bot: minhwatuIntermediateBot,
      botLevel: 1,
      HostRoom: HostRoom as never,
      GuestRoom: GuestRoom as never,
    });
    // 새 게임에서 오간 멘탈 포커 메시지에는 게임 꼬리표가 붙는다.
    const tags = new Set<number>();
    guests[0]?.transport.onMessage((m) => {
      if (isFairMessage(m)) tags.add((m as { g?: number }).g ?? 1);
    });

    await host.start();
    await until(() => guests.every((g) => g.match !== null), "첫 화면");
    // 첫 판을 끝까지 치고 둘째 판을 막 시작했을 때 그만한다(첫 판 검증까지 하고, 둘째 판 섞기 증명은 오가는 중).
    await playToSecondRound(host, guests, incidents);
    host.abandon();
    await until(() => audits.length === 2, "첫 게임 검증");
    expect(audits).toEqual([{ ok: true }, { ok: true }]);
    const firstSeed = host.archiveSource()?.seed;
    const firstKeys = guests.map((g) => keysOf(g.fair?.device));

    await host.rematch();
    await until(
      () => guests.every((g) => g.gameNo === 2 && g.match !== null),
      "새 게임 첫 화면",
    );
    expect(host.archiveSource()?.seed).not.toBe(firstSeed);
    expect(guests.map((g) => keysOf(g.fair?.device))).not.toEqual(firstKeys);
    expect(tags.has(2)).toBe(true);

    await playToSecondRound(host, guests, incidents);
    host.abandon();
    await until(() => audits.length === 4, "새 게임 검증");
    expect(audits.slice(2)).toEqual([{ ok: true }, { ok: true }]);
    expect(incidents).toEqual([]);
  });
});
