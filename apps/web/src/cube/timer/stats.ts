import type { Penalty } from "./machine";

/**
 * 기록 통계(대회 규정의 평균 계산을 따른다고 기억한다 — WCA 규정 9f로 확인 필요).
 * - 한 번 기록 = 잰 시간 + (+2면 2초). DNF는 어떤 기록보다 나쁘다(여기서는 Infinity).
 * - n번 평균(aoN): 위아래로 ceil(n × 5%)개씩 빼고 나머지의 평균. 5번·12번은 하나씩, 100번은 다섯씩.
 *   DNF가 빼는 개수보다 많으면 평균도 DNF.
 * - 세 번 평균(mo3): 셋 모두의 평균. 하나라도 DNF면 DNF. 세 번 중 최고(bo3)는 블라인드 공식 결과.
 * - 화면에 보일 때: 한 번 기록은 1/100초 아래를 버리고, 평균은 1/100초로 반올림한다.
 */

export interface Timed {
  readonly ms: number;
  readonly penalty: Penalty;
}

/** 평균·최고에서 DNF를 나타내는 값 */
export const DNF = Number.POSITIVE_INFINITY;

export function effectiveMs(t: Timed): number {
  if (t.penalty === "DNF") return DNF;
  return t.penalty === "+2" ? t.ms + 2000 : t.ms;
}

/** 가장 좋은 한 번 기록. 기록이 없으면 null, 모두 DNF면 DNF */
export function best(list: readonly Timed[]): number | null {
  if (list.length === 0) return null;
  return Math.min(...list.map(effectiveMs));
}

/** 위아래에서 빼는 개수 */
export function trimCount(n: number): number {
  return Math.ceil(n * 0.05);
}

/** 딱 n개로 내는 평균(위아래 trimCount씩 빼고). 개수가 다르면 null */
export function averageOf(list: readonly Timed[]): number | null {
  const n = list.length;
  if (n < 3) return null;
  const trim = trimCount(n);
  const sorted = list.map(effectiveMs).sort((a, b) => a - b);
  const kept = sorted.slice(trim, n - trim);
  if (kept.some((v) => v === DNF)) return DNF;
  return kept.reduce((s, v) => s + v, 0) / kept.length;
}

/** 셋 모두의 평균(빼지 않는다) */
export function meanOf(list: readonly Timed[]): number | null {
  if (list.length === 0) return null;
  const values = list.map(effectiveMs);
  if (values.some((v) => v === DNF)) return DNF;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** 마지막 n개의 평균. 기록이 n개보다 적으면 null. `list`는 오래된 것부터 */
export function currentAverage(
  list: readonly Timed[],
  n: number,
): number | null {
  if (list.length < n) return null;
  return averageOf(list.slice(-n));
}

/** 이어진 n개 묶음 가운데 가장 좋은 평균 */
export function bestAverage(list: readonly Timed[], n: number): number | null {
  let out: number | null = null;
  for (let i = 0; i + n <= list.length; i++) {
    const v = averageOf(list.slice(i, i + n));
    if (v !== null && (out === null || v < out)) out = v;
  }
  return out;
}

export function currentMean(list: readonly Timed[], n: number): number | null {
  if (list.length < n) return null;
  return meanOf(list.slice(-n));
}

export interface SessionStats {
  readonly count: number;
  readonly best: number | null;
  readonly ao5: number | null;
  readonly ao12: number | null;
  readonly ao100: number | null;
  readonly bestAo5: number | null;
  readonly bestAo12: number | null;
  /** 블라인드: 마지막 세 번 평균, 세 번 중 최고 */
  readonly mo3: number | null;
  readonly bo3: number | null;
}

export function sessionStats(list: readonly Timed[]): SessionStats {
  const last3 = list.slice(-3);
  return {
    count: list.length,
    best: best(list),
    ao5: currentAverage(list, 5),
    ao12: currentAverage(list, 12),
    ao100: currentAverage(list, 100),
    bestAo5: bestAverage(list, 5),
    bestAo12: bestAverage(list, 12),
    mo3: currentMean(list, 3),
    bo3: last3.length === 3 ? best(last3) : null,
  };
}

function clockText(cs: number): string {
  const minutes = Math.floor(cs / 6000);
  const seconds = Math.floor((cs % 6000) / 100);
  const frac = String(cs % 100).padStart(2, "0");
  if (minutes > 0)
    return `${minutes}:${String(seconds).padStart(2, "0")}.${frac}`;
  return `${seconds}.${frac}`;
}

/** 한 번 기록 글자: 1/100초 아래는 버린다 */
export function formatSingle(ms: number | null): string {
  if (ms === null) return "-";
  if (ms === DNF) return "DNF";
  return clockText(Math.floor(ms / 10));
}

/** 평균 글자: 1/100초로 반올림한다 */
export function formatAverage(ms: number | null): string {
  if (ms === null) return "-";
  if (ms === DNF) return "DNF";
  return clockText(Math.round(ms / 10));
}

/** 기록 한 줄 글자(+2는 더한 값 뒤에 「+」, DNF는 잰 시간을 괄호로) */
export function formatSolve(t: Timed): string {
  if (t.penalty === "DNF") return `DNF(${formatSingle(t.ms)})`;
  if (t.penalty === "+2") return `${formatSingle(t.ms + 2000)}+`;
  return formatSingle(t.ms);
}
