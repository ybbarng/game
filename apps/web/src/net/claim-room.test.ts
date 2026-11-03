import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import type { ClaimsResolved } from "./claim";
import {
  type ButtonAction,
  type ButtonEvent,
  type ButtonRules,
  type ButtonState,
  type ButtonView,
  buttonKit,
  targetOf,
} from "./claim-fixture";
import { DelayedNetwork, type DelayFn } from "./delayed-network";
import { GuestRoom } from "./guest-room";
import { HostRoom } from "./host-room";
import type { Transport } from "./transport";

/**
 * 공정한 동시 판정 1층을 방 전체(HostRoom·GuestRoom)로 돌린다(docs/43 7절 1단계 끝 기준).
 * 망은 `DelayedNetwork`, 시간은 `ManualClock`이라 지연과 창이 시험이 정한 순간에만 일어난다.
 * 자리: 방장 0, 철수(a) 1, 영희(b) 2.
 */

type Host = HostRoom<
  ButtonRules,
  ButtonState,
  ButtonView,
  ButtonAction,
  ButtonEvent,
  undefined
>;
type Guest = GuestRoom<
  ButtonRules,
  ButtonState,
  ButtonView,
  ButtonAction,
  ButtonEvent,
  undefined
>;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** 조건이 맞을 때까지 시계를 조금씩 옮기며 기다린다(입장·시작처럼 암호 계산이 낀 절차) */
async function pump(clock: ManualClock, condition: () => boolean) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > 30_000)
      throw new Error("조건을 기다리다 시간이 지났다");
    clock.advance(1);
    await flush();
  }
}

/** 시간을 정확히 옮긴다. 청구 통로와 화면 전달은 모두 시계 안에서 동기로 돈다 */
async function tick(clock: ManualClock, ms: number) {
  clock.advance(ms);
  await flush();
}

async function setup(
  delay: DelayFn,
  hostTransport: (t: Transport) => Transport = (t) => t,
) {
  const clock = new ManualClock();
  // 방에 들어오고 시작하는 동안은 지연 없이, 판이 시작된 뒤 시험이 정한 지연을 쓴다.
  const net = new DelayedNetwork(clock, () => 1);
  const host: Host = new HostRoom({
    kit: buttonKit,
    transport: hostTransport(net.join("host")),
    clock,
    hostName: "방장",
    rules: { players: 3 },
    revealTimeoutMs: 600_000,
    standInDelayMs: 600_000,
  });
  const guest = (id: string, name: string): Guest =>
    new GuestRoom({
      kit: buttonKit,
      transport: net.join(id),
      clock,
      name,
      token: null,
    });
  const a = guest("a", "철수");
  await pump(clock, () => a.seat !== null);
  const b = guest("b", "영희");
  await pump(clock, () => b.seat !== null && a.lobby?.seats.length === 3);
  const started = host.start();
  await pump(clock, () => a.match !== null && b.match !== null);
  await started;

  const troubles: string[] = [];
  const resolved: Record<string, ClaimsResolved[]> = { host: [], a: [], b: [] };
  host.onIncident((n) =>
    troubles.push(`host ${n.own ? "own" : `from${n.reporter}`} ${n.reason}`),
  );
  host.claims?.onResolved((r) => resolved.host?.push(r));
  for (const [name, g] of [
    ["a", a],
    ["b", b],
  ] as const) {
    g.on("incident", (n) =>
      troubles.push(
        `${name} ${n.own ? "own" : `from${n.reporter}`} ${n.reason}`,
      ),
    );
    g.on("rejected", (e) => troubles.push(`${name} rejected ${e}`));
    g.claims?.onResolved((r) => resolved[name]?.push(r));
  }
  net.delay = delay;
  return { clock, net, host, a, b, troubles, resolved };
}

const boardOf = (room: Host | Guest) => room.claims?.latestSeen();
const scoresOf = (host: Host) => host.match?.current().scores;
const outcomes = (list: ClaimsResolved[] | undefined) =>
  (list ?? []).map((r) => ({
    at: r.at,
    entries: r.entries.map((e) => [e.claim.seat, e.claim.seen, e.outcome]),
  }));

describe("실시간 청구 1층: 방 전체", () => {
  it("늦게 본 판의 정직한 청구는 그 판 기준으로 맞은 청구가 된다", async () => {
    // 방장 → 영희만 100ms(영희 화면이 늦다), 나머지 10ms
    const { clock, host, a, b, troubles, resolved } = await setup((from, to) =>
      from === "host" && to === "b" ? 100 : 10,
    );
    host.match?.submit({ type: "next" });
    await tick(clock, 20);
    expect([boardOf(host), boardOf(a), boardOf(b)]).toEqual([1, 1, 0]);
    // 영희는 아직 0번 판을 보고 0번 판의 맞는 단추를 누른다(1번 판 기준이면 틀린 단추다).
    expect(targetOf(0)).not.toBe(targetOf(1));
    b.claims?.claim({ button: targetOf(0) });
    // 청구 도착(10ms) + 창(50ms) + 발표가 영희에게 닿을 때까지
    await tick(clock, 300);

    const expected = [
      {
        at: 1,
        entries: [[2, 0, { status: "judged", verdict: "hit" }]],
      },
    ];
    expect(outcomes(resolved.host)).toEqual(expected);
    expect(outcomes(resolved.a)).toEqual(expected);
    expect(outcomes(resolved.b)).toEqual(expected);
    expect(scoresOf(host)).toEqual([0, 0, 1]);
    expect(b.match?.current().scores).toEqual([0, 0, 1]);
    expect(troubles).toEqual([]);
  });

  it("방장이 참가자 청구를 빼고 발표하면 다른 참가자가 이의를 낸다", async () => {
    // 방장 기기가 발표에서 철수(1번 자리)의 청구를 뺀다
    const omitSeat1 = (t: Transport): Transport => ({
      ...t,
      send: (message, to) => {
        const m = message as Partial<ClaimsResolved>;
        t.send(
          m.kind === "claims-resolved"
            ? {
                ...m,
                entries: (m.entries ?? []).filter((e) => e.claim.seat !== 1),
              }
            : message,
          to,
        );
      },
    });
    const { clock, host, a, troubles, resolved } = await setup(
      () => 10,
      omitSeat1,
    );
    a.claims?.claim({ button: targetOf(0) });
    host.claims?.claim({ button: targetOf(0) });
    await tick(clock, 200);
    // 영희가 받은 발표에는 방장 청구만 있다. 아직 유예(1초) 안이라 이의는 없다.
    expect(outcomes(resolved.b)).toEqual([
      { at: 0, entries: [[0, 0, { status: "judged", verdict: "hit" }]] },
    ]);
    expect(troubles).toEqual([]);
    await tick(clock, 1_000);
    const omitted = "방장이 1번 자리의 청구(0번 판)를 발표하지 않았다";
    // 영희(직접 받은 증인)와 철수(청구한 본인) 모두 자기 기기가 찾아 알리고, 방장은 그 알림을 받는다.
    expect(troubles.sort()).toEqual(
      [
        `a own ${omitted}`,
        `b own ${omitted}`,
        `b from1 ${omitted}`,
        `a from2 ${omitted}`,
        `host from1 ${omitted}`,
        `host from2 ${omitted}`,
      ].sort(),
    );
  });

  it("창이 지난 옛 판 청구는 모든 기기가 같은 결론(벌칙 없이 버림)을 낸다", async () => {
    // 철수 → 방장만 300ms(청구가 늦게 닿는다), 나머지 10ms
    const { clock, host, a, b, troubles, resolved } = await setup((from, to) =>
      from === "a" && to === "host" ? 300 : 10,
    );
    a.claims?.claim({ button: targetOf(0) });
    await tick(clock, 10);
    host.match?.submit({ type: "next" });
    await tick(clock, 10);
    host.match?.submit({ type: "next" });
    await tick(clock, 500);

    const expected = [
      {
        at: 2,
        entries: [[1, 0, { status: "ignored", reason: "stale" }]],
      },
    ];
    expect(outcomes(resolved.host)).toEqual(expected);
    expect(outcomes(resolved.a)).toEqual(expected);
    expect(outcomes(resolved.b)).toEqual(expected);
    expect(scoresOf(host)).toEqual([0, 0, 0]);
    expect([boardOf(host), boardOf(a), boardOf(b)]).toEqual([2, 2, 2]);
    expect(troubles).toEqual([]);
    // 유예가 지나도 이의가 없다(발표에 들어 있었다).
    await tick(clock, 2_000);
    expect(troubles).toEqual([]);
  });
});
