/*
 * 손님 시계 확인(docs/50 3-2, docs/24 4절): 방장이 기록에 적은 시간을 참가자 기기가 자기 시계로 맞춰 본다.
 *
 * 방장 기기가 판을 돌리며 수마다 쓴 시간(`spent`)과 시간패·시간 상한 같은 시계 행동을 기록에 남긴다. 판 끝 검증은
 * 그 값이 규칙에 맞는지만 보고 실제로 그만큼 지났는지는 몰랐다. 그래서 방장은 손님에게 일찍 시간패를 주거나,
 * 자기 시간을 적게 적거나, 시간 상한을 아무 때나 낼 수 있었다.
 *
 * 참가자 기기는 방장이 보낸 화면이 닿은 시각을 적어 둔다(`ArrivalBook`). 방장 시계는 엔진 걸음마다 다시 걸리고
 * 그 걸음의 화면은 곧바로 나가므로, 두 화면이 닿은 사이는 방장이 잰 사이에 내려받기 지연의 차이만 더한 것이다.
 * 판 끝에 기록을 다시 돌리며 차례마다 방장이 적은 시간과 내 기기가 잰 사이를 견준다(`witnessTimes`).
 *
 * 2결 판정이다(증명하지 않는다). 지연이 흔들리는 만큼 허용 폭을 두고, 그 폭이 방장이 얻을 수 있는 이득의 상한이다.
 * 끊겼거나 화면이 가려졌던(휴대폰 잠금 등) 동안은 닿은 시각을 믿을 수 없어 그 사이에 걸친 차례는 재지 않는다.
 */

import type { Clock } from "@game/fair-play";

/**
 * 차례 하나의 어긋남 허용 폭(ms). 한 차례의 어긋남은 그 차례 처음·끝 화면의 내려받기 지연 차이다. 휴대폰이 끊기지
 * 않은 채 6~10초 멈추면(지하철·엘리베이터, WebRTC 다시 보내기) 앞 화면이 늦어 앞 차례가 +10초, 뒤 차례가 −10초가
 * 된다. 그것까지 덮고, 수십 초 단위인 시간패 조작은 판 길이와 상관없이 잡는다
 */
export const TURN_SLACK_MS = 15_000;
/**
 * 자리마다 합에서 빼는 차례 수: 어긋남이 가장 큰(절댓값) 차례 둘. 끊김 없는 멈춤 한두 번은 자리마다 큰 어긋남
 * 한두 차례로만 남으므로 합을 흔들지 않게 한다. 방장은 이만큼의 차례에서 `TURN_SLACK_MS`까지 더 가져갈 수 있다
 */
export const DRIFT_TRIM = 2;
/**
 * 한 자리에 쌓인 어긋남(부호 있는 합)의 허용 폭: 기본(ms) + 잰 차례 수의 제곱근마다(ms).
 * 정직한 방장이면 차례마다의 어긋남은 앞뒤 지연의 차이라 부호가 들쭉날쭉해 서로 상쇄되고, 합은 차례 수의 제곱근만큼만
 * 자란다(차례마다 지연이 따로 흔들릴 때. 실제 망은 앞뒤 지연이 비슷해 더 작다). 방장이 차례마다 조금씩 가져가면 합이
 * 차례 수에 비례해 자라 이 폭을 넘는다. 제곱근 폭은 지연 표준편차 0.4초(가끔 튀는 것 포함)일 때의 약 4.5배다
 */
export const DRIFT_BASE_MS = 3_000;
export const DRIFT_SQRT_MS = 2_500;
/** 시간 창(시간 상한 등)이 일찍 닫혔다고 볼 허용 폭(ms) */
export const WINDOW_SLACK_MS = 3_000;

/** 화면 하나가 닿은 때 */
export interface Arrival {
  /** 내 기기 시계(ms) */
  at: number;
  /** 끊김·가려짐마다 바뀌는 번호. 같은 번호 안의 두 시각만 사이를 잴 수 있다 */
  segment: number;
  /** 닿을 때 화면이 가려져 있었다(닿은 시각이 늦게 적혔을 수 있다) */
  hidden: boolean;
}

/**
 * 받은 화면마다 닿은 시각을 적는다(`RemoteMatch.seen`과 같은 차례). 끊기거나 화면이 가려지면 `breakSegment`.
 */
export class ArrivalBook {
  readonly arrivals: Arrival[] = [];
  private segment = 0;
  private hidden = false;

  constructor(private readonly clock: Clock) {}

  /** 화면 하나를 받았다 */
  record(): void {
    this.arrivals.push({
      at: this.clock.now(),
      segment: this.segment,
      hidden: this.hidden,
    });
  }

  /** 여기서 앞뒤로 사이를 재지 않는다(방장과 끊김, 방장이 바뀜, 다시 맞춘 화면) */
  breakSegment(): void {
    this.segment++;
  }

  /** 화면이 가려지거나 다시 보였다(가려진 동안 기기가 멈추면 닿은 시각이 늦게 적힌다) */
  setHidden(hidden: boolean): void {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    this.segment++;
  }
}

/** 판 끝 다시 계산에서 상태마다 모은 것 */
export interface WitnessInput {
  /** 상태 k(기록 k개를 넣은 뒤)의 시계 차례(`timing.turn`). 개인 시간이 없는 게임이면 비워 둔다 */
  turns: readonly ({ seat: number; left: number } | null)[];
  /** 상태 k에 열린 시간 창(`kit.timers`): 열쇠 → 길이(ms). `kit.clockKey`가 없으면 비워 둔다 */
  windows: readonly ReadonlyMap<string, number>[];
  /** 기록 i마다 */
  entries: readonly {
    seat: number;
    /** 방장이 적은 쓴 시간(없으면 null) */
    spent: number | null;
    /** 같은 사람의 시계를 이어 재는 행동(`timing.keepsTurn`) */
    keeps: boolean;
    /** 시간 창이 닫혀 넣은 행동이면 그 창 열쇠(`kit.clockKey`) */
    window: string | null;
  }[];
  /** 상태 k의 화면이 처음 닿은 때(못 받았으면 없음) */
  arrivalOf: ReadonlyMap<number, Arrival>;
  /** 컴퓨터 자리: 생각이 길어도 지지 않게 방장이 쓴 시간을 줄여 적으므로 더 적은 쪽은 보지 않는다 */
  botSeats: ReadonlySet<number>;
}

/**
 * 방장이 적은 시간을 내 기기가 잰 사이와 견준다. 문제가 없으면 null, 있으면 판 끝 검증 실패 까닭.
 *
 * - 차례마다: 시계를 다시 건 상태(앞 행동을 넣은 뒤, `LocalMatch.armClock`과 같은 규칙)부터 쓴 시간을 적은 행동을
 *   넣은 상태까지의 어긋남(적은 시간 − 잰 사이)이 `TURN_SLACK_MS`를 넘으면 실패다. 시간패도 쓴 시간을 적으므로
 *   일찍 낸 시간패가 여기서 잡힌다
 * - 자리마다: 어긋남을 부호 있는 채로 더하되 가장 큰 `DRIFT_TRIM`차례를 빼고, `DRIFT_BASE_MS + DRIFT_SQRT_MS ×
 *   √(잰 차례 수)`를 넘으면 실패다(차례마다 조금씩 가져가기). 컴퓨터 자리는 생각이 길어도 지지 않게 줄여 적으므로 많이 적은 차례만 본다
 * - 시간 창마다: 창이 열린 상태부터 그 창으로 넣은 행동까지가 창 길이보다 허용 폭 넘게 짧으면 실패다
 */
export function witnessTimes(input: WitnessInput): string | null {
  const { turns, windows, entries, arrivalOf, botSeats } = input;
  const drift = new Map<number, number[]>();
  const opened = new Map<string, number>();
  let start = 0;
  for (const [i, entry] of entries.entries()) {
    // 시간 창: 상태 i에 열려 있는 열쇠만 남기고(사라졌다 다시 열리면 새로 잰다), 새 열쇠는 이 상태부터 잰다.
    const open = windows[i];
    if (open) {
      for (const key of opened.keys()) if (!open.has(key)) opened.delete(key);
      for (const key of open.keys()) if (!opened.has(key)) opened.set(key, i);
    }
    if (entry.window !== null && windows.length > 0) {
      const from = opened.get(entry.window);
      if (from === undefined)
        return `기록 ${i + 1}번째: 열리지 않은 시간 창으로 넣었다`;
      const ms = windows[from]?.get(entry.window) ?? 0;
      const a = arrivalOf.get(from);
      const b = arrivalOf.get(i + 1);
      // 앞 시각이 늦게 적혔으면(가려진 동안 닿음) 사이가 짧게 잰다: 믿지 않는다. 뒤가 늦은 것은 길어질 뿐이다.
      if (a && b && !a.hidden && b.at - a.at < ms - WINDOW_SLACK_MS)
        return `기록 ${i + 1}번째: 시간 창이 내 기기에서 ${seconds(ms - (b.at - a.at))}초 일찍 닫혔다`;
    }

    const before = turns[i] ?? null;
    if (before && entry.spent !== null && entry.seat === before.seat) {
      const a = arrivalOf.get(start);
      const b = arrivalOf.get(i + 1);
      if (a && b && a.segment === b.segment && !a.hidden && !b.hidden) {
        const off = entry.spent - (b.at - a.at);
        const bot = botSeats.has(entry.seat);
        if (bot ? off > TURN_SLACK_MS : Math.abs(off) > TURN_SLACK_MS)
          return differs(i, entry.seat, off);
        if (!bot) {
          const offs = drift.get(entry.seat) ?? [];
          offs.push(off);
          drift.set(entry.seat, offs);
          const sum = trimmedSum(offs);
          if (
            Math.abs(sum) >
            DRIFT_BASE_MS + DRIFT_SQRT_MS * Math.sqrt(offs.length)
          )
            return differs(i, entry.seat, sum);
        }
      }
    }
    const after = turns[i + 1] ?? null;
    const keep =
      before !== null &&
      after !== null &&
      before.seat === after.seat &&
      entry.keeps;
    if (!keep) start = i + 1;
  }
  return null;
}

/** 부호 있는 합에서 절댓값이 가장 큰 `DRIFT_TRIM`개를 뺀 것 */
function trimmedSum(offs: readonly number[]): number {
  const sum = offs.reduce((a, b) => a + b, 0);
  const largest = [...offs]
    .sort((a, b) => Math.abs(b) - Math.abs(a))
    .slice(0, DRIFT_TRIM);
  return sum - largest.reduce((a, b) => a + b, 0);
}

function differs(index: number, seat: number, off: number): string {
  return `기록 ${index + 1}번째: ${seat}번 자리 시간을 내 기기에서 잰 것보다 ${seconds(Math.abs(off))}초 ${off > 0 ? "많이" : "적게"} 적었다`;
}

function seconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}

/**
 * 받은 화면(차례대로)을 다시 돌린 화면(상태 차례)에 맞춘다. 판 끝 검증의 화면 대조와 같은 방식이다: 앞에서부터
 * 처음 같은 화면에 놓는다. 같은 화면이 이어지면 첫 것만 쓴다(닿은 시각도 처음 닿은 때)
 */
export function arrivalsByState(
  seen: readonly string[],
  arrivals: readonly Arrival[],
  replayed: readonly string[],
): Map<number, Arrival> {
  const out = new Map<number, Arrival>();
  let cursor = 0;
  for (const [i, view] of seen.entries()) {
    while (cursor < replayed.length && replayed[cursor] !== view) cursor++;
    if (cursor === replayed.length) break;
    const arrival = arrivals[i];
    if (arrival && !out.has(cursor)) out.set(cursor, arrival);
  }
  return out;
}

/** 기록 속 행동에 방장이 실은 쓴 시간(`timing.stamp`가 `spent`에 싣는다). 없으면 null */
export function spentOf(action: unknown): number | null {
  if (typeof action !== "object" || action === null) return null;
  const spent = (action as { spent?: unknown }).spent;
  return typeof spent === "number" && Number.isFinite(spent) ? spent : null;
}
