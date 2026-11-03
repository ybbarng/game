/**
 * 기기 안 길이를 재는 단조 시계(docs/43 4-1 `MonotonicClock`). 제한 시간용 `Clock`(벽시계 `Date.now`)과 따로 둔다.
 * 제품은 `performance.now`(사용자가 시계를 바꿔도 뒤로 가지 않고, `event.timeStamp`·`requestAnimationFrame`
 * 시각과 같은 기준). 시험은 기기마다 시작점이 다른 가짜를 넣는다(`ManualMonotonic`).
 * 공통 장치로 옮길 때 `packages/fair-play/src/clock.ts` 옆으로 간다.
 */
export interface MonotonicClock {
  /** 지금 시각(ms, 소수 가능). 기기마다 시작점이 달라 다른 기기 값과 바로 빼면 안 된다 */
  now(): number;
}

export const performanceClock: MonotonicClock = {
  now: () => performance.now(),
};

/** 시험용: `set`·`advance`로 옮길 때만 흐른다 */
export class ManualMonotonic implements MonotonicClock {
  constructor(private time = 0) {}
  now(): number {
    return this.time;
  }
  advance(ms: number): void {
    this.time += ms;
  }
  set(time: number): void {
    this.time = time;
  }
}
