/*
 * 가운데 더미 치기 = "원카드!"(docs/43 3-1·3-2).
 * - 시각은 누르기 시작한 순간(`pointerdown`)으로 잡고, 그 순간 화면에 그려져 있던 판 번호를 `seen`으로 삼는다.
 * - 실수 막기: `HOLD_MS`(150ms) 동안 손을 대고 있어야 확정한다. 그사이 떼거나 미끄러지면 취소.
 *   확정이 늦어도 `seen`은 누르기 시작한 순간 것이라 판정 순서는 바뀌지 않는다.
 * - 손가락 둘 이상이 함께 닿으면(손바닥) 무시하고, 모두 뗄 때까지 새 누름을 받지 않는다.
 * - 키보드(스페이스)도 같은 `HOLD_MS` 뒤에 확정한다(떼어도 취소하지 않는다). 누름에서 청구를 보내기까지가 늘 같아야
 *   방장이 반응 시간 경계에서 그만큼 뺄 수 있다(docs/42 17-3). 되풀이(`repeat`)는 부르는 쪽이 거른다.
 * - 확정하면 누른 순간의 판 번호와 반응 시간(누른 시각 − 그 판을 그린 시각)을 넘긴다.
 */
import type { Clock } from "@game/fair-play";

export const HOLD_MS = 150;

export class ShoutPress {
  /** 확정을 기다리는 누름 */
  private pending: {
    pointer: number;
    seen: number;
    cancel: () => void;
  } | null = null;
  /** 키보드 누름(누르고 있기를 보지 않는다) */
  private readonly keys = new Set<() => void>();
  /** 지금 닿아 있는 손가락 */
  private readonly down = new Set<number>();
  /** 여러 손가락이 닿아 막았다(모두 뗄 때까지) */
  private blocked = false;

  constructor(
    private readonly clock: Clock,
    private readonly onConfirm: (seen: number, rtMs?: number) => void,
    private readonly holdMs = HOLD_MS,
  ) {}

  /** 누르기 시작. `seen`은 누른 순간 화면에 그려져 있던 판 번호, `rtMs`는 그 판을 그린 뒤 누르기까지 */
  press(pointer: number, seen: number, rtMs?: number): void {
    this.down.add(pointer);
    if (this.down.size > 1 || this.blocked) {
      this.blocked = true;
      this.drop();
      return;
    }
    this.drop();
    const cancel = this.clock.after(this.holdMs, () => {
      if (this.pending?.pointer !== pointer) return;
      this.pending = null;
      this.onConfirm(seen, rtMs);
    });
    this.pending = { pointer, seen, cancel };
  }

  /** 손을 뗐다·미끄러졌다·취소됐다. 확정 전이면 버린다 */
  release(pointer: number): void {
    this.down.delete(pointer);
    if (this.pending?.pointer === pointer) this.drop();
    if (this.down.size === 0) this.blocked = false;
  }

  /** 키보드: `holdMs` 뒤 확정(떼도 취소하지 않는다) */
  key(seen: number, rtMs?: number): void {
    const cancel = this.clock.after(this.holdMs, () => {
      this.keys.delete(cancel);
      this.onConfirm(seen, rtMs);
    });
    this.keys.add(cancel);
  }

  /** 기다리는 누름이 있나(시험용) */
  get holding(): boolean {
    return this.pending !== null;
  }

  dispose(): void {
    this.drop();
    for (const cancel of this.keys) cancel();
    this.keys.clear();
    this.down.clear();
    this.blocked = false;
  }

  private drop(): void {
    this.pending?.cancel();
    this.pending = null;
  }
}
