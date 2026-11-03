import { ManualClock } from "@game/fair-play";
import { heuristicBot } from "@game/mighty-ai";
import { presetRules } from "@game/mighty-engine";
import { describe, expect, it } from "vitest";

import { GuestRoom } from "./guest-room";
import { HostRoom } from "./host-room";
import { MemoryNetwork, type Transport } from "./transport";

/**
 * 실시간 청구가 없는 게임(마이티)의 방, 곧 이 기능을 모르는 옛 방 코드가 청구·방장 발표·함께 정한 난수 메시지를
 * 받아도 그냥 버리는지 지킨다(상태·부정 알림·끊기 없음, 이어서 진행). 메시지에 `t`가 없어서
 * `isGuestMessage`·`isHostMessage`를 지나지 못하는 것이 근거다(claim.ts, joint-random.ts).
 */

const rules = presetRules("standard5");
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function until(condition: () => boolean): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > 30_000)
      throw new Error("조건을 기다리다 시간이 지났다");
    await flush();
  }
}

/** 새 클라이언트가 보내는 모양 전부(청구, 방장 발표, 함께 정한 난수 약속·공개) */
function claimShapes(game: string, seq: number): unknown[] {
  const claim = {
    v: 1,
    kind: "claim",
    game,
    claimId: `c${seq}`,
    seat: 1,
    seen: seq,
    body: { button: 1 },
    rtMs: 321,
  };
  return [
    claim,
    { ...claim, game: "buttons" },
    {
      v: 1,
      kind: "claims-resolved",
      game,
      batch: seq,
      at: seq,
      entries: [{ claim, outcome: { status: "judged", verdict: "hit" } }],
    },
    { jr: 1, k: "commit", scope: `r${seq}`, seat: 1, hash: "b".repeat(64) },
    { jr: 1, k: "reveal", scope: `r${seq}`, seat: 1, secret: "secretAAAA0" },
  ];
}

function snapshot(host: HostRoom, guests: GuestRoom[]): string {
  return JSON.stringify({
    host: host.lobby(),
    hostView: host.match?.current() ?? null,
    log: host.match?.actionLog() ?? null,
    guests: guests.map((g) => ({
      seat: g.seat,
      lobby: g.lobby,
      view: g.match?.current() ?? null,
    })),
  });
}

async function flood(
  host: HostRoom,
  guests: GuestRoom[],
  senders: Transport[],
  seq: number,
) {
  const before = snapshot(host, guests);
  for (const s of senders) {
    for (const m of claimShapes("mighty", seq)) s.send(m);
    for (const m of claimShapes("mighty", seq + 1)) s.send(m, "host");
  }
  for (let i = 0; i < 10; i++) await flush();
  expect(snapshot(host, guests)).toBe(before);
}

describe("옛 방 코드가 청구 메시지를 무시한다", () => {
  it("로비와 게임 중 모두 상태가 그대로이고 이어서 진행된다", async () => {
    const clock = new ManualClock();
    const net = new MemoryNetwork();
    const host = new HostRoom({
      transport: net.join("host"),
      clock,
      hostName: "방장",
      rules,
      revealTimeoutMs: 500,
      standInDelayMs: 10,
    });
    expect(host.claims).toBe(null);
    const aTransport = net.join("a");
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
    const troubles: string[] = [];
    host.onIncident((n) => troubles.push(`host ${n.reason}`));
    host.onOwnError((e) => troubles.push(`host error ${e}`));
    for (const [i, g] of guests.entries()) {
      g.on("incident", (n) => troubles.push(`guest${i} ${n.reason}`));
      g.on("rejected", (e) => troubles.push(`guest${i} rejected ${e}`));
      g.on("kicked", () => troubles.push(`guest${i} kicked`));
      g.on("hostLeft", () => troubles.push(`guest${i} hostLeft`));
    }
    // 손님 통로와, 방에 없는 기기(자리 없는 연결)에서 쏟아 넣는다
    const stranger = net.join("x");
    await flood(host, guests, [aTransport, stranger], 0);

    await host.start();
    await until(() => a.match !== null && b.match !== null);
    await flood(host, guests, [aTransport, stranger], 10);

    // 이어서 몇 수 둔다
    const match = host.match;
    if (!match) throw new Error("시작하지 않았다");
    let made = 0;
    for (let i = 0; i < 2000 && made < 6; i++) {
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
    expect(made).toBe(6);
    expect(troubles).toEqual([]);
    host.close();
  });
});
