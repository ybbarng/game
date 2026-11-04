import { applyMove, isSolved, parseMoves } from "@game/cube-engine";
import { ReductionStuckError } from "@game/cube-reduction";
import type { PuzzleState } from "@game/puzzle-core";
import { type BotLevel, solveHuman } from "./methods";
import type { HumanSolve, SolveStage, StageName } from "./solve";

/**
 * 속도 흉내(docs/46 6절): 해법 수에 "언제 두나"를 붙인다.
 * 단계마다 생각 멈춤(다음 단계 모양 알아보기) 뒤 초당 수만큼 두고, 수마다 작은 흔들림을 준다.
 * 한 단계 안에서도 공식을 되풀이하면 공식 묶음 사이에 짧게 살핀다(`HumanSolve.looks`).
 * 흔들림은 씨앗에서 나오므로 같은 씨앗이면 시각까지 같다(복기·시험·다른 기기에서 다시 계산).
 */

export interface BotSpeed {
  /** 초당 수(TPS) */
  tps: number;
  /** 단계 사이 생각 멈춤(ms) */
  pauseMs: number;
  /** 단계 안 공식 묶음 사이 살피는 멈춤(ms) */
  lookMs: number;
  /** 수 사이 시간의 흔들림 폭(0.3 = ±30%) */
  jitter: number;
}

/** 2×2·3×3 */
export const BOT_SPEEDS: Readonly<Record<BotLevel, BotSpeed>> = {
  beginner: { tps: 2, pauseMs: 2500, lookMs: 800, jitter: 0.35 },
  intermediate: { tps: 4, pauseMs: 1200, lookMs: 400, jitter: 0.3 },
  advanced: { tps: 8, pauseMs: 400, lookMs: 150, jitter: 0.25 },
  expert: { tps: 10, pauseMs: 150, lookMs: 50, jitter: 0.15 },
};

/**
 * 4×4·5×5: 사람도 큰 큐브는 더 느리다(층을 골라 쥐고, 큐브가 크고 무겁다).
 * 초당 수를 낮추고 멈춤은 3×3과 같게 둔다.
 */
export const BIG_BOT_SPEEDS: Readonly<Record<BotLevel, BotSpeed>> = {
  beginner: { tps: 1.5, pauseMs: 2500, lookMs: 800, jitter: 0.35 },
  intermediate: { tps: 3, pauseMs: 1200, lookMs: 400, jitter: 0.3 },
  advanced: { tps: 6, pauseMs: 400, lookMs: 150, jitter: 0.25 },
  expert: { tps: 8, pauseMs: 150, lookMs: 50, jitter: 0.15 },
};

/** 가운데·모서리 짝 단계는 흩어진 조각을 찾느라 단계 앞 멈춤이 더 길다(배수) */
export const STAGE_PAUSE_FACTOR: Readonly<Partial<Record<StageName, number>>> =
  {
    "centers-ud": 2,
    "centers-rest": 2,
    edges: 2,
    "last-edges": 1.5,
  };

/** 크기에 맞는 빠르기(4×4 이상은 큰 큐브 빠르기) */
export function botSpeed(level: BotLevel, size: number): BotSpeed {
  return (size >= 4 ? BIG_BOT_SPEEDS : BOT_SPEEDS)[level];
}

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
  /** 고른 단계의 3×3 해법이 실패해 초고수 해를 그 단계 빠르기로 대신 두었다 */
  fallback?: true;
}

export interface BotPlanOptions {
  /** 살펴보기 시간(ms). 첫 수는 이 뒤에 둔다. 기본 0 */
  inspectionMs?: number;
  /** 해법 고르기. 시험이 일부러 실패하는 해법을 넣는다. 기본 `solveHuman` */
  solve?: (level: BotLevel, size: number, state: PuzzleState) => HumanSolve;
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

/**
 * 고른 단계의 해법이 실패하면(축소 뒤 3×3 사람 해법이 못 맞춤 등) 초고수 해(축소법 + 2단계
 * 3×3 해법)로 대신한다. 빠르기는 고른 단계 그대로라 입문이 갑자기 빨라지지 않는다. 같은
 * 상태면 늘 같은 대체라 다른 기기가 다시 계산해도 같은 계획이 나온다. 초고수 해도 실패하면
 * 그 오류를 그대로 던진다(화면이 그 판을 기권시킨다).
 *
 * 4×4·5×5 축소법이 막힌 오류(`ReductionStuckError`)는 대신하지 않고 바로 던진다. 축소법은
 * 모든 단계가 함께 쓰고(big.ts `reduction`, 돌려 쥐기까지 다 해 본 뒤의 오류) 같은 상태면
 * 결과가 같아서, 초고수로 다시 풀어도 똑같이 막힌다. 다시 풀면 5×5 돌려 쥐기 여섯 번을 한 번
 * 더 계산할 뿐이다.
 */
function solveOrFallback(
  level: BotLevel,
  size: number,
  state: PuzzleState,
  solve: NonNullable<BotPlanOptions["solve"]>,
): { solve: HumanSolve; fallback: boolean } {
  try {
    return { solve: solve(level, size, state), fallback: false };
  } catch (e) {
    if (level === "expert" || e instanceof RangeError) throw e;
    if (e instanceof ReductionStuckError) throw e;
    return { solve: solve("expert", size, state), fallback: true };
  }
}

/**
 * 해법을 처음으로 맞춰지는 수까지만 쓴 길이. 사람 해법은 끝에 서로 지우는 수(`U' U`)가 남아 다 두기 전에
 * 맞춰질 때가 있다(2×2 입문 150판 중 1판쯤). 대결은 맞춰지는 순간 그 사람의 수를 끝내므로(`isSolved`, 돌려
 * 쥔 방향은 따지지 않음) 계획도 거기서 끝내야 컴퓨터가 둔 수와 다른 기기가 다시 계산한 계획이 같다
 * (2026-11-04 #90 CI: 52수 계획이 50수째에 맞춰져 「컴퓨터 계획과 다름」)
 */
function solvedLength(
  size: number,
  start: PuzzleState,
  moves: readonly string[],
): number {
  let state = start;
  for (let i = 0; i < moves.length; i++) {
    for (const m of parseMoves(size, moves[i] as string))
      state = applyMove(size, state, m);
    if (isSolved(size, state)) return i + 1;
  }
  return moves.length;
}

/** 컴퓨터가 맞추는 계획: 수와 둘 시각, 단계 경계. 처음 맞춰지는 수에서 끝난다 */
export function botPlan(
  level: BotLevel,
  size: number,
  startState: PuzzleState,
  seed: number,
  opts: BotPlanOptions = {},
): BotPlan {
  const { solve, fallback } = solveOrFallback(
    level,
    size,
    startState,
    opts.solve ?? solveHuman,
  );
  const speed = botSpeed(level, size);
  const next = rng(seed);
  const wobble = (base: number) => base * (1 + speed.jitter * (2 * next() - 1));
  const step = 1000 / speed.tps;
  const looks = new Set(solve.looks);
  const length = solvedLength(size, startState, solve.moves);
  let t = opts.inspectionMs ?? 0;
  const moves: BotMove[] = [];
  const stages: SolveStage[] = [];
  for (const st of solve.stages) {
    if (st.start >= length && length < solve.moves.length) break;
    const end = Math.min(st.end, length);
    stages.push(end === st.end ? st : { ...st, end });
    if (end > st.start)
      t += wobble(speed.pauseMs * (STAGE_PAUSE_FACTOR[st.name] ?? 1));
    for (let i = st.start; i < end; i++) {
      const move = solve.moves[i] as string;
      if (i > st.start && looks.has(i)) t += wobble(speed.lookMs);
      t += wobble(step) * (isRotationMove(move) ? ROTATION_FACTOR : 1);
      moves.push({ move, at: Math.round(t) });
    }
  }
  return {
    moves,
    stages,
    finishAt: moves.at(-1)?.at ?? opts.inspectionMs ?? 0,
    ...(fallback ? { fallback: true as const } : {}),
  };
}
