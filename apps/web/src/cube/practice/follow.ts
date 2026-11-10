// 따라 치기 판정(docs/47 16-9). 공식을 한 수씩 맞춰 본다(`FormulaRun`·`MoveMatcher`, R2를 나눠 쳐도 맞음).
// 틀린 수는 큐브에 넣지 않는다. 반 바퀴를 나눠 치다 틀리면 먼저 넣은 반쪽도 되돌린다(`undo`).
// 화면과 떨어진 순수 모듈이라 웹 미니 모드·겨루기도 그대로 쓴다.
import { type CubeMove, invertMove } from "@game/cube-engine";

import { FormulaRun } from "../keys/formula";

export type FollowStep =
  /** 맞은 수(반 바퀴를 나눠 친 반쪽 포함). 큐브에 넣는다 */
  | { kind: "hit"; index: number }
  | { kind: "partial"; index: number }
  /** 공식 끝 */
  | { kind: "done" }
  /** 틀린 수: 큐브에 넣지 않는다. `undo`는 먼저 넣은 반쪽을 되돌릴 수(차례대로 넣는다) */
  | { kind: "miss"; index: number; undo: CubeMove[] };

export class FollowJudge {
  private run: FormulaRun;
  /** 반 바퀴의 반쪽으로 넣은 수 */
  private pending: CubeMove[] = [];
  /** 맞춘 수(공식 낱말 하나 = 한 수) */
  hits = 0;
  misses = 0;

  constructor(
    readonly n: number,
    readonly tokens: readonly string[],
  ) {
    this.run = new FormulaRun(n, tokens);
  }

  /** 지금 칠 낱말 차례(끝나면 tokens.length) */
  get index(): number {
    return this.run.index;
  }

  get done(): boolean {
    return this.run.done;
  }

  /** 지금 칠 낱말 */
  get expected(): string | undefined {
    return this.tokens[this.run.index];
  }

  feed(move: CubeMove): FollowStep | null {
    if (this.run.done) return null;
    const at = this.run.index;
    const r = this.run.feed(move);
    if (r === "partial") {
      this.pending.push(move);
      return { kind: "partial", index: at };
    }
    if (r === "miss") {
      this.misses++;
      const undo = this.pending.reverse().map(invertMove);
      this.pending = [];
      return { kind: "miss", index: at, undo };
    }
    this.pending = [];
    this.hits++;
    return r === "done" ? { kind: "done" } : { kind: "hit", index: at };
  }
}
