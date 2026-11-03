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
  type ReductionSolution,
  type ReductionStageId,
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

function reduction(n: number, state: PuzzleState): ReductionSolution {
  const key = `${n}:${faceColors(n, state).join("")}`;
  const hit = reductionCache.get(key);
  if (hit) return hit;
  const red = solveReductionState(n, state);
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
): HumanSolve {
  const red = reduction(n, state);
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
export function solveBigExpert(n: number, state: PuzzleState): HumanSolve {
  const red = reduction(n, state);
  const redMoves = red.moves.split(/\s+/).filter(Boolean);
  const stages = red.stages.map((st) => ({
    name: (REDUCTION_STAGE[st.id] ?? st.id) as StageName,
    start: st.from,
    end: st.to,
  }));
  return { moves: redMoves, stages, looks: [] };
}
