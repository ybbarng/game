// @vitest-environment node

import { ManualClock } from "@game/fair-play";
import { heuristicBot } from "@game/mighty-ai";
import { presetRules } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";

import { GuestRoom } from "./guest-room";
import { HostRoom } from "./host-room";
import { type LatencyMessage, withLatency } from "./latency";
import { MemoryNetwork, type Transport } from "./transport";

/**
 * 옛 클라이언트와 새 클라이언트가 섞인 방(docs/43 5절 E2). 새 클라이언트는 `withLatency`로 측정 메시지를
 * 보내고, 옛 클라이언트는 그것을 거르지 않은 채 방 코드(HostRoom·GuestRoom)로 받는다. 옛 방 코드가
 * 측정 메시지를 그냥 버리는지(상태·부정 알림·끊기 없음, 이후 진행 그대로) 지킨다.
 */

const rules = presetRules("standard5");
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function until(condition: () => boolean, tries = 200): Promise<void> {
  const start = Date.now();
  for (let i = 0; !condition(); i++) {
    if (i >= tries && Date.now() - start > 30_000)
      throw new Error("조건을 기다리다 시간이 지났다");
    await flush();
  }
}

/** latency.ts가 실제로 보내는 모양 전부(두 통로의 핑·답, 알림, 받은 시각) */
function latencyShapes(seq: number): LatencyMessage[] {
  return [
    { lat: 1, t: "ping", n: seq, r: "9f3c2a1b7e4d", ch: "o" },
    { lat: 1, t: "ping", n: seq + 1, r: "0a1b2c3d4e5f", ch: "u" },
    { lat: 1, t: "pong", n: seq, r: "9f3c2a1b7e4d", ch: "o", at: 12_345.6 },
    { lat: 1, t: "pong", n: seq + 1, r: "0a1b2c3d4e5f", ch: "u", at: 12_346 },
    { lat: 1, t: "beacon", k: `b${seq}` },
    { lat: 1, t: "seen", k: `b${seq}`, at: 12_400.25 },
  ];
}

/** 새 클라이언트의 통로. 측정 시계는 방 시계와 따로 두어 핑 일정이 방의 제한 시간을 건드리지 않게 한다 */
function newClient(net: MemoryNetwork, id: string, beacon: boolean) {
  const meterClock = new ManualClock();
  let nonce = 0;
  const transport = withLatency(net.join(id), {
    clock: meterClock,
    mono: { now: () => meterClock.now() },
    pingMs: 1000,
    beacon,
    nonce: () => `${id}${nonce++}`,
  });
  return { transport, meterClock };
}

/** 옛 기기 통로에 측정 메시지가 실제로 닿았는지 센다(시험이 헛돌지 않게) */
function countLatency(transport: Transport) {
  const types = new Set<string>();
  let n = 0;
  transport.onMessage((m) => {
    const msg = m as { lat?: unknown; t?: unknown };
    if (msg.lat !== 1) return;
    n++;
    types.add(String(msg.t));
  });
  return () => ({ n, types: [...types].sort() });
}

/** 방이 내는 알림 중 "무언가 잘못됐다"는 것을 모두 모은다 */
function watch(host: HostRoom, guests: GuestRoom[]) {
  const troubles: string[] = [];
  host.onIncident((n) => troubles.push(`host incident ${n.reason}`));
  host.onOwnError((e) => troubles.push(`host error ${e}`));
  for (const [i, g] of guests.entries()) {
    g.on("incident", (n) => troubles.push(`guest${i} incident ${n.reason}`));
    g.on("rejected", (e) => troubles.push(`guest${i} rejected ${e}`));
    g.on("kicked", () => troubles.push(`guest${i} kicked`));
    g.on("hostLeft", () => troubles.push(`guest${i} hostLeft`));
    g.on("full", () => troubles.push(`guest${i} full`));
  }
  return troubles;
}

/** 방이 볼 수 있는 상태 전부(로비와, 시작했으면 각자 화면) */
function snapshot(host: HostRoom, guests: GuestRoom[]): string {
  return JSON.stringify({
    host: host.lobby(),
    hostView: host.match?.current() ?? null,
    guests: guests.map((g) => ({
      seat: g.seat,
      lobby: g.lobby,
      view: g.match?.current() ?? null,
    })),
  });
}

/** 사람 자리도 봇처럼 두게 해 몇 수 진행한다 */
async function playMoves(host: HostRoom, guests: GuestRoom[], moves: number) {
  const match = host.match;
  if (!match) throw new Error("시작하지 않았다");
  let made = 0;
  for (let i = 0; i < 2000 && made < moves; i++) {
    const hostView = match.current();
    if (hostView.decision) {
      match.submit(heuristicBot.decide(hostView, { seed: i }));
      made++;
    }
    for (const g of guests) {
      const view = g.match?.current();
      if (view?.decision) {
        g.match?.submit(heuristicBot.decide(view, { seed: i }));
        made++;
      }
    }
    await flush();
  }
  return made;
}

/** 측정 메시지를 쏟아 넣고(실제 측정기 + 모양 전부), 방 상태가 그대로인지 본다 */
async function flood(
  host: HostRoom,
  guests: GuestRoom[],
  senders: { transport: Transport; meterClock: ManualClock }[],
  seq: number,
) {
  await until(() => true);
  const before = snapshot(host, guests);
  for (const s of senders) {
    // 실제 측정기가 핑·알림을 보낸다
    s.meterClock.advance(3000);
    // 모두에게, 그리고 한 사람씩
    for (const m of latencyShapes(seq)) s.transport.send(m);
    for (const m of latencyShapes(seq + 10)) s.transport.send(m, "host");
  }
  for (let i = 0; i < 10; i++) await flush();
  expect(snapshot(host, guests)).toBe(before);
}

describe("옛 방 코드가 새 클라이언트의 측정 메시지를 무시한다", () => {
  it("옛 방장·옛 손님 사이의 새 손님: 로비와 게임 중 모두 상태가 그대로이고 이어서 진행된다", async () => {
    const clock = new ManualClock();
    const net = new MemoryNetwork();
    const hostTransport = net.join("host");
    const hostGot = countLatency(hostTransport);
    const host = new HostRoom({
      transport: hostTransport,
      clock,
      hostName: "방장",
      rules,
      revealTimeoutMs: 500,
      standInDelayMs: 10,
    });
    // 손님이 알림도 보내게 해 beacon·seen까지 옛 기기에 닿게 한다
    const fresh = newClient(net, "a", true);
    const a = new GuestRoom({
      transport: fresh.transport,
      clock,
      name: "철수",
      token: null,
    });
    await until(() => a.seat !== null);
    const bTransport = net.join("b");
    const bGot = countLatency(bTransport);
    const b = new GuestRoom({
      transport: bTransport,
      clock,
      name: "영희",
      token: null,
    });
    await until(() => b.seat !== null && a.lobby?.seats.length === 5);
    const guests = [a, b];
    const troubles = watch(host, guests);

    await flood(host, guests, [fresh], 0);
    const all = ["beacon", "ping", "pong", "seen"];
    expect(hostGot().types).toEqual(all);
    expect(bGot().types).toEqual(all);
    expect(host.lobby().seats.map((s) => s.kind)).toEqual([
      "host",
      "guest",
      "guest",
      "bot",
      "bot",
    ]);

    await host.start();
    await until(() => a.match !== null && b.match !== null);
    await flood(host, guests, [fresh], 100);

    const made = await playMoves(host, guests, 8);
    expect(made).toBe(8);
    await until(
      () =>
        JSON.stringify(a.match?.current().phase) ===
        JSON.stringify(host.match?.current().phase),
    );
    expect(troubles).toEqual([]);
    // 옛 기기는 핑에 답하지 않으니 새 손님의 측정기에는 표본이 없다(잃은 핑으로만 센다)
    const summary = fresh.transport.meter.summary();
    expect(summary.pairs.map((p) => p.peer).sort()).toEqual(["b", "host"]);
    expect(summary.pairs.every((p) => p.app.n === 0 && p.app.sent > 0)).toBe(
      true,
    );
    host.close();
  });

  it("새 방장·옛 손님들: 손님 방 코드는 방장의 핑·알림을 버리고 그대로 진행한다", async () => {
    const clock = new ManualClock();
    const net = new MemoryNetwork();
    const fresh = newClient(net, "host", true);
    const host = new HostRoom({
      transport: fresh.transport,
      clock,
      hostName: "방장",
      rules,
      revealTimeoutMs: 500,
      standInDelayMs: 10,
    });
    const aTransport = net.join("a");
    const aGot = countLatency(aTransport);
    const a = new GuestRoom({
      transport: aTransport,
      clock,
      name: "철수",
      token: null,
    });
    await until(() => a.seat !== null);
    const b = new GuestRoom({
      transport: net.join("b"),
      clock,
      name: "영희",
      token: null,
    });
    await until(() => b.seat !== null && a.lobby?.seats.length === 5);
    const guests = [a, b];
    const troubles = watch(host, guests);

    await flood(host, guests, [fresh], 0);
    expect(aGot().types).toEqual(["beacon", "ping", "pong", "seen"]);
    await host.start();
    await until(() => a.match !== null && b.match !== null);
    await flood(host, guests, [fresh], 100);

    expect(await playMoves(host, guests, 8)).toBe(8);
    await until(
      () =>
        JSON.stringify(b.match?.current().phase) ===
        JSON.stringify(host.match?.current().phase),
    );
    expect(troubles).toEqual([]);
    expect(fresh.transport.meter.peers().sort()).toEqual(["a", "b"]);
    host.close();
  });
});
