import { type CubeMove, invertMoves, parseMoves } from "@game/cube-engine";
import type { Clock } from "@game/fair-play";

/**
 * 미니 모드가 가만히 떠 있을 때(포커스 없음)의 움직임(docs/47 15절, 사용자 2026-11-09).
 *
 * - 큐브가 맞춰져 있으면 이따금 첫 화면 연출(섞고 해법대로 맞추기 한 판)을 보인다.
 * - 섞여 있으면(맞추다 만 상태) 이따금 몇 수를 저절로 돌렸다가 같은 수를 거꾸로 되돌린다. 움직임은 3D 장면에만 넣고
 *   엔진 상태(사용자의 진행)는 건드리지 않는다. 끝나거나 멈추면 장면을 엔진 상태로 다시 칠한다(`restore`).
 * - 움직이는 동안만 그리고 나머지는 쉰다(3D 장면은 움직일 때만 그린다). 포커스를 받으면 바로 멈추고 되돌린다.
 *
 * 화면 틀을 모르는 상태 기계라 `Clock`을 넣어 시험한다.
 */

export interface IdleTiming {
  /** 포커스를 잃고 처음 움직이기까지 */
  firstMs: number;
  /** 맞춘 큐브의 연출 사이 간격 */
  heroEveryMs: number;
  /** 섞인 큐브의 조금 섞기 사이 간격 */
  jiggleEveryMs: number;
  /** 조금 섞기 한 수의 간격(회전이 끝나고 잠깐 멈출 만큼) */
  jiggleStepMs: number;
  /** 조금 섞기의 수(되돌리는 수는 따로) */
  jiggleMoves: number;
}

/**
 * 기본 간격. 첫 화면 연출 한 판(3×3)은 약 30초 동안 그리고, 조금 섞기는 4수 + 되돌리기 4수로 약 4초다.
 * 사용자 요청 「성능을 최대한 적게」에 맞춰 그리는 시간이 전체의 몇 %가 되지 않게 잡았다: 연출은 6분에 한 번
 * (약 8%), 조금 섞기는 2분에 한 번(약 3%). 처음 움직임은 포커스를 잃고 1분 뒤(바로 움직이면 Esc를 누르자마자
 * 큐브가 돌아 어지럽다)
 */
export const IDLE_TIMING: IdleTiming = {
  firstMs: 60_000,
  heroEveryMs: 6 * 60_000,
  jiggleEveryMs: 2 * 60_000,
  jiggleStepMs: 500,
  jiggleMoves: 4,
};

const FACES = ["U", "D", "R", "L", "F", "B"] as const;
const AXIS: Record<(typeof FACES)[number], number> = {
  U: 0,
  D: 0,
  R: 1,
  L: 1,
  F: 2,
  B: 2,
};
const SUFFIXES = ["", "'", "2"] as const;

/**
 * 조금 섞기 한 번의 수: 바깥 면 `count`수(이웃한 두 수는 다른 축) 뒤에 그 거꾸로. 이어서 두면 처음 상태로 돌아온다.
 * 바깥 면만 써서 큰 큐브에서도 들고 있는 방향·센터가 바뀌지 않는다
 */
export function jigglePlan(
  n: number,
  rng: () => number,
  count: number,
): CubeMove[] {
  const tokens: string[] = [];
  let lastAxis = -1;
  while (tokens.length < count) {
    const face = FACES[
      Math.floor(rng() * FACES.length)
    ] as (typeof FACES)[number];
    if (AXIS[face] === lastAxis) continue;
    lastAxis = AXIS[face];
    tokens.push(`${face}${SUFFIXES[Math.floor(rng() * SUFFIXES.length)]}`);
  }
  const forward = parseMoves(n, tokens.join(" "));
  return [...forward, ...invertMoves(forward)];
}

/** 수를 `stepMs` 간격으로 하나씩 둔다. 다 두고 `stepMs` 뒤 `done`. 끄는 함수를 돌려준다 */
export function playMoves(
  clock: Clock,
  moves: readonly CubeMove[],
  stepMs: number,
  onMove: (move: CubeMove) => void,
  done: () => void,
): () => void {
  let i = 0;
  let off: (() => void) | null = null;
  const step = () => {
    off = null;
    if (i >= moves.length) {
      done();
      return;
    }
    onMove(moves[i++] as CubeMove);
    off = clock.after(stepMs, step);
  };
  off = clock.after(0, step);
  return () => {
    off?.();
    off = null;
  };
}

export interface IdleHooks {
  /** 지금 엔진 상태가 맞춘 큐브인가 */
  solved(): boolean;
  /**
   * 첫 화면 연출 한 판을 시작한다. 끝나면 `done`. 끄는 함수를 돌려준다.
   * 연출을 못 하면(3D 없음, 연출이 없는 크기) null: 그때는 조금 섞기를 한다
   */
  hero(done: () => void): (() => void) | null;
  /** 조금 섞기 한 번(`jigglePlan` + `playMoves`). 끝나면 `done`. 끄는 함수를 돌려준다 */
  jiggle(done: () => void): () => void;
  /** 장면을 엔진 상태로 다시 칠한다(움직임이 끝났거나 멈췄을 때) */
  restore(): void;
  /** 움직임을 시작했다(화면 표시용) */
  started?(kind: Exclude<IdleShowing, null>): void;
}

export type IdleShowing = "hero" | "jiggle" | null;

export class IdleShow {
  private active = false;
  private timer: (() => void) | null = null;
  private stopShow: (() => void) | null = null;
  private kind: IdleShowing = null;

  constructor(
    private readonly clock: Clock,
    private readonly hooks: IdleHooks,
    private readonly timing: IdleTiming = IDLE_TIMING,
  ) {}

  /** 지금 움직이는 것 */
  get showing(): IdleShowing {
    return this.kind;
  }

  /** 다음 움직임이 걸려 있는가 */
  get armed(): boolean {
    return this.timer !== null;
  }

  /**
   * 쉬는 중(포커스 없음, 창이 보임)인가. 켜면 `firstMs` 뒤부터 움직이고, 끄면 움직이던 것을 바로 멈추고 되돌린다
   */
  setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    if (on) {
      this.arm(this.timing.firstMs);
      return;
    }
    this.clearTimer();
    this.cancelShow();
  }

  /** 엔진 상태가 바뀌었다(크기 바꾸기 등): 움직이던 것을 멈추고 되돌린 뒤 간격을 처음부터 잰다 */
  reset(): void {
    this.cancelShow();
    this.clearTimer();
    if (this.active) this.arm(this.timing.firstMs);
  }

  dispose(): void {
    this.active = false;
    this.clearTimer();
    this.stopShow?.();
    this.stopShow = null;
    this.kind = null;
  }

  private cancelShow(): void {
    if (!this.stopShow) return;
    this.stopShow();
    this.stopShow = null;
    this.kind = null;
    this.hooks.restore();
  }

  private clearTimer(): void {
    this.timer?.();
    this.timer = null;
  }

  private arm(ms: number): void {
    this.clearTimer();
    this.timer = this.clock.after(ms, () => {
      this.timer = null;
      this.fire();
    });
  }

  private fire(): void {
    if (!this.active) return;
    const finished = () => {
      if (!this.stopShow) return;
      this.stopShow = null;
      this.kind = null;
      this.hooks.restore();
      if (this.active)
        this.arm(
          this.hooks.solved()
            ? this.timing.heroEveryMs
            : this.timing.jiggleEveryMs,
        );
    };
    if (this.hooks.solved()) {
      // 끝내기를 시작하기 전에 정해 둔다(연출이 바로 끝나도 `finished`가 알아보게)
      this.kind = "hero";
      this.stopShow = () => undefined;
      const stop = this.hooks.hero(finished);
      if (stop) {
        if (this.stopShow) {
          this.stopShow = stop;
          this.hooks.started?.("hero");
        }
        return;
      }
    }
    this.kind = "jiggle";
    this.stopShow = () => undefined;
    const stop = this.hooks.jiggle(finished);
    if (this.stopShow) {
      this.stopShow = stop;
      this.hooks.started?.("jiggle");
    }
  }
}
