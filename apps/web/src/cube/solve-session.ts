import {
  applyMove,
  type CubeMove,
  flowScore,
  formatMove,
  invertMove,
  isRotation,
  isSolved,
  type MilestoneId,
  milestonesOf,
  parseMoves,
  type SolveProgress,
  type StickerMask,
  solvedCube,
  solveProgress,
  stageMask,
} from "@game/cube-engine";
import type { Clock } from "@game/fair-play";
import type { PuzzleState } from "@game/puzzle-core";

import { LOW_RATIO, MoveCounter, type SessionLimit } from "./challenge";
import {
  COMBO_SHOW,
  type ComboState,
  EMPTY_COMBO,
  pushCombo,
} from "./flow/combo";
import {
  formatReplay,
  formatSplits,
  type SolveMode,
  type SolveRecord,
  type Split,
} from "./records";

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

export type SessionCue =
  | "inspect8"
  | "inspect12"
  /** 살펴보기 15초: 지금 시작하면 +2(대회의 끝 알림) */
  | "inspect15"
  /** 맞추는 동안 이정표 칩 하나가 새로 켜짐(같은 수에 여럿이 켜져도 한 번, 다 맞춘 수는 빼고) */
  | "milestone"
  | "solved"
  | "dnf"
  /** 제한 도전: 체력이 20% 아래로 내려감 */
  | "low";

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
  dnfReason?: "inspection" | "unsolved" | "time" | "moves";
}

export interface MoveEntry {
  notation: string;
  move: CubeMove;
  /** 맞추기(블라인드는 외우기) 시작부터 ms. 살펴보기 중 큐브 돌리기는 음수 */
  t: number;
}

export const INSPECTION_MS = 15_000;
export const INSPECTION_DNF_MS = 17_000;
/** 살펴보기 알림 시각. 대회처럼 8·12초, 15초에는 다른 소리(docs/51 5절) */
export const INSPECTION_ALERTS = [8_000, 12_000, 15_000] as const;
const ALERT_CUE: Record<(typeof INSPECTION_ALERTS)[number], SessionCue> = {
  8000: "inspect8",
  12000: "inspect12",
  15000: "inspect15",
};

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
  /**
   * 혼자 맞추기의 구간 기록: 이정표를 처음 지난 시각(맞추기 시작부터 ms), 지난 차례대로(docs/51 1-2).
   * 맞추는 동안만 잰다. 블라인드는 재지 않는다(가린 채 맞추는 동안 진행을 알려 주면 안 된다)
   */
  splits: Split[] = [];
  /** 이번 판 진행 막대의 가장 높았던 값(0~1, 막대의 눈금) */
  bestProgress = 0;
  /** 흐름 콤보(`flow/combo.ts`, 수 흐름 띠와 같은 규칙)와 이번 판 가장 긴 콤보 */
  private combo: ComboState = EMPTY_COMBO;
  private comboBest = 0;
  private progressCache: { state: PuzzleState; value: SolveProgress } | null =
    null;
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

  /**
   * 제한 도전의 체력(docs/51 2-3). `start`에서 판마다 정한다. 없으면 보통 혼자 맞추기.
   * 시간 체력은 첫 면 돌리기부터 줄고(살펴보기 +2초 벌점은 체력에서 뺀다), 칩 하나마다 채워진다(다 맞춘 수는 빼고).
   * 수 체력은 `MoveCounter`(HTM)로 세어 체력을 넘는 수를 두면 끝난다
   */
  limit: SessionLimit | null = null;
  private counter = new MoveCounter();
  /** 시간 체력: 0이 되는 시각(clock) */
  private deadline = 0;
  private limitTimers: (() => void)[] = [];
  /** 시간 체력: 채운 횟수와 마지막으로 채운 시각(clock, 화면의 「+10초」) */
  refills = 0;
  lastRefillAt: number | null = null;
  /** 끝났을 때 남은 체력 */
  private leftAtEnd: number | null = null;
  private lowCued = false;

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
  start(scramble: string, seed?: number, limit?: SessionLimit): void {
    if (this.disposedFlag) return;
    this.clearTimers();
    this.clearLimit();
    this.limit = limit ?? null;
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
    this.splits = [];
    this.bestProgress = 0;
    this.combo = EMPTY_COMBO;
    this.comboBest = 0;
    this.counter.reset();
    this.refills = 0;
    this.lastRefillAt = null;
    this.leftAtEnd = null;
    this.lowCued = false;
    this.solveEnd = 0;
    const now = this.clock.now();
    this.phaseStart = now;
    if (this.mode === "blind") {
      this.phase = "memo";
      this.solveStart = now;
    } else if (this.inspection) {
      this.phase = "inspect";
      for (const at of INSPECTION_ALERTS)
        this.timers.push(this.clock.after(at, () => this.cue(ALERT_CUE[at])));
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
    this.clearLimit();
    this.limit = null;
    this.phase = "free";
    this.state = solvedCube(this.n);
    this.scramble = "";
    this.seed = undefined;
    this.history = [];
    this.undoStack = [];
    this.moveCount = 0;
    this.result = null;
    this.splits = [];
    this.bestProgress = 0;
    this.combo = EMPTY_COMBO;
    this.comboBest = 0;
    this.counter.reset();
    this.refills = 0;
    this.lastRefillAt = null;
    this.leftAtEnd = null;
    this.lowCued = false;
    this.solveEnd = 0;
    this.changed();
  }

  /** 제한 도전: 처음 체력(시간은 ms, 수는 수). 막대의 100% */
  get hpMax(): number | null {
    const l = this.limit;
    if (!l) return null;
    return l.kind === "time" ? l.startMs : l.budget;
  }

  /** 제한 도전: 체력으로 센 수(HTM) */
  get limitMoves(): number {
    return this.counter.count;
  }

  /** 제한 도전: 지금 남은 체력(시간은 ms, 수는 수). 체력이 없는 판이면 null */
  hpLeft(): number | null {
    const l = this.limit;
    if (!l) return null;
    if (this.leftAtEnd !== null) return this.leftAtEnd;
    if (l.kind === "moves") return Math.max(0, l.budget - this.counter.count);
    if (this.phase === "solving")
      return Math.max(0, this.deadline - this.clock.now());
    return l.startMs - (this.phase === "ready" ? this.penalty : 0);
  }

  /** 지금 상태의 진행(조각 점수·큰 큐브 숫자). 같은 상태면 다시 계산하지 않는다 */
  get progress(): SolveProgress {
    const hit = this.progressCache;
    if (hit && hit.state === this.state) return hit.value;
    const value = solveProgress(this.n, this.state);
    this.progressCache = { state: this.state, value };
    return value;
  }

  /** 지금 상태의 흐름 콤보 진행 칸(`flowScore`). 같은 상태면 다시 계산하지 않는다 */
  get flowScore(): number {
    const hit = this.flowCache;
    if (hit && hit.state === this.state) return hit.value;
    const value = flowScore(this.n, this.state, this.progress.pieces);
    this.flowCache = { state: this.state, value };
    return value;
  }
  private flowCache: { state: PuzzleState; value: number } | null = null;

  /**
   * 이번 판 가장 긴 흐름 콤보(docs/51 2-1): 맞추는 동안 면 돌리기 사이가 1초 안쪽으로 이어진 수. 되돌리는 수와
   * 진행 없는 막 돌리기는 끊는다. 수 흐름 띠와 같은 규칙(`flow/combo.ts`)이다. 블라인드는 세지 않는다
   */
  get longestCombo(): number {
    return this.mode === "solo" ? this.comboBest : 0;
  }

  /** 지나간 이정표 하나의 시각(없으면 undefined) */
  splitOf(id: MilestoneId): number | undefined {
    return this.splits.find((x) => x.id === id)?.ms;
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
    const solved = this.phase === "solving" && isSolved(this.n, this.state);
    // 큐브 돌리기는 색 기준 판정을 바꾸지 않으니 세지 않는다
    if (this.phase === "solving" && this.mode === "solo" && !rotation)
      this.track(now - this.solveStart, solved);
    if (this.phase === "solving" && this.mode === "solo") {
      this.combo = pushCombo(
        this.combo,
        this.n,
        move,
        now,
        rotation ? undefined : this.flowScore,
      );
      if (this.combo.combo > this.comboBest) this.comboBest = this.combo.combo;
    }
    if (this.phase === "solving" && this.limit?.kind === "moves")
      this.countLimit(move, rotation, solved, now);
    if (this.phase === "solving" && solved) this.finishSolo(now);
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
    this.clearLimit();
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
    const l = this.limit;
    if (l?.kind === "time") {
      this.deadline = now + l.startMs - this.penalty;
      this.armTime();
    }
  }

  /** 시간 체력: 0이 되는 때와 20% 아래로 내려가는 때를 건다 */
  private armTime(): void {
    const l = this.limit;
    if (l?.kind !== "time") return;
    this.clearLimit();
    const now = this.clock.now();
    const left = this.deadline - now;
    const lowAt = left - l.startMs * LOW_RATIO;
    if (lowAt > 0) {
      this.lowCued = false;
      this.limitTimers.push(this.clock.after(lowAt, () => this.lowCue()));
    } else if (left > 0) this.lowCue();
    this.limitTimers.push(
      this.clock.after(Math.max(0, left), () => this.limitOut("time")),
    );
  }

  /** 수 체력: 한 수를 세고, 넘으면 끝 */
  private countLimit(
    move: CubeMove,
    rotation: boolean,
    solved: boolean,
    now: number,
  ): void {
    const l = this.limit;
    if (l?.kind !== "moves") return;
    this.counter.push(move, rotation, this.n);
    if (solved) return;
    const left = l.budget - this.counter.count;
    if (left < 0) {
      this.limitOut("moves", now);
      return;
    }
    if (left < l.budget * LOW_RATIO) this.lowCue();
    else this.lowCued = false;
  }

  private lowCue(): void {
    if (this.lowCued) return;
    this.lowCued = true;
    this.cue("low");
  }

  /** 체력이 다했다 */
  private limitOut(reason: "time" | "moves", at?: number): void {
    if (this.disposedFlag || this.phase !== "solving") return;
    const now = at ?? this.clock.now();
    this.leftAtEnd = 0;
    this.result = {
      ms: null,
      penalty: this.penalty,
      moves: this.moveCount,
      dnfReason: reason,
    };
    this.solveEnd = now;
    this.phase = "done";
    this.clearTimers();
    this.clearLimit();
    this.cue("dnf");
    this.record();
    this.changed();
  }

  /** 끝난 판이 맞추기 시작부터 걸린 시간(ms, 살펴보기에서 끝났으면 0) */
  get playedMs(): number {
    return this.phase === "done"
      ? Math.max(0, this.solveEnd - this.solveStart)
      : 0;
  }
  private solveEnd = 0;

  private clearLimit(): void {
    for (const off of this.limitTimers) off();
    this.limitTimers = [];
  }

  private penalty = 0;

  /** 이정표·막대 눈금을 고친다(맞추는 동안 수마다) */
  private track(t: number, solved: boolean): void {
    const value = this.progress.value;
    if (value > this.bestProgress) this.bestProgress = value;
    let fresh = false;
    for (const id of milestonesOf(this.n, this.state))
      if (!this.splits.some((x) => x.id === id)) {
        this.splits.push({ id, ms: t });
        fresh = true;
      }
    // 칩 하나에 한 번. 다 맞춘 수는 맞춤 소리가 맡는다
    if (fresh && !solved) this.cue("milestone");
    // 시간 체력: 새 칩 하나에 한 번 채운다(다 맞춘 수는 채우지 않는다)
    const l = this.limit;
    if (fresh && !solved && l?.kind === "time") {
      this.deadline += l.refillMs;
      this.refills++;
      this.lastRefillAt = this.clock.now();
      this.armTime();
    }
  }

  private finishSolo(now: number): void {
    if (this.limit) {
      this.leftAtEnd =
        this.limit.kind === "time"
          ? Math.max(0, this.deadline - now)
          : Math.max(0, this.limit.budget - this.counter.count);
      this.clearLimit();
    }
    this.solveEnd = now;
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
    if (this.limit) this.leftAtEnd = 0;
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
      ...(this.splits.length > 0 ? { splits: formatSplits(this.splits) } : {}),
      ...(this.longestCombo >= COMBO_SHOW ? { combo: this.longestCombo } : {}),
      replay: formatReplay(this.history),
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
