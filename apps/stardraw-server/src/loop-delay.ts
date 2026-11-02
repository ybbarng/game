import { monitorEventLoopDelay } from "node:perf_hooks";
import type { Clock } from "@game/fair-play";

/**
 * 최근 이벤트 루프 지연 최대(ms, 2026-11-03). `/api/state`의 `loopDelayMaxMs`로 내보내 바깥 감시가 서버가 멈추는지
 * 본다(관측지 몰림에서 루프가 몇 초씩 멈춰도 상태 응답 하나로는 알기 어려웠다). 지금 구간(windowMs)과 바로 앞 구간 중
 * 큰 값이라, 구간이 바뀐 직후에도 방금 전의 멈춤이 사라지지 않는다
 */

/** perf_hooks 히스토그램에서 쓰는 것(시험이 흉내 낸다). 값은 나노초 */
export interface DelaySource {
  readonly max: number;
  reset(): void;
}

export class LoopDelay {
  private previousMs = 0;
  private windowStart: number;

  constructor(
    private readonly source: DelaySource,
    private readonly clock: Pick<Clock, "now">,
    private readonly windowMs = 60_000,
  ) {
    this.windowStart = clock.now();
  }

  /** 최근 최대(ms, 소수 첫째 자리까지) */
  recentMaxMs(): number {
    const now = this.clock.now();
    if (now - this.windowStart >= this.windowMs) {
      // 한 구간 넘게 묻지 않았으면 앞 구간은 지금 히스토그램이 덮은 시간 전체다
      this.previousMs = this.currentMs();
      this.source.reset();
      this.windowStart = now;
    }
    return Math.round(Math.max(this.previousMs, this.currentMs()) * 10) / 10;
  }

  private currentMs(): number {
    const max = this.source.max;
    // 표본이 없으면 perf_hooks가 아주 큰 값을 준다
    return Number.isFinite(max) && max > 0 && max < 1e15 ? max / 1e6 : 0;
  }
}

/** 운영: 20ms 간격으로 재는 히스토그램 */
export function startLoopDelay(clock: Pick<Clock, "now">): LoopDelay {
  const h = monitorEventLoopDelay({ resolution: 20 });
  h.enable();
  return new LoopDelay(h, clock);
}
