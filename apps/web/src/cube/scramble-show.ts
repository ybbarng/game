import { type CubeMove, parseMoves, solvedCube } from "@game/cube-engine";
import type { Clock } from "@game/fair-play";
import type { PuzzleState } from "@game/puzzle-core";

import { stickersFromState } from "./bridge";
import type { CubeScene } from "./view/types";

/**
 * 섞기 연출(docs/47 3-1, 2026-11-11). 섞은 모양을 어떻게 보여 줄지만 정한다. 엔진 상태와 시간은 건드리지 않는다:
 * 세션은 `start(…, { hold: true })`로 섞인 상태를 받아 두고 연출이 끝나거나 첫 키가 들어올 때 시간을 연다
 * (`SolveSession.release`). 사이트 혼자 맞추기와 Cubie 미니 화면이 같이 쓴다.
 *
 * - 바로: 섞인 모양으로 즉시(예전 그대로).
 * - 하나씩 빠르게: 맞춘 큐브에서 섞기 수를 차례로 빠르게 돌린다. 3×3(약 20수)이 1초 안팎, 5×5(60수)도 2초 안쪽.
 * - 짧은 연출: 크기와 상관없이 0.5초. 큐브가 세로축으로 한 바퀴 돌고, 반 바퀴(뒤를 볼 때)에서 섞인 모양으로 바뀐다.
 *
 * 공식 섞기(WCA)는 큐브 방향을 바꾸지 않으므로(흰 위·초록 앞) 끝난 뒤 방향은 처음과 같다(한 바퀴 = 제자리).
 */

/** 설정 값. 「크기에 맞게」는 5×5까지 하나씩 빠르게, 6×6·7×7은 짧은 연출 */
export type ScrambleShowSetting = "auto" | "instant" | "moves" | "spin";

export const SCRAMBLE_SHOW_LABEL: Record<ScrambleShowSetting, string> = {
  auto: "크기에 맞게",
  instant: "바로",
  moves: "하나씩 빠르게",
  spin: "짧은 연출",
};

export const SCRAMBLE_SHOW_SETTINGS = Object.keys(
  SCRAMBLE_SHOW_LABEL,
) as ScrambleShowSetting[];

export type ScrambleShowKind = Exclude<ScrambleShowSetting, "auto">;

/** 「크기에 맞게」에서 하나씩 빠르게를 쓰는 가장 큰 크기 */
export const AUTO_MOVES_MAX_N = 5;

/** 짧은 연출의 길이(ms) */
export const SPIN_MS = 500;

/** 칸 시간이 소수라 생기는 반올림 틈(ms) */
const EPS_MS = 1e-6;

/** 하나씩 빠르게: 기준(3×3 섞기 20수)에 걸리는 시간과 큰 큐브의 상한(ms) */
const MOVES_BASE_MS = 1000;
const MOVES_BASE_COUNT = 20;
const MOVES_MAX_MS = 2000;

/** 이 크기·설정에서 실제로 쓸 연출. 움직임 줄이기를 켠 기기는 늘 바로 */
export function resolveScrambleShow(
  setting: ScrambleShowSetting,
  n: number,
  reducedMotion: boolean,
): ScrambleShowKind {
  if (reducedMotion) return "instant";
  if (setting !== "auto") return setting;
  return n <= AUTO_MOVES_MAX_N ? "moves" : "spin";
}

/**
 * 하나씩 빠르게의 전체 시간(ms). 수가 늘수록 조금씩 길어지되(√) 2초를 넘지 않는다.
 * 2×2 11수 약 0.74초, 3×3 20수 1초, 4×4 40수 약 1.41초, 5×5 60수 약 1.73초, 6×6·7×7은 2초
 */
export function movesShowMs(count: number): number {
  if (count <= 0) return 0;
  return Math.min(
    MOVES_MAX_MS,
    Math.round(MOVES_BASE_MS * Math.sqrt(count / MOVES_BASE_COUNT)),
  );
}

/** 연출 계획 */
export type ScrambleShowPlan =
  | { kind: "instant" }
  | { kind: "moves"; moves: readonly CubeMove[]; stepMs: number }
  | { kind: "spin"; ms: number };

export function planScrambleShow(
  kind: ScrambleShowKind,
  n: number,
  scramble: string,
): ScrambleShowPlan {
  if (kind === "spin") return { kind, ms: SPIN_MS };
  if (kind === "instant") return { kind };
  let moves: CubeMove[];
  try {
    moves = parseMoves(n, scramble);
  } catch {
    return { kind: "instant" };
  }
  if (moves.length === 0) return { kind: "instant" };
  return { kind, moves, stepMs: movesShowMs(moves.length) / moves.length };
}

/** 연출 계획의 전체 시간(ms) */
export function planMs(plan: ScrambleShowPlan): number {
  if (plan.kind === "moves") return plan.stepMs * plan.moves.length;
  if (plan.kind === "spin") return plan.ms;
  return 0;
}

/** 연출이 그리는 곳(3D 장면). 상태 기계는 이것만 부른다 */
export interface ScrambleShowTarget {
  /** 맞춘 큐브로 칠한다(하나씩 빠르게의 시작) */
  solved(): void;
  /** 수 하나를 `ms` 동안 돌린다 */
  turn(move: CubeMove, ms: number): void;
  /** 큐브 전체를 `ms` 동안 한 바퀴 돌린다 */
  spin(ms: number): void;
  /** 섞인 모양으로 칠한다(돌던 한 바퀴는 그대로 이어 돈다) */
  paint(): void;
  /** 움직임을 멈추고 섞인 모양으로 칠한다(여러 번 불러도 같다) */
  scrambled(): void;
}

/**
 * 연출 하나의 진행(상태 기계). 시계를 넣어 시험한다(`ManualClock`).
 * - `play`: 새 연출(돌던 것은 섞인 모양으로 칠하지 않고 버린다. 새 연출이 처음부터 칠한다).
 * - `finish`: 연출을 바로 끝내 섞인 모양으로 두고 `onDone`을 부른다(키가 들어왔을 때). 돌던 연출이 있었으면 true.
 * - `cancel`: 연출을 멈추고 섞인 모양으로 두되 `onDone`은 부르지 않는다(새 섞기를 기다리는 동안).
 * - `drop`: 장면을 건드리지 않고 멈춘다(맞춘 상태로·다시 보기처럼 장면을 따로 칠할 때).
 */
export class ScrambleShow {
  private readonly clock: Clock;
  private readonly onChange: (() => void) | undefined;
  private run: {
    target: ScrambleShowTarget;
    onDone: () => void;
    stop: () => void;
  } | null = null;

  constructor(clock: Clock, onChange?: () => void) {
    this.clock = clock;
    this.onChange = onChange;
  }

  /** 연출 중인가 */
  get running(): boolean {
    return this.run !== null;
  }

  play(
    plan: ScrambleShowPlan,
    target: ScrambleShowTarget,
    onDone: () => void,
  ): void {
    this.stopRun();
    if (plan.kind === "instant") {
      target.scrambled();
      onDone();
      this.onChange?.();
      return;
    }
    let cancel: () => void = () => {};
    const run = { target, onDone, stop: () => cancel() };
    this.run = run;
    const end = () => {
      if (this.run !== run) return;
      this.run = null;
      target.scrambled();
      onDone();
      this.onChange?.();
    };
    // 차례는 시작 시각에서 잰다. 타이머가 늦게 와도(바쁜 기기·그리기가 느린 기기) 밀린 수는 바로 돌려 따라잡고,
    // 계획한 시간에 끝난다(타이머를 이어 걸면 늦음이 쌓여 연출이 몇 배로 길어진다)
    const t0 = this.clock.now();
    const total = planMs(plan);
    const at = (ms: number, fn: () => void) => {
      cancel = this.clock.after(Math.max(0, t0 + ms - this.clock.now()), () => {
        if (this.run === run) fn();
      });
    };
    if (plan.kind === "moves") {
      const { moves, stepMs } = plan;
      target.solved();
      let i = 0;
      const next = () => {
        const elapsed = this.clock.now() - t0;
        if (elapsed >= total - EPS_MS) {
          end();
          return;
        }
        // 지금까지 돌았어야 할 수: 앞의 밀린 수는 바로, 마지막 수만 한 칸 시간으로
        const due = Math.min(
          moves.length,
          Math.floor((elapsed + EPS_MS) / stepMs) + 1,
        );
        while (i < due) {
          target.turn(moves[i] as CubeMove, i < due - 1 ? 0 : stepMs);
          i++;
        }
        at(i < moves.length ? i * stepMs : total, next);
      };
      next();
    } else {
      // 맞춘 큐브로 돌기 시작해 반 바퀴(뒤를 볼 때) 섞인 모양으로 바꾼다
      target.solved();
      target.spin(plan.ms);
      at(plan.ms / 2, () => {
        target.paint();
        at(plan.ms, end);
      });
    }
    this.onChange?.();
  }

  finish(): boolean {
    const r = this.run;
    if (!r) return false;
    this.stopRun();
    r.target.scrambled();
    r.onDone();
    this.onChange?.();
    return true;
  }

  cancel(): void {
    const r = this.run;
    if (!r) return;
    this.stopRun();
    r.target.scrambled();
    this.onChange?.();
  }

  drop(): void {
    if (!this.run) return;
    this.stopRun();
    this.onChange?.();
  }

  private stopRun(): void {
    const r = this.run;
    this.run = null;
    r?.stop();
  }
}

/**
 * 3D 장면에 그리는 연출 자리. 장면은 그때그때 `getView`로 찾는다(크기·품질을 바꾸면 장면이 새로 생긴다).
 * 크기가 다른 장면이면 칠하지 않는다(새 장면은 만들 때 엔진 상태로 칠한다)
 */
export function viewShowTarget(
  getView: () => CubeScene | null,
  n: number,
  scrambled: PuzzleState,
): ScrambleShowTarget {
  const view = () => {
    const v = getView();
    return v && v.n === n ? v : null;
  };
  return {
    solved: () => view()?.setStickers(stickersFromState(n, solvedCube(n))),
    turn: (move, ms) => view()?.enqueue(move, ms),
    spin: (ms) => view()?.spin(ms),
    paint: () => view()?.setStickers(stickersFromState(n, scrambled)),
    scrambled: () => {
      const v = view();
      if (!v) return;
      v.spin(0);
      v.setStickers(stickersFromState(n, scrambled));
    },
  };
}

/**
 * 섞은 판을 3D 장면에 연출한다(사이트 혼자 맞추기·Cubie 미니 화면이 같이 쓴다). 세션은 먼저
 * `start(…, { hold: !instant })`로 섞인 상태를 받아 두고, 연출이 끝나면 `onDone`에서 `release`한다.
 * 「바로」면 장면만 칠하고 `onDone`을 바로 부른다
 */
export function showScramble(
  show: ScrambleShow,
  o: {
    kind: ScrambleShowKind;
    n: number;
    scramble: string;
    scrambled: PuzzleState;
    getView: () => CubeScene | null;
    onDone: () => void;
  },
): void {
  // 그릴 장면이 없으면(3D를 못 그리는 기기, 장면이 아직 없거나 다른 크기) 연출 없이 바로
  const view = o.getView();
  const kind = view && view.n === o.n ? o.kind : "instant";
  show.play(
    planScrambleShow(kind, o.n, o.scramble),
    viewShowTarget(o.getView, o.n, o.scrambled),
    o.onDone,
  );
}
