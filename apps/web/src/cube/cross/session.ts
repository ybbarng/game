import {
  applyMove,
  type CubeMove,
  invertMove,
  isRotation,
  type StickerMask,
  stageMask,
} from "@game/cube-engine";
import type { Clock } from "@game/fair-play";
import type { PuzzleState } from "@game/puzzle-core";

import {
  CROSS_COLOR_SETS,
  type CrossColorSet,
  type CrossDifficulty,
  type CrossRound,
  roundStart,
} from "./scramble";
import { crossDone } from "./solver";

/**
 * 십자 훈련 한 판(docs/47 8절). 화면을 모르는 상태 기계라 시계(`Clock`)를 넣어 시험한다.
 *
 *   inspect(살펴보기, 큐브 돌리기 x·y·z만) → 첫 면 돌리기로 solving(시간·수 세기) → 십자가 되면 done
 *
 * - 살펴보기 벌점은 혼자 맞추기와 같은 규칙(WCA A3)을 고른 시간에 맞춰 쓴다: L초를 넘겨 시작하면 +2,
 *   L+2초가 되면 DNF(15초면 15·17초). 「무제한」은 벌점이 없다.
 * - 수는 반 바퀴를 한 수로 센다(HTM): 같은 면을 잇달아 돌리면 합친다(U U = U2 한 수, U U' = 0수).
 *   가운데 층(M·E·S)은 두 수, 넓은 층은 한 수, 큐브 돌리기는 세지 않는다.
 * - 고른 색 센터 어느 색이든 십자가 되면 성공. 수 제한을 넘는 순간 실패.
 * - 「계획 후 가리고」: 치기 시작하면 큐브를 모두 가린다. 다 했으면 「끝」을 누른다(십자가 안 되었으면 실패).
 *   십자가 되면 바로 끝난다.
 */

export type CrossLimit = "opt" | "opt1" | "opt2" | "none";
export type CrossInspection = 15 | 8 | "none";
export type CrossStyle = "see" | "blind";

export interface CrossConditions {
  colorSet: CrossColorSet;
  difficulty: CrossDifficulty;
  limit: CrossLimit;
  inspection: CrossInspection;
  style: CrossStyle;
  /** 십자 색을 아래로 쥐고 시작 */
  fromBottom: boolean;
}

export const DEFAULT_CONDITIONS: CrossConditions = {
  colorSet: "white",
  difficulty: "random",
  limit: "opt2",
  inspection: 15,
  style: "see",
  fromBottom: false,
};

/** 조건 묶음의 이름(기록을 모으는 열쇠) */
export function conditionKey(c: CrossConditions): string {
  return [
    c.colorSet,
    c.difficulty,
    c.limit,
    c.inspection,
    c.style,
    c.fromBottom ? "bottom" : "any",
  ].join("|");
}

export function limitFor(limit: CrossLimit, optimal: number): number | null {
  return limit === "none"
    ? null
    : optimal + { opt: 0, opt1: 1, opt2: 2 }[limit];
}

export type CrossPhase = "idle" | "inspect" | "solving" | "done";
export type CrossFail = "over" | "unsolved" | "inspection" | "gaveUp";
export type CrossCue = "inspect8" | "inspect12" | "solved" | "fail";

export interface CrossResult {
  ok: boolean;
  reason?: CrossFail;
  /** 내 수(HTM) */
  moves: number;
  optimal: number;
  limit: number | null;
  /** 첫 면 돌리기부터 끝까지(ms, 벌점 빼고) */
  solveMs: number;
  /** 살펴본 시간(ms) */
  inspectMs: number;
  /** 살펴보기 벌점(ms, 0 또는 2000) */
  penalty: number;
  /** 십자를 만든 색(성공했을 때) */
  color?: number;
}

export interface CrossRecord {
  at: number;
  /** 조건 열쇠(`conditionKey`) */
  cond: string;
  ok: boolean;
  reason?: CrossFail;
  moves: number;
  optimal: number;
  solveMs: number;
  inspectMs: number;
  penalty: number;
  scramble: string;
}

interface Counted {
  key: string;
  turns: number;
  cost: number;
}

export interface CrossSessionOptions {
  clock: Clock;
  onChange?: () => void;
  onCue?: (cue: CrossCue) => void;
  onRecord?: (record: CrossRecord) => void;
  /** 기록 시각(시험은 고정값) */
  wallNow?: () => number;
}

export class CrossSession {
  private readonly opts: CrossSessionOptions;
  private readonly clock: Clock;
  phase: CrossPhase = "idle";
  state: PuzzleState | null = null;
  round: CrossRound | null = null;
  conditions: CrossConditions = DEFAULT_CONDITIONS;
  result: CrossResult | null = null;
  private counted: Counted[] = [];
  private undoStack: CubeMove[] = [];
  private roundStartAt = 0;
  private solveStartAt = 0;
  private inspectMs = 0;
  private penalty = 0;
  private timers: (() => void)[] = [];
  private disposedFlag = false;

  constructor(opts: CrossSessionOptions) {
    this.opts = opts;
    this.clock = opts.clock;
  }

  get colors(): readonly number[] {
    return CROSS_COLOR_SETS[this.conditions.colorSet];
  }

  /** 지금 수(HTM) */
  get moves(): number {
    return this.counted.reduce((s, c) => s + c.cost, 0);
  }

  get limit(): number | null {
    return this.round
      ? limitFor(this.conditions.limit, this.round.optimal)
      : null;
  }

  /** 살펴보기 시간 상한(ms). 무제한이면 null */
  get inspectLimitMs(): number | null {
    const i = this.conditions.inspection;
    return i === "none" ? null : i * 1000;
  }

  /** 「계획 후 가리고」로 치는 중이라 큐브를 가리나 */
  get hidden(): boolean {
    return this.conditions.style === "blind" && this.phase === "solving";
  }

  get mask(): StickerMask | null {
    return this.hidden ? stageMask(3, "all-hidden") : null;
  }

  /** 살펴보기면 지난 살펴보기 시간, 치는 중이면 지난 시간, 끝났으면 걸린 시간(ms) */
  elapsed(): number {
    const now = this.clock.now();
    if (this.phase === "inspect") return now - this.roundStartAt;
    if (this.phase === "solving") return now - this.solveStartAt;
    if (this.phase === "done") return this.result?.solveMs ?? 0;
    return 0;
  }

  /** 새 판(또는 같은 섞기 다시) */
  start(round: CrossRound, conditions: CrossConditions): void {
    if (this.disposedFlag) return;
    this.clearTimers();
    this.round = round;
    this.conditions = conditions;
    this.state = roundStart(round);
    this.counted = [];
    this.undoStack = [];
    this.result = null;
    this.penalty = 0;
    this.inspectMs = 0;
    this.roundStartAt = this.clock.now();
    this.phase = "inspect";
    const limit = this.inspectLimitMs;
    if (limit !== null) {
      // 알림은 끝나기 7초·3초 전(15초면 8·12초, 대회 심판이 부르는 때)
      for (const [before, cue] of [
        [7_000, "inspect8"],
        [3_000, "inspect12"],
      ] as const) {
        if (limit - before > 0)
          this.timers.push(
            this.clock.after(limit - before, () => this.cue(cue)),
          );
      }
      this.timers.push(
        this.clock.after(limit + 2_000, () => {
          if (this.phase !== "inspect") return;
          this.inspectMs = this.clock.now() - this.roundStartAt;
          this.finish(false, "inspection");
        }),
      );
    }
    this.changed();
  }

  /** 수 하나. 받아들였으면 true */
  input(move: CubeMove): boolean {
    if (!this.apply(move)) return false;
    this.undoStack.push(move);
    this.afterMove();
    return true;
  }

  /** 마지막 수를 거꾸로(되돌리기도 수 세기에서 합친다: U 뒤 되돌리기 = 0수) */
  undo(): CubeMove | null {
    if (this.phase !== "solving" && this.phase !== "inspect") return null;
    const last = this.undoStack.at(-1);
    if (!last) return null;
    const inv = invertMove(last);
    if (!this.apply(inv)) return null;
    this.undoStack.pop();
    this.afterMove();
    return inv;
  }

  /** 「끝」(계획 후 가리고): 십자가 안 되었으면 실패 */
  declareDone(): void {
    if (this.phase !== "solving") return;
    const color = this.doneColor();
    if (color !== null) this.finish(true, undefined, color);
    else this.finish(false, "unsolved");
  }

  giveUp(): void {
    if (this.phase !== "inspect" && this.phase !== "solving") return;
    if (this.phase === "inspect")
      this.inspectMs = this.clock.now() - this.roundStartAt;
    this.finish(false, "gaveUp");
  }

  /** 판을 기록 없이 접는다(조건을 바꿨을 때) */
  abandon(): void {
    this.clearTimers();
    this.phase = "idle";
    this.round = null;
    this.state = null;
    this.result = null;
    this.counted = [];
    this.undoStack = [];
    this.changed();
  }

  dispose(): void {
    this.disposedFlag = true;
    this.clearTimers();
  }

  get disposed(): boolean {
    return this.disposedFlag;
  }

  private apply(move: CubeMove): boolean {
    if (!this.state) return false;
    if (this.phase !== "inspect" && this.phase !== "solving") return false;
    const rotation = isRotation(3, move);
    if (!rotation && this.phase === "inspect") this.beginSolve();
    this.state = applyMove(3, this.state, move);
    if (this.phase === "solving") this.count(move, rotation);
    return true;
  }

  private afterMove(): void {
    if (this.phase === "solving") {
      const color = this.doneColor();
      const limit = this.limit;
      if (color !== null) this.finish(true, undefined, color);
      else if (limit !== null && this.moves > limit) this.finish(false, "over");
    }
    this.changed();
  }

  private count(move: CubeMove, rotation: boolean): void {
    if (rotation) {
      // 큐브 돌리기 뒤의 같은 면은 다른 면이라 합치지 않는다
      this.counted.push({ key: "rot", turns: 0, cost: 0 });
      return;
    }
    const key = `${move.axis}${move.from}${move.to}`;
    const top = this.counted.at(-1);
    if (top && top.key === key) {
      top.turns = (top.turns + move.turns) % 4;
      if (top.turns === 0) this.counted.pop();
      return;
    }
    const slice = move.from === 2 && move.to === 2;
    this.counted.push({ key, turns: move.turns, cost: slice ? 2 : 1 });
  }

  private beginSolve(): void {
    const now = this.clock.now();
    this.inspectMs = now - this.roundStartAt;
    const limit = this.inspectLimitMs;
    this.penalty = limit !== null && this.inspectMs > limit ? 2_000 : 0;
    this.clearTimers();
    this.solveStartAt = now;
    this.phase = "solving";
  }

  private doneColor(): number | null {
    if (!this.state) return null;
    for (const c of this.colors) if (crossDone(this.state, c)) return c;
    return null;
  }

  private finish(ok: boolean, reason?: CrossFail, color?: number): void {
    const round = this.round;
    if (!round) return;
    const now = this.clock.now();
    const solveMs = this.phase === "solving" ? now - this.solveStartAt : 0;
    this.result = {
      ok,
      ...(reason ? { reason } : {}),
      moves: this.moves,
      optimal: round.optimal,
      limit: this.limit,
      solveMs,
      inspectMs: this.inspectMs,
      penalty: this.penalty,
      ...(color === undefined ? {} : { color }),
    };
    this.phase = "done";
    this.clearTimers();
    this.cue(ok ? "solved" : "fail");
    if (!this.disposedFlag)
      this.opts.onRecord?.({
        at: (this.opts.wallNow ?? Date.now)(),
        cond: conditionKey(this.conditions),
        ok,
        ...(reason ? { reason } : {}),
        moves: this.result.moves,
        optimal: round.optimal,
        solveMs,
        inspectMs: this.inspectMs,
        penalty: this.penalty,
        scramble: round.scramble,
      });
    this.changed();
  }

  private clearTimers(): void {
    for (const off of this.timers) off();
    this.timers = [];
  }

  private cue(cue: CrossCue): void {
    if (!this.disposedFlag) this.opts.onCue?.(cue);
  }

  private changed(): void {
    this.opts.onChange?.();
  }
}
