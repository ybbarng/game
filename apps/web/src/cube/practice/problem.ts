// 공식 연습 문제 하나의 시작 큐브(docs/47 16-9). 맞춘 큐브를 쥔 뒤 보일 공식의 거꾸로를 돌린 모양이라,
// 보인 공식을 끝까지 치면 다 맞춰진다. 다른 공식으로 풀어도 보고 치기는 결과 모양(goal)으로 채점한다.
import {
  applyMoves,
  type CubeMove,
  invertMoves,
  parseMoves,
  type StickerMask,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import { maskFor } from "../learn/judge";
import { algTokens } from "../learn/notation";
import type { GoalName } from "../learn/types";
import type { DrillCase, PracticeStage } from "./types";

export const PRACTICE_N = 3;

export interface Problem {
  caseId: string;
  /** 보일 공식(앞 윗면 돌리기 + 공식) */
  alg: string;
  /** 공식 앞에 붙인 윗면 돌리기("", "U", "U'", "U2") */
  preAuf: string;
}

export interface ProblemBoard {
  tokens: string[];
  start: PuzzleState;
  mask: StickerMask | null;
  goal: GoalName;
}

/** 쥐기 + 공식의 거꾸로 */
export function problemStart(stage: PracticeStage, alg: string): PuzzleState {
  const n = PRACTICE_N;
  const hold = stage.hold ? parseMoves(n, stage.hold) : [];
  const undo: CubeMove[] = invertMoves(parseMoves(n, alg));
  return applyMoves(n, solvedCube(n), [...hold, ...undo]);
}

export function joinAlg(preAuf: string, alg: string): string {
  return `${preAuf} ${alg}`.trim();
}

export function boardFor(
  stage: PracticeStage,
  c: DrillCase,
  problem: Problem,
): ProblemBoard {
  return {
    tokens: algTokens(problem.alg),
    start: problemStart(stage, problem.alg),
    mask: maskFor(PRACTICE_N, stage.mask),
    goal: stage.goal(c),
  };
}
