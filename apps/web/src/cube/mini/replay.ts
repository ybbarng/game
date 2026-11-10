import { parseMoves } from "@game/cube-engine";

import { type ReplayStep, solveSteps } from "../replay-player";
import type { MiniRecord } from "./store";

/**
 * 떠 있을 때 내 판 다시 보기(docs/47 15-13, 사용자 2026-11-09 「큐브가 맞춰진 채로 일정 시간 있으면 replay로
 * 동작하면 어떨까? 섞고 맞추는 과정」). 맞춘 큐브에서 홈 시연 대신 내 판 하나를: 섞기를 빠르게 보인 뒤 맞춘 과정을
 * 그때 수 시각대로(멈춤은 1초까지, 혼자 맞추기 다시 보기와 같다). 그래도 1분이 넘는 판은 1분 안팎이 되게 빠르게
 * 돌린다(`fitSolveSteps`).
 */

export interface IdleReplayTiming {
  /** 섞기 한 수의 간격 */
  scrambleStepMs: number;
  /** 섞기를 다 보이고 맞추기 첫 수까지 */
  gapMs: number;
  /**
   * 맞춘 과정을 이 길이 안팎으로 맞춘다(멈춤을 1초로 줄인 뒤에도 길면 그만큼 빠르게). 홈 시연 한 판(3×3 약 30초)을
   * 6분에 한 번 그리던 몫에서 크게 벗어나지 않게 1분. 예전(2026-11-09)에는 이보다 긴 판을 아예 고르지 않았는데,
   * 초보는 판이 대부분 1분을 넘어(첫 판 8분) 내 판 다시 보기가 거의 나오지 않았다(2026-11-10 사용자 지적).
   */
  targetSolveMs: number;
  /**
   * 빠르게 돌려도 수 사이를 이보다 좁히지 않는다(알아볼 수 있게). 원래 이보다 빨랐던 수는 그때 간격 그대로.
   * 수가 아주 많은 판은 이 때문에 `targetSolveMs`를 넘기는데, 앞부분만 자르지 않고 판 전체를 이 빠르기로 돌린다
   */
  minStepMs: number;
}

export const IDLE_REPLAY_TIMING: IdleReplayTiming = {
  scrambleStepMs: 150,
  gapMs: 800,
  targetSolveMs: 60_000,
  minStepMs: 120,
};

/**
 * 맞춘 과정 걸음(첫 걸음 0ms)을 `targetSolveMs` 안팎으로 줄인다. 이미 짧으면 그대로. 줄일 때 수 사이 간격을 같은
 * 배로 나누되 `minStepMs`(원래 더 짧았으면 원래 간격)보다 좁히지 않는다. 기록 창 다시 보기는 쓰지 않는다(그때 속도)
 */
export function fitSolveSteps(
  steps: readonly ReplayStep[],
  timing: Pick<
    IdleReplayTiming,
    "targetSolveMs" | "minStepMs"
  > = IDLE_REPLAY_TIMING,
): ReplayStep[] {
  const first = steps[0];
  const last = steps.at(-1);
  if (!first || !last) return [];
  const length = last.at - first.at;
  if (length <= timing.targetSolveMs) return [...steps];
  const k = length / timing.targetSolveMs;
  const out: ReplayStep[] = [];
  let at = first.at;
  let prev = first.at;
  for (const s of steps) {
    const gap = s.at - prev;
    prev = s.at;
    at += Math.max(gap / k, Math.min(gap, timing.minStepMs));
    out.push({ ...s, at: Math.round(at) });
  }
  return out;
}

/** 섞기 걸음을 그리는 한 수의 회전 시간(ms). 간격보다 짧아야 차례가 밀리지 않는다 */
export const SCRAMBLE_MOVE_MS = 110;

/**
 * 다시 보기에서 `i`번째 걸음을 돌리는 회전 시간(ms): 설정의 회전 시간으로 돌리되, 다음 걸음이 더 빨리 오면 그 간격의
 * 0.9배로 줄인다(차례가 밀리지 않게, 40ms 아래로는 줄이지 않는다). 떠 있을 때와 기록 창 다시 보기가 함께 쓴다
 */
export function replayMoveMs(
  steps: readonly ReplayStep[],
  i: number,
  baseMs: number,
): number {
  const step = steps[i];
  if (!step) return baseMs;
  const gap = (steps[i + 1]?.at ?? step.at + 1e9) - step.at;
  return Math.max(40, Math.min(baseMs, Math.round(gap * 0.9)));
}

/** 다시 볼 수 있는 판: 다시 보기 글·섞기 글이 있고 맞춘 판 */
export function hasReplay(r: MiniRecord): boolean {
  return (
    r.ms !== null &&
    typeof r.replay === "string" &&
    r.replay !== "" &&
    !!r.scramble
  );
}

/**
 * 떠 있을 때 돌릴 판을 고른다. `turn`이 짝수면 최고 기록 판(최근 목록과 최고 5판 가운데 가장 빠른 것), 홀수면 가장
 * 최근 판을 먼저 찾고, 없으면 다른 쪽. 긴 판도 고른다(돌릴 때 `fitSolveSteps`로 줄인다). 다시 보기 재료가 있는
 * 판이 하나도 없을 때만 null(홈 시연).
 */
export function pickIdleReplay(
  records: readonly MiniRecord[],
  best5: readonly MiniRecord[],
  turn: number,
): MiniRecord | null {
  const recent = records.find(hasReplay) ?? null;
  let best: MiniRecord | null = null;
  for (const r of [...records, ...best5])
    if (
      hasReplay(r) &&
      (best === null || (r.ms as number) < (best.ms as number))
    )
      best = r;
  return turn % 2 === 0 ? (best ?? recent) : (recent ?? best);
}

/**
 * 맞춘 큐브에서 시작하는 다시 보기 걸음: 섞기 수를 `scrambleStepMs`마다 하나씩, `gapMs` 쉬고, 맞춘 과정을 그때 시각대로
 * (1분이 넘으면 `fitSolveSteps`로 줄여서)
 */
export function idleReplaySteps(
  n: number,
  record: MiniRecord,
  timing: IdleReplayTiming = IDLE_REPLAY_TIMING,
): ReplayStep[] {
  let scramble: ReplayStep[];
  try {
    scramble = parseMoves(n, record.scramble).map((m, i) => ({
      at: i * timing.scrambleStepMs,
      moves: [m],
      part: "scramble" as const,
    }));
  } catch {
    return [];
  }
  const solveAt =
    scramble.length === 0
      ? 0
      : (scramble.at(-1) as ReplayStep).at + timing.gapMs;
  const solve = fitSolveSteps(solveSteps(n, record.replay), timing);
  return [...scramble, ...solve.map((s) => ({ ...s, at: s.at + solveAt }))];
}
