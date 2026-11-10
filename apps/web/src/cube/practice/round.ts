// 공식 연습 한 판(docs/47 16-9): 10문제를 끊김 없이 잇고, 콤보와 판 끝 결과를 센다.
// 시각은 부르는 쪽이 넣는다(제품은 진짜 시계, 시험은 ManualClock). 화면과 떨어진 순수 모듈이다.
import type { CubeMove } from "@game/cube-engine";

import { countMoves } from "../keys/formula";
import { FollowJudge, type FollowStep } from "./follow";
import type { Problem } from "./problem";

export const ROUND_SIZE = 10;

export type PracticeMode = "follow" | "see";

/**
 * 공식 연습 콤보. 혼자 맞추기의 흐름 콤보(`flow/combo.ts`, 멈추지 않고 돌렸나)와 따로 센다.
 * - 따라 치기: 틀린 수 없이 이어 맞춘 공식 수. 틀리면 그 자리에서 0
 * - 보고 치기: 공식을 펼쳐 보지 않고 이어 맞춘 공식 수. 펼치면 그 자리에서 0
 */
export class PracticeCombo {
  current = 0;
  best = 0;

  hit(): void {
    this.current++;
    if (this.current > this.best) this.best = this.current;
  }

  break(): void {
    this.current = 0;
  }
}

export interface ProblemResult {
  caseId: string;
  /** 첫 수부터 다 맞출 때까지 */
  ms: number;
  /** 친 수(따라 치기는 공식의 수, 보고 치기는 실제로 친 면 돌리기) */
  moves: number;
  misses: number;
  peeked: boolean;
}

export interface RoundSummary {
  /** 0~1. 따라 치기는 맞은 수 / 친 수, 보고 치기는 펼쳐 보지 않고 맞춘 문제 / 문제 */
  accuracy: number;
  avgMs: number;
  /** 1분에 친 수 */
  perMinute: number;
  bestCombo: number;
  /** 수 하나에 오래 걸린 공식 셋(같은 상황은 한 번) */
  slow: { caseId: string; ms: number }[];
}

export class PracticeRound {
  index = 0;
  readonly results: ProblemResult[] = [];
  readonly combo = new PracticeCombo();
  private judge: FollowJudge | null = null;
  private startedAt: number | null = null;
  private typed = 0;
  private misses = 0;
  private peeked = false;
  private hitsAll = 0;
  private missesAll = 0;

  constructor(
    readonly problems: readonly Problem[],
    readonly mode: PracticeMode,
    readonly tokensOf: (p: Problem) => string[],
    readonly n = 3,
  ) {
    this.reset();
  }

  get current(): Problem | undefined {
    return this.problems[this.index];
  }

  get over(): boolean {
    return this.index >= this.problems.length;
  }

  /** 지금 문제의 따라 치기 판정(보고 치기는 null) */
  get follow(): FollowJudge | null {
    return this.judge;
  }

  get problemMisses(): number {
    return this.misses;
  }

  get problemPeeked(): boolean {
    return this.peeked;
  }

  private reset(): void {
    const p = this.current;
    this.judge =
      p && this.mode === "follow"
        ? new FollowJudge(this.n, this.tokensOf(p))
        : null;
    this.startedAt = null;
    this.typed = 0;
    this.misses = 0;
    this.peeked = false;
  }

  private finish(now: number, moves: number): ProblemResult {
    const p = this.current as Problem;
    const r: ProblemResult = {
      caseId: p.caseId,
      ms: Math.max(0, now - (this.startedAt ?? now)),
      moves,
      misses: this.misses,
      peeked: this.peeked,
    };
    this.results.push(r);
    const clean = this.mode === "follow" ? r.misses === 0 : !r.peeked;
    if (clean) this.combo.hit();
    return r;
  }

  /** 따라 치기: 수 하나. 문제가 끝나면 `result`를 함께 돌려준다 */
  feedFollow(
    move: CubeMove,
    now: number,
  ): { step: FollowStep; result?: ProblemResult } | null {
    const j = this.judge;
    if (!j || this.over) return null;
    const step = j.feed(move);
    if (!step) return null;
    // 시간은 그 문제의 첫 키(틀린 수 포함)부터 잰다
    if (this.startedAt === null) this.startedAt = now;
    if (step.kind === "miss") {
      this.misses++;
      this.missesAll++;
      this.combo.break();
      return { step };
    }
    if (step.kind === "partial") return { step };
    this.hitsAll++;
    if (step.kind === "done")
      return { step, result: this.finish(now, countMoves(j.tokens)) };
    return { step };
  }

  /** 보고 치기: 면 돌리기 하나를 쳤다(시간은 첫 수부터) */
  typedSee(now: number): void {
    if (this.startedAt === null) this.startedAt = now;
    this.typed++;
  }

  /** 보고 치기: 공식을 펼쳐 봤다 */
  peek(): void {
    if (this.peeked) return;
    this.peeked = true;
    this.combo.break();
  }

  /** 보고 치기: 목표 모양이 됐다 */
  solvedSee(now: number): ProblemResult | null {
    if (this.mode !== "see" || this.over) return null;
    return this.finish(now, this.typed);
  }

  /** 다음 문제로. 판이 끝났으면 false */
  next(): boolean {
    if (this.over) return false;
    this.index++;
    this.reset();
    return !this.over;
  }

  summary(): RoundSummary {
    const rs = this.results;
    const totalMs = rs.reduce((s, r) => s + r.ms, 0);
    const totalMoves = rs.reduce((s, r) => s + r.moves, 0);
    const accuracy =
      this.mode === "follow"
        ? this.hitsAll + this.missesAll === 0
          ? 0
          : this.hitsAll / (this.hitsAll + this.missesAll)
        : rs.length === 0
          ? 0
          : rs.filter((r) => !r.peeked).length / rs.length;
    const seen = new Set<string>();
    const slow = [...rs]
      .sort((a, b) => b.ms / Math.max(1, b.moves) - a.ms / Math.max(1, a.moves))
      .filter((r) => {
        if (seen.has(r.caseId)) return false;
        seen.add(r.caseId);
        return true;
      })
      .slice(0, 3)
      .map((r) => ({ caseId: r.caseId, ms: r.ms }));
    return {
      accuracy,
      avgMs: rs.length === 0 ? 0 : totalMs / rs.length,
      perMinute: totalMs === 0 ? 0 : (totalMoves * 60_000) / totalMs,
      bestCombo: this.combo.best,
      slow,
    };
  }
}
