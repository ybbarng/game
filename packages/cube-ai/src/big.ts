import {
  applyMoves,
  type CubeMove,
  faceColors,
  formatMove,
  parseMoves,
} from "@game/cube-engine";
import {
  EDGE_PARITY_TEXT,
  PLL_PARITY_TEXT,
  type ReductionLimits,
  type ReductionSolution,
  type ReductionStageId,
  ReductionStuckError,
  solveReductionState,
  threeParity,
  toThreeFacelets,
} from "@game/cube-reduction";
import type { PuzzleState } from "@game/puzzle-core";
import type { Step } from "./methods";
import { type HumanSolve, Solve, type StageName } from "./solve";

/**
 * 4×4·5×5 사람 흉내(축소법). 가운데 → 모서리 짝 → 마지막 두 모서리까지는 축소법(cube-reduction)
 * 그대로 두고, 그 뒤는 축소가 끝난 큐브를 3×3처럼 보고(바깥 꼭짓점·짝 지은 모서리·가운데)
 * 같은 단계의 3×3 사람 해법 차례(`Step`)를 돌린다. 3×3 수는 n×n 수로 옮긴다
 * (바깥층은 바깥층, 3×3 가운데 층은 n×n 안쪽 층 전부).
 *
 * 4×4 패리티는 사람처럼 3×3 단계 도중에 고친다. 차례 속 "oll-parity" 칸(OLL 앞)에서 모서리
 * 하나가 뒤집혀 있으면 OLL 패리티 공식(UF 모서리 뒤집기)을, "pll-parity" 칸(PLL 앞)에서 두
 * 모서리가 바뀌어 있으면 PLL 패리티 공식(UF·UB 맞바꾸기)을 넣는다. 두 공식은 첫 두 층과
 * 가운데를 그대로 두므로 이어서 3×3 해법을 계속 돌린다.
 */

const REDUCTION_STAGE: Partial<Record<ReductionStageId, StageName>> = {
  "centers-ud": "centers-ud",
  "centers-rest": "centers-rest",
  edges: "edges",
  "last-edges": "last-edges",
};

/** 색 번호를 그대로 글자로(흰=U, 빨강=R …): 3×3 해법이 흰 가운데를 찾아 아래로 돌린다 */
const IDENTITY = [0, 1, 2, 3, 4, 5];

/** 축소가 끝난 n×n 상태 → 3×3 스티커 문자열(글자는 색) */
function threeView(n: number, state: PuzzleState): string {
  return toThreeFacelets(n, faceColors(n, state), IDENTITY);
}

/** 3×3 수 → n×n 수. 층 1은 1, 층 3은 n, 층 2(가운데)는 안쪽 층 2~n−1 */
export function liftMove(n: number, m: CubeMove): CubeMove {
  const from = m.from === 1 ? 1 : m.from === 2 ? 2 : n;
  const to = m.to === 1 ? 1 : m.to === 2 ? n - 1 : n;
  return { ...m, from, to };
}

/**
 * 축소법은 5×5에서 수백 ms 걸린다. 같은 섞기를 여러 단계 컴퓨터가 함께 풀 때(경주) 한 번만
 * 계산하도록 최근 몇 개를 기억한다. 결과는 상태로만 정해지므로 기억해도 답이 바뀌지 않는다.
 */
const reductionCache = new Map<string, ReductionSolution>();
const REDUCTION_CACHE_SIZE = 8;

/**
 * 축소법이 막히면(`ReductionStuckError`) 이 차례로 큐브를 돌려 쥐고 다시 푼다. 처음은 쥔
 * 그대로. 돌려 쥐면 축소법이 보는 면 차례가 바뀌어(5×5는 정가운데 색이 따라 돈다, 4×4는 흰
 * 면을 늘 위로 맞추므로 옮길 조각이 달라진다) 공식 고르기가 다른 길로 간다. 사람이 막혔을
 * 때 큐브를 돌려 다른 면부터 보는 것과 같다. 차례가 정해져 있어 같은 상태면 늘 같은 해다.
 */
export const REGRIPS: readonly string[] = ["", "y", "x", "x'", "y2", "x2"];

/** 돌려 쥔 수를 축소법 해의 맨 앞(첫 단계 안)에 붙인다 */
function withGrip(grip: string, red: ReductionSolution): ReductionSolution {
  if (!grip) return red;
  return {
    moves: red.moves ? `${grip} ${red.moves}` : grip,
    stages: red.stages.map((st, i) => ({
      ...st,
      from: i === 0 ? 0 : st.from + 1,
      to: st.to + 1,
    })),
  };
}

/**
 * 축소법으로 풀되, 막히면 `REGRIPS` 차례로 돌려 쥐고 다시 해 본다. 모두 막히면 마지막
 * `ReductionStuckError`를 그대로 던져 화면이 잡게 한다. 막힘이 아닌 오류는 바로 던진다.
 * `solve`는 시험에서 막힘을 일으키려고 바꿔 넣는다.
 */
export function reduceWithRegrip(
  n: number,
  state: PuzzleState,
  solve: (
    n: number,
    state: PuzzleState,
  ) => ReductionSolution = solveReductionState,
): ReductionSolution {
  let stuck: ReductionStuckError | undefined;
  for (const grip of REGRIPS) {
    const start = grip ? applyMoves(n, state, parseMoves(n, grip)) : state;
    try {
      return withGrip(grip, solve(n, start));
    } catch (e) {
      if (!(e instanceof ReductionStuckError)) throw e;
      stuck = e;
    }
  }
  throw stuck;
}

/**
 * `limits`는 시험이 축소법을 일부러 막히게 할 때만 넣는다. 그때는 기억을 건너뛴다(기본
 * 상한으로 푼 해를 돌려주거나, 막힌 결과로 다른 시험을 흐리지 않게).
 */
function reduction(
  n: number,
  state: PuzzleState,
  limits?: ReductionLimits,
): ReductionSolution {
  if (limits) {
    return reduceWithRegrip(n, state, (size, s) =>
      solveReductionState(size, s, limits),
    );
  }
  const key = `${n}:${faceColors(n, state).join("")}`;
  const hit = reductionCache.get(key);
  if (hit) return hit;
  const red = reduceWithRegrip(n, state);
  reductionCache.set(key, red);
  if (reductionCache.size > REDUCTION_CACHE_SIZE) {
    reductionCache.delete(reductionCache.keys().next().value as string);
  }
  return red;
}

export function solveBigHuman(
  steps: readonly Step[],
  n: number,
  state: PuzzleState,
  limits?: ReductionLimits,
): HumanSolve {
  const red = reduction(n, state, limits);
  const redMoves = red.moves.split(/\s+/).filter(Boolean);
  const moves: string[] = [];
  const stages: HumanSolve["stages"] = [];
  const looks: number[] = [];
  for (const st of red.stages) {
    const name = REDUCTION_STAGE[st.id];
    if (!name) continue;
    const start = moves.length;
    moves.push(...redMoves.slice(st.from, st.to));
    stages.push({ name, start, end: moves.length });
  }
  let cur = applyMoves(n, state, parseMoves(n, moves.join(" ")));
  let s = new Solve(3, threeView(n, cur));

  /** 지금 3×3 판에 둔 수를 n×n 수로 옮겨 붙이고 n×n 상태를 앞으로 보낸다 */
  const flush = () => {
    const r = s.result();
    const offset = moves.length;
    const lifted = parseMoves(3, r.moves.join(" ")).map((m) => liftMove(n, m));
    moves.push(...lifted.map((m) => formatMove(n, m)));
    for (const st of r.stages) {
      stages.push({
        name: st.name,
        start: st.start + offset,
        end: st.end + offset,
      });
    }
    for (const l of r.looks) looks.push(l + offset);
    cur = applyMoves(n, cur, lifted);
  };

  for (const step of steps) {
    if (typeof step === "function") {
      step(s);
      continue;
    }
    if (n % 2 === 1) continue;
    // 3×3로 보아 풀 수 없는 모양인지(가운데 기준 글자라 큐브를 돌려 쥐어도 같다)
    const p = threeParity(s.rel());
    const found = step === "oll-parity" ? p.oll : p.pll;
    if (!found) continue;
    flush();
    const alg = parseMoves(
      n,
      step === "oll-parity" ? EDGE_PARITY_TEXT : PLL_PARITY_TEXT,
    );
    const start = moves.length;
    moves.push(...alg.map((m) => formatMove(n, m)));
    stages.push({ name: step, start, end: moves.length });
    cur = applyMoves(n, cur, alg);
    s = new Solve(3, threeView(n, cur));
  }
  if (!s.isSolved()) throw new Error("다 맞추지 못했다");
  flush();
  return { moves, stages, looks };
}

/** 4×4·5×5 초고수: 축소법 + 2단계 3×3 해법(cube-reduction 그대로, 패리티는 3×3 앞에서) */
export function solveBigExpert(
  n: number,
  state: PuzzleState,
  limits?: ReductionLimits,
): HumanSolve {
  const red = reduction(n, state, limits);
  const redMoves = red.moves.split(/\s+/).filter(Boolean);
  const stages = red.stages.map((st) => ({
    name: (REDUCTION_STAGE[st.id] ?? st.id) as StageName,
    start: st.from,
    end: st.to,
  }));
  return { moves: redMoves, stages, looks: [] };
}
