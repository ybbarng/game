import { parseMoves } from "@game/cube-engine";

import { type ReplayStep, solveSteps } from "../replay-player";
import type { MiniRecord } from "./store";

/**
 * 떠 있을 때 내 판 다시 보기(docs/47 15-13, 사용자 2026-11-09 「큐브가 맞춰진 채로 일정 시간 있으면 replay로
 * 동작하면 어떨까? 섞고 맞추는 과정」). 맞춘 큐브에서 홈 시연 대신 내 판 하나를: 섞기를 빠르게 보인 뒤 맞춘 과정을
 * 그때 수 시각대로(멈춤은 1초까지, 혼자 맞추기 다시 보기와 같다).
 */

export interface IdleReplayTiming {
  /** 섞기 한 수의 간격 */
  scrambleStepMs: number;
  /** 섞기를 다 보이고 맞추기 첫 수까지 */
  gapMs: number;
}

/**
 * 맞춘 과정의 길이 상한은 두지 않는다(2026-11-10 사용자). 예전에는 1분 넘는 판을 고르지 않아, 판이 대부분 1분을 넘는
 * 초보(첫 판 8분)에게 내 판 다시 보기가 거의 나오지 않았다. 빠르게 돌려 맞추는 것도 정신없어 버렸다. 멈춘 시간만
 * 1초로 줄이고(`REPLAY_MAX_PAUSE_MS`) 그때 속도 그대로 돌린다. 몇 분짜리 판이면 몇 분 동안 돌고, 포커스를 받으면
 * 바로 멈춘다
 */
export const IDLE_REPLAY_TIMING: IdleReplayTiming = {
  scrambleStepMs: 150,
  gapMs: 800,
};

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
 * 최근 판을 먼저 찾고, 없으면 다른 쪽. 길이와 상관없이 고른다. 다시 보기 재료가 있는 판이 하나도 없을 때만
 * null(홈 시연).
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
  return [...scramble, ...solveSteps(n, record.replay, undefined, solveAt)];
}
