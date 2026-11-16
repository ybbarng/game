// 4×4 야우 풀이 함수(docs/47 8-6 단계 지도, 16-16~16-21). 섞인 4×4를 야우 차례 그대로 배우기 단원의 경우별 정해진 길로
// 끝까지 맞춘다: 흰·노랑 센터(축소법 센터 규칙을 두 색만) → 흰 십자 셋 → 옆 센터 넷 → 마지막 십자 엣지 → 엣지 여덟
// (축소법 처음 엣지 규칙) → 3×3처럼(패리티 포함, 3×3 처음 맞추기 차례). 단계마다 그 단원이 가르치는 것과 같은 수다.
// 컴퓨터 해법(`@game/cube-ai`)처럼 탐색하지 않고 규칙만 따르므로 결정적이고, 수는 사람이 단원대로 할 때와 같다.
import type { PuzzleState } from "@game/puzzle-core";
import { stepMoves } from "./beginner-path";
import {
  type Pick,
  playN,
  runCenters,
  runEdges444,
  stepMovesBig,
} from "./big-path";
import { type ReducedStage, solveReduced } from "./big-solve";
import {
  runYauCross,
  runYauLastCross,
  runYauSideCenters,
  stepMovesYau,
  stepMovesYauCross,
  stepMovesYauLast,
  yauSideTargets,
} from "./yau-path";

/** 같은 경우가 여럿이면 첫째(단원 시연과 같은 고르기) */
const FIRST: Pick = () => 0;
const WHITE = 0;
const YELLOW = 3;

/** 야우 단계(단계 지도 `4x4-yau`의 차례와 같다) */
export type YauStageId =
  | "centers-ud"
  | "cross3"
  | "centers-rest"
  | "last-cross"
  | "edges"
  | "three";

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

/** 큐브 돌리기 24가지(돌리기 적은 것 먼저) */
const HOLDS: readonly string[] = ["", "x", "x2", "x'", "z", "z'"].flatMap((a) =>
  ["", "y", "y'", "y2"].map((b) => join(a, b)),
);

/** 흰 면 아래·흰 십자 엣지 셋(앞·왼쪽·뒤)이 되는 쥐기 */
function sideHold(s: PuzzleState): string {
  const ok = (h: string) => {
    try {
      yauSideTargets(playN(4, s, h));
      return true;
    } catch {
      return false;
    }
  };
  const h = [...HOLDS]
    .sort((a, b) => a.split(" ").length - b.split(" ").length)
    .find(ok);
  if (h === undefined) throw new Error("흰 십자 셋이 맞지 않았다");
  return h;
}

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
  const stages: YauStage[] = [];
  let s = start;
  const push = (id: YauStageId, list: string[], parts?: YauPart[]) => {
    const steps = list.map((x) => join(x)).filter(Boolean);
    const moves = join(...steps);
    stages.push(parts ? { id, moves, steps, parts } : { id, moves, steps });
    s = playN(4, s, moves);
  };

  const centers = runCenters(4, s, pick, [WHITE, YELLOW]);
  push("centers-ud", centers.steps.map(stepMovesBig));
  push("cross3", runYauCross(s, pick).steps.map(stepMovesYauCross));
  // 옆 센터는 흰 면 아래, 비운 십자 자리(흰-주황)를 오른쪽으로 쥔 큐브에서 시작한다(단원 쥐기)
  const side = sideHold(s);
  const sideRun = runYauSideCenters(playN(4, s, side), pick);
  const sideSteps = sideRun.steps.map(stepMovesYau);
  push("centers-rest", [join(side, sideSteps[0] ?? ""), ...sideSteps.slice(1)]);
  push("last-cross", runYauLastCross(s, pick).steps.map(stepMovesYauLast));
  push("edges", runEdges444(s).steps.map(stepMovesBig));
  const parts = solveReduced(4, s).stages.map(partOf);
  push(
    "three",
    parts.flatMap((p) => p.steps),
    parts,
  );

  return { state: s, stages, moves: join(...stages.map((st) => st.moves)) };
}
