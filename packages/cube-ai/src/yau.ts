import type { PuzzleState } from "@game/puzzle-core";

import { finishAsThree } from "./big";
import type { Step } from "./methods";
import type { HumanSolve, StageName } from "./solve";
import {
  type Pick,
  playN,
  runCenters,
  runEdges444,
  stepMovesBig,
} from "./taught-big";
import {
  runYauCross,
  runYauLastCross,
  runYauSideCenters,
  stepMovesYau,
  stepMovesYauCross,
  stepMovesYauLast,
  yauSideTargets,
} from "./taught-yau";
import { yauEdgesShort } from "./yau-edges";

/**
 * 4×4 야우의 앞 다섯 단계(docs/47 8-6 단계 지도, 16-16~16-21): 흰·노랑 센터(축소법 센터 규칙을 두 색만) → 흰 십자 셋 →
 * 옆 센터 넷 → 마지막 십자 엣지 → 엣지 여덟(축소법 처음 엣지 규칙). 배우기 단원의 경우별 정해진 길 그대로라 결정적이고,
 * 수는 사람이 단원대로 할 때와 같다. 웹 배우기 `learn/yau-solve.ts`(단계 지도 시연·첫 화면 연출)와 4×4 컴퓨터 중수
 * (`solveYauHuman`, docs/47 10-4)가 같이 쓴다. 뒤의 「3×3처럼」은 쓰는 쪽이 붙인다
 */

/** 같은 경우가 여럿이면 첫째(단원 시연과 같은 고르기) */
const FIRST: Pick = () => 0;
const WHITE = 0;
const YELLOW = 3;

/** 야우 앞 단계(단계 지도 `4x4-yau`의 차례와 같다) */
export type YauReduceStageId =
  | "centers-ud"
  | "cross3"
  | "centers-rest"
  | "last-cross"
  | "edges";

export interface YauReduceStage {
  id: YauReduceStageId;
  /** 이 단계에서 친 수(큐브 돌리기 포함, 빈 글이면 이미 맞아 있었다) */
  moves: string;
  /** 걸음마다 친 수(경우 하나: 쥐기 + 공식, 이어 붙이면 `moves`). 빈 걸음은 없다 */
  steps: string[];
}

const join = (...xs: string[]) => xs.filter(Boolean).join(" ").trim();

/** 큐브 돌리기 24가지(돌리기 적은 것 먼저) */
const HOLDS: readonly string[] = ["", "x", "x2", "x'", "z", "z'"].flatMap((a) =>
  ["", "y", "y'", "y2"].map((b) => join(a, b)),
);

const ORANGE = 4;
const R_FACE = 1;

/**
 * 옆 센터의 쥐기 고르기. `orange`(지금): 흰 면 아래, 흰 십자 셋 단계가 비워 둔 흰-주황 자리를 오른쪽으로. 흰-주황 엣지
 * 블럭이 우연히 제자리에 들어 있어 흰 십자 넷이 다 있어도 오른쪽(작업대)은 흰-주황 자리라, R이 빼내는 것은 넣지 않은
 * 흰-주황뿐이고 마지막 십자 엣지 단계가 다시 넣는다(docs/47 16-22). `shortest`(계획 표 4·5): 흰 면 아래·흰 십자 엣지
 * 셋(앞·왼쪽·뒤)이 되는 가장 짧은 쥐기. 넷이 다 있으면 넣은 흰-빨강 등이 오른쪽에 와 R이 빼냈다(대회 섞기 300개 중 하나)
 */
export type YauSideHold = "orange" | "shortest";

/** 옆 센터를 시작하는 쥐기 */
function sideHold(s: PuzzleState, rule: YauSideHold): string {
  const targets = (h: string) => {
    try {
      return yauSideTargets(playN(4, s, h));
    } catch {
      return null;
    }
  };
  const h = [...HOLDS]
    .sort((a, b) => a.split(" ").length - b.split(" ").length)
    .find((x) => {
      const fc = targets(x);
      return fc !== null && (rule === "shortest" || fc[R_FACE] === ORANGE);
    });
  if (h === undefined) throw new Error("흰 십자 셋이 맞지 않았다");
  return h;
}

/**
 * 엣지 여덟을 짝짓는 길. `taught`는 배우기 단원 규칙(축소법 처음 엣지, 한 줄씩 묶어 평균 약 86수), `short`는 십자를 지키는
 * 짧은 짝짓기(`yau-edges.ts`, 평균 약 27수, 고수·초고수 컴퓨터)
 */
export type YauEdges = "taught" | "short";

/**
 * 섞인 4×4를 야우 앞 다섯 단계로(엣지 짝까지). 끝난 상태와 단계들. `pick`은 같은 경우가 여럿일 때 고르는 차례.
 * 앞 네 단계는 늘 단원 규칙이고, 엣지 짝만 `edges`로 고른다. `hold`는 옆 센터 쥐기(계획 표 4·5의 컴퓨터만 `shortest`)
 */
export function yauReduce(
  start: PuzzleState,
  pick: Pick = FIRST,
  edges: YauEdges = "taught",
  hold: YauSideHold = "orange",
): { state: PuzzleState; stages: YauReduceStage[] } {
  const stages: YauReduceStage[] = [];
  let s = start;
  const push = (id: YauReduceStageId, list: string[]) => {
    const steps = list.map((x) => join(x)).filter(Boolean);
    const moves = join(...steps);
    stages.push({ id, moves, steps });
    s = playN(4, s, moves);
  };
  push(
    "centers-ud",
    runCenters(4, s, pick, [WHITE, YELLOW]).steps.map(stepMovesBig),
  );
  push("cross3", runYauCross(s, pick).steps.map(stepMovesYauCross));
  // 옆 센터는 흰 면 아래, 비운 십자 자리(흰-주황)를 오른쪽으로 쥔 큐브에서 시작한다(단원 쥐기)
  const side = sideHold(s, hold);
  const sideSteps = runYauSideCenters(playN(4, s, side), pick).steps.map(
    stepMovesYau,
  );
  push("centers-rest", [join(side, sideSteps[0] ?? ""), ...sideSteps.slice(1)]);
  push("last-cross", runYauLastCross(s, pick).steps.map(stepMovesYauLast));
  push(
    "edges",
    edges === "short"
      ? yauEdgesShort(s)
      : runEdges444(s).steps.map(stepMovesBig),
  );
  return { state: s, stages };
}

/** 컴퓨터 계획의 단계 이름(첫 화면 연출 `yau-hero.ts`와 같다) */
const STAGE_OF: Readonly<Record<YauReduceStageId, StageName>> = {
  "centers-ud": "yau-centers",
  cross3: "yau-cross3",
  "centers-rest": "centers-rest",
  "last-cross": "yau-last-cross",
  edges: "edges",
};

const tokens = (text: string) => text.split(/\s+/).filter(Boolean);

/**
 * 4×4 컴퓨터 야우(docs/47 10-4): 앞 다섯 단계는 `yauReduce`(배우기 단원 규칙, 고수·초고수는 엣지 짝만 짧은 길 `edges`), 그 뒤 「3×3처럼」은 그 단계의 3×3 사람
 * 해법 차례(`steps`, 패리티는 축소법 컴퓨터처럼 OLL·PLL 앞에서)를 돌린다. 걸음(경우 하나)마다 살피는 자리를 둔다
 * (단계 첫 걸음은 단계 앞 멈춤이 맡는다). 흰 십자는 야우가 이미 맞춰 두어 3×3 십자 단계는 쥐기뿐이다
 */
export function solveYauHuman(
  steps: readonly Step[],
  state: PuzzleState,
  until?: StageName,
  edges: YauEdges = "taught",
  hold: YauSideHold = "orange",
): HumanSolve {
  const { stages: parts } = yauReduce(state, FIRST, edges, hold);
  const moves: string[] = [];
  const stages: HumanSolve["stages"] = [];
  const looks: number[] = [];
  for (const part of parts) {
    const start = moves.length;
    part.steps.forEach((step, i) => {
      if (i > 0) looks.push(moves.length);
      moves.push(...tokens(step));
    });
    stages.push({ name: STAGE_OF[part.id], start, end: moves.length });
    if (until === STAGE_OF[part.id]) return { moves, stages, looks };
  }
  return finishAsThree(steps, 4, state, { moves, stages, looks }, 0, until);
}
