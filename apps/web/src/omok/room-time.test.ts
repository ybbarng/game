// @vitest-environment node
import { ManualClock } from "@game/fair-play";
import { omokBotFor } from "@game/omok-ai";
import { type OmokRules, pointAt } from "@game/omok-engine";
import { describe, expect, it } from "vitest";

import { type AuditResult, GuestRoom } from "@/net/guest-room";
import { HostRoom } from "@/net/host-room";
import { MemoryNetwork } from "@/net/transport";

import { omokKit } from "./kit";

const FAST: OmokRules = { variant: "standard", winsToFinish: 1, time: "fast" };
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

describe("오목 온라인 방의 개인 시간", () => {
  it("방장 시계가 참가자의 시간패를 기록하고, 참가자의 판 끝 검증을 통과한다", async () => {
    const clock = new ManualClock();
    const net = new MemoryNetwork();
    const host = new HostRoom({
      kit: omokKit,
      transport: net.join("host"),
      clock,
      hostName: "방장",
      rules: FAST,
      bot: omokBotFor(1),
      botLevel: 1,
    });
    const guest = new GuestRoom({
      kit: omokKit,
      transport: net.join("a"),
      clock,
      name: "철수",
      token: null,
    });
    await until(() => guest.seat !== null && guest.lobby !== null);
    const audits: AuditResult[] = [];
    guest.on("audit", (r) => audits.push(r));
    await host.start();
    await until(() => guest.match !== null);
    const match = host.match;
    if (!match) throw new Error("시작하지 않았다");

    // 먼저 두는 쪽이 한 수씩 둔다(쓴 시간은 방장 시계가 싣는다).
    const points = ["H8", "H9", "G8"];
    for (const name of points) {
      await until(
        () =>
          match.current().decision !== null ||
          guest.match?.current().decision !== null,
      );
      clock.advance(5_000);
      const action = { type: "place" as const, at: pointAt(name) };
      if (match.current().decision) match.submit(action);
      else guest.match?.submit(action);
      await until(
        () => match.current().moves.length >= points.indexOf(name) + 1,
      );
    }
    // 참가자 차례가 올 때까지 두고, 참가자 시간이 다 지나게 한다.
    if (match.current().decision) {
      clock.advance(1_000);
      match.submit({ type: "place", at: pointAt("J10") });
    }
    await until(() => guest.match?.current().decision !== null);
    const seat = guest.seat as number;
    const left = match.current().clocks?.[seat];
    expect(left?.main).toBeLessThan(180_000);
    // 시간패가 걸리는 순간까지만 감는다(더 감으면 참가자 기기가 시간패 화면을 그만큼 늦게 받은 것이 된다).
    clock.advance((left?.main ?? 0) + (left?.periods ?? 0) * 30_000 + 1);
    await until(() => match.current().result !== null);
    expect(match.current().result).toEqual({ kind: "time", seat: 0 });
    await until(() => guest.match?.current().result !== null);

    host.finish();
    await until(() => audits.length === 1);
    expect(audits).toEqual([{ ok: true }]);
  });
});

/**
 * 방장 기기와 참가자 기기의 시계를 따로 둔다. 방장 시계만 더 감으면 방장이 실제보다 시간이 더 지났다고 적는 것
 * (조작한 방장)이고, 둘을 같이 감으면 정직한 방장이다
 */
async function twoClocks() {
  const hostClock = new ManualClock();
  const guestClock = new ManualClock();
  const net = new MemoryNetwork();
  const host = new HostRoom({
    kit: omokKit,
    transport: net.join("host"),
    clock: hostClock,
    hostName: "방장",
    rules: FAST,
  });
  const guest = new GuestRoom({
    kit: omokKit,
    transport: net.join("a"),
    clock: guestClock,
    name: "철수",
    token: null,
  });
  await until(() => guest.seat !== null && guest.lobby !== null);
  const audits: AuditResult[] = [];
  guest.on("audit", (r) => audits.push(r));
  await host.start();
  await until(() => guest.match !== null);
  const match = host.match;
  if (!match) throw new Error("시작하지 않았다");
  const seat = guest.seat as number;
  /** 두 기기 시계를 옮긴다(`guestMs`를 따로 주면 참가자 시계는 그만큼) */
  const pass = (hostMs: number, guestMs = hostMs) => {
    hostClock.advance(hostMs);
    guestClock.advance(guestMs);
  };
  /** 지금 차례인 쪽이 한 수 두고 그 화면이 참가자에게 닿을 때까지 기다린다 */
  const place = async (name: string) => {
    const moves = match.current().moves.length;
    const action = { type: "place" as const, at: pointAt(name) };
    if (match.current().decision) match.submit(action);
    else guest.match?.submit(action);
    await until(() => guest.match?.current().moves.length === moves + 1);
  };
  const guestTurn = () => guest.match?.current().decision !== null;
  const audit = async () => {
    await until(() => guest.match?.current().result != null);
    host.finish();
    await until(() => audits.length === 1);
    return audits[0];
  };
  return { net, host, guest, match, seat, pass, place, guestTurn, audit };
}

/** 이 자리가 지금부터 쓸 수 있는 시간을 다 쓰는 순간(시간패가 걸린다) */
const flagIn = (clock: { main: number; periods: number } | undefined) =>
  (clock?.main ?? 0) + (clock?.periods ?? 0) * 30_000 + 1;

describe("손님 시계 확인: 방장이 적은 시간을 참가자 기기가 맞춰 본다", () => {
  it("정직한 방장: 두 기기 시계가 함께 가면 시간패까지 둔 판도 검증을 통과한다", async () => {
    const room = await twoClocks();
    for (const name of ["H8", "H9", "G8", "G9"]) {
      room.pass(4_000);
      await room.place(name);
    }
    if (!room.guestTurn()) {
      room.pass(1_000);
      await room.place("F8");
    }
    room.pass(flagIn(room.match.current().clocks?.[room.seat]));
    expect(await room.audit()).toEqual({ ok: true });
    expect(room.match.current().result).toEqual({
      kind: "time",
      seat: 1 - room.seat,
    });
  });

  it("조작한 방장: 참가자가 10초만 생각했는데 시간패를 적으면 참가자 검증이 받아들이지 않는다", async () => {
    const room = await twoClocks();
    if (!room.guestTurn()) {
      room.pass(2_000);
      await room.place("H8");
    }
    // 방장 시계만 시간패까지 감는다: 참가자 기기에서는 10초가 지났다.
    room.pass(flagIn(room.match.current().clocks?.[room.seat]), 10_000);
    const result = await room.audit();
    expect(room.match.current().result).toEqual({
      kind: "time",
      seat: 1 - room.seat,
    });
    expect(result).toMatchObject({
      ok: false,
      reason: expect.stringMatching(
        new RegExp(`${room.seat}번 자리 시간을 .*많이 적었다`),
      ),
    });
  });

  it("조작한 방장: 자기 차례에 1분을 쓰고 1초로 적으면 참가자 검증이 받아들이지 않는다", async () => {
    const room = await twoClocks();
    if (room.guestTurn()) {
      room.pass(2_000);
      await room.place("H8");
    }
    room.pass(1_000, 60_000);
    await room.place("H9");
    room.guest.match?.submit({ type: "resign" });
    expect(await room.audit()).toMatchObject({
      ok: false,
      reason: expect.stringMatching(
        new RegExp(`${1 - room.seat}번 자리 시간을 .*적게 적었다`),
      ),
    });
  });

  it("방장과 끊겼다 이어진 차례는 재지 않는다(그사이 닿은 시각을 믿을 수 없다)", async () => {
    const room = await twoClocks();
    if (room.guestTurn()) {
      room.pass(2_000);
      await room.place("H8");
    }
    // 방장 차례에 참가자 기기가 끊겼다 이어진다. 그사이 두 시계가 어긋나도(기기가 잠듦) 잡지 않는다.
    room.net.disconnect("a");
    await until(() => room.host.lobby().seats[room.seat]?.connected === false);
    room.pass(1_000, 30_000);
    room.net.reconnect("a");
    await until(() => room.host.lobby().seats[room.seat]?.connected === true);
    await room.place("H9");
    room.guest.match?.submit({ type: "resign" });
    expect(await room.audit()).toEqual({ ok: true });
  });
});
