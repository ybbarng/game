import type { Clock } from "@game/fair-play";

/**
 * 실물 큐브 타이머의 상태 기계(docs/47 6절). 화면·키와 떨어진 순수 로직이라 `Clock`을 넣어 시험한다.
 *
 * 흐름: 대기 → (살펴보기 켜짐) 살펴보기 → 누르고 있기 → 준비 → 떼면 시작 → 누르면 멈춤 → 대기(결과).
 * - 살펴보기: 대기에서 첫 누름으로 시작한다. 8초·12초에 알림을 낸다.
 * - 누르고 있기: `holdMs`보다 오래 누르고 있으면 「준비」. 그 전에 떼면 취소(살펴보기 중이면 살펴보기로 돌아간다).
 * - 블라인드: 살펴보기가 없다. 도는 동안 첫 누름은 외우기 끝 표시, 다음 누름이 멈춤이다.
 *
 * 살펴보기 벌점(WCA 규정 A3·A5로 기억한다 — 규정 원문으로 확인 필요):
 * 살펴보기는 15초까지. 15초를 넘겨 17초까지 안에 시작하면 +2, 17초를 넘겨 시작하면 DNF.
 * 시작 = 준비에서 손을 뗀 때(타이머가 도는 순간).
 */

export type Penalty = "none" | "+2" | "DNF";

export const INSPECTION_MS = 15_000;
export const INSPECTION_DNF_MS = 17_000;
/** 살펴보기 알림 시각 */
export const INSPECTION_WARNINGS = [8_000, 12_000] as const;
export const DEFAULT_HOLD_MS = 300;

export type Phase = "idle" | "inspecting" | "holding" | "ready" | "running";

export interface SolveResult {
  /** 시작부터 멈춤까지(벌점 더하기 전) */
  readonly ms: number;
  readonly penalty: Penalty;
  /** 살펴보기에 쓴 시간(살펴보기를 했을 때만) */
  readonly inspectionMs?: number;
  /** 블라인드: 시작부터 외우기 끝 표시까지 */
  readonly memoMs?: number;
}

export type TimerEventOut =
  | { type: "inspection-start" }
  | { type: "inspection-warning"; at: (typeof INSPECTION_WARNINGS)[number] }
  | { type: "ready" }
  | { type: "start" }
  | { type: "memo"; ms: number }
  | { type: "stop"; result: SolveResult }
  | { type: "cancel" }
  | { type: "change" };

export interface MachineOptions {
  /** 살펴보기를 할지(블라인드면 이 값과 관계없이 하지 않는다) */
  inspection: boolean;
  /** 「준비」까지 누르고 있어야 하는 시간 */
  holdMs: number;
  /** 블라인드: 외우기·맞추기 나눠 재기 */
  blind: boolean;
}

export interface MachineView {
  readonly phase: Phase;
  /** 살펴보기를 시작한 시각(살펴보기 중·그 뒤 누르고 있기·준비 동안) */
  readonly inspectionStart: number | null;
  /** 타이머가 시작한 시각 */
  readonly startAt: number | null;
  /** 블라인드 외우기 끝 시각 */
  readonly memoAt: number | null;
  /** 마지막 결과(대기 화면에 보인다) */
  readonly last: SolveResult | null;
}

/** 살펴보기 시간 → 벌점 */
export function inspectionPenalty(elapsedMs: number): Penalty {
  if (elapsedMs > INSPECTION_DNF_MS) return "DNF";
  if (elapsedMs > INSPECTION_MS) return "+2";
  return "none";
}

export class TimerMachine {
  private phase: Phase = "idle";
  private inspectionStart: number | null = null;
  private startAt: number | null = null;
  private memoAt: number | null = null;
  private last: SolveResult | null = null;
  /** 걸어 둔 일(살펴보기 알림, 준비)을 끄는 함수 */
  private inspectionTimers: (() => void)[] = [];
  private cancelHold: (() => void) | null = null;

  constructor(
    private readonly clock: Clock,
    private options: MachineOptions,
    private readonly emit: (e: TimerEventOut) => void = () => {},
  ) {}

  view(): MachineView {
    return {
      phase: this.phase,
      inspectionStart: this.inspectionStart,
      startAt: this.startAt,
      memoAt: this.memoAt,
      last: this.last,
    };
  }

  /** 설정을 바꾼다. 도는 중에는 다음 풀이부터 적용된다(대기에서만 바뀐다) */
  setOptions(next: MachineOptions): void {
    this.options = next;
  }

  private usesInspection(): boolean {
    return this.options.inspection && !this.options.blind;
  }

  /** 지금 시각 기준 경과 시간 */
  elapsed(): number {
    const now = this.clock.now();
    if (this.phase === "running" && this.startAt !== null)
      return now - this.startAt;
    if (this.inspectionStart !== null) return now - this.inspectionStart;
    return 0;
  }

  /** 스페이스바를 누르거나 화면을 누름. 도는 중이면 아무 키나 이것으로 부른다 */
  press(): void {
    const now = this.clock.now();
    switch (this.phase) {
      case "idle":
        if (this.usesInspection()) {
          this.startInspection(now);
          return;
        }
        this.startHold();
        return;
      case "inspecting":
        this.startHold();
        return;
      case "running":
        if (this.options.blind && this.memoAt === null) {
          this.memoAt = now;
          this.emit({ type: "memo", ms: now - (this.startAt ?? now) });
          this.emit({ type: "change" });
          return;
        }
        this.stop(now);
        return;
      default:
        // 누르고 있기·준비 중에 또 누름(키 반복 등)은 무시한다
        return;
    }
  }

  /** 스페이스바를 떼거나 화면에서 손을 뗌 */
  release(): void {
    const now = this.clock.now();
    if (this.phase === "holding") {
      this.clearHold();
      this.phase = this.inspectionStart !== null ? "inspecting" : "idle";
      this.emit({ type: "change" });
      return;
    }
    if (this.phase === "ready") this.start(now);
  }

  /** 살펴보기·누르고 있기를 그만둔다(Esc). 도는 중에는 아무 일도 하지 않는다 */
  cancel(): void {
    if (this.phase === "idle" || this.phase === "running") return;
    this.clearHold();
    this.clearInspection();
    this.inspectionStart = null;
    this.phase = "idle";
    this.emit({ type: "cancel" });
    this.emit({ type: "change" });
  }

  /** 걸어 둔 일을 모두 끈다(화면을 떠날 때) */
  dispose(): void {
    this.clearHold();
    this.clearInspection();
  }

  private startInspection(now: number): void {
    this.inspectionStart = now;
    this.phase = "inspecting";
    this.inspectionTimers = INSPECTION_WARNINGS.map((at) =>
      this.clock.after(at, () => this.emit({ type: "inspection-warning", at })),
    );
    this.emit({ type: "inspection-start" });
    this.emit({ type: "change" });
  }

  private startHold(): void {
    this.phase = "holding";
    const toReady = () => {
      this.cancelHold = null;
      if (this.phase !== "holding") return;
      this.phase = "ready";
      this.emit({ type: "ready" });
      this.emit({ type: "change" });
    };
    if (this.options.holdMs <= 0) {
      toReady();
      return;
    }
    this.cancelHold = this.clock.after(this.options.holdMs, toReady);
    this.emit({ type: "change" });
  }

  private start(now: number): void {
    this.clearInspection();
    this.startAt = now;
    this.memoAt = null;
    this.phase = "running";
    this.emit({ type: "start" });
    this.emit({ type: "change" });
  }

  private stop(now: number): void {
    const startAt = this.startAt ?? now;
    const inspectionMs =
      this.inspectionStart !== null ? startAt - this.inspectionStart : null;
    const result: SolveResult = {
      ms: now - startAt,
      penalty: inspectionMs === null ? "none" : inspectionPenalty(inspectionMs),
      ...(inspectionMs !== null ? { inspectionMs } : {}),
      ...(this.memoAt !== null ? { memoMs: this.memoAt - startAt } : {}),
    };
    this.last = result;
    this.phase = "idle";
    this.inspectionStart = null;
    this.startAt = null;
    this.memoAt = null;
    this.emit({ type: "stop", result });
    this.emit({ type: "change" });
  }

  private clearHold(): void {
    this.cancelHold?.();
    this.cancelHold = null;
  }

  private clearInspection(): void {
    for (const off of this.inspectionTimers) off();
    this.inspectionTimers = [];
  }
}
