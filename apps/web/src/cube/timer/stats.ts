import type { Penalty } from "./machine";

/**
 * 기록 통계(WCA 규정 2026-04-01판 9b·9f).
 * - 한 번 기록(9f1·9f2): 잰 시간(+2 더하기 전 원래 값)을 1/100초 아래로 버리고, +2면 2초를 더한다.
 *   그렇게 낸 기록이 10분 이상이면 초 아래를 버린다. DNF는 어떤 기록보다 나쁘다(여기서는 Infinity).
 * - 평균(9f1·9f2): 위처럼 버린 기록으로 계산한 뒤, 10분 미만은 1/100초로, 10분 이상은 초로 반올림한다
 *   (X.49는 X, X.50은 X+1).
 * - 5번 평균(ao5, 9f8·9f9): 가장 좋은 것과 나쁜 것을 하나씩 빼고 셋의 평균. DNF가 둘 이상이면 DNF.
 * - 12번·100번 평균은 규정이 아니라 연습 타이머들의 관례다. 5번 평균처럼 위아래로 ceil(n × 5%)개씩
 *   뺀다(12번은 하나씩, 100번은 다섯씩). DNF가 빼는 개수보다 많으면 DNF.
 * - 세 번 평균(mo3, 9f10·9f11): 셋 모두의 평균. 하나라도 DNF면 DNF.
 * - 블라인드:
 *   - 3×3 블라인드(333bf)는 5번 중 최고(Bo5)로 순위를 정하고(9b3a), 5번 평균(Ao5)은 순위와 따로
 *     기록으로 인정한다(9b3b).
 *   - 4×4·5×5 블라인드는 3번 중 최고(Bo3)로 순위를 정하고, 세 번 평균(Mo3)은 따로 인정한다(9b6).
 *     지금 타이머 종목에는 없어 bo3·mo3는 그 종목을 넣을 때 쓴다.
 */

export interface Timed {
  readonly ms: number;
  readonly penalty: Penalty;
}

/** 평균·최고에서 DNF를 나타내는 값 */
export const DNF = Number.POSITIVE_INFINITY;

/** 10분: 이보다 길면 초 단위로 적는다(9f2) */
export const TEN_MINUTES_MS = 600_000;

/** 기록으로 적는 값(9f1·9f2). 원래 값을 1/100초로 버린 뒤 +2를 더하고, 10분 이상이면 초로 버린다 */
export function recordedMs(t: Timed): number {
  if (t.penalty === "DNF") return DNF;
  const truncated = Math.floor(t.ms / 10) * 10;
  const total = t.penalty === "+2" ? truncated + 2000 : truncated;
  return total >= TEN_MINUTES_MS ? Math.floor(total / 1000) * 1000 : total;
}

/** 평균값을 규정대로 반올림한다(10분 미만은 1/100초, 10분 이상은 초) */
export function roundAverage(ms: number): number {
  if (ms === DNF) return DNF;
  // 나눗셈에서 생기는 아주 작은 오차가 반올림을 뒤집지 않게 먼저 1/1000ms로 맞춘다
  const clean = Math.round(ms * 1000) / 1000;
  const unit = clean >= TEN_MINUTES_MS ? 1000 : 10;
  return Math.round(clean / unit) * unit;
}

/** 가장 좋은 한 번 기록. 기록이 없으면 null, 모두 DNF면 DNF */
export function best(list: readonly Timed[]): number | null {
  if (list.length === 0) return null;
  return Math.min(...list.map(recordedMs));
}

/** 위아래에서 빼는 개수 */
export function trimCount(n: number): number {
  return Math.ceil(n * 0.05);
}

/** 딱 n개로 내는 평균(위아래 trimCount씩 빼고). 3개보다 적으면 null */
export function averageOf(list: readonly Timed[]): number | null {
  const n = list.length;
  if (n < 3) return null;
  const trim = trimCount(n);
  const sorted = list.map(recordedMs).sort((a, b) => a - b);
  const kept = sorted.slice(trim, n - trim);
  if (kept.some((v) => v === DNF)) return DNF;
  return roundAverage(kept.reduce((s, v) => s + v, 0) / kept.length);
}

/** 모두의 평균(빼지 않는다) */
export function meanOf(list: readonly Timed[]): number | null {
  if (list.length === 0) return null;
  const values = list.map(recordedMs);
  if (values.some((v) => v === DNF)) return DNF;
  return roundAverage(values.reduce((s, v) => s + v, 0) / values.length);
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

/** 마지막 n개 가운데 최고(Best of n). 기록이 n개보다 적으면 null */
export function currentBestOf(
  list: readonly Timed[],
  n: number,
): number | null {
  if (list.length < n) return null;
  return best(list.slice(-n));
}

export interface SessionStats {
  readonly count: number;
  readonly best: number | null;
  readonly ao5: number | null;
  /** 12·100번 평균은 규정이 아닌 관례 */
  readonly ao12: number | null;
  readonly ao100: number | null;
  readonly bestAo5: number | null;
  readonly bestAo12: number | null;
  /** 3×3 블라인드의 순위 형식: 마지막 5번 중 최고(9b3a) */
  readonly bo5: number | null;
  /** 4×4·5×5 블라인드의 순위 형식(9b6a)과 따로 인정하는 세 번 평균(9b6b) */
  readonly bo3: number | null;
  readonly mo3: number | null;
}

export function sessionStats(list: readonly Timed[]): SessionStats {
  return {
    count: list.length,
    best: best(list),
    ao5: currentAverage(list, 5),
    ao12: currentAverage(list, 12),
    ao100: currentAverage(list, 100),
    bestAo5: bestAverage(list, 5),
    bestAo12: bestAverage(list, 12),
    bo5: currentBestOf(list, 5),
    bo3: currentBestOf(list, 3),
    mo3: currentMean(list, 3),
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

/** 평균 글자: 1/100초로 반올림한다(평균 함수가 이미 규정대로 반올림해 둔 값이면 그대로 나온다) */
export function formatAverage(ms: number | null): string {
  if (ms === null) return "-";
  if (ms === DNF) return "DNF";
  return clockText(Math.round(ms / 10));
}

/** 기록 한 줄 글자(+2는 더한 값 뒤에 「+」, DNF는 잰 시간을 괄호로) */
export function formatSolve(t: Timed): string {
  if (t.penalty === "DNF") return `DNF(${formatSingle(t.ms)})`;
  if (t.penalty === "+2") return `${formatSingle(recordedMs(t))}+`;
  return formatSingle(recordedMs(t));
}
