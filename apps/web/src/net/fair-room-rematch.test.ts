// @vitest-environment node
import { presetRules } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";

import type { ArchiveSource } from "@/review/recorder";

import {
  hostBidsTop,
  playRounds,
  settleDevices,
  setup,
  until,
} from "./fair-room-fixture";
import type { AuditResult } from "./guest-room";

const rules = presetRules("standard5");

/** 기기 열쇠(섞기·자리 열쇠가 든 저장본) */
const keysOf = (device: { snapshotAll(): unknown } | undefined) =>
  JSON.stringify(device?.snapshotAll() ?? null);

describe("마이티 암호화방: 한 판 더", () => {
  it("새 게임은 새 열쇠로 다시 섞고, 나간 사람 자리는 컴퓨터가 앉으며, 두 게임 모두 검증을 통과한다", async () => {
    const { host, guests, incidents } = await setup(rules, 2);
    const [stay, gone] = guests;
    if (!stay || !gone) throw new Error("참가자가 둘이어야 한다");
    const audits: AuditResult[] = [];
    stay.on("audit", (r) => audits.push(r));
    const archives: ArchiveSource[] = [];
    stay.on("archive", (s) => archives.push(JSON.parse(JSON.stringify(s))));

    await host.start();
    await until(() => stay.match !== null && gone.match !== null);
    expect(await playRounds(host, guests, 1, incidents, hostBidsTop)).toBe(1);
    // 게임 전체 그만하기로 끝낸다(첫 게임 끝).
    host.abandon();
    await until(() => audits.length === 1);
    expect(audits).toEqual([{ ok: true }]);
    const firstHostKeys = keysOf(host.fair?.device);
    const firstGuestKeys = keysOf(stay.fair?.device);
    const firstArchive = archives.at(-1);
    const firstCount = archives.length;
    const firstSeat = gone.seat ?? -1;

    // 한 사람은 판 끝에 나간다.
    gone.leave();
    await until(() => host.lobby().seats[firstSeat]?.connected === false);
    await settleDevices(host, [stay]);

    await host.rematch();
    await until(() => stay.match !== null && stay.gameNo === 2);
    expect(host.lobby().seats[firstSeat]?.kind).toBe("bot");
    // 방장·참가자 모두 새 기기 열쇠
    expect(keysOf(host.fair?.device)).not.toBe(firstHostKeys);
    expect(keysOf(stay.fair?.device)).not.toBe(firstGuestKeys);

    expect(await playRounds(host, [stay], 1, incidents, hostBidsTop)).toBe(1);
    host.abandon();
    await until(() => audits.length === 2);
    expect(audits[1]).toEqual({ ok: true });
    expect(incidents).toEqual([]);
    // 새 게임 복기 기록은 다른 시드로 따로 생기고, 앞 게임 기록을 다시 쓰지 않는다.
    const later = archives.slice(firstCount);
    expect(later.length).toBeGreaterThan(0);
    expect(new Set(later.map((a) => a.seed)).size).toBe(1);
    expect(later[0]?.seed).not.toBe(firstArchive?.seed);
    expect(archives.slice(0, firstCount).at(-1)).toEqual(firstArchive);
  });
});
