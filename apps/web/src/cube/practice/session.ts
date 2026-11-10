// 공식 연습 한 판을 화면 없이 돌리는 진행기(docs/47 16-9·16-11). 출제(`drawRound`)·판정(`PracticeRound`·`FollowJudge`)·
// 기본 공식(`pickAlg`)·기록(`store.ts`)은 사이트 공식 연습과 같은 모듈이고, 이 파일은 그것들을 시계와 함께 잇기만 한다.
// 문제를 맞춘 뒤 잠깐 멈춤, 틀린 수의 키를 잠깐 보이기 같은 시간은 넣어 받은 `Clock`으로 잰다(제품은 진짜 시계,
// 시험은 ManualClock). 사이트 공식 연습(`PracticeApp`)과 Cubie 미니 모드가 함께 쓴다.
import {
  applyMove,
  applyMoves,
  type CubeMove,
  invertMove,
} from "@game/cube-engine";
import type { Clock } from "@game/fair-play";
import type { PuzzleState } from "@game/puzzle-core";

import type { AlgBook } from "../algs/store";
import type { Keymap } from "../input/keymaps";
import { countsAsMove, goalMet } from "../learn/judge";
import { loadTrain, recordSolve } from "../learn/progress";
import { drawRound } from "./deck";
import { pickAlg } from "./pick-alg";
import { boardFor, PRACTICE_N, type ProblemBoard, problemOf } from "./problem";
import {
  type PracticeMode,
  PracticeRound,
  type ProblemResult,
  type RoundSummary,
} from "./round";
import {
  loadPractice,
  type PracticeRecord,
  recordFollow,
  recordRound,
  rememberStage,
} from "./store";
import type { DrillCase, PracticeStage } from "./types";

/** 다 맞춘 모습을 보이는 시간(사이트 공식 연습과 같다) */
export const SOLVED_PAUSE_MS = 700;
/** 틀린 수의 키를 보이는 시간(사이트 공식 연습과 같다) */
export const WRONG_SHOW_MS = 1500;

export type PracticePhase = "play" | "pause" | "over";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export interface PracticeSessionOptions {
  stage: PracticeStage;
  mode: PracticeMode;
  keymap: Keymap;
  algBook?: AlgBook;
  clock: Clock;
  /** 판마다 새 씨앗 */
  seed: () => number;
  /** 연습 기록을 둘 저장소(없으면 이 기기 localStorage) */
  storage?: StorageLike | null;
  /** 보일 것이 바뀌었다 */
  onChange?: () => void;
  /** 장면을 이 상태로 통째 다시 칠해야 한다(새 문제, 반 바퀴의 반쪽 되돌림) */
  onRepaint?: (state: PuzzleState) => void;
  /** 소리: 틀린 수는 invalid, 문제 하나를 맞추면 solved */
  onCue?: (cue: "invalid" | "solved") => void;
}

/** 수 하나의 결과. applied면 부른 쪽이 장면에 그 수를 넣는다 */
export type PracticeInput = "applied" | "rejected" | "ignored";

export class PracticeSession {
  readonly stage: PracticeStage;
  readonly mode: PracticeMode;
  round!: PracticeRound;
  board: ProblemBoard | null = null;
  state: PuzzleState | null = null;
  phase: PracticePhase = "play";
  /** 틀린 낱말(키를 잠깐 보인다) */
  wrong: { index: number; token: string } | null = null;
  /** 보고 치기에서 공식을 펼쳤나(이 문제) */
  peeked = false;
  summary: RoundSummary | null = null;
  record: PracticeRecord;
  /** 이번 문제에서 마지막으로 맞춘 결과(맞춤 표시용) */
  lastResult: ProblemResult | null = null;
  disposed = false;
  private picked = new Map<string, string>();
  private common = new Map<string, string>();
  /** 보고 치기에서 둔 수(되돌리기) */
  private history: CubeMove[] = [];
  private cancelPause: (() => void) | null = null;
  private cancelWrong: (() => void) | null = null;

  constructor(private readonly opts: PracticeSessionOptions) {
    this.stage = opts.stage;
    this.mode = opts.mode;
    for (const c of this.stage.cases) {
      const p = pickAlg(c, opts.keymap, opts.algBook ?? {});
      this.picked.set(c.id, p.alg);
      this.common.set(c.id, p.common);
    }
    this.record = rememberStage(this.stage.id, this.storage);
    this.newRound();
  }

  private get storage(): StorageLike | null | undefined {
    return this.opts.storage;
  }

  private changed(): void {
    if (!this.disposed) this.opts.onChange?.();
  }

  caseOf(id: string): DrillCase | undefined {
    return this.stage.cases.find((c) => c.id === id);
  }

  /** 지금 문제의 상황 */
  get current(): DrillCase | undefined {
    const p = this.round.current;
    return p ? this.caseOf(p.caseId) : undefined;
  }

  /** 공식 낱말 */
  get tokens(): string[] {
    return this.board?.tokens ?? [];
  }

  /** 따라 치기에서 지금 칠 낱말 차례(맞춘 모습을 보이는 동안은 끝) */
  get at(): number {
    if (this.phase !== "play") return this.tokens.length;
    return this.round.follow?.index ?? 0;
  }

  /** 고른 공식이 실물에서 흔한 공식과 다르면 흔한 공식 */
  get commonAlg(): string | null {
    const p = this.round.current;
    if (!p) return null;
    const common = this.common.get(p.caseId);
    return common && common !== this.picked.get(p.caseId) ? common : null;
  }

  /** 새 판(10문제). 판 끝 결과를 보다가 「한 판 더」 */
  newRound(): void {
    this.clearTimers();
    const book =
      this.mode === "follow"
        ? loadPractice(this.storage).follow
        : loadTrain(this.storage);
    // 시작 모양은 상황 + 윗면 돌리기, 보일 공식은 고른 공식을 그 모양에 맞춘 것(대결과 같은 방식, docs/47 16-14)
    const problems = drawRound(
      this.stage.cases.map((c) => c.id),
      { seed: this.opts.seed(), book, auf: this.stage.auf },
    ).map((d) =>
      problemOf(
        this.stage,
        this.caseOf(d.caseId) as DrillCase,
        d.turn,
        this.picked.get(d.caseId) as string,
      ),
    );
    this.round = new PracticeRound(
      problems,
      this.mode,
      (p) => boardFor(this.stage, this.caseOf(p.caseId) as DrillCase, p).tokens,
      PRACTICE_N,
    );
    this.summary = null;
    this.showProblem();
  }

  private showProblem(): void {
    const p = this.round.current;
    const c = p ? this.caseOf(p.caseId) : undefined;
    this.board = p && c ? boardFor(this.stage, c, p) : null;
    this.state = this.board?.start ?? null;
    this.phase = "play";
    this.wrong = null;
    this.peeked = false;
    this.lastResult = null;
    this.history = [];
    if (this.state) this.opts.onRepaint?.(this.state);
    this.changed();
  }

  /** 수 하나. 판 끝·멈춤 중이면 받지 않는다 */
  input(move: CubeMove): PracticeInput {
    if (this.disposed || this.phase !== "play" || !this.board || !this.state)
      return "ignored";
    const now = this.opts.clock.now();
    const n = PRACTICE_N;
    if (this.mode === "follow") {
      const r = this.round.feedFollow(move, now);
      if (!r) return "ignored";
      if (r.step.kind === "miss") {
        this.flashWrong(r.step.index, this.round.follow?.expected ?? "");
        this.opts.onCue?.("invalid");
        if (r.step.undo.length > 0) {
          // 반 바퀴의 반쪽까지 되돌린다(장면은 다시 칠한다)
          this.state = applyMoves(n, this.state, r.step.undo);
          this.opts.onRepaint?.(this.state);
        }
        this.changed();
        return "rejected";
      }
      this.state = applyMove(n, this.state, move);
      if (r.result) {
        this.record = recordFollow(
          r.result.caseId,
          Math.round(r.result.ms),
          r.result.moves,
          r.result.misses,
          this.storage,
        );
        this.solvedProblem(r.result);
      }
      this.changed();
      return "applied";
    }
    this.state = applyMove(n, this.state, move);
    this.history.push(move);
    if (countsAsMove(n, move)) this.round.typedSee(now);
    if (goalMet(n, this.state, this.board.goal)) {
      const res = this.round.solvedSee(now);
      if (res) {
        if (!res.peeked)
          recordSolve(res.caseId, Math.round(res.ms), res.moves, this.storage);
        this.solvedProblem(res);
      }
    }
    this.changed();
    return "applied";
  }

  /** 보고 치기: 마지막 수를 되돌린다(장면에 넣을 수를 돌려준다). 따라 치기는 틀린 수가 큐브에 남지 않아 없다 */
  undo(): CubeMove | null {
    if (this.mode !== "see" || this.phase !== "play" || !this.state)
      return null;
    const last = this.history.pop();
    if (!last) return null;
    const back = invertMove(last);
    this.state = applyMove(PRACTICE_N, this.state, back);
    this.changed();
    return back;
  }

  /** 보고 치기: 처음 모양으로 되돌린다(장면은 다시 칠한다). 따라 치기는 틀린 수가 큐브에 남지 않아 없다 */
  reset(): boolean {
    if (this.mode !== "see" || this.phase !== "play" || !this.board)
      return false;
    this.state = this.board.start;
    this.history = [];
    this.opts.onRepaint?.(this.state);
    this.changed();
    return true;
  }

  /** 보고 치기: 공식을 펼친다(그 문제는 콤보에서 빠진다) */
  peek(): boolean {
    if (this.mode !== "see" || this.phase !== "play" || this.peeked)
      return false;
    this.round.peek();
    this.peeked = true;
    this.changed();
    return true;
  }

  private flashWrong(index: number, token: string): void {
    this.cancelWrong?.();
    this.wrong = { index, token };
    this.cancelWrong = this.opts.clock.after(WRONG_SHOW_MS, () => {
      this.cancelWrong = null;
      this.wrong = null;
      this.changed();
    });
  }

  /** 문제 하나를 끝냈다: 잠깐 다 맞춘 모습을 보인 뒤 다음 문제(또는 판 끝) */
  private solvedProblem(r: ProblemResult): void {
    this.cancelWrong?.();
    this.cancelWrong = null;
    this.wrong = null;
    this.lastResult = r;
    this.phase = "pause";
    this.opts.onCue?.("solved");
    this.cancelPause = this.opts.clock.after(SOLVED_PAUSE_MS, () => {
      this.cancelPause = null;
      if (this.disposed) return;
      if (!this.round.next()) {
        this.phase = "over";
        this.summary = this.round.summary();
        this.record = recordRound(this.stage.id, this.mode, this.storage);
        this.changed();
        return;
      }
      this.showProblem();
    });
  }

  private clearTimers(): void {
    this.cancelPause?.();
    this.cancelPause = null;
    this.cancelWrong?.();
    this.cancelWrong = null;
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimers();
  }
}
