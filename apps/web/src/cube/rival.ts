// 혼자 하는 모드(오늘의 섞기·제한 도전)의 「컴퓨터와 겨루기」(docs/47 10-2). 내 판은 혼자 맞추기 그대로 두고, 같은 섞기를
// 컴퓨터 계획(`botPlan`)으로 나란히 둔다. 컴퓨터는 내가 맞추기를 시작한 순간(살펴보기 뒤 첫 면 돌리기) 함께 출발한다.
// 기록(오늘의 섞기·도전 기록)은 혼자 하기 규칙 그대로다: 컴퓨터는 견줄 상대일 뿐 내 판의 규칙을 바꾸지 않는다.
// 제한 도전이면 컴퓨터도 같은 체력 규칙(시간 체력의 칩마다 채움, 수 체력의 HTM 세기)으로 끝나는지 계획에서 미리 계산한다.

import type { BotPlan } from "@game/cube-ai";
import {
  applyMove,
  type CubeMove,
  isRotation,
  isSolved,
  milestonesOf,
  parseMoves,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import {
  challengeScore,
  MoveCounter,
  type SessionLimit,
  stageCount,
} from "./challenge";
import type { Split } from "./records";

/** 컴퓨터 계획 씨앗(uint32): 섞기 씨앗과 크기에서. 같은 날 오늘의 섞기면 늘 같은 컴퓨터다 */
export function rivalSeed(scrambleSeed: number, n: number): number {
  let h = 0x811c9dc5;
  for (const ch of `cube-rival|${scrambleSeed >>> 0}|${n}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface RivalOutcome {
  /** 맞춘 시각(ms, 출발부터). 못 맞추면 null */
  doneAt: number | null;
  /** 끝난 시각(맞춤이나 체력 다함) */
  endAt: number;
  /** 체력이 다해 끝났다 */
  reason?: "time" | "moves";
  /** 지난 이정표(칩) */
  splits: Split[];
  /** 제한 도전: 끝날 때 남은 체력(시간 ms, 수), 그리고 점수. 체력 없는 판이면 null */
  left: number | null;
  score: number | null;
}

/**
 * 계획을 처음부터 끝까지 두어 결과를 미리 계산한다(혼자 맞추기 세션 `SolveSession`과 같은 규칙).
 * 시간 체력: 처음 시간에서 줄고, 새 칩마다(다 맞춘 수 빼고) 채운다. 다음 수 시각이 체력보다 늦으면 그 순간 끝.
 * 수 체력: HTM으로 세고(헛수를 되돌리면 돌려받는다) 넘으면 그 수에서 끝.
 */
export function rivalOutcome(
  n: number,
  start: PuzzleState,
  plan: BotPlan,
  limit: SessionLimit | null,
): RivalOutcome {
  let state = start;
  const splits: Split[] = [];
  const counter = new MoveCounter();
  let deadline = limit?.kind === "time" ? limit.startMs : 0;
  const end = (
    at: number,
    reason: "time" | "moves" | null,
    left: number | null,
  ): RivalOutcome => ({
    doneAt: reason ? null : at,
    endAt: at,
    ...(reason ? { reason } : {}),
    splits,
    left,
    score:
      limit && left !== null
        ? challengeScore(limit.kind, stageCount(splits), left)
        : null,
  });
  for (const m of plan.moves) {
    if (limit?.kind === "time" && m.at > deadline)
      return end(deadline, "time", 0);
    for (const move of parseMoves(n, m.move) as CubeMove[]) {
      state = applyMove(n, state, move);
      const rotation = isRotation(n, move);
      const solved = isSolved(n, state);
      if (!rotation) {
        let fresh = false;
        for (const id of milestonesOf(n, state))
          if (!splits.some((x) => x.id === id)) {
            splits.push({ id, ms: m.at });
            fresh = true;
          }
        if (fresh && !solved && limit?.kind === "time")
          deadline += limit.refillMs;
      }
      if (limit?.kind === "moves") {
        counter.push(move, rotation, n);
        if (!solved && counter.count > limit.budget)
          return end(m.at, "moves", 0);
      }
      if (solved) {
        const left =
          limit === null
            ? null
            : limit.kind === "time"
              ? Math.max(0, deadline - m.at)
              : Math.max(0, limit.budget - counter.count);
        return end(m.at, null, left);
      }
    }
  }
  // 계획이 맞추지 못하고 끝났다(있어서는 안 되지만, 그래도 끝은 있다)
  return {
    doneAt: null,
    endAt: plan.finishAt,
    splits,
    left: limit ? 0 : null,
    score: limit ? challengeScore(limit.kind, stageCount(splits), 0) : null,
  };
}

/** 출발 뒤 `t`ms까지 둔 계획 수(끝난 뒤의 수는 두지 않는다) */
export function rivalShown(
  plan: BotPlan,
  outcome: RivalOutcome,
  t: number,
): number {
  const until = Math.min(t, outcome.endAt);
  const k = plan.moves.findIndex((m) => m.at > until);
  return k < 0 ? plan.moves.length : k;
}

/** 계획 앞 `count`수를 둔 컴퓨터 큐브와 면 돌린 수 */
export function rivalAt(
  n: number,
  start: PuzzleState,
  plan: BotPlan,
  count: number,
): { state: PuzzleState; turns: number } {
  let state = start;
  let turns = 0;
  for (const m of plan.moves.slice(0, count)) {
    for (const move of parseMoves(n, m.move) as CubeMove[]) {
      state = applyMove(n, state, move);
      if (!isRotation(n, move)) turns++;
    }
  }
  return { state, turns };
}

/** 내 결과와 견준 한 줄 */
export function rivalVerdict(
  mine: { total: number | null; score: number | null },
  rival: RivalOutcome,
): "win" | "lose" | "tie" {
  if (mine.score !== null && rival.score !== null) {
    if (mine.score === rival.score) return "tie";
    return mine.score > rival.score ? "win" : "lose";
  }
  if (mine.total === null && rival.doneAt === null) return "tie";
  if (mine.total === null) return "lose";
  if (rival.doneAt === null) return "win";
  if (mine.total === rival.doneAt) return "tie";
  return mine.total < rival.doneAt ? "win" : "lose";
}
