// @vitest-environment node
import { minhwatuIntermediateBot } from "@game/minhwatu-ai";
import { type MinhwatuView, STANDARD_RULES } from "@game/minhwatu-engine";
import { describe, expect, it } from "vitest";

import { minhwatuRoomKit } from "@/minhwatu/fair-table";
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

/** 첫 판을 끝까지 쳐서 둘째 판이 시작할 때까지(이 기기가 「1판 끝」을 본 앞 게임을 만든다) */
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
      kit: minhwatuRoomKit,
      rules: { ...STANDARD_RULES, rounds: 2 },
      guests: 2,
      bot: minhwatuIntermediateBot,
      botLevel: 1,
      HostRoom: HostRoom as never,
      GuestRoom: GuestRoom as never,
    });
    // 기기마다 받은 멘탈 포커 메시지(보낸 기기와 함께). 새 게임 메시지에는 게임 꼬리표가 붙는다.
    const devices = [host, ...guests];
    const received = devices.map(() => [] as { m: unknown; from: string }[]);
    for (const [i, d] of devices.entries())
      d.transport.onMessage((m, from) => {
        if (isFairMessage(m)) received[i]?.push({ m, from });
      });
    const tagsOf = (i: number) =>
      new Set(received[i]?.map(({ m }) => (m as { g?: number }).g ?? 1));

    await host.start();
    await until(() => guests.every((g) => g.match !== null), "첫 화면");
    host.abandon();
    await until(() => audits.length === 2, "첫 게임 검증");
    expect(audits).toEqual([{ ok: true }, { ok: true }]);
    const firstSeed = host.archiveSource()?.seed;
    const firstKeys = guests.map((g) => keysOf(g.fair?.device));
    const stale = received.map((list) => [...list]);
    expect(stale.map((list) => list.length > 0)).toEqual([true, true, true]);

    await host.rematch();
    await until(
      () => guests.every((g) => g.gameNo === 2 && g.match !== null),
      "새 게임 첫 화면",
    );
    expect(host.archiveSource()?.seed).not.toBe(firstSeed);
    expect(guests.map((g) => keysOf(g.fair?.device))).not.toEqual(firstKeys);
    expect([tagsOf(0).has(2), tagsOf(1).has(2), tagsOf(2).has(2)]).toEqual([
      true,
      true,
      true,
    ]);

    // 앞 게임 메시지(꼬리표 없음)가 새 게임 첫 판 중에 늦게 닿는다: 같은 판 번호(1판)라도 새 게임 진행에 넣지 않는다.
    const sender = new Map(devices.map((d) => [d.transport.selfId, d]));
    for (const [i, list] of stale.entries())
      for (const { m, from } of list)
        sender.get(from)?.transport.send(m, devices[i]?.transport.selfId);
    // 새 열쇠로 카드를 여는 수(세 자리가 한 번씩)까지 친 뒤 그만한다.
    await playHwatu({
      host,
      guests,
      bot: minhwatuIntermediateBot,
      incidents,
      done: () => (host.match?.actionLog().length ?? 0) >= 3,
    });
    host.abandon();
    await until(() => audits.length === 4, "새 게임 검증");
    expect(audits.slice(2)).toEqual([{ ok: true }, { ok: true }]);
    expect(incidents).toEqual([]);
  });

  it("앞 게임에서 끝낸 판 번호를 새 게임에 가져가지 않는다: 새 게임 첫 판 도중에 그만둬도 검증을 통과한다", async () => {
    const { host, guests, incidents, audits } = await setupHwatu({
      kit: minhwatuRoomKit,
      rules: { ...STANDARD_RULES, rounds: 2 },
      guests: 1,
      bot: minhwatuIntermediateBot,
      botLevel: 1,
      HostRoom: HostRoom as never,
      GuestRoom: GuestRoom as never,
    });
    await host.start();
    await until(() => guests.every((g) => g.match !== null), "첫 화면");
    // 앞 게임은 첫 판을 끝까지 쳤다(이 기기는 「1판 끝」을 보았다).
    await playToSecondRound(host, guests, incidents);
    host.abandon();
    await until(() => audits.length === 1, "첫 게임 검증");
    expect(audits).toEqual([{ ok: true }]);

    await host.rematch();
    await until(
      () => guests.every((g) => g.gameNo === 2 && g.match !== null),
      "새 게임 첫 화면",
    );
    // 새 게임은 첫 판을 끝내지 않았다. 앞 게임의 「1판 끝」이 남아 있으면 끝낸 판을 숨긴 것으로 본다.
    expect(
      (host.match?.current() as MinhwatuView | undefined)?.roundNumber,
    ).toBe(1);
    host.abandon();
    await until(() => audits.length === 2, "새 게임 검증");
    expect(audits[1]).toEqual({ ok: true });
    expect(incidents).toEqual([]);
  });
});
