import { type CubeMove, parseMoves } from "@game/cube-engine";
import type { Clock } from "@game/fair-play";

import { parseReplay } from "./records";

/**
 * 기록 다시 보기(혼자 맞추기 `SolveApp`, Cubie 기록 창·떠 있을 때 움직임, docs/47 15-13).
 *
 * 다시 보기 글(`SolveRecord.replay`, "R@120 U'@380")을 때 맞춘 걸음 목록으로 바꾸고(`solveSteps`), `ReplayPlayer`가
 * `Clock`에 맞춰 하나씩 내보낸다. 화면(3D 장면에 넣기, SVG 그림 상태 바꾸기)은 `onStep`이 맡는다.
 */

export interface ReplayStep {
  /** 다시 보기 시작부터 ms */
  at: number;
  moves: CubeMove[];
  /** 섞기를 빠르게 보이는 걸음(떠 있을 때)인가, 맞춘 과정인가 */
  part: "scramble" | "solve";
}

/** 오래 멈춘 곳은 이만큼으로 줄인다(혼자 맞추기 다시 보기와 같다) */
export const REPLAY_MAX_PAUSE_MS = 1_000;

/** 다시 보기 글 → 걸음. 첫 수가 0ms, 수 사이 멈춤은 `maxPauseMs`까지. 읽지 못하는 수는 건너뛴다 */
export function solveSteps(
  n: number,
  replay: string | undefined,
  maxPauseMs = REPLAY_MAX_PAUSE_MS,
  offset = 0,
): ReplayStep[] {
  const out: ReplayStep[] = [];
  let at = offset;
  let prev: number | null = null;
  for (const [notation, t] of parseReplay(replay)) {
    if (prev !== null) at += Math.min(maxPauseMs, Math.max(0, t - prev));
    prev = t;
    let moves: CubeMove[];
    try {
      moves = parseMoves(n, notation);
    } catch {
      continue;
    }
    if (moves.length > 0) out.push({ at, moves, part: "solve" });
  }
  return out;
}

/** 다시 보기 글을 돌리는 데 걸리는 시간(ms, 멈춤을 줄인 뒤). 수를 읽지 않아 가볍다 */
export function replayLength(
  replay: string | undefined,
  maxPauseMs = REPLAY_MAX_PAUSE_MS,
): number {
  let total = 0;
  let prev: number | null = null;
  for (const [, t] of parseReplay(replay)) {
    if (prev !== null) total += Math.min(maxPauseMs, Math.max(0, t - prev));
    prev = t;
  }
  return total;
}

export type ReplayStatus = "playing" | "paused" | "done";

export interface ReplayHooks {
  onStep(step: ReplayStep, index: number): void;
  /** 마지막 걸음 뒤 `endMs`가 지났다 */
  onEnd?(): void;
  /** 처음부터 다시: 그림을 시작 상태로 */
  onReset?(): void;
  onStatus?(status: ReplayStatus): void;
}

/**
 * 걸음을 시각대로 내보낸다. 멈추기·이어 보기·처음부터. 걸어 둔 타이머는 늘 하나(다음 걸음)라 멈추면 바로 선다.
 * 화면 틀을 모르니 `Clock`을 넣어 시험한다.
 */
export class ReplayPlayer {
  private index = 0;
  /** 멈춘 자리(ms) */
  private pos = 0;
  /** 돌기 시작한 시각(clock). 멈췄으면 null */
  private startedAt: number | null = null;
  private timer: (() => void) | null = null;
  private finished = false;

  constructor(
    private readonly clock: Clock,
    readonly steps: readonly ReplayStep[],
    private readonly hooks: ReplayHooks,
    private readonly endMs = 600,
  ) {}

  get status(): ReplayStatus {
    if (this.finished) return "done";
    return this.startedAt === null ? "paused" : "playing";
  }

  /** 내보낸 걸음 수 */
  get played(): number {
    return this.index;
  }

  /** 지금 자리(ms) */
  get position(): number {
    return (
      this.pos +
      (this.startedAt === null ? 0 : this.clock.now() - this.startedAt)
    );
  }

  /** 끝까지 걸리는 시간(ms, 끝 멈춤 포함) */
  get length(): number {
    return (this.steps.at(-1)?.at ?? 0) + this.endMs;
  }

  play(): void {
    if (this.finished) {
      this.restart();
      return;
    }
    if (this.startedAt !== null) return;
    this.startedAt = this.clock.now();
    this.schedule();
    this.hooks.onStatus?.("playing");
  }

  pause(): void {
    if (this.startedAt === null) return;
    this.pos = this.position;
    this.startedAt = null;
    this.clear();
    this.hooks.onStatus?.("paused");
  }

  toggle(): void {
    if (this.status === "playing") this.pause();
    else this.play();
  }

  restart(): void {
    this.clear();
    this.startedAt = null;
    this.index = 0;
    this.pos = 0;
    this.finished = false;
    this.hooks.onReset?.();
    this.play();
  }

  /** 버린다(화면을 떠날 때·포커스를 받을 때). 그 뒤로는 아무것도 내보내지 않는다 */
  stop(): void {
    this.clear();
    this.startedAt = null;
  }

  private clear(): void {
    this.timer?.();
    this.timer = null;
  }

  private schedule(): void {
    this.clear();
    const next = this.steps[this.index];
    const due = next ? next.at : this.length;
    this.timer = this.clock.after(Math.max(0, due - this.position), () => {
      this.timer = null;
      if (next) {
        this.index++;
        this.hooks.onStep(next, this.index - 1);
        if (this.startedAt !== null) this.schedule();
        return;
      }
      this.pos = this.length;
      this.startedAt = null;
      this.finished = true;
      this.hooks.onStatus?.("done");
      this.hooks.onEnd?.();
    });
  }
}
