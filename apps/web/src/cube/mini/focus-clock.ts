import { type Clock, realClock } from "@game/fair-play";

/**
 * 포커스가 있는 동안만 흐르는 시계(미니 모드의 시간 재기, docs/47 14절). `SolveSession`에 넣으면 창이 포커스를
 * 잃은 동안은 맞추는 시간이 늘지 않고, 다시 받으면 이어서 잰다.
 *
 * `after`는 바탕 시계 그대로다. 미니 모드는 살펴보기·체력이 없어 세션이 `after`를 쓰지 않는다.
 */
export class FocusClock implements Clock {
  private acc = 0;
  private since: number | null;

  constructor(
    private readonly base: Clock = realClock,
    focused = false,
  ) {
    this.since = focused ? base.now() : null;
  }

  get focused(): boolean {
    return this.since !== null;
  }

  now(): number {
    return this.acc + (this.since === null ? 0 : this.base.now() - this.since);
  }

  setFocused(on: boolean): void {
    if (on === this.focused) return;
    if (on) this.since = this.base.now();
    else {
      this.acc += this.base.now() - (this.since as number);
      this.since = null;
    }
  }

  after(ms: number, fn: () => void): () => void {
    return this.base.after(ms, fn);
  }
}
