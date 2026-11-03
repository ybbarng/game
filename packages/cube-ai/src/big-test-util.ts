/** 큰 큐브 시험에서만 쓰는 도구 */
import { applyMoves, isSolved, parseMoves } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { expect } from "vitest";
import type { BotLevel } from "./methods";
import type { HumanSolve, StageName } from "./solve";

/** 엔진에 수를 두면 맞춰지고, 단계가 빈틈없이 이어지고, 살피는 자리가 수 안에 있다 */
export function checkSolve(
  n: number,
  start: PuzzleState,
  solve: HumanSolve,
): void {
  const end = applyMoves(n, start, parseMoves(n, solve.moves.join(" ")));
  expect(isSolved(n, end)).toBe(true);
  let at = 0;
  for (const st of solve.stages) {
    expect(st.start).toBe(at);
    expect(st.end).toBeGreaterThanOrEqual(st.start);
    at = st.end;
  }
  expect(at).toBe(solve.moves.length);
  for (const l of solve.looks) {
    expect(l).toBeGreaterThan(0);
    expect(l).toBeLessThan(solve.moves.length);
  }
}

export const REDUCTION_STAGES: readonly StageName[] = [
  "centers-ud",
  "centers-rest",
  "edges",
  "last-edges",
];

/** 축소 뒤 3×3 단계 차례(패리티 빼고) */
export const THREE_STAGES: Readonly<Record<BotLevel, readonly StageName[]>> = {
  beginner: ["cross", "corners", "middle", "eo", "co", "cp", "ep"],
  intermediate: ["cross", "corners", "middle", "eo", "co", "cp", "ep"],
  advanced: ["cross", "f2l-1", "f2l-2", "f2l-3", "f2l-4", "oll", "pll"],
  expert: ["three"],
};

export const stageNames = (s: HumanSolve) => s.stages.map((st) => st.name);

export const withoutParity = (s: HumanSolve) =>
  stageNames(s).filter((x) => x !== "oll-parity" && x !== "pll-parity");

/** 단계 이름별 수 길이(보고용) */
export function stageLengths(s: HumanSolve): Record<string, number> {
  const out: Record<string, number> = {};
  for (const st of s.stages)
    out[st.name] = (out[st.name] ?? 0) + st.end - st.start;
  return out;
}
