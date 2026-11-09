import { parseMoves } from "@game/cube-engine";

import { type ReplayStep, replayLength, solveSteps } from "../replay-player";
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
  /**
   * 맞춘 과정이 이보다 길면(멈춤을 줄인 뒤) 그 판은 고르지 않는다. 홈 시연 한 판(3×3 약 30초)을 6분에 한 번 그리던
   * 몫(약 8%)에서 크게 벗어나지 않게 1분으로 잡았다: 1분이면 6분에 한 번 약 17%이고, 큰 큐브 몇 분짜리 판까지
   * 돌리면 쉬는 동안의 절반 가까이를 그리게 된다. 빠르게 돌리기는 고르지 않았다: 수가 많은 판을 빨리 돌리면
   * 장면 차례가 밀리고 「맞추던 속도로」라는 뜻도 사라진다
   */
  maxSolveMs: number;
}

export const IDLE_REPLAY_TIMING: IdleReplayTiming = {
  scrambleStepMs: 150,
  gapMs: 800,
  maxSolveMs: 60_000,
};

/** 섞기 걸음을 그리는 한 수의 회전 시간(ms). 간격보다 짧아야 차례가 밀리지 않는다 */
export const SCRAMBLE_MOVE_MS = 110;

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
 * 최근 판을 먼저 찾고, 없으면 다른 쪽. 맞춘 과정이 `maxSolveMs`보다 긴 판은 건너뛴다. 없으면 null(홈 시연).
 */
export function pickIdleReplay(
  records: readonly MiniRecord[],
  best5: readonly MiniRecord[],
  turn: number,
  maxSolveMs = IDLE_REPLAY_TIMING.maxSolveMs,
): MiniRecord | null {
  const fits = (r: MiniRecord) =>
    hasReplay(r) && replayLength(r.replay) <= maxSolveMs;
  const recent = records.find(fits) ?? null;
  let best: MiniRecord | null = null;
  for (const r of [...records, ...best5])
    if (fits(r) && (best === null || (r.ms as number) < (best.ms as number)))
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
