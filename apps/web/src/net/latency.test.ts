import { ManualClock } from "@game/fair-play";
import { describe, expect, it } from "vitest";

import {
  distribution,
  LATENCY_PROBE,
  type LatencyMessage,
  LatencyMeter,
  type LatencyOptions,
  type UnorderedLink,
  withLatency,
} from "./latency";
import type { Transport } from "./transport";

/**
 * 시험용 망: 기기 사이 편도 지연을 쌍마다 정하고, 전달을 `ManualClock.after`로 건다.
 * 기기마다 단조 시계 시작점이 달라(origin) 시계 차이도 흉내 낸다.
 */
function delayedNet(
  clock: ManualClock,
  delay: (from: string, to: string, n: number) => number,
) {
  const inbox = new Map<string, (message: unknown, from: string) => void>();
  let n = 0;
  const deliver = (from: string, to: string, message: unknown) => {
    const copy = JSON.parse(JSON.stringify(message)) as unknown;
    clock.after(delay(from, to, n++), () => inbox.get(to)?.(copy, from));
  };
  return {
    on(id: string, handler: (message: unknown, from: string) => void) {
      inbox.set(id, handler);
    },
    send(from: string, message: unknown, to?: string) {
      for (const id of inbox.keys())
        if (id !== from && (to === undefined || id === to))
          deliver(from, id, message);
    },
  };
}

type Net = ReturnType<typeof delayedNet>;

function device(
  net: Net,
  clock: ManualClock,
  id: string,
  origin: number,
  extra: Partial<Omit<LatencyOptions, "send" | "clock" | "mono">> = {},
): LatencyMeter {
  let nonce = 0;
  const meter = new LatencyMeter({
    send: (message, to) => net.send(id, message, to),
    clock,
    mono: { now: () => clock.now() + origin },
    pingMs: 1000,
    nonce: () => `${id}${nonce++}`,
    ...extra,
  });
  net.on(id, (message, from) => meter.handle(message, from));
  return meter;
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe("distribution: 가장 가까운 순위 백분위", () => {
  it.each([
    [[], { n: 0, min: null, p50: null, p95: null }],
    [[5], { n: 1, min: 5, p50: 5, p95: 5 }],
    [[4, 1, 3, 2], { n: 4, min: 1, p50: 2, p95: 4 }],
    [
      Array.from({ length: 100 }, (_, i) => i + 1),
      { n: 100, min: 1, p50: 50, p95: 95, p99: 99, max: 100 },
    ],
  ])("%j", (values, expected) => {
    expect(distribution(values)).toMatchObject(expected);
  });
});

describe("LatencyMeter: 쌍별 앱 핑", () => {
  it("편도 20ms씩이면 RTT 40, 시계 차이는 정확히 시작점 차이", () => {
    const clock = new ManualClock();
    const net = delayedNet(clock, () => 20);
    const a = device(net, clock, "a", 1000);
    const b = device(net, clock, "b", 50_000);
    a.addPeer("b");
    b.addPeer("a");
    clock.advance(1000 * 5 + 100);
    const s = a.summary().pairs[0];
    expect(s?.peer).toBe("b");
    expect(s?.app).toMatchObject({ n: 5, min: 40, p95: 40, jitter: 0 });
    expect(s?.app.lost).toBe(0);
    expect(s?.offsetMs).toBe(49_000);
    expect(s?.unordered).toBeNull();
  });

  it("한 번 튄 핑은 튐 비율과 p99에 보이고 min은 그대로", () => {
    const clock = new ManualClock();
    // 세 번째 메시지(a의 첫 핑에 b가 보낸 답)만 300ms 늦다
    const net = delayedNet(clock, (_f, _t, n) => (n === 2 ? 300 : 10));
    const a = device(net, clock, "a", 0);
    device(net, clock, "b", 0).addPeer("a");
    a.addPeer("b");
    clock.advance(4500);
    const app = a.summary().pairs[0]?.app;
    expect(app?.min).toBe(20);
    expect(app?.max).toBe(310);
    expect(app?.spikeRate).toBe(0.25);
  });

  it("답이 오지 않으면 잃은 핑으로 센다", () => {
    const clock = new ManualClock();
    const net = delayedNet(clock, () => 10);
    const a = device(net, clock, "a", 0);
    a.addPeer("ghost");
    clock.advance(3500);
    expect(a.summary().pairs[0]?.app).toMatchObject({ sent: 3, lost: 3, n: 0 });
  });

  it("숨긴 탭이면 핑을 보내지 않는다", () => {
    const clock = new ManualClock();
    const net = delayedNet(clock, () => 10);
    let hidden = true;
    const a = device(net, clock, "a", 0, { hidden: () => hidden });
    device(net, clock, "b", 0).addPeer("a");
    a.addPeer("b");
    clock.advance(3500);
    expect(a.summary().pairs[0]?.app.sent).toBe(0);
    hidden = false;
    clock.advance(1000);
    expect(a.summary().pairs[0]?.app.sent).toBe(1);
  });
});

describe("LatencyMeter: getStats와 핑 늦추기(docs/43 1-2 막는 길 (a))", () => {
  it("핑 답만 100ms 늦춘 상대는 앱 핑 min이 getStats min보다 100 크다", async () => {
    const clock = new ManualClock();
    const net = delayedNet(clock, () => 20);
    const a = device(net, clock, "a", 0, {
      rtcStats: async () => ({ rttMs: 40, path: "host-host" }),
    });
    device(net, clock, "b", 0, { pongDelayMs: 100 }).addPeer("a");
    a.addPeer("b");
    for (let i = 0; i < 3; i++) {
      clock.advance(1000);
      await flush();
    }
    clock.advance(500);
    expect(a.rttMin("b", "app")).toBe(140);
    expect(a.rttMin("b", "rtc")).toBe(40);
    const s = a.summary().pairs[0];
    expect(s?.appMinusRtcMin).toBe(100);
    expect(s?.rtc).toMatchObject({ n: 3, min: 40, path: "host-host" });
  });
});

describe("LatencyMeter: 순서 없는 채널", () => {
  it("같은 핑을 두 통로로 보내 나란히 잰다", () => {
    const clock = new ManualClock();
    const net = delayedNet(clock, () => 30);
    // 순서 없는 통로는 10ms
    const links = new Map<string, (m: unknown, from: string) => void>();
    const link = (self: string): UnorderedLink => ({
      open: () => undefined,
      close: () => undefined,
      send: (peer, message) => {
        const copy = JSON.parse(JSON.stringify(message)) as unknown;
        clock.after(10, () => links.get(peer)?.(copy, self));
        return true;
      },
      onMessage: (h) => links.set(self, h),
    });
    const a = device(net, clock, "a", 0, { unordered: link("a") });
    device(net, clock, "b", 0, { unordered: link("b") }).addPeer("a");
    a.addPeer("b");
    clock.advance(2500);
    const s = a.summary().pairs[0];
    expect(s?.app.min).toBe(60);
    expect(s?.unordered).toMatchObject({ n: 2, min: 20, lost: 0 });
  });
});

describe("LatencyMeter: 손님끼리 같은 알림을 받은 시각(docs/43 1-2 막는 길 (b))", () => {
  // 방장 h → 손님 a 10ms, h → b 30ms, a ↔ b 15ms(대칭)
  const oneWay = (from: string, to: string) => {
    const key = [from, to].sort().join("");
    return key === "ah" ? 10 : key === "bh" ? 30 : 15;
  };

  async function run(beaconDelayMs?: (peer: string) => number) {
    const clock = new ManualClock();
    const net = delayedNet(clock, oneWay);
    const h = device(net, clock, "h", 0, {
      beacon: true,
      ...(beaconDelayMs ? { beaconDelayMs } : {}),
    });
    const a = device(net, clock, "a", 7_000);
    const b = device(net, clock, "b", 123_000);
    for (const [m, peers] of [
      [h, ["a", "b"]],
      [a, ["h", "b"]],
      [b, ["h", "a"]],
    ] as const)
      for (const p of peers) m.addPeer(p);
    clock.advance(1000 * 4 + 500);
    return { a, b };
  }

  it("정직하면 차이는 두 편도의 차이(10 − 30 = −20)", async () => {
    const { a, b } = await run();
    // 첫 알림은 시계 차이를 아직 모를 때 와서 버려진다
    expect(a.skews("b").every((v) => v === -20)).toBe(true);
    expect(a.skews("b").length).toBeGreaterThan(0);
    expect(b.skews("a").every((v) => v === 20)).toBe(true);
  });

  it("방장이 a에게만 100ms 늦게 보내면 차이가 +80으로 벌어진다", async () => {
    const { a } = await run((peer) => (peer === "a" ? 100 : 0));
    expect(a.skews("b").length).toBeGreaterThan(0);
    expect(a.skews("b").every((v) => v === 80)).toBe(true);
    expect(
      a.summary().pairs.find((p) => p.peer === "b")?.beaconSkew,
    ).toMatchObject({ min: 80, absP95: 80 });
  });
});

describe("withLatency: 방 통로에 붙이기", () => {
  function fakeTransport(selfId: string) {
    const msg: ((m: unknown, from: string) => void)[] = [];
    const join: ((p: string) => void)[] = [];
    const sent: { message: unknown; to?: string }[] = [];
    let left = false;
    const transport: Transport = {
      selfId,
      send: (message, to) => sent.push({ message, ...(to ? { to } : {}) }),
      onMessage: (h) => msg.push(h),
      onPeerJoin: (h) => join.push(h),
      onPeerLeave: () => undefined,
      leave: () => {
        left = true;
      },
    };
    return {
      transport,
      sent,
      left: () => left,
      receive: (m: unknown, from: string) => {
        for (const h of msg) h(m, from);
      },
      join: (p: string) => {
        for (const h of join) h(p);
      },
    };
  }

  it("측정 메시지는 걸러 내고 방 메시지는 받은 차례 그대로 넘긴다", () => {
    const clock = new ManualClock();
    const inner = fakeTransport("me");
    const reports: unknown[] = [];
    const wrapped = withLatency(inner.transport, {
      clock,
      mono: { now: () => clock.now() },
      pingMs: 1000,
      report: (s) => reports.push(s),
    });
    const got: unknown[] = [];
    wrapped.onMessage((m) => got.push(m));
    inner.join("host");
    inner.receive({ t: "deal", n: 1 }, "host");
    inner.receive({ lat: 1, t: "ping", n: 0, r: "x", ch: "o" }, "host");
    inner.receive({ t: "deal", n: 2 }, "host");
    expect(got).toEqual([
      { t: "deal", n: 1 },
      { t: "deal", n: 2 },
    ]);
    // 핑에는 바로 답했다
    const pong = inner.sent[0]?.message as LatencyMessage;
    expect(pong).toMatchObject({ lat: 1, t: "pong", n: 0, r: "x" });
    expect(inner.sent[0]?.to).toBe("host");
    // 방 메시지는 그대로 나간다
    wrapped.send({ t: "act" }, "host");
    expect(inner.sent[1]).toEqual({ message: { t: "act" }, to: "host" });

    clock.advance(1000);
    expect(inner.sent[2]?.message).toMatchObject({ lat: 1, t: "ping" });
    wrapped.leave();
    expect(inner.left()).toBe(true);
    expect(reports).toHaveLength(1);
    // 멈춘 뒤에는 핑을 보내지 않는다
    const count = inner.sent.length;
    clock.advance(5000);
    expect(inner.sent.length).toBe(count);
    expect(clock.pending()).toBe(0);
  });

  it("요약은 10분마다 낸다(진단 서버 용량을 아끼려고 드물게)", () => {
    expect(LATENCY_PROBE.reportMs).toBe(600_000);
    const clock = new ManualClock();
    const inner = fakeTransport("me");
    const reports: unknown[] = [];
    withLatency(inner.transport, {
      clock,
      mono: { now: () => clock.now() },
      pingMs: LATENCY_PROBE.pingMs,
      reportMs: LATENCY_PROBE.reportMs,
      report: (s) => reports.push(s),
    });
    inner.join("host");
    clock.advance(LATENCY_PROBE.reportMs - 1);
    expect(reports).toHaveLength(0);
    clock.advance(1);
    expect(reports).toHaveLength(1);
    clock.advance(LATENCY_PROBE.reportMs);
    expect(reports).toHaveLength(2);
  });

  it("숨긴 탭이면 정기 요약을 건너뛰고, 방을 나갈 때 마지막 요약은 낸다", () => {
    const clock = new ManualClock();
    const inner = fakeTransport("me");
    const reports: unknown[] = [];
    let hidden = true;
    const wrapped = withLatency(inner.transport, {
      clock,
      mono: { now: () => clock.now() },
      pingMs: 1000,
      reportMs: 600_000,
      report: (s) => reports.push(s),
      hidden: () => hidden,
    });
    inner.join("host");
    clock.advance(1_200_000);
    expect(reports).toHaveLength(0);
    hidden = false;
    clock.advance(600_000);
    expect(reports).toHaveLength(1);
    hidden = true;
    wrapped.leave();
    expect(reports).toHaveLength(2);
  });
});

describe("요약 한 번의 크기", () => {
  it("쌍마다 숫자 요약만 가고 표본 배열은 가지 않는다(진단 기록 하나 1KB 안쪽)", async () => {
    const clock = new ManualClock();
    const net = delayedNet(clock, (_f, _t, n) => 20 + (n % 7));
    const links = new Map<string, (m: unknown, from: string) => void>();
    const link = (self: string): UnorderedLink => ({
      open: () => undefined,
      close: () => undefined,
      send: (peer, message) => {
        const copy = JSON.parse(JSON.stringify(message)) as unknown;
        clock.after(12, () => links.get(peer)?.(copy, self));
        return true;
      },
      onMessage: (h) => links.set(self, h),
    });
    // trystero 연결 id 길이(20자)
    const hostId = "Xq3vT9bLm2Rk7WpZc4Ds";
    const guestId = "Yh8nF1sKe6Ju0GtAo5Vb";
    const h = device(net, clock, hostId, 0, {
      beacon: true,
      unordered: link(hostId),
      rtcStats: async () => ({ rttMs: 41.234, path: "srflx-relay" }),
    });
    const g = device(net, clock, guestId, 98_765.4321, {
      unordered: link(guestId),
    });
    h.addPeer(guestId);
    g.addPeer(hostId);
    // 10분 동안 5초 간격 핑이면 표본 120개쯤
    for (let i = 0; i < 120; i++) {
      clock.advance(1000);
      await flush();
    }
    clock.advance(500);
    const summary = h.summary();
    const pair = summary.pairs[0];
    expect(pair?.app.n).toBeGreaterThanOrEqual(100);
    expect(pair?.unordered?.n).toBeGreaterThanOrEqual(100);
    // 배열은 하나도 없다
    const arrays = JSON.stringify(pair).match(/\[/g) ?? [];
    expect(arrays).toHaveLength(0);
    // diag.ts가 붙이는 머리(세션 id·방 태그·시각·종류)까지 더한 진단 기록 하나
    const event = {
      s: "3f2a9c1e-5b7d-4e8f-a1b2-c3d4e5f60718",
      room: "a1b2c3d4e5f6",
      at: "2026-11-03T12:34:56.789Z",
      t: 600_123,
      kind: "latency",
      elapsedMs: summary.elapsedMs,
      ...pair,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(event)).length;
    expect(bytes).toBeLessThan(1024);
  });
});
