import {
  applyMove,
  type CubeMove,
  formatMove,
  invertMove,
  isRotation,
  isSolved,
  parseMoves,
} from "@game/cube-engine";
import { ReductionStuckError } from "@game/cube-reduction";
import type { PuzzleState } from "@game/puzzle-core";
import { type SolveMethod, solveHuman } from "./methods";
import {
  BOT_TARGET_MS,
  type BotLevel,
  type BotSkill,
  fitLevel,
  type LegacyBotLevel,
  levelMethod,
  readBotSkill,
} from "./skill";
import type { HumanSolve, SolveStage, StageName } from "./solve";

/**
 * 속도 흉내(docs/46 6절, docs/47 10-1): 해법 수에 "언제 두나"를 붙인다.
 * 단계마다 생각 멈춤(다음 단계 모양 알아보기) 뒤 그 단계 빠르기로 두고, 수마다 작은 흔들림을 준다.
 * 공식을 외워 두는 단계(OLL·PLL 등)는 찾으며 두는 단계(십자·F2L·층별·축소)보다 빠르다.
 * 한 단계 안에서도 공식을 되풀이하면 공식 묶음 사이에 짧게 살핀다(`HumanSolve.looks`).
 * 낮은 단계는 가끔 헛수(반대로 돌림)를 두었다가 알아차리고 되돌린다. 판마다 컨디션도 조금 다르다.
 * 흔들림·헛수는 씨앗에서 나오므로 같은 씨앗이면 시각까지 같다(복기·시험·다른 기기에서 다시 계산).
 */

export interface BotSpeed {
  /** 공식을 외워 두는 단계(OLL·PLL·노란 면 등)의 초당 수(TPS) */
  tps: number;
  /** 찾으며 두는 단계(십자·F2L·층별·가운데·모서리 짝)의 초당 수 */
  searchTps: number;
  /** 단계 사이 생각 멈춤(ms) */
  pauseMs: number;
  /** 단계 안 공식 묶음 사이 살피는 멈춤(ms) */
  lookMs: number;
  /** 수 사이 시간의 흔들림 폭(0.3 = ±30%) */
  jitter: number;
  /** 면 돌리기 하나마다 헛수를 둘 확률 */
  slip: number;
  /** 헛수를 알아차리는 멈춤(ms) */
  slipMs: number;
  /** 판마다 컨디션 흔들림(0.1 = 모든 시간 ±10%) */
  form: number;
}

/**
 * 단계별 빠르기 모양(시간 배율 1). 크기·단계마다 `BASE_MEAN_MS`로 나눠 목표 시간에 맞춘다(`botSpeed`).
 * 사람 손 빠르기의 비율: 공식 단계가 찾는 단계보다 1.5~2배 빠르고, 높은 단계일수록 멈춤이 짧고 헛수가 드물다
 */
export const LEVEL_SHAPES: Readonly<Record<BotLevel, BotSpeed>> = {
  novice: {
    tps: 2,
    searchTps: 1.2,
    pauseMs: 3000,
    lookMs: 1200,
    jitter: 0.35,
    slip: 0.04,
    slipMs: 1500,
    form: 0.12,
  },
  casual: {
    tps: 3,
    searchTps: 2,
    pauseMs: 1500,
    lookMs: 700,
    jitter: 0.3,
    slip: 0.02,
    slipMs: 900,
    form: 0.1,
  },
  club: {
    tps: 4.5,
    searchTps: 2.8,
    pauseMs: 1000,
    lookMs: 400,
    jitter: 0.3,
    slip: 0.01,
    slipMs: 600,
    form: 0.08,
  },
  fast: {
    tps: 7,
    searchTps: 4,
    pauseMs: 500,
    lookMs: 200,
    jitter: 0.25,
    slip: 0.003,
    slipMs: 400,
    form: 0.07,
  },
  pro: {
    tps: 10,
    searchTps: 7,
    pauseMs: 250,
    lookMs: 80,
    jitter: 0.2,
    slip: 0,
    slipMs: 300,
    form: 0.06,
  },
};

/**
 * 시간 배율 1(`LEVEL_SHAPES` 그대로)로 둔 계획의 평균 길이(ms). bench(`balance.strength.ts`)가 잰 값이다.
 * 목표 / 이 값 = 그 크기·단계의 시간 배율. 해법이나 모양을 바꾸면 bench를 다시 돌려 고치고 `BOT_PLAN_VERSION`을 올린다
 */
export const BASE_MEAN_MS: Readonly<Record<number, Record<BotLevel, number>>> =
  {
    // 2026-11-05 bench: 섞기 2×2 400 · 3×3 300 · 4×4 100 · 5×5 60개
    2: {
      novice: 79_180,
      casual: 44_990,
      club: 26_900,
      fast: 5_440,
      pro: 3_300,
    },
    3: {
      novice: 157_940,
      casual: 60_160,
      club: 30_600,
      fast: 14_630,
      pro: 8_500,
    },
    4: {
      novice: 251_680,
      casual: 112_130,
      club: 65_820,
      fast: 37_490,
      pro: 21_360,
    },
    5: {
      novice: 339_830,
      casual: 163_070,
      club: 100_800,
      fast: 61_970,
      pro: 35_020,
    },
  };

/** 공식을 외워 두는 단계(이 밖은 찾으며 두는 단계) */
const ALG_STAGES: ReadonlySet<StageName> = new Set<StageName>([
  "eo",
  "co",
  "cp",
  "ep",
  "oll",
  "pll",
  "ll-edges",
  "ll-corner-place",
  "ll-corner-twist",
  "oll-parity",
  "pll-parity",
  "solve",
  "three",
]);

/** 가운데·모서리 짝 단계는 흩어진 조각을 찾느라 단계 앞 멈춤이 더 길다(배수) */
export const STAGE_PAUSE_FACTOR: Readonly<Partial<Record<StageName, number>>> =
  {
    "centers-ud": 2,
    "centers-rest": 2,
    edges: 2,
    "last-edges": 1.5,
  };

/** 단계·크기의 시간 배율(목표 / 배율 1 평균) */
export function levelScale(level: BotLevel, size: number): number {
  const target = BOT_TARGET_MS[size]?.[level];
  const base = BASE_MEAN_MS[size]?.[level];
  if (target === undefined || base === undefined)
    throw new RangeError(`${size}×${size} 컴퓨터는 아직 없다`);
  return target / base;
}

/** 단계·크기에 맞춘 빠르기(시간 배율을 곱한 것) */
export function botSpeed(
  level: BotLevel,
  size: number,
  scale?: number,
): BotSpeed {
  const k = scale ?? levelScale(level, size);
  const s = LEVEL_SHAPES[level];
  return {
    ...s,
    tps: s.tps / k,
    searchTps: s.searchTps / k,
    pauseMs: s.pauseMs * k,
    lookMs: s.lookMs * k,
    slipMs: s.slipMs * k,
  };
}

/** 컴퓨터 단계 → 쓰는 단계 모양과 시간 배율(「내 실력에 맞춤」은 목표에 가까운 단계를 목표에 맞게 늘이거나 줄인다) */
export function resolveSkill(
  skill: Exclude<BotSkill, { kind: "legacy" }>,
  size: number,
): { level: BotLevel; scale: number } {
  if (skill.kind === "level")
    return { level: skill.level, scale: levelScale(skill.level, size) };
  const fit = fitLevel(size, skill.targetMs);
  const base = BASE_MEAN_MS[size]?.[fit.level];
  if (base === undefined)
    throw new RangeError(`${size}×${size} 컴퓨터는 아직 없다`);
  return { level: fit.level, scale: fit.targetMs / base };
}

/** 큐브 돌리기(x·y·z)는 면 돌리기보다 조금 빠르다 */
const ROTATION_FACTOR = 0.7;

export interface BotMove {
  move: string;
  /** 시작(살펴보기 포함)부터 이 수를 다 둔 시각(ms) */
  at: number;
  /** 헛수(반대로 돌린 수)나 그것을 되돌린 수. 해법의 수가 아니다 */
  slip?: true;
}

export interface BotPlan {
  moves: BotMove[];
  stages: SolveStage[];
  /** 마지막 수를 둔 시각(ms). 수가 없으면 살펴보기 시간 */
  finishAt: number;
  /** 고른 단계의 3×3 해법이 실패해 2단계 해법 해를 그 단계 빠르기로 대신 두었다 */
  fallback?: true;
}

export interface BotPlanOptions {
  /** 살펴보기 시간(ms). 첫 수는 이 뒤에 둔다. 기본 0 */
  inspectionMs?: number;
  /** 해법 고르기. 시험이 일부러 실패하는 해법을 넣는다. 기본 `solveHuman` */
  solve?: (method: SolveMethod, size: number, state: PuzzleState) => HumanSolve;
  /** bench만: 시간 배율을 정해 둔다(배율 1 평균을 잴 때) */
  scale?: number;
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
 * 고른 해법이 실패하면(축소 뒤 3×3 사람 해법이 못 맞춤 등) 2단계 해법 해(`expert`)로 대신한다. 빠르기는 고른 단계
 * 그대로라 입문이 갑자기 빨라지지 않는다. 같은 상태면 늘 같은 대체라 다른 기기가 다시 계산해도 같은 계획이 나온다.
 * 대체 해도 실패하면 그 오류를 그대로 던진다(화면이 그 판을 기권시킨다).
 *
 * 4×4·5×5 축소법이 막힌 오류(`ReductionStuckError`)는 대신하지 않고 바로 던진다. 축소법은
 * 모든 단계가 함께 쓰고(big.ts `reduction`, 돌려 쥐기까지 다 해 본 뒤의 오류) 같은 상태면
 * 결과가 같아서, 다시 풀어도 똑같이 막힌다.
 */
function solveOrFallback(
  method: SolveMethod,
  size: number,
  state: PuzzleState,
  solve: NonNullable<BotPlanOptions["solve"]>,
): { solve: HumanSolve; fallback: boolean } {
  try {
    return { solve: solve(method, size, state), fallback: false };
  } catch (e) {
    if (method === "expert" || e instanceof RangeError) throw e;
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

/** 헛수: 반대 방향(반 바퀴면 한 칸만) */
function slipOf(m: CubeMove): CubeMove {
  return m.turns === 2 ? { ...m, turns: 1 } : invertMove(m);
}

/**
 * 컴퓨터가 맞추는 계획: 수와 둘 시각, 단계 경계. 처음 맞춰지는 수에서 끝난다.
 * `skill`은 단계(글 `botSkillText`도 받는다). 모르는 글이면 RangeError
 */
export function botPlan(
  skill: BotSkill | string,
  size: number,
  startState: PuzzleState,
  seed: number,
  opts: BotPlanOptions = {},
): BotPlan {
  const read = typeof skill === "string" ? readBotSkill(skill) : skill;
  if (!read) throw new RangeError(`모르는 컴퓨터 단계: ${String(skill)}`);
  if (read.kind === "legacy")
    return legacyPlan(read.level, size, startState, seed, opts);
  const { level, scale } = resolveSkill(read, size);
  const { solve, fallback } = solveOrFallback(
    levelMethod(level, size),
    size,
    startState,
    opts.solve ?? solveHuman,
  );
  const speed = botSpeed(level, size, opts.scale ?? scale);
  const next = rng(seed);
  const form = 1 + speed.form * (2 * next() - 1);
  const wobble = (base: number) =>
    base * form * (1 + speed.jitter * (2 * next() - 1));
  const looks = new Set(solve.looks);
  const length = solvedLength(size, startState, solve.moves);
  let t = opts.inspectionMs ?? 0;
  let state = startState;
  const moves: BotMove[] = [];
  const stages: SolveStage[] = [];
  /** 계획에 더한 헛수 수(단계 경계를 계획 차례로 옮긴다) */
  let extra = 0;
  for (const st of solve.stages) {
    if (st.start >= length && length < solve.moves.length) break;
    const end = Math.min(st.end, length);
    const startAt = st.start + extra;
    if (end > st.start)
      t += wobble(speed.pauseMs * (STAGE_PAUSE_FACTOR[st.name] ?? 1));
    const step = 1000 / (ALG_STAGES.has(st.name) ? speed.tps : speed.searchTps);
    for (let i = st.start; i < end; i++) {
      const move = solve.moves[i] as string;
      if (i > st.start && looks.has(i)) t += wobble(speed.lookMs);
      const parsed = parseMoves(size, move);
      const one = parsed.length === 1 ? (parsed[0] as CubeMove) : null;
      if (
        speed.slip > 0 &&
        !isRotationMove(move) &&
        one &&
        !isRotation(size, one) &&
        next() < speed.slip
      ) {
        const wrong = slipOf(one);
        const after = applyMove(size, state, wrong);
        // 헛수로 우연히 맞춰지면 대결이 거기서 끝나 계획과 어긋난다: 그때는 헛수를 두지 않는다
        if (!isSolved(size, after)) {
          t += wobble(step);
          moves.push({
            move: formatMove(size, wrong),
            at: Math.round(t),
            slip: true,
          });
          t += wobble(speed.slipMs);
          t += wobble(step);
          moves.push({
            move: formatMove(size, invertMove(wrong)),
            at: Math.round(t),
            slip: true,
          });
          extra += 2;
        }
      }
      t += wobble(step) * (isRotationMove(move) ? ROTATION_FACTOR : 1);
      moves.push({ move, at: Math.round(t) });
      for (const m of parsed) state = applyMove(size, state, m);
    }
    stages.push({ name: st.name, start: startAt, end: end + extra });
  }
  return {
    moves,
    stages,
    finishAt: moves.at(-1)?.at ?? opts.inspectionMs ?? 0,
    ...(fallback ? { fallback: true as const } : {}),
  };
}

// ---------- 옛 계획(2026-11-05 전 단계 값) ----------

/**
 * 옛 표(버전 없는 값 `beginner`·`intermediate`·`advanced`·`expert`). 옛 화면 방장이 둔 컴퓨터를 이 기기가 다시 계산해
 * 맞춰 보도록 그대로 둔다. 새 방장은 이 값을 만들지 않는다. 바꾸지 않는다(바꾸면 옛 방의 확인이 어긋난다)
 */
interface LegacySpeed {
  tps: number;
  pauseMs: number;
  lookMs: number;
  jitter: number;
}

/** 옛 2×2·3×3 */
export const LEGACY_BOT_SPEEDS: Readonly<Record<LegacyBotLevel, LegacySpeed>> =
  {
    beginner: { tps: 2, pauseMs: 2500, lookMs: 800, jitter: 0.35 },
    intermediate: { tps: 4, pauseMs: 1200, lookMs: 400, jitter: 0.3 },
    advanced: { tps: 8, pauseMs: 400, lookMs: 150, jitter: 0.25 },
    expert: { tps: 10, pauseMs: 150, lookMs: 50, jitter: 0.15 },
  };

/** 옛 4×4·5×5 */
export const LEGACY_BIG_BOT_SPEEDS: Readonly<
  Record<LegacyBotLevel, LegacySpeed>
> = {
  beginner: { tps: 1.5, pauseMs: 2500, lookMs: 800, jitter: 0.35 },
  intermediate: { tps: 3, pauseMs: 1200, lookMs: 400, jitter: 0.3 },
  advanced: { tps: 6, pauseMs: 400, lookMs: 150, jitter: 0.25 },
  expert: { tps: 8, pauseMs: 150, lookMs: 50, jitter: 0.15 },
};

function legacyPlan(
  level: LegacyBotLevel,
  size: number,
  startState: PuzzleState,
  seed: number,
  opts: BotPlanOptions,
): BotPlan {
  // 옛 단계 이름은 해법 이름과 같다
  const { solve, fallback } = solveOrFallback(
    level,
    size,
    startState,
    opts.solve ?? solveHuman,
  );
  const speed = (size >= 4 ? LEGACY_BIG_BOT_SPEEDS : LEGACY_BOT_SPEEDS)[level];
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
