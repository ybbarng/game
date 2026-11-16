// 4×4 야우 풀이 함수(docs/47 8-6 단계 지도, 16-16~16-21). 섞인 4×4를 야우 차례 그대로 배우기 단원의 경우별 정해진 길로
// 끝까지 맞춘다: 흰·노랑 센터(축소법 센터 규칙을 두 색만) → 흰 십자 셋 → 옆 센터 넷 → 마지막 십자 엣지 → 엣지 여덟
// (축소법 처음 엣지 규칙) → 3×3처럼(패리티 포함, 3×3 처음 맞추기 차례). 단계마다 그 단원이 가르치는 것과 같은 수다.
// 탐색하지 않고 규칙만 따르므로 결정적이고, 수는 사람이 단원대로 할 때와 같다. 앞 다섯 단계는 4×4 컴퓨터 야우와 같이 쓰는
// `@game/cube-ai`의 `yauReduce`다(컴퓨터는 그 뒤를 CFOP으로, docs/47 10-4).
import { type YauReduceStageId, yauReduce } from "@game/cube-ai";
import type { PuzzleState } from "@game/puzzle-core";
import { stepMoves } from "./beginner-path";
import { type Pick, playN } from "./big-path";
import { type ReducedStage, solveReduced } from "./big-solve";

/** 같은 경우가 여럿이면 첫째(단원 시연과 같은 고르기) */
const FIRST: Pick = () => 0;

/** 야우 단계(단계 지도 `4x4-yau`의 차례와 같다) */
export type YauStageId = YauReduceStageId | "three";

export interface YauStage {
  id: YauStageId;
  /** 이 단계에서 친 수(큐브 돌리기 포함, 빈 글이면 이미 맞아 있었다) */
  moves: string;
  /** 걸음마다 친 수(경우 하나: 쥐기 + 공식, 이어 붙이면 `moves`). 빈 걸음은 없다 */
  steps: string[];
  /** 「3×3처럼」의 작은 단계(3×3 처음 맞추기 차례와 패리티, `solveReduced`). 그 밖의 단계에는 없다 */
  parts?: YauPart[];
}

/** 「3×3처럼」의 작은 단계 하나 */
export interface YauPart {
  id: ReducedStage["id"];
  moves: string;
  /** 걸음마다 친 수(첫 걸음은 단계 앞 쥐기를 함께 든다) */
  steps: string[];
}

export interface YauSolution {
  state: PuzzleState;
  stages: YauStage[];
  /** 모든 수(단계를 이어 붙인 것) */
  moves: string;
}

const join = (...xs: string[]) => xs.filter(Boolean).join(" ").trim();

const tokens = (text: string) => text.split(/\s+/).filter(Boolean);

/** 「3×3처럼」 작은 단계를 걸음으로 나눈다: 걸음 수 앞의 쥐기(흰 면 위로 들기·z2)는 첫 걸음에 붙인다 */
function partOf(st: ReducedStage): YauPart {
  const all = tokens(st.moves);
  const steps = st.steps
    .map(stepMoves)
    .map((x) => join(x))
    .filter(Boolean);
  const body = steps.reduce((k, x) => k + tokens(x).length, 0);
  const lead = all.slice(0, all.length - body).join(" ");
  if (steps.length === 0)
    return { id: st.id, moves: join(st.moves), steps: lead ? [lead] : [] };
  steps[0] = join(lead, steps[0] as string);
  return { id: st.id, moves: join(...steps), steps };
}

/** 섞인 4×4를 야우 차례로 끝까지. `pick`은 같은 경우가 여럿일 때 고르는 차례(기본 첫째) */
export function solveYau(start: PuzzleState, pick: Pick = FIRST): YauSolution {
  const front = yauReduce(start, pick);
  const stages: YauStage[] = [...front.stages];
  const parts = solveReduced(4, front.state).stages.map(partOf);
  const steps = parts.flatMap((p) => p.steps).filter(Boolean);
  const moves = join(...steps);
  stages.push({ id: "three", moves, steps, parts });
  return {
    state: playN(4, front.state, moves),
    stages,
    moves: join(...stages.map((st) => st.moves)),
  };
}
