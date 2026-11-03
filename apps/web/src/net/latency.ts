/**
 * 쌍별 지연 측정(docs/43 4-1 `net/latency.ts`, 5절 E2). 방에 있는 동안 상대마다 드물게 앱 핑을 보내
 * RTT 분포를 모으고, 같은 쌍의 `getStats` RTT(`currentRoundTripTime`)와 경로를 나란히 적는다.
 * 순서 없는 데이터 채널이 있으면 같은 핑을 그쪽으로도 보내 앞 막힘을 비교한다.
 * 같은 "알림"(방장의 신호)을 손님마다 받은 시각을 서로 직접 알려 차이도 잰다(docs/43 1-2 막는 길 (b)).
 *
 * - 시간 재기는 `MonotonicClock`(제품 `performance.now`), 일정(다음 핑·요약)은 `Clock.after`로 넣는다.
 *   시험은 `ManualMonotonic` + `ManualClock`으로 결정적으로 돈다.
 * - 숨긴 탭이면 핑을 보내지 않는다(`hidden()`).
 * - 메시지는 `{ lat: 1, … }` 모양이라 방 메시지와 섞이지 않는다(`isLatencyMessage`). `withLatency`가 방 코드에
 *   닿기 전에 걸러 낸다.
 */
import type { Clock } from "@game/fair-play";

import type { MonotonicClock } from "./monotonic-clock";
import type { Transport } from "./transport";

/** 실제 방에 붙일지와 주기. 끄려면 `enabled: false` 하나만 바꾼다 */
export const LATENCY_PROBE = {
  enabled: true,
  /** 핑 간격(ms). 메시지가 작아도 게임 통로를 쓰므로 드물게 */
  pingMs: 5000,
  /** 요약을 진단 기록으로 보내는 간격(ms) */
  reportMs: 60_000,
} as const;

/** 답이 이보다 늦으면 잃은 핑으로 센다 */
const LOST_MS = 10_000;
/** 앱 핑 RTT가 그 쌍의 최소보다 이만큼 넘으면 "튐" */
export const SPIKE_MS = 200;
/** 쌍마다 남기는 표본 수 상한(5초 간격이면 약 4시간) */
const MAX_SAMPLES = 3000;

export type LatencyChannel = "o" | "u";

export type LatencyMessage =
  | { lat: 1; t: "ping"; n: number; r: string; ch: LatencyChannel }
  | {
      lat: 1;
      t: "pong";
      n: number;
      r: string;
      ch: LatencyChannel;
      /** 답한 기기의 단조 시계(시계 차이 추정용) */
      at: number;
    }
  /** 알림: 받은 기기마다 받은 시각을 남긴다 */
  | { lat: 1; t: "beacon"; k: string }
  /** 내가 그 알림을 받은 시각(내 단조 시계) */
  | { lat: 1; t: "seen"; k: string; at: number };

export function isLatencyMessage(message: unknown): message is LatencyMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { lat?: unknown }).lat === 1
  );
}

/** 브라우저가 전송 계층에서 잰 RTT와 경로(host/srflx/relay) */
export interface RtcSample {
  rttMs: number | null;
  path: string | null;
}

/** 순서 없는 채널(ordered:false, maxRetransmits:0). 없으면 앱 핑만 잰다 */
export interface UnorderedLink {
  /** 그 상대와의 채널을 연다(이미 열려 있으면 그대로) */
  open(peerId: string): void;
  /** 보냈으면 true(채널이 아직 안 열렸으면 false) */
  send(peerId: string, message: LatencyMessage): boolean;
  onMessage(handler: (message: unknown, from: string) => void): void;
  close(peerId: string): void;
}

export interface LatencyOptions {
  send(message: LatencyMessage, to?: string): void;
  clock: Clock;
  mono: MonotonicClock;
  pingMs?: number;
  /** 요약을 내는 간격. 0이면 저절로 내지 않는다 */
  reportMs?: number;
  report?(summary: LatencySummary): void;
  rtcStats?(peerId: string): Promise<RtcSample | null>;
  unordered?: UnorderedLink;
  hidden?(): boolean;
  /** 이 기기가 알림을 보내나(방장). 받은 쪽은 받은 시각을 다른 기기에 알린다 */
  beacon?: boolean;
  nonce?(): string;
  /** 속임 시험(docs/43 5절 E5): 핑 답만 이만큼 늦춘다 */
  pongDelayMs?: number;
  /** 속임 시험: 알림을 이 상대에게만 이만큼 늦게 보낸다 */
  beaconDelayMs?(peerId: string): number;
}

export interface Distribution {
  n: number;
  min: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
}

export interface PairSummary {
  peer: string;
  /** 순서 보장 통로(게임 메시지와 같은 통로) 앱 핑 RTT */
  app: Distribution & {
    /** 흔들림 여유 = p95 − min */
    jitter: number | null;
    /** min보다 SPIKE_MS 넘게 늦은 비율 */
    spikeRate: number | null;
    sent: number;
    lost: number;
  };
  /** 순서 없는 채널 앱 핑. 채널이 없으면 null */
  unordered: (Distribution & { sent: number; lost: number }) | null;
  /** getStats `currentRoundTripTime` */
  rtc: Distribution & { path: string | null };
  /** 앱 핑 min − getStats min(앱·JS 처리 몫. 크게 벌어지면 핑 늦추기 의심) */
  appMinusRtcMin: number | null;
  /** 같은 알림을 내가 받은 시각 − 이 상대가 받은 시각(시계 차이를 핑으로 맞춘 값) */
  beaconSkew: Distribution & { absP95: number | null };
  /** 이 상대 시계 − 내 시계 추정(가장 짧은 왕복 표본) */
  offsetMs: number | null;
}

export interface LatencySummary {
  /** 측정을 시작한 뒤 지난 시간(ms) */
  elapsedMs: number;
  pairs: PairSummary[];
}

interface Pending {
  sentAt: number;
}

interface Pair {
  app: number[];
  unordered: number[];
  rtc: number[];
  path: string | null;
  skew: number[];
  sent: Record<LatencyChannel, number>;
  received: Record<LatencyChannel, number>;
  /** 가장 짧은 왕복과 그때의 시계 차이 */
  bestRtt: number;
  offset: number | null;
}

export function distribution(values: readonly number[]): Distribution {
  if (values.length === 0)
    return { n: 0, min: null, p50: null, p95: null, p99: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  // 가장 가까운 순위(nearest-rank) 백분위
  const at = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ??
    null;
  return {
    n: sorted.length,
    min: sorted[0] ?? null,
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    max: sorted[sorted.length - 1] ?? null,
  };
}

const round = (value: number | null) =>
  value === null ? null : Math.round(value * 10) / 10;

function roundDist<T extends Distribution>(d: T): T {
  return {
    ...d,
    min: round(d.min),
    p50: round(d.p50),
    p95: round(d.p95),
    p99: round(d.p99),
    max: round(d.max),
  };
}

function push(list: number[], value: number): void {
  list.push(value);
  if (list.length > MAX_SAMPLES) list.shift();
}

function defaultNonce(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class LatencyMeter {
  private readonly pairs = new Map<string, Pair>();
  private readonly pending = new Map<string, Pending>();
  /** 알림 열쇠 → 내가 받은 시각 */
  private readonly arrivals = new Map<string, number>();
  /** 알림 열쇠 → (상대 → 상대가 받은 시각, 상대 시계) */
  private readonly theirArrivals = new Map<string, Map<string, number>>();
  private seq = 0;
  private beaconSeq = 0;
  private readonly started: number;
  private stopTick: (() => void) | null = null;
  private stopReport: (() => void) | null = null;
  private stopped = false;

  constructor(private readonly options: LatencyOptions) {
    this.started = options.mono.now();
    options.unordered?.onMessage((message, from) => {
      if (isLatencyMessage(message)) this.handle(message, from);
    });
    this.scheduleTick();
    const reportMs = options.reportMs ?? 0;
    if (reportMs > 0 && options.report) this.scheduleReport(reportMs);
  }

  addPeer(peerId: string): void {
    if (this.stopped || this.pairs.has(peerId)) return;
    this.pairs.set(peerId, {
      app: [],
      unordered: [],
      rtc: [],
      path: null,
      skew: [],
      sent: { o: 0, u: 0 },
      received: { o: 0, u: 0 },
      bestRtt: Number.POSITIVE_INFINITY,
      offset: null,
    });
    this.options.unordered?.open(peerId);
  }

  removePeer(peerId: string): void {
    this.pairs.delete(peerId);
    this.options.unordered?.close(peerId);
  }

  peers(): string[] {
    return [...this.pairs.keys()];
  }

  /** 측정 메시지면 처리하고 true */
  handle(message: unknown, from: string): boolean {
    if (!isLatencyMessage(message)) return false;
    if (this.stopped) return true;
    const now = this.options.mono.now();
    switch (message.t) {
      case "ping": {
        const reply = () => {
          const pong: LatencyMessage = {
            lat: 1,
            t: "pong",
            n: message.n,
            r: message.r,
            ch: message.ch,
            at: this.options.mono.now(),
          };
          if (message.ch === "u") this.options.unordered?.send(from, pong);
          else this.options.send(pong, from);
        };
        const delay = this.options.pongDelayMs ?? 0;
        if (delay > 0) this.options.clock.after(delay, reply);
        else reply();
        break;
      }
      case "pong": {
        const key = `${from}:${message.ch}:${message.n}:${message.r}`;
        const sent = this.pending.get(key);
        const pair = this.pairs.get(from);
        if (!sent || !pair) break;
        this.pending.delete(key);
        const rtt = now - sent.sentAt;
        pair.received[message.ch]++;
        push(message.ch === "u" ? pair.unordered : pair.app, rtt);
        if (rtt < pair.bestRtt) {
          pair.bestRtt = rtt;
          // Cristian: 상대가 답한 순간은 내 시계로 보낸 시각 + 왕복의 절반쯤
          pair.offset = message.at - (sent.sentAt + rtt / 2);
        }
        break;
      }
      case "beacon":
        this.noteArrival(message.k, now);
        break;
      case "seen": {
        let theirs = this.theirArrivals.get(message.k);
        if (!theirs) {
          theirs = new Map();
          this.theirArrivals.set(message.k, theirs);
        }
        theirs.set(from, message.at);
        this.compareArrivals(message.k);
        break;
      }
    }
    return true;
  }

  /**
   * 알림을 받은 시각을 남기고 다른 기기에 알린다. 측정 화면은 자기 자극 메시지를 받은 시각을 이것으로 넣는다
   * (`key`는 보낸 기기와 회차로 만들어 겹치지 않게)
   */
  noteArrival(key: string, at = this.options.mono.now()): void {
    if (this.stopped || this.arrivals.has(key)) return;
    this.arrivals.set(key, at);
    // 오래된 열쇠는 버린다
    if (this.arrivals.size > 200) {
      const first = this.arrivals.keys().next().value as string;
      this.arrivals.delete(first);
      this.theirArrivals.delete(first);
    }
    this.options.send({ lat: 1, t: "seen", k: key, at });
    this.compareArrivals(key);
  }

  private compareArrivals(key: string): void {
    const mine = this.arrivals.get(key);
    const theirs = this.theirArrivals.get(key);
    if (mine === undefined || !theirs) return;
    for (const [peer, at] of theirs) {
      const pair = this.pairs.get(peer);
      if (!pair || pair.offset === null) continue;
      // 상대 시각을 내 시계로 옮긴다: 상대 시계 − offset
      push(pair.skew, mine - (at - pair.offset));
      theirs.delete(peer);
    }
  }

  /** 알림을 모두에게 보낸다(방장). 속임 시험이면 상대마다 늦출 수 있다 */
  sendBeacon(key = `b${this.beaconSeq++}`): string {
    const message: LatencyMessage = { lat: 1, t: "beacon", k: key };
    const delayOf = this.options.beaconDelayMs;
    if (!delayOf) this.options.send(message);
    else
      for (const peer of this.pairs.keys()) {
        const delay = delayOf(peer);
        if (delay > 0)
          this.options.clock.after(delay, () =>
            this.options.send(message, peer),
          );
        else this.options.send(message, peer);
      }
    return key;
  }

  /** 한 번 잰다: 상대마다 핑(두 통로)과 getStats. 시험·측정 화면이 직접 부를 수도 있다 */
  tick(): void {
    if (this.stopped || this.options.hidden?.()) return;
    const now = this.options.mono.now();
    for (const [key, p] of this.pending)
      if (now - p.sentAt > LOST_MS) this.pending.delete(key);
    for (const [peer, pair] of this.pairs) {
      for (const ch of ["o", "u"] as const) {
        if (ch === "u" && !this.options.unordered) continue;
        const n = this.seq++;
        const r = (this.options.nonce ?? defaultNonce)();
        const ping: LatencyMessage = { lat: 1, t: "ping", n, r, ch };
        const sentAt = this.options.mono.now();
        if (ch === "u") {
          if (!this.options.unordered?.send(peer, ping)) continue;
        } else this.options.send(ping, peer);
        pair.sent[ch]++;
        this.pending.set(`${peer}:${ch}:${n}:${r}`, { sentAt });
      }
      const stats = this.options.rtcStats;
      if (stats)
        void stats(peer).then(
          (sample) => {
            if (!sample || this.pairs.get(peer) !== pair) return;
            if (sample.rttMs !== null) push(pair.rtc, sample.rttMs);
            if (sample.path) pair.path = sample.path;
          },
          () => undefined,
        );
    }
    if (this.options.beacon) this.sendBeacon();
  }

  private scheduleTick(): void {
    const ms = this.options.pingMs ?? LATENCY_PROBE.pingMs;
    this.stopTick = this.options.clock.after(ms, () => {
      this.tick();
      if (!this.stopped) this.scheduleTick();
    });
  }

  private scheduleReport(ms: number): void {
    this.stopReport = this.options.clock.after(ms, () => {
      this.options.report?.(this.summary());
      if (!this.stopped) this.scheduleReport(ms);
    });
  }

  /** 그 상대와의 RTT 최소(앱 핑 / getStats). 아직 표본이 없으면 null */
  rttMin(peerId: string, source: "app" | "rtc"): number | null {
    const pair = this.pairs.get(peerId);
    if (!pair) return null;
    const list = source === "app" ? pair.app : pair.rtc;
    return list.length === 0 ? null : Math.min(...list);
  }

  /** 그 상대와의 표본 수 */
  samples(peerId: string): { app: number; rtc: number; unordered: number } {
    const pair = this.pairs.get(peerId);
    return {
      app: pair?.app.length ?? 0,
      rtc: pair?.rtc.length ?? 0,
      unordered: pair?.unordered.length ?? 0,
    };
  }

  /** 같은 알림을 받은 시각 차이(내 − 상대) 표본 */
  skews(peerId: string): number[] {
    return [...(this.pairs.get(peerId)?.skew ?? [])];
  }

  summary(): LatencySummary {
    const pairs: PairSummary[] = [];
    for (const [peer, pair] of this.pairs) {
      const app = distribution(pair.app);
      const rtc = distribution(pair.rtc);
      const skew = distribution(pair.skew);
      const spikes =
        app.min === null
          ? null
          : pair.app.filter((v) => v - (app.min as number) > SPIKE_MS).length /
            pair.app.length;
      pairs.push({
        peer,
        app: {
          ...roundDist(app),
          jitter:
            app.p95 === null || app.min === null
              ? null
              : round(app.p95 - app.min),
          spikeRate: spikes === null ? null : round(spikes * 100) / 100,
          sent: pair.sent.o,
          lost: pair.sent.o - pair.received.o,
        },
        unordered: this.options.unordered
          ? {
              ...roundDist(distribution(pair.unordered)),
              sent: pair.sent.u,
              lost: pair.sent.u - pair.received.u,
            }
          : null,
        rtc: { ...roundDist(rtc), path: pair.path },
        appMinusRtcMin:
          app.min === null || rtc.min === null
            ? null
            : round(app.min - rtc.min),
        beaconSkew: {
          ...roundDist(skew),
          absP95: round(distribution(pair.skew.map(Math.abs)).p95),
        },
        offsetMs: round(pair.offset),
      });
    }
    return {
      elapsedMs: Math.round(this.options.mono.now() - this.started),
      pairs,
    };
  }

  /** 멈추고 마지막 요약을 낸다 */
  stop(): void {
    if (this.stopped) return;
    if (this.options.report && this.pairs.size > 0)
      this.options.report(this.summary());
    this.stopped = true;
    this.stopTick?.();
    this.stopReport?.();
    for (const peer of this.pairs.keys()) this.options.unordered?.close(peer);
  }
}

/**
 * 통로를 감싸 측정기를 붙인다. 측정 메시지는 여기서 걸러 방 코드(HostRoom·GuestRoom)에 닿지 않고,
 * 방 메시지는 받은 차례 그대로 넘긴다. `leave` 때 마지막 요약을 낸다.
 */
export function withLatency(
  inner: Transport,
  options: Omit<LatencyOptions, "send">,
): Transport & { meter: LatencyMeter } {
  const meter = new LatencyMeter({
    ...options,
    send: (message, to) => inner.send(message, to),
  });
  const handlers: ((message: unknown, from: string) => void)[] = [];
  inner.onMessage((message, from) => {
    if (meter.handle(message, from)) return;
    for (const h of handlers) h(message, from);
  });
  inner.onPeerJoin((peer) => meter.addPeer(peer));
  inner.onPeerLeave((peer) => meter.removePeer(peer));
  return {
    selfId: inner.selfId,
    send: (message, to) => inner.send(message, to),
    onMessage: (h) => handlers.push(h),
    onPeerJoin: (h) => inner.onPeerJoin(h),
    onPeerLeave: (h) => inner.onPeerLeave(h),
    leave: () => {
      meter.stop();
      inner.leave();
    },
    ...(inner.fingerprints
      ? {
          fingerprints: (peer: string) =>
            inner.fingerprints?.(peer) ?? Promise.resolve(null),
        }
      : {}),
    meter,
  };
}
