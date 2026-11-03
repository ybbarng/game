import type { Clock } from "@game/fair-play";

import type { Transport } from "./transport";

/**
 * 보낸 기기 `from`에서 받는 기기 `to`로 가는 `n`번째 메시지(그 쌍에서 0부터)의 지연(ms).
 * 시험이 정한다: 고정, 비대칭(쌍마다 다르게), 특정 메시지만 늦추기(`message` 모양을 보고)
 */
export type DelayFn = (
  from: string,
  to: string,
  n: number,
  message: unknown,
) => number;

type Handlers = {
  message: ((message: unknown, from: string) => void)[];
  join: ((peerId: string) => void)[];
  leave: ((peerId: string) => void)[];
};

/**
 * 시험용 지연 망(docs/31 8절, docs/43 4-1). `MemoryNetwork`와 같은 `Transport`를 주되, 메시지를
 * `clock.after(delay(from, to, n, message), …)`로 전달한다. 시험은 `ManualClock`을 넣어 `advance`로 시간을 옮긴다.
 *
 * - 기본은 쌍마다 보낸 차례를 지킨다(WebRTC 순서 보장 채널처럼). 앞 메시지가 늦으면 뒤 메시지도 그 뒤에 닿는다(앞 막힘).
 *   `ordered: false`면 지연대로 앞질러 닿는다.
 * - 들어옴·나감 알림은 지연 없이 다음 마이크로태스크에 전한다(방에 들어오는 절차가 시계를 기다리지 않게).
 */
export class DelayedNetwork {
  private readonly peers = new Map<string, Handlers>();
  private readonly counts = new Map<string, number>();
  /** 쌍마다 마지막 메시지가 닿을 시각(순서 보장) */
  private readonly lastAt = new Map<string, number>();
  /** 전한 메시지 수(시험이 헛돌지 않았는지 본다) */
  delivered = 0;

  constructor(
    private readonly clock: Clock,
    /** 바꿔 끼울 수 있다(시험 도중 한 쌍만 늦추기) */
    public delay: DelayFn = () => 0,
    private readonly ordered = true,
  ) {}

  join(selfId: string): Transport {
    const handlers: Handlers = { message: [], join: [], leave: [] };
    for (const [id, other] of this.peers)
      queueMicrotask(() => {
        for (const h of other.join) h(selfId);
        for (const h of handlers.join) h(id);
      });
    this.peers.set(selfId, handlers);
    return {
      selfId,
      send: (message, to) => {
        if (!this.peers.has(selfId)) return;
        const copy = JSON.stringify(message);
        for (const id of this.peers.keys()) {
          if (id === selfId || (to !== undefined && id !== to)) continue;
          this.schedule(selfId, id, copy);
        }
      },
      onMessage: (h) => handlers.message.push(h),
      onPeerJoin: (h) => handlers.join.push(h),
      onPeerLeave: (h) => handlers.leave.push(h),
      leave: () => {
        this.peers.delete(selfId);
        for (const other of this.peers.values())
          queueMicrotask(() => {
            for (const h of other.leave) h(selfId);
          });
      },
    };
  }

  private schedule(from: string, to: string, copy: string): void {
    const key = `${from}>${to}`;
    const n = this.counts.get(key) ?? 0;
    this.counts.set(key, n + 1);
    const message = JSON.parse(copy) as unknown;
    const now = this.clock.now();
    let at = now + Math.max(0, this.delay(from, to, n, message));
    if (this.ordered) at = Math.max(at, this.lastAt.get(key) ?? now);
    this.lastAt.set(key, at);
    this.clock.after(at - now, () => {
      const target = this.peers.get(to);
      if (!target || !this.peers.has(from)) return;
      this.delivered++;
      // 받는 쪽마다 따로 복사한다(고쳐 써도 다른 기기에 번지지 않게).
      for (const h of target.message) h(JSON.parse(copy) as unknown, from);
    });
  }
}
