/**
 * E5 속임 시험(docs/43 5절)의 진행. 같은 브라우저 탭끼리 실제 WebRTC로 이어(local-rtc.ts) 방장이 자극을 보내고,
 * 모두가 자극을 그린 프레임부터 누름까지를 rt로 재 청구한다. 확인하는 기기는 아래 경계(claimBound)를
 * 앱 핑 RTT_min과 getStats RTT 두 기준으로 각각 계산해 나란히 남긴다.
 *
 * 속임 설정(주소 해시, 시험용):
 * - `pingDelay=D`: 이 기기가 핑 답만 D ms 늦춘다(막는 길 (a)가 잡나)
 * - `rtCut=D`: 이 기기가 rt를 D ms 깎아 보고한다
 * - `stimDelay=D&stimTo=이름`: 방장이 그 손님에게만 자극을 D ms 늦게 보낸다(막는 길 (b)·(d)가 잡나)
 */
import { realClock } from "@game/fair-play";

import { type ClaimBound, claimBound } from "@/net/claim-bound";
import {
  type LatencyMeter,
  type LatencySummary,
  withLatency,
} from "@/net/latency";
import { performanceClock } from "@/net/monotonic-clock";
import { negotiatedUnordered, rtcSample } from "@/net/rtc-latency";
import type { Transport } from "@/net/transport";

import { joinLocalRtc } from "./local-rtc";

export interface E5Config {
  room: string;
  role: "host" | "guest";
  name: string;
  /** 핑 간격(ms) */
  pingMs: number;
  /** 흔들림 + 그리기 여유(ms) */
  slackMs: number;
  /** 자극을 그린 뒤 저절로 누르기까지(ms). 0이면 사람이 누른다 */
  autoMs: number;
  rounds: number;
  /** 회차 사이 쉬는 시간(이 값 ~ 두 배 사이 무작위, ms) */
  gapMs: number;
  pingDelayMs: number;
  rtCutMs: number;
  stimDelayMs: number;
  stimTo: string | null;
}

export function parseConfig(search: string, hash: string): E5Config {
  const q = new URLSearchParams(search);
  const h = new URLSearchParams(hash.replace(/^#/, ""));
  const num = (params: URLSearchParams, key: string, fallback: number) => {
    const v = Number(params.get(key));
    return Number.isFinite(v) && params.has(key) ? v : fallback;
  };
  const role = q.get("role") === "host" ? "host" : "guest";
  return {
    room: q.get("room") ?? "lab",
    role,
    name: q.get("name") ?? role,
    pingMs: num(q, "ping", 500),
    slackMs: num(q, "slack", 30),
    autoMs: num(q, "auto", 0),
    rounds: num(q, "rounds", 10),
    gapMs: num(q, "gap", 1000),
    pingDelayMs: num(h, "pingDelay", 0),
    rtCutMs: num(h, "rtCut", 0),
    stimDelayMs: num(h, "stimDelay", 0),
    stimTo: h.get("stimTo"),
  };
}

type LabMessage =
  | { lab: "hi"; name: string; role: "host" | "guest" }
  | { lab: "stim"; r: number }
  | { lab: "claim"; r: number; rt: number; name: string };

function isLab(message: unknown): message is LabMessage {
  return typeof message === "object" && message !== null && "lab" in message;
}

export interface CheckRow {
  r: number;
  checker: string;
  claimant: string;
  /** 손님 청구를 방장이 확인 / 방장 청구를 손님이 확인 */
  kind: "guest-claim" | "host-claim";
  elapsedMs: number;
  rtReportedMs: number;
  rttAppMs: number | null;
  rttRtcMs: number | null;
  /** 앱 핑 RTT_min 기준(방장 청구 확인은 RTT 0) */
  app: ClaimBound | null;
  /** getStats RTT 기준(방장 청구 확인은 해당 없음) */
  rtc: ClaimBound | null;
}

export interface OwnClaim {
  r: number;
  rtTrueMs: number;
  rtReportedMs: number;
}

export interface PairResult {
  checker: string;
  claimant: string;
  kind: CheckRow["kind"];
  n: number;
  meanClippedApp: number | null;
  meanClippedRtc: number | null;
}

const mean = (values: number[]) =>
  values.length === 0
    ? null
    : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;

export class E5Session {
  readonly transport: Transport & { meter: LatencyMeter };
  readonly peers = new Map<string, { name: string; role: "host" | "guest" }>();
  readonly rows: CheckRow[] = [];
  readonly own: OwnClaim[] = [];
  private readonly sentAt = new Map<number, number>();
  private readonly receivedAt = new Map<number, number>();
  private readonly waiting = new Map<
    number,
    { from: string; at: number; rt: number }[]
  >();
  private readonly claimed = new Set<number>();
  running = false;
  done = false;

  constructor(
    readonly config: E5Config,
    private readonly onChange: () => void,
    private readonly onStimulus: (r: number) => void,
  ) {
    const rtc = joinLocalRtc(config.room);
    this.transport = withLatency(rtc, {
      clock: realClock,
      mono: performanceClock,
      pingMs: config.pingMs,
      rtcStats: async (peer) => {
        const pc = rtc.connectionOf(peer);
        return pc ? rtcSample(pc) : null;
      },
      unordered: negotiatedUnordered((peer) => rtc.connectionOf(peer)),
      hidden: () => document.visibilityState === "hidden",
      pongDelayMs: config.pingDelayMs,
    });
    this.transport.onPeerJoin((peer) => {
      this.transport.send(
        { lab: "hi", name: config.name, role: config.role },
        peer,
      );
    });
    this.transport.onPeerLeave((peer) => {
      this.peers.delete(peer);
      this.onChange();
    });
    this.transport.onMessage((message, from) => {
      if (isLab(message)) this.receive(message, from);
    });
  }

  private now(): number {
    return performance.now();
  }

  guests(): string[] {
    return [...this.peers]
      .filter(([, p]) => p.role === "guest")
      .map(([id]) => id);
  }

  nameOf(peer: string): string {
    return this.peers.get(peer)?.name ?? peer;
  }

  /** 방장: 모든 손님과 앱 핑 3개·getStats 1개 이상 모였나 */
  ready(): boolean {
    const guests = this.guests();
    return (
      guests.length > 0 &&
      guests.every((g) => {
        const s = this.transport.meter.samples(g);
        return s.app >= 3 && s.rtc >= 1;
      })
    );
  }

  async run(): Promise<void> {
    if (this.running || this.config.role !== "host") return;
    this.running = true;
    for (let r = 1; r <= this.config.rounds; r++) {
      await sleep(this.config.gapMs * (1 + Math.random()));
      this.sendStimulus(r);
      // 모두의 청구를 기다린다(안 오면 5초 뒤 넘어간다)
      const until = this.now() + 5000;
      while (!this.roundComplete(r) && this.now() < until) await sleep(50);
    }
    this.done = true;
    this.onChange();
  }

  private roundComplete(r: number): boolean {
    const claimants = new Set(
      this.rows.filter((row) => row.r === r).map((row) => row.claimant),
    );
    return (
      this.claimed.has(r) &&
      this.guests().every((g) => claimants.has(this.nameOf(g)))
    );
  }

  private sendStimulus(r: number): void {
    this.sentAt.set(r, this.now());
    for (const guest of this.guests()) {
      const delay =
        this.config.stimTo && this.nameOf(guest) === this.config.stimTo
          ? this.config.stimDelayMs
          : 0;
      const send = () => this.transport.send({ lab: "stim", r }, guest);
      if (delay > 0) setTimeout(send, delay);
      else send();
    }
    this.onStimulus(r);
  }

  /** 누름: 그 판을 본 뒤 rt(속임 설정이면 깎은 값)를 모두에게 청구한다 */
  claim(r: number, rtTrueMs: number): void {
    if (this.claimed.has(r)) return;
    this.claimed.add(r);
    const rtReportedMs = rtTrueMs - this.config.rtCutMs;
    this.own.push({ r, rtTrueMs, rtReportedMs });
    this.transport.send({
      lab: "claim",
      r,
      rt: rtReportedMs,
      name: this.config.name,
    });
    this.onChange();
  }

  private receive(message: LabMessage, from: string): void {
    const at = this.now();
    if (message.lab === "hi") {
      this.peers.set(from, { name: message.name, role: message.role });
    } else if (message.lab === "stim") {
      if (this.receivedAt.has(message.r)) return;
      this.receivedAt.set(message.r, at);
      this.transport.meter.noteArrival(`stim:${message.r}`, at);
      this.onStimulus(message.r);
      for (const w of this.waiting.get(message.r) ?? [])
        this.checkHostClaim(message.r, w.from, w.at, w.rt);
      this.waiting.delete(message.r);
    } else if (message.lab === "claim") {
      const sender = this.peers.get(from);
      if (this.config.role === "host" && sender?.role === "guest") {
        const s = this.sentAt.get(message.r);
        if (s === undefined) return;
        const elapsedMs = at - s;
        const rttAppMs = this.transport.meter.rttMin(from, "app");
        const rttRtcMs = this.transport.meter.rttMin(from, "rtc");
        const bound = (rtt: number | null) =>
          rtt === null
            ? null
            : claimBound({
                elapsedMs,
                rttMinMs: rtt,
                rtReportedMs: message.rt,
                slackMs: this.config.slackMs,
              });
        this.rows.push({
          r: message.r,
          checker: this.config.name,
          claimant: message.name,
          kind: "guest-claim",
          elapsedMs,
          rtReportedMs: message.rt,
          rttAppMs,
          rttRtcMs,
          app: bound(rttAppMs),
          rtc: bound(rttRtcMs),
        });
      } else if (this.config.role === "guest" && sender?.role === "host") {
        // 자극보다 방장 청구가 먼저 닿을 수 있다(자극을 늦게 받았을 때). 자극을 받으면 계산한다
        if (this.receivedAt.has(message.r))
          this.checkHostClaim(message.r, from, at, message.rt);
        else {
          const list = this.waiting.get(message.r) ?? [];
          list.push({ from, at, rt: message.rt });
          this.waiting.set(message.r, list);
        }
      }
    }
    this.onChange();
  }

  private checkHostClaim(r: number, from: string, at: number, rt: number) {
    const received = this.receivedAt.get(r) as number;
    const elapsedMs = at - received;
    this.rows.push({
      r,
      checker: this.config.name,
      claimant: this.nameOf(from),
      kind: "host-claim",
      elapsedMs,
      rtReportedMs: rt,
      rttAppMs: null,
      rttRtcMs: null,
      app: claimBound({
        elapsedMs,
        rttMinMs: 0,
        rtReportedMs: rt,
        slackMs: this.config.slackMs,
      }),
      rtc: null,
    });
  }

  results(): PairResult[] {
    const groups = new Map<string, CheckRow[]>();
    for (const row of this.rows) {
      const key = `${row.checker}>${row.claimant}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.values()].map((rows) => {
      const first = rows[0] as CheckRow;
      return {
        checker: first.checker,
        claimant: first.claimant,
        kind: first.kind,
        n: rows.length,
        meanClippedApp: mean(
          rows.flatMap((r) => (r.app ? [r.app.clippedMs] : [])),
        ),
        meanClippedRtc: mean(
          rows.flatMap((r) => (r.rtc ? [r.rtc.clippedMs] : [])),
        ),
      };
    });
  }

  /** 다른 기기와 같은 자극을 받은 시각 차이 평균(내 − 상대) */
  skews(): { peer: string; n: number; meanMs: number | null }[] {
    return [...this.peers.keys()].map((peer) => {
      const values = this.transport.meter.skews(peer);
      return {
        peer: this.nameOf(peer),
        n: values.length,
        meanMs: mean(values),
      };
    });
  }

  snapshot(): {
    config: E5Config;
    self: string;
    peers: Record<string, { name: string; role: string }>;
    rows: CheckRow[];
    own: OwnClaim[];
    results: PairResult[];
    skews: ReturnType<E5Session["skews"]>;
    latency: LatencySummary;
    done: boolean;
  } {
    return {
      config: this.config,
      self: this.transport.selfId,
      peers: Object.fromEntries(this.peers),
      rows: this.rows,
      own: this.own,
      results: this.results(),
      skews: this.skews(),
      latency: this.transport.meter.summary(),
      done: this.done,
    };
  }

  leave(): void {
    this.transport.leave();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
