import {
  applyMove,
  type CubeMove,
  formatMove,
  invertMove,
  isRotation,
  isSolved,
  parseMoves,
  type StickerMask,
  solvedCube,
  stageMask,
} from "@game/cube-engine";
import type { Clock } from "@game/fair-play";
import type { PuzzleState } from "@game/puzzle-core";

import type { SolveMode, SolveRecord } from "./records";

/**
 * 혼자 맞추기·가상 블라인드 한 번의 진행(docs/47 1·7절). 화면을 모르는 순수 상태 기계라 시계(`Clock`)를 넣어 시험한다.
 * 엔진 상태가 기준이다: 키를 누른 순간 수가 적용되고 시간도 그 순간으로 잰다. 3D 장면은 따라 그릴 뿐이다.
 *
 * 혼자 맞추기:  free(맞춘 큐브, 마음대로) → 섞기 → inspect(살펴보기) 또는 ready → 첫 면 돌리기로 solving → done
 *   - 살펴보기 동안 면 돌리기는 "시작"이다: 그 수가 살펴보기를 끝내고 시간을 연다(살펴보기만 하며 몰래 돌릴 수 없다).
 *     큐브 돌리기(x·y·z)와 보기 돌리기는 시간을 열지 않는다.
 *   - 살펴보기 벌점은 타이머와 같다(WCA A3): 15초 넘겨 시작하면 +2, 17초 넘기면 DNF. 8·12초에 알림.
 * 블라인드:  free → 섞기 → memo(외우기, 면 돌리기 막음) → 「시작」 → blindSolve(모두 가림) → 「끝」 → done
 */

export type SolvePhase =
  | "free"
  | "inspect"
  | "ready"
  | "solving"
  | "memo"
  | "blindSolve"
  | "done";

export type SessionCue = "inspect8" | "inspect12" | "solved" | "dnf";

export interface SolveResult {
  /** 맞춘 시간(ms, 벌점 빼고). DNF면 null */
  ms: number | null;
  penalty: number;
  moves: number;
  /** 블라인드: 외우기 시간 */
  memoMs?: number;
  /** 블라인드: 맞추기만의 시간 */
  execMs?: number;
  /** 왜 DNF인가 */
  dnfReason?: "inspection" | "unsolved";
}

export interface MoveEntry {
  notation: string;
  move: CubeMove;
  /** 맞추기(블라인드는 외우기) 시작부터 ms. 살펴보기 중 큐브 돌리기는 음수 */
  t: number;
}

export const INSPECTION_MS = 15_000;
export const INSPECTION_DNF_MS = 17_000;
export const INSPECTION_ALERTS = [8_000, 12_000] as const;

export interface SolveSessionOptions {
  n: number;
  mode: SolveMode;
  /** 혼자 맞추기의 살펴보기(블라인드는 쓰지 않는다) */
  inspection: boolean;
  clock: Clock;
  /** 상태가 바뀔 때마다(화면 다시 그리기) */
  onChange?: () => void;
  /** 소리·알림 */
  onCue?: (cue: SessionCue) => void;
  /** 한 번이 끝나 기록이 생겼을 때 */
  onRecord?: (record: SolveRecord) => void;
}

/** 수 하나를 넣은 결과 */
export type InputResult =
  /** 적용했다 */
  | "applied"
  /** 지금은 면 돌리기를 막는다(블라인드 외우기) */
  | "blocked";

export class SolveSession {
  readonly n: number;
  readonly mode: SolveMode;
  private readonly clock: Clock;
  private readonly opts: SolveSessionOptions;

  phase: SolvePhase = "free";
  state: PuzzleState;
  /** 지금 판의 섞기 글 */
  scramble = "";
  /** 섞기를 만든 씨앗 */
  seed: number | undefined;
  /** 지금 판에 넣은 수(살펴보기 중 큐브 돌리기, 되돌리기 포함). 다시 보기에 쓴다 */
  history: MoveEntry[] = [];
  /** 되돌릴 수 있는 수(되돌리기로 넣은 수는 빼고) */
  private undoStack: CubeMove[] = [];
  /** 면 돌린 수(되돌리기도 한 수, 큐브 돌리기는 빼고) */
  moveCount = 0;
  result: SolveResult | null = null;
  /** 살펴보기·외우기가 시작된 시각 */
  private phaseStart = 0;
  /** 맞추기(블라인드는 외우기) 시작 시각 */
  private solveStart = 0;
  private memoEnd = 0;
  private timers: (() => void)[] = [];
  /** 정리했는가. 정리한 세션은 새 판을 열지 않고 소리·기록도 내지 않는다(늦게 온 섞기가 옛 세션을 깨우지 않게) */
  private disposedFlag = false;
  inspection: boolean;

  constructor(opts: SolveSessionOptions) {
    this.opts = opts;
    this.n = opts.n;
    this.mode = opts.mode;
    this.clock = opts.clock;
    this.inspection = opts.inspection;
    this.state = solvedCube(opts.n);
  }

  /** 지금 가림(블라인드 맞추기 중에는 모두 까맣게, 끝나면 공개) */
  get mask(): StickerMask | null {
    return this.phase === "blindSolve" ? stageMask(this.n, "all-hidden") : null;
  }

  /** 시간이 흐르는 중인가(화면이 시계를 돌릴지) */
  get running(): boolean {
    return (
      this.phase === "inspect" ||
      this.phase === "solving" ||
      this.phase === "memo" ||
      this.phase === "blindSolve" ||
      this.phase === "ready"
    );
  }

  /** 지금 보여 줄 시간(ms). 살펴보기면 지난 살펴보기 시간 */
  elapsed(): number {
    const now = this.clock.now();
    switch (this.phase) {
      case "inspect":
      case "ready":
        return now - this.phaseStart;
      case "solving":
      case "memo":
      case "blindSolve":
        return now - this.solveStart;
      case "done":
        return this.result?.ms ?? 0;
      default:
        return 0;
    }
  }

  /** 섞기 글을 받아 새 판을 연다 */
  start(scramble: string, seed?: number): void {
    if (this.disposedFlag) return;
    this.clearTimers();
    const moves = parseMoves(this.n, scramble);
    let s = solvedCube(this.n);
    for (const m of moves) s = applyMove(this.n, s, m);
    this.state = s;
    this.scramble = scramble;
    this.seed = seed;
    this.history = [];
    this.undoStack = [];
    this.moveCount = 0;
    this.result = null;
    this.penalty = 0;
    const now = this.clock.now();
    this.phaseStart = now;
    if (this.mode === "blind") {
      this.phase = "memo";
      this.solveStart = now;
    } else if (this.inspection) {
      this.phase = "inspect";
      for (const at of INSPECTION_ALERTS)
        this.timers.push(
          this.clock.after(at, () =>
            this.cue(at === 8_000 ? "inspect8" : "inspect12"),
          ),
        );
      this.timers.push(
        this.clock.after(INSPECTION_DNF_MS, () => this.inspectionTimeout()),
      );
    } else {
      this.phase = "ready";
    }
    this.changed();
  }

  /** 맞춘 상태로(판을 버린다) */
  reset(): void {
    this.clearTimers();
    this.phase = "free";
    this.state = solvedCube(this.n);
    this.scramble = "";
    this.seed = undefined;
    this.history = [];
    this.undoStack = [];
    this.moveCount = 0;
    this.result = null;
    this.changed();
  }

  /** 수 하나. 받아들였으면 "applied"(화면이 장면에 넣는다) */
  input(move: CubeMove, notation: string): InputResult {
    const r = this.apply(move, notation);
    if (r === "applied") this.undoStack.push(move);
    return r;
  }

  private apply(move: CubeMove, notation: string): InputResult {
    const rotation = isRotation(this.n, move);
    if (!rotation && this.phase === "memo") return "blocked";
    const now = this.clock.now();
    if (!rotation && (this.phase === "inspect" || this.phase === "ready"))
      this.beginSolve(now);
    this.state = applyMove(this.n, this.state, move);
    const counting =
      this.phase === "solving" ||
      this.phase === "blindSolve" ||
      this.phase === "memo";
    if (counting || this.phase === "inspect" || this.phase === "ready")
      this.history.push({ notation, move, t: now - this.solveStart });
    if (!rotation) this.moveCount++;
    if (this.phase === "solving" && isSolved(this.n, this.state))
      this.finishSolo(now);
    this.changed();
    return "applied";
  }

  /** 마지막 수를 거꾸로 돌린다(되돌리기도 한 수로 센다). 돌린 수를 돌려준다 */
  undo(): CubeMove | null {
    const last = this.undoStack.at(-1);
    if (!last) return null;
    const inv = invertMove(last);
    if (this.apply(inv, formatMove(this.n, inv)) !== "applied") return null;
    this.undoStack.pop();
    return inv;
  }

  /**
   * 「시작」·「끝」(블라인드), 살펴보기 끝(혼자 맞추기에서는 살펴보기를 접고 첫 면 돌리기를 기다린다).
   * 무엇을 했는지 돌려준다.
   */
  advance(): "memoEnd" | "blindEnd" | "inspectEnd" | null {
    const now = this.clock.now();
    if (this.phase === "inspect") {
      // 살펴보기를 접는다. 벌점은 접은 순간으로 정하고, 첫 면 돌리기로 시간이 열린다
      this.penalty = now - this.phaseStart > INSPECTION_MS ? 2_000 : 0;
      this.clearTimers();
      this.phase = "ready";
      this.changed();
      return "inspectEnd";
    }
    if (this.phase === "memo") {
      this.memoEnd = now;
      this.phase = "blindSolve";
      this.changed();
      return "memoEnd";
    }
    if (this.phase === "blindSolve") {
      const solved = isSolved(this.n, this.state);
      const total = now - this.solveStart;
      this.result = {
        ms: solved ? total : null,
        penalty: 0,
        moves: this.moveCount,
        memoMs: this.memoEnd - this.solveStart,
        execMs: now - this.memoEnd,
        ...(solved ? {} : { dnfReason: "unsolved" as const }),
      };
      this.phase = "done";
      this.cue(solved ? "solved" : "dnf");
      this.record();
      this.changed();
      return "blindEnd";
    }
    return null;
  }

  /** 화면을 떠나거나 크기를 바꿀 때. 타이머를 멈추고 그 뒤 부르는 것은 모두 무시한다 */
  dispose(): void {
    this.disposedFlag = true;
    this.clearTimers();
  }

  get disposed(): boolean {
    return this.disposedFlag;
  }

  private beginSolve(now: number): void {
    const inspected = now - this.phaseStart;
    const wasInspect = this.phase === "inspect";
    this.clearTimers();
    // 살펴보기 중 큐브 돌리기의 시각을 맞추기 시작 기준으로 다시 잰다
    for (const e of this.history) e.t -= now - this.solveStart;
    this.solveStart = now;
    this.phase = "solving";
    if (wasInspect) this.penalty = inspected > INSPECTION_MS ? 2_000 : 0;
  }

  private penalty = 0;

  private finishSolo(now: number): void {
    this.result = {
      ms: now - this.solveStart,
      penalty: this.penalty,
      moves: this.moveCount,
    };
    this.phase = "done";
    this.clearTimers();
    this.cue("solved");
    this.record();
  }

  private inspectionTimeout(): void {
    if (this.disposedFlag || this.phase !== "inspect") return;
    this.result = {
      ms: null,
      penalty: 0,
      moves: 0,
      dnfReason: "inspection",
    };
    this.phase = "done";
    this.clearTimers();
    this.cue("dnf");
    this.record();
    this.changed();
  }

  private record(): void {
    const r = this.result;
    if (!r || this.disposedFlag) return;
    const record: SolveRecord = {
      at: Date.now(),
      n: this.n,
      mode: this.mode,
      ms: r.ms,
      penalty: r.penalty,
      moves: r.moves,
      scramble: this.scramble,
      ...(this.seed === undefined ? {} : { seed: this.seed }),
      ...(r.memoMs === undefined ? {} : { memoMs: r.memoMs }),
      replay: this.history
        .map((e) => `${e.notation}@${Math.round(e.t)}`)
        .join(" "),
    };
    this.opts.onRecord?.(record);
  }

  private clearTimers(): void {
    for (const off of this.timers) off();
    this.timers = [];
  }

  private cue(cue: SessionCue): void {
    if (!this.disposedFlag) this.opts.onCue?.(cue);
  }

  private changed(): void {
    this.opts.onChange?.();
  }
}
