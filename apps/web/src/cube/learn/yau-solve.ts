// 4×4 야우 풀이 함수(docs/47 8-6 단계 지도, 16-16~16-21). 섞인 4×4를 야우 차례 그대로 배우기 단원의 경우별 정해진 길로
// 끝까지 맞춘다: 흰·노랑 센터(축소법 센터 규칙을 두 색만) → 흰 십자 셋 → 옆 센터 넷 → 마지막 십자 엣지 → 엣지 여덟
// (축소법 처음 엣지 규칙) → 3×3처럼(패리티 포함, 3×3 처음 맞추기 차례). 단계마다 그 단원이 가르치는 것과 같은 수다.
// 컴퓨터 해법(`@game/cube-ai`)처럼 탐색하지 않고 규칙만 따르므로 결정적이고, 수는 사람이 단원대로 할 때와 같다.
import type { PuzzleState } from "@game/puzzle-core";

import {
  type Pick,
  playN,
  runCenters,
  runEdges444,
  stepMovesBig,
} from "./big-path";
import { solveReduced } from "./big-solve";
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

/** 섞인 4×4를 야우 차례로 끝까지. `pick`은 같은 경우가 여럿일 때 고르는 차례(기본 첫째) */
export function solveYau(start: PuzzleState, pick: Pick = FIRST): YauSolution {
  const stages: YauStage[] = [];
  let s = start;
  const push = (id: YauStageId, moves: string) => {
    stages.push({ id, moves });
    s = playN(4, s, moves);
  };

  const centers = runCenters(4, s, pick, [WHITE, YELLOW]);
  push("centers-ud", join(...centers.steps.map(stepMovesBig)));
  push("cross3", join(...runYauCross(s, pick).steps.map(stepMovesYauCross)));
  // 옆 센터는 흰 면 아래, 비운 십자 자리(흰-주황)를 오른쪽으로 쥔 큐브에서 시작한다(단원 쥐기)
  const side = sideHold(s);
  const sideRun = runYauSideCenters(playN(4, s, side), pick);
  push("centers-rest", join(side, ...sideRun.steps.map(stepMovesYau)));
  push(
    "last-cross",
    join(...runYauLastCross(s, pick).steps.map(stepMovesYauLast)),
  );
  push("edges", join(...runEdges444(s).steps.map(stepMovesBig)));
  push("three", join(...solveReduced(4, s).stages.map((st) => st.moves)));

  return { state: s, stages, moves: join(...stages.map((st) => st.moves)) };
}
