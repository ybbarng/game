// 공식 연습 문제 하나의 시작 큐브와 보일 공식(docs/47 16-9·16-14).
// 시작 모양은 상황 자체로 정한다: 맞춘 큐브를 쥔 뒤 단원이 그 상황을 만드는 수(없으면 흔한 공식의 거꾸로)를 돌리고,
// 윗면 돌리기를 더한다. 그래서 공식이 사람마다(키 배치·내 공식) 달라도 같은 상황·같은 윗면이면 시작 모양은 같다.
// 보일 공식은 그 모양에서 정확히 목표가 되게, 필요하면 앞에 윗면 돌리기나 큐브 돌리기를 붙여 맞춘다(`alignPrefix`).
import {
  applyMoves,
  type CubeMove,
  invertMoves,
  parseMoves,
  type StickerMask,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import { goalMet, maskFor } from "../learn/judge";
import { algTokens } from "../learn/notation";
import type { GoalName } from "../learn/types";
import type { DrillCase, PracticeStage } from "./types";

export const PRACTICE_N = 3;

/** 시작 모양에 더하는 윗면 돌리기 */
export const SHAPE_TURNS = ["", "U", "U2", "U'"] as const;

/** 보일 공식 앞에 붙여 볼 것: 큐브 돌리기(y) 없이 윗면 돌리기만 먼저, 그다음 y를 곁들여. 짧은 것이 먼저다 */
export const ALIGN_PREFIXES: readonly string[] = ["", "y", "y'", "y2"].flatMap(
  (r) => ["", "U", "U'", "U2"].map((u) => `${r} ${u}`.trim()),
);

export interface Problem {
  caseId: string;
  /** 시작 모양에 더한 윗면 돌리기(`SHAPE_TURNS`). 문제 목록의 일부라 겨루는 모두가 같다 */
  turn: string;
  /** 보일 공식(맞춤 + 공식) */
  alg: string;
  /** 공식 앞에 붙인 맞춤("", "U", "y U'" …) */
  preAuf: string;
}

export interface ProblemBoard {
  tokens: string[];
  start: PuzzleState;
  mask: StickerMask | null;
  goal: GoalName;
}

/** 쥐기 + 상황 만들기(단원의 setup, 없으면 흔한 공식의 거꾸로) + 윗면 돌리기 */
export function caseStart(
  stage: PracticeStage,
  c: DrillCase,
  turn = "",
): PuzzleState {
  const n = PRACTICE_N;
  const hold = stage.hold ? parseMoves(n, stage.hold) : [];
  const make: CubeMove[] = c.setup
    ? parseMoves(n, c.setup)
    : invertMoves(parseMoves(n, c.algs[0] as string));
  const top = turn ? parseMoves(n, turn) : [];
  return applyMoves(n, solvedCube(n), [...hold, ...make, ...top]);
}

/** 쥐기 + 공식의 거꾸로(그 공식만으로 만든 모양. 시험이 단원 자료를 맞춰 볼 때 쓴다) */
export function problemStart(stage: PracticeStage, alg: string): PuzzleState {
  const n = PRACTICE_N;
  const hold = stage.hold ? parseMoves(n, stage.hold) : [];
  return applyMoves(n, solvedCube(n), [
    ...hold,
    ...invertMoves(parseMoves(n, alg)),
  ]);
}

export function joinAlg(preAuf: string, alg: string): string {
  return `${preAuf} ${alg}`.trim();
}

/**
 * 이 모양을 이 공식으로 목표까지 풀려면 앞에 무엇을 붙여야 하나. 붙일 것 없이 풀리면 "". 어느 것을 붙여도 안 풀리면 null
 * (그 상황의 공식이 아니다)
 */
export function alignPrefix(
  stage: PracticeStage,
  c: DrillCase,
  start: PuzzleState,
  alg: string,
): string | null {
  const n = PRACTICE_N;
  let body: CubeMove[];
  try {
    body = parseMoves(n, alg);
  } catch {
    return null;
  }
  if (body.length === 0) return null;
  const goal = stage.goal(c);
  for (const pre of ALIGN_PREFIXES) {
    const moves = pre ? [...parseMoves(n, pre), ...body] : body;
    if (goalMet(n, applyMoves(n, start, moves), goal)) return pre;
  }
  return null;
}

/** 상황·윗면 돌리기·공식 → 문제. 공식이 그 모양을 풀지 못하면 null */
export function problemFor(
  stage: PracticeStage,
  c: DrillCase,
  turn: string,
  alg: string,
): Problem | null {
  const pre = alignPrefix(stage, c, caseStart(stage, c, turn), alg);
  if (pre === null) return null;
  return { caseId: c.id, turn, preAuf: pre, alg: joinAlg(pre, alg) };
}

/**
 * 출제 하나 + 고른 공식 → 문제. 고른 공식이 그 모양을 풀지 못하면 흔한 공식으로 낸다
 * (자료·후보는 모두 풀린다는 것을 시험이 확인한다. 지워졌거나 잘못 적힌 내 공식만 여기 닿는다)
 */
export function problemOf(
  stage: PracticeStage,
  c: DrillCase,
  turn: string,
  alg: string,
): Problem {
  return (
    problemFor(stage, c, turn, alg) ??
    problemFor(stage, c, turn, c.algs[0] as string) ?? {
      caseId: c.id,
      turn,
      preAuf: "",
      alg: c.algs[0] as string,
    }
  );
}

export function boardFor(
  stage: PracticeStage,
  c: DrillCase,
  problem: Problem,
): ProblemBoard {
  return {
    tokens: algTokens(problem.alg),
    start: caseStart(stage, c, problem.turn),
    mask: maskFor(PRACTICE_N, stage.mask),
    goal: stage.goal(c),
  };
}
