/**
 * 대결 틀 시험 도구. 실제 시간으로 기다리지 않는다: 모든 전달과 제한 시간이 `ManualClock` 위에서 돈다.
 * - `DelayNet`: 연결마다 지연(ms)을 주는 메모리 그물. 연결 하나 안에서는 순서를 지킨다(WebRTC 데이터 채널처럼).
 *   끊김·다시 연결, 메시지 버리기·바꾸기(`filter`)를 넣을 수 있다.
 * - `sortPuzzle`: 숫자 몇 개를 이웃끼리 바꿔 정렬하는 아주 작은 퍼즐.
 */

import { sha256Hex } from "@game/baseball-engine";
import { type Clock, ManualClock } from "@game/fair-play";
import type { Transport } from "../transport";
import { RaceSession } from "./race-session";
import type { RaceGame, RaceOptions } from "./types";

type Handlers = {
  message: ((m: unknown, from: string) => void)[];
  join: ((id: string) => void)[];
  leave: ((id: string) => void)[];
};

export class DelayNet {
  private readonly peers = new Map<string, Handlers>();
  private readonly down = new Set<string>();
  private readonly lastAt = new Map<string, number>();
  /** `from>to` → 지연(ms). 없으면 `defaultDelay` */
  readonly delays = new Map<string, number>();
  defaultDelay = 20;
  /** 메시지를 바꾸거나(돌려준 값) 버린다(null) */
  filter?: (message: unknown, from: string, to: string) => unknown | null;

  constructor(readonly clock: ManualClock) {}

  setDelay(from: string, to: string, ms: number): void {
    this.delays.set(`${from}>${to}`, ms);
  }

  private deliver(from: string, to: string, fn: () => void): void {
    const key = `${from}>${to}`;
    const delay = this.delays.get(key) ?? this.defaultDelay;
    const at = Math.max(
      this.clock.now() + delay,
      this.lastAt.get(key) ?? Number.NEGATIVE_INFINITY,
    );
    this.lastAt.set(key, at);
    this.clock.after(at - this.clock.now(), fn);
  }

  join(selfId: string): Transport {
    const handlers: Handlers = { message: [], join: [], leave: [] };
    this.peers.set(selfId, handlers);
    return {
      selfId,
      send: (message, to) => {
        if (this.down.has(selfId)) return;
        for (const [id, other] of this.peers) {
          if (id === selfId || (to !== undefined && id !== to)) continue;
          if (this.down.has(id)) continue;
          const copy = JSON.parse(JSON.stringify(message)) as unknown;
          const sent = this.filter ? this.filter(copy, selfId, id) : copy;
          if (sent === null) continue;
          this.deliver(selfId, id, () => {
            // 가는 동안 끊겼으면 사라진다
            if (this.down.has(id) || this.down.has(selfId)) return;
            for (const h of other.message) h(sent, selfId);
          });
        }
      },
      onMessage: (h) => handlers.message.push(h),
      onPeerJoin: (h) => handlers.join.push(h),
      onPeerLeave: (h) => handlers.leave.push(h),
      leave: () => this.peers.delete(selfId),
    };
  }

  /** 연결이 끊긴 것처럼 서로에게 나갔다고 알린다 */
  disconnect(id: string): void {
    if (this.down.has(id)) return;
    this.down.add(id);
    const self = this.peers.get(id) as Handlers;
    for (const [otherId, other] of this.peers) {
      if (otherId === id) continue;
      this.clock.after(0, () => {
        for (const h of other.leave) h(id);
        for (const h of self.leave) h(otherId);
      });
    }
  }

  reconnect(id: string): void {
    if (!this.down.delete(id)) return;
    const self = this.peers.get(id) as Handlers;
    for (const [otherId, other] of this.peers) {
      if (otherId === id || this.down.has(otherId)) continue;
      this.clock.after(0, () => {
        for (const h of other.join) h(id);
        for (const h of self.join) h(otherId);
      });
    }
  }
}

/** 기기마다 시작점이 다른 시계(시계 차이가 판정에 끼지 않는지 보려고). `shift`로 시계를 몰래 돌릴 수도 있다 */
export class OffsetClock implements Clock {
  constructor(
    private readonly base: ManualClock,
    public offset: number,
  ) {}
  now(): number {
    return this.base.now() + this.offset;
  }
  after(ms: number, fn: () => void): () => void {
    return this.base.after(ms, fn);
  }
}

/** 숫자 k개(기본 6)를 섞어 두고, 이웃 두 칸을 바꾸는 수(i ↔ i+1)로 정렬하는 퍼즐 */
export const sortPuzzle: RaceGame<number, number[]> = {
  id: "sort",
  startState(seed, options) {
    const k = (options as { size?: number } | undefined)?.size ?? 6;
    const state = Array.from({ length: k }, (_, i) => i);
    for (let i = k - 1; i > 0; i--) {
      const r = Number.parseInt(sha256Hex(`${seed}|${i}`).slice(0, 8), 16);
      const j = r % (i + 1);
      [state[i], state[j]] = [state[j] as number, state[i] as number];
    }
    if (state.every((v, i) => v === i))
      [state[0], state[1]] = [state[1] as number, state[0] as number];
    return state;
  },
  apply(state, i) {
    if (!Number.isInteger(i) || i < 0 || i >= state.length - 1)
      throw new Error("둘 수 없는 수");
    const next = [...state];
    [next[i], next[i + 1]] = [next[i + 1] as number, next[i] as number];
    return next;
  },
  isSolved: (state) => state.every((v, i) => v === i),
  progress: (state) =>
    state.filter((v, i) => v === i).length / Math.max(1, state.length),
  encodeMove: (m) => String(m),
  decodeMove: (s) => Number(s),
};

/** 거품 정렬로 푸는 수 목록 */
export function bubbleSolution(start: number[]): number[] {
  const s = [...start];
  const moves: number[] = [];
  for (let end = s.length - 1; end > 0; end--)
    for (let i = 0; i < end; i++)
      if ((s[i] as number) > (s[i + 1] as number)) {
        [s[i], s[i + 1]] = [s[i + 1] as number, s[i] as number];
        moves.push(i);
      }
  return moves;
}

export interface Device {
  id: string;
  session: RaceSession<number, number[]>;
  transport: Transport;
  clock: OffsetClock;
}

export const TEST_OPTIONS: RaceOptions = {
  inspectionMs: 1_000,
  timeLimitMs: 20_000,
  capMs: 200,
};

/** n명 판을 만들고 모두 0ms에 시작한다. 아이디는 p1, p2, … 기기 시계는 서로 다른 시작점 */
export function setupRace(
  n: number,
  options: Partial<RaceOptions> = {},
  configure?: (net: DelayNet) => void,
  /** 기기마다 다른 게임(시작 상태를 다르게 만드는 기기 등). 없으면 `sortPuzzle` */
  gameFor?: (id: string) => RaceGame<number, number[]>,
  /** 기기마다 다르게 덮어쓸 설정(설정이 다른 기기) */
  optionsFor?: (id: string) => Partial<RaceOptions>,
): { clock: ManualClock; net: DelayNet; devices: Device[] } {
  const clock = new ManualClock();
  const net = new DelayNet(clock);
  configure?.(net);
  const ids = Array.from({ length: n }, (_, i) => `p${i + 1}`);
  const devices = ids.map((id, idx) => {
    const transport = net.join(id);
    const deviceClock = new OffsetClock(
      clock,
      1_000_000 * (idx + 1) + 37 * idx,
    );
    let counter = 0;
    const session = new RaceSession({
      game: gameFor?.(id) ?? sortPuzzle,
      transport,
      clock: deviceClock,
      race: "r1",
      players: ids,
      options: { ...TEST_OPTIONS, ...options, ...optionsFor?.(id) },
      random: () => `${id}-${counter++}`,
    });
    return { id, session, transport, clock: deviceClock };
  });
  for (const d of devices) d.session.start();
  clock.advance(0);
  return { clock, net, devices };
}

/**
 * 풀림 뒤 `startMs`에 첫 수, 그 뒤 `everyMs`마다 한 수씩 거품 정렬로 푼다.
 * `beforeFirst`는 첫 수 바로 전에 부른다(시계를 몰래 돌리는 시험)
 */
export function autoSolve(
  clock: ManualClock,
  device: Device,
  startMs: number,
  everyMs: number,
  beforeFirst?: () => void,
): { moves: () => number } {
  // 섞기를 다시 정하면(시도 번호가 바뀌면) 새 섞기로 처음부터 다시 푼다
  let startedAttempt = -1;
  let count = 0;
  device.session.onChange((snap) => {
    if (snap.attempt === startedAttempt || snap.phase !== "race") return;
    const attempt = snap.attempt;
    startedAttempt = attempt;
    const moves = bubbleSolution(device.session.startState() as number[]);
    count = moves.length;
    const step = (j: number) => {
      if (device.session.snapshot().attempt !== attempt) return;
      if (j === 0) beforeFirst?.();
      const result = device.session.play(moves[j] as number);
      if (!result.ok) throw new Error(`수가 거절됨: ${result.reason}`);
      if (j + 1 < moves.length) clock.after(everyMs, () => step(j + 1));
    };
    clock.after(startMs, () => step(0));
  });
  return { moves: () => count };
}

/** 조건이 맞을 때까지 시계를 감는다. 상한은 멈춘 시험을 잡는 안전장치 */
export function runUntil(
  clock: ManualClock,
  done: () => boolean,
  limitMs = 120_000,
  stepMs = 10,
): void {
  const end = clock.now() + limitMs;
  while (!done()) {
    if (clock.now() >= end) throw new Error("조건이 맞지 않은 채 시간이 다 감");
    clock.advance(stepMs);
  }
}
