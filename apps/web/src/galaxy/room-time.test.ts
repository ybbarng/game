// @vitest-environment node

import { ManualClock } from "@game/fair-play";
import { NUMBERS, SHORT_RULES } from "@game/galaxy-engine";
import { describe, expect, it } from "vitest";

import { type AuditResult, GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";
import { MemoryNetwork } from "@/net/transport";

import { galaxyOnlineKit } from "./online";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** 조건이 맞을 때까지 기다린다. 상한은 멈춘 시험을 잡는 안전장치일 뿐이다 */
async function until(condition: () => boolean): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > 50_000)
      throw new Error("조건을 기다리다 시간이 지났다");
    await flush();
  }
}

const CAP = NUMBERS.timeCap.short as number;

/**
 * 짧은 판 2인 방. 방장 기기와 참가자 기기의 시계를 따로 둔다. 판을 시작하면 둘 다 주사위 사슬 약속을 기다리고
 * (그동안 재는 창은 시간 상한뿐이다), 시험이 두 시계를 옮긴 뒤 참가자가 기권해 판 끝 검증을 받는다
 */
async function timeUpAfter(hostMs: number, guestMs: number) {
  const hostClock = new ManualClock();
  const guestClock = new ManualClock();
  const net = new MemoryNetwork();
  const host = new HostRoom({
    kit: galaxyOnlineKit,
    transport: net.join("host"),
    clock: hostClock,
    hostName: "방장",
    rules: { ...SHORT_RULES, players: 2 },
  });
  const guest = new GuestRoom({
    kit: galaxyOnlineKit,
    transport: net.join("guest"),
    clock: guestClock,
    name: "철수",
    token: null,
  });
  await until(() => guest.seat !== null && guest.lobby !== null);
  const audits: AuditResult[] = [];
  guest.on("audit", (r) => audits.push(r));
  await host.start();
  await until(() => guest.match !== null);
  expect(guest.match?.current().phase).toBe("commit");
  guestClock.advance(guestMs);
  hostClock.advance(hostMs);
  await until(() => guest.match?.current().timeUp === true);
  guest.match?.submit({ type: "resign" });
  await until(() => guest.match?.current().phase === "gameOver");
  host.finish();
  await until(() => audits.length === 1);
  return audits[0];
}

describe("은하 한 바퀴 시간 상한: 참가자 기기가 정말 그만큼 지났는지 본다", () => {
  it("정직한 방장: 시간 상한만큼 지나 낸 시간 상한은 검증을 통과한다", async () => {
    expect(await timeUpAfter(CAP, CAP)).toEqual({ ok: true });
  });

  it("조작한 방장: 시작하고 1분 만에 시간 상한을 내면 참가자 검증이 받아들이지 않는다", async () => {
    // 방장 시계만 시간 상한까지 감는다(앞선 방장이 판을 일찍 끝내려는 흉내). 참가자 기기에서는 1분이 지났다.
    const result = await timeUpAfter(CAP, 60_000);
    expect(result).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/시간 창이 내 기기에서 .*초 일찍 닫혔다/),
    });
  });
});
