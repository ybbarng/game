import type { Clock } from "@game/fair-play";

import type { Transport } from "@/net/transport";

/**
 * 한 기기 안의 여러 경주 참가자(나 + 방장 기기가 돌리는 컴퓨터)를 경주 틀에 각각 한 사람처럼 보이게 하는 창구.
 *
 * - 경주 메시지는 모두 `{type: "cube-race", f: 보낸 참가자, to?, m: 경주 메시지}` 봉투에 싸서 진짜 연결로 보낸다.
 * - 받는 쪽은 봉투의 `f`가 보낸 기기 자신이거나 **그 기기가 맡은 컴퓨터**일 때만 받는다(`owner`로 확인).
 *   그래서 아무나 남의 이름이나 컴퓨터 이름으로 수를 보낼 수 없다.
 * - 같은 기기 안 참가자끼리는 시계(`clock.after(0)`)로 한 박자 늦게 건넨다(실제 연결처럼 비동기).
 * - 기기 하나가 나가거나 돌아오면 그 기기가 맡은 참가자 모두가 나가거나 돌아온 것으로 알린다.
 */

export interface RaceEnvelope {
  type: "cube-race";
  f: string;
  to?: string;
  m: unknown;
}

type Handlers = {
  message: ((m: unknown, from: string) => void)[];
  join: ((id: string) => void)[];
  leave: ((id: string) => void)[];
};

export interface RaceHubInit {
  /** 진짜 연결. 혼자 하기(컴퓨터와 경주)는 없다 */
  transport?: Transport;
  clock: Clock;
  /** 참가자 아이디 → 그 참가자를 맡은 기기(연결 아이디). 모르는 참가자면 undefined */
  owner(participant: string): string | undefined;
  /** 기기 하나가 맡은 참가자(그 기기 사람과 컴퓨터) */
  participantsOf(device: string): string[];
}

export function isRaceEnvelope(raw: unknown): raw is RaceEnvelope {
  if (typeof raw !== "object" || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    r.type === "cube-race" &&
    typeof r.f === "string" &&
    (r.to === undefined || typeof r.to === "string")
  );
}

export class RaceHub {
  private readonly locals = new Map<string, Handlers>();
  private readonly init: RaceHubInit;
  private closed = false;

  constructor(init: RaceHubInit) {
    this.init = init;
    const t = init.transport;
    if (!t) return;
    t.onMessage((raw, device) => {
      if (this.closed || !isRaceEnvelope(raw)) return;
      // 그 기기가 맡은 참가자 이름으로만 받는다
      if (init.owner(raw.f) !== device) return;
      this.deliver(raw.f, raw.to, raw.m);
    });
    t.onPeerJoin((device) => {
      if (this.closed) return;
      for (const id of init.participantsOf(device))
        for (const h of this.locals.values()) for (const fn of h.join) fn(id);
    });
    t.onPeerLeave((device) => {
      if (this.closed) return;
      for (const id of init.participantsOf(device))
        for (const h of this.locals.values()) for (const fn of h.leave) fn(id);
    });
  }

  /** 이 기기 안 참가자 하나의 창구. 경주 틀(`RaceSession`)에 그대로 넘긴다 */
  local(id: string): Transport {
    const handlers: Handlers = { message: [], join: [], leave: [] };
    this.locals.set(id, handlers);
    return {
      selfId: id,
      send: (message, to) => {
        if (this.closed) return;
        // 같은 기기 안 다른 참가자
        for (const [other, h] of this.locals) {
          if (other === id || (to !== undefined && other !== to)) continue;
          const copy = JSON.parse(JSON.stringify(message)) as unknown;
          this.init.clock.after(0, () => {
            if (this.closed) return;
            for (const fn of h.message) fn(copy, id);
          });
        }
        if (to !== undefined && this.locals.has(to)) return;
        const t = this.init.transport;
        if (!t) return;
        const envelope: RaceEnvelope = {
          type: "cube-race",
          f: id,
          ...(to !== undefined ? { to } : {}),
          m: message,
        };
        const device = to === undefined ? undefined : this.init.owner(to);
        if (to !== undefined && device === undefined) return;
        t.send(envelope, device);
      },
      onMessage: (h) => handlers.message.push(h),
      onPeerJoin: (h) => handlers.join.push(h),
      onPeerLeave: (h) => handlers.leave.push(h),
      leave: () => this.locals.delete(id),
    };
  }

  /** 경주가 끝나면 그 판 참가자 창구를 모두 뗀다 */
  clear(): void {
    this.locals.clear();
  }

  close(): void {
    this.closed = true;
    this.locals.clear();
  }

  private deliver(from: string, to: string | undefined, message: unknown) {
    for (const [id, h] of this.locals) {
      if (id === from || (to !== undefined && id !== to)) continue;
      for (const fn of h.message) fn(message, from);
    }
  }
}
