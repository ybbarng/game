import type { PuzzleState } from "@game/puzzle-core";
import { type BotLevel, solveHuman } from "./methods";
import type { SolveStage } from "./solve";

/**
 * 속도 흉내(docs/46 6절): 해법 수에 "언제 두나"를 붙인다.
 * 단계마다 생각 멈춤(다음 단계 모양 알아보기) 뒤 초당 수만큼 두고, 수마다 작은 흔들림을 준다.
 * 흔들림은 씨앗에서 나오므로 같은 씨앗이면 시각까지 같다(복기·시험·다른 기기에서 다시 계산).
 */

export interface BotSpeed {
  /** 초당 수(TPS) */
  tps: number;
  /** 단계 사이 생각 멈춤(ms) */
  pauseMs: number;
  /** 수 사이 시간의 흔들림 폭(0.3 = ±30%) */
  jitter: number;
}

export const BOT_SPEEDS: Readonly<Record<BotLevel, BotSpeed>> = {
  beginner: { tps: 2, pauseMs: 2500, jitter: 0.35 },
  intermediate: { tps: 4, pauseMs: 1200, jitter: 0.3 },
  advanced: { tps: 8, pauseMs: 400, jitter: 0.25 },
  expert: { tps: 10, pauseMs: 150, jitter: 0.15 },
};

/** 큐브 돌리기(x·y·z)는 면 돌리기보다 조금 빠르다 */
const ROTATION_FACTOR = 0.7;

export interface BotMove {
  move: string;
  /** 시작(살펴보기 포함)부터 이 수를 다 둔 시각(ms) */
  at: number;
}

export interface BotPlan {
  moves: BotMove[];
  stages: SolveStage[];
  /** 마지막 수를 둔 시각(ms). 수가 없으면 살펴보기 시간 */
  finishAt: number;
}

export interface BotPlanOptions {
  /** 살펴보기 시간(ms). 첫 수는 이 뒤에 둔다. 기본 0 */
  inspectionMs?: number;
}

/** 작은 결정적 난수(mulberry32), 0 이상 1 미만 */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isRotationMove = (m: string) => /^[xyz]/.test(m);

/** 컴퓨터가 맞추는 계획: 수와 둘 시각, 단계 경계 */
export function botPlan(
  level: BotLevel,
  size: number,
  startState: PuzzleState,
  seed: number,
  opts: BotPlanOptions = {},
): BotPlan {
  const solve = solveHuman(level, size, startState);
  const speed = BOT_SPEEDS[level];
  const next = rng(seed);
  const wobble = (base: number) => base * (1 + speed.jitter * (2 * next() - 1));
  const step = 1000 / speed.tps;
  let t = opts.inspectionMs ?? 0;
  const moves: BotMove[] = [];
  for (const st of solve.stages) {
    if (st.end > st.start) t += wobble(speed.pauseMs);
    for (let i = st.start; i < st.end; i++) {
      const move = solve.moves[i] as string;
      t += wobble(step) * (isRotationMove(move) ? ROTATION_FACTOR : 1);
      moves.push({ move, at: Math.round(t) });
    }
  }
  return {
    moves,
    stages: solve.stages,
    finishAt: moves.at(-1)?.at ?? opts.inspectionMs ?? 0,
  };
}
