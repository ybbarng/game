import type { CubeMove } from "../view/types";
import { MoveMatcher } from "./reach";

/**
 * 공식 한 줄을 키로 따라 친다(키 익히기 8단계·공식 따라 치기). 수마다 `MoveMatcher`로 맞춰 보고, 틀리면 그 수에
 * 머문다. 끝까지 치면 "done".
 */
export class FormulaRun {
  private i = 0;
  private matcher: MoveMatcher | null;
  mistakes = 0;

  constructor(
    readonly n: number,
    readonly tokens: readonly string[],
  ) {
    this.matcher = this.make();
  }

  private make(): MoveMatcher | null {
    const t = this.tokens[this.i];
    return t === undefined ? null : new MoveMatcher(this.n, t);
  }

  /** 지금 칠 수의 차례(끝나면 tokens.length) */
  get index(): number {
    return this.i;
  }

  get done(): boolean {
    return this.i >= this.tokens.length;
  }

  feed(move: CubeMove): "hit" | "partial" | "miss" | "done" | null {
    if (!this.matcher) return null;
    const r = this.matcher.feed(move);
    if (r === "miss") this.mistakes++;
    if (r !== "hit") return r;
    this.i++;
    this.matcher = this.make();
    return this.matcher ? "hit" : "done";
  }

  restart(): void {
    this.i = 0;
    this.mistakes = 0;
    this.matcher = this.make();
  }
}

/** 공식의 수 개수(큐브 돌리기 빼고, R2는 한 수) */
export function countMoves(tokens: readonly string[]): number {
  return tokens.filter((t) => !/^[xyz]/.test(t)).length;
}
