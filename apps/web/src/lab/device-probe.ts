/**
 * E1 기기 혼자 재기(docs/43 5절): 타이머 단위, 화면 주사율, 누름 시각. 화면 없이 부를 수 있는 부분만 모았다.
 */
import { distribution } from "@/net/latency";

/** `performance.now`를 `budgetMs` 동안 계속 읽어 0보다 큰 가장 작은 간격과 서로 다른 간격 수를 낸다 */
export function timerStep(
  now: () => number = () => performance.now(),
  budgetMs = 30,
): { minStepMs: number | null; distinctSteps: number; reads: number } {
  const start = now();
  let last = start;
  let min = Number.POSITIVE_INFINITY;
  const steps = new Set<number>();
  let reads = 0;
  for (;;) {
    const t = now();
    reads++;
    if (t !== last) {
      const step = t - last;
      if (step > 0 && step < min) min = step;
      if (steps.size < 1000) steps.add(Math.round(step * 1e6) / 1e6);
      last = t;
    }
    if (t - start >= budgetMs || reads > 5_000_000) break;
  }
  return {
    minStepMs: Number.isFinite(min) ? round3(min) : null,
    distinctSteps: steps.size,
    reads,
  };
}

/** 프레임 시각 목록에서 간격 분포와 주사율 추정(간격 중앙값으로) */
export function frameRate(times: readonly number[]): {
  intervals: ReturnType<typeof distribution>;
  hz: number | null;
} {
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++)
    gaps.push((times[i] as number) - (times[i - 1] as number));
  const intervals = distribution(gaps);
  return {
    intervals: {
      ...intervals,
      min: round3n(intervals.min),
      p50: round3n(intervals.p50),
      p95: round3n(intervals.p95),
      p99: round3n(intervals.p99),
      max: round3n(intervals.max),
    },
    hz: intervals.p50 ? Math.round(1000 / intervals.p50) : null,
  };
}

/** `requestAnimationFrame` 시각을 `count`개 모은다 */
export function collectFrames(count = 121): Promise<number[]> {
  return new Promise((resolve) => {
    const times: number[] = [];
    const step = (t: number) => {
      times.push(t);
      if (times.length >= count) resolve(times);
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/**
 * 시각 값들의 단위 추정: 소수 자리를 보고 가장 거친 단위를 고른다.
 * 모두 정수면 1ms, 0.1 배수면 0.1ms … 아니면 "더 고움"(0.001 미만)
 */
export function timestampUnit(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  for (const unit of [1, 0.5, 0.1, 0.01, 0.005, 0.001])
    if (
      values.every(
        (v) => Math.abs(v / unit - Math.round(v / unit)) < 1e-6 / unit,
      )
    )
      return unit;
  return 0;
}

export interface TapRecord {
  /** pointerdown의 event.timeStamp */
  downTs: number;
  /** pointerdown 처리기 안 performance.now − timeStamp(입력 처리 지연, docs/44 6절 3) */
  handlerLagMs: number;
  /** click의 event.timeStamp − pointerdown의 timeStamp(손을 떼는 시간 포함) */
  clickMinusDownMs: number | null;
  pointerType: string;
}

export function summarizeTaps(taps: readonly TapRecord[]) {
  const clickGaps = taps
    .map((t) => t.clickMinusDownMs)
    .filter((v): v is number => v !== null);
  return {
    n: taps.length,
    timeStampUnitMs: timestampUnit(taps.map((t) => t.downTs)),
    handlerLag: distribution(taps.map((t) => round3(t.handlerLagMs))),
    clickMinusDown: distribution(clickGaps.map(round3)),
    pointerTypes: [...new Set(taps.map((t) => t.pointerType))],
  };
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function round3n(v: number | null): number | null {
  return v === null ? null : round3(v);
}

export function deviceInfo(): Record<string, unknown> {
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; type?: string };
  };
  return {
    ua: nav.userAgent,
    platform: nav.platform,
    cores: nav.hardwareConcurrency,
    dpr: window.devicePixelRatio,
    screen: `${window.screen.width}x${window.screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    net: nav.connection?.effectiveType ?? null,
    netType: nav.connection?.type ?? null,
    crossOriginIsolated: window.crossOriginIsolated,
  };
}
