/**
 * 예측 몰림 숫자(docs/36 11-43). 마감 무렵 예측이 몰려 서버가 받지 못한 일이 있었는지를 회차마다 숫자로만 센다.
 * IP·열쇠·예측서 id는 남기지 않는다. 메모리에만 두고 최근 `keep`회차만 남긴다(서버를 다시 띄우면 비어도 된다).
 */

/** 한 회차의 숫자. 이름은 `/api/state`의 `pressure`와 서버 로그 한 줄에 그대로 나간다 */
export interface RoundPressure {
  round: number;
  /** Argon2 줄이 가득해 503으로 돌려보낸 수(서명 확인 전 조기 거절 포함) */
  busy: number;
  /** 줄에 들어갔다가 기다림 상한(5초)을 넘겨 503으로 떨어진 수 */
  queueTimeout: number;
  /** 줄의 가장 긴 길이(앞줄 + 보통 줄, 줄에 설 때 잰다) */
  maxQueue: number;
  /** 줄에서 가장 오래 기다린 시간(ms, 주입한 시계). 503 전 조기 경보 */
  maxWaitMs: number;
  /** 같은 IP 앞부분의 회차당 예측 상한으로 429를 돌려준 수 */
  prefixEntry: number;
  /** 같은 IP 앞부분의 하루 등록 상한으로 429를 돌려준 수(등록만, 예측과 함께 온 등록 모두) */
  prefixRegister: number;
  /** 마감 뒤 늦게 도착해 409로 돌려보낸 이 회차 예측서 수(마감 뒤 `LATE_WINDOW`초 안 도착만) */
  late: number;
}

export type PressureCount =
  | "busy"
  | "queueTimeout"
  | "prefixEntry"
  | "prefixRegister"
  | "late";

/** 늦은 도착으로 세는 마감 뒤 시간(초). 그보다 늦은 것은 몰림과 상관없는 옛 탭으로 본다 */
export const LATE_WINDOW = 60;

/** 기본으로 남기는 회차 수 */
export const PRESSURE_KEEP = 24;

export function emptyPressure(round: number): RoundPressure {
  return {
    round,
    busy: 0,
    queueTimeout: 0,
    maxQueue: 0,
    maxWaitMs: 0,
    prefixEntry: 0,
    prefixRegister: 0,
    late: 0,
  };
}

/**
 * 감시(gatus)가 숫자 하나로 비교하는 합·최댓값. 알림 기준 제안(docs/36 11-43):
 * `entryBusyRecent == 0`, `entryPrefixRecent == 0`, `entryMaxWaitMsRecent < 2000`, `entryLateRecent < 20`
 */
export interface PressureRecent {
  /** busy + queueTimeout 합(503) */
  entryBusyRecent: number;
  /** prefixEntry + prefixRegister 합(429) */
  entryPrefixRecent: number;
  entryLateRecent: number;
  entryMaxWaitMsRecent: number;
  entryMaxQueueRecent: number;
}

export class EntryPressure {
  private readonly rounds = new Map<number, RoundPressure>();

  constructor(private readonly keep = PRESSURE_KEEP) {}

  private at(round: number): RoundPressure {
    let p = this.rounds.get(round);
    if (!p) {
      p = emptyPressure(round);
      this.rounds.set(round, p);
      // 넘치면 가장 오래된(번호가 작은) 회차부터 버린다
      while (this.rounds.size > this.keep)
        this.rounds.delete(Math.min(...this.rounds.keys()));
    }
    return p;
  }

  add(round: number, kind: PressureCount): void {
    this.at(round)[kind]++;
  }

  queued(round: number, length: number): void {
    const p = this.at(round);
    p.maxQueue = Math.max(p.maxQueue, length);
  }

  waited(round: number, ms: number): void {
    const p = this.at(round);
    p.maxWaitMs = Math.max(p.maxWaitMs, Math.round(ms));
  }

  /** 그 회차의 숫자(없으면 모두 0). 고쳐도 남은 값에 영향이 없는 사본 */
  get(round: number): RoundPressure {
    const p = this.rounds.get(round);
    return p ? { ...p } : emptyPressure(round);
  }

  /** 남아 있는 회차 번호(작은 것부터) */
  kept(): number[] {
    return [...this.rounds.keys()].sort((a, b) => a - b);
  }

  /** `include`가 고른 회차들의 합·최댓값 */
  recent(include: (round: number) => boolean): PressureRecent {
    const out: PressureRecent = {
      entryBusyRecent: 0,
      entryPrefixRecent: 0,
      entryLateRecent: 0,
      entryMaxWaitMsRecent: 0,
      entryMaxQueueRecent: 0,
    };
    for (const p of this.rounds.values()) {
      if (!include(p.round)) continue;
      out.entryBusyRecent += p.busy + p.queueTimeout;
      out.entryPrefixRecent += p.prefixEntry + p.prefixRegister;
      out.entryLateRecent += p.late;
      out.entryMaxWaitMsRecent = Math.max(
        out.entryMaxWaitMsRecent,
        p.maxWaitMs,
      );
      out.entryMaxQueueRecent = Math.max(out.entryMaxQueueRecent, p.maxQueue);
    }
    return out;
  }
}
