// 공식 연습(docs/47 16-9)의 초보자 묶음. 3×3 처음 맞추기 단원(lessons-333.ts)과 같은 공식을 쓴다.
// 단원 글에만 있던 상수를 상황 묶음으로 엮었다. 단원 공식이 바뀌면 여기도 함께 바뀐다(같은 상수를 읽는다).
import {
  CORNER_CYCLE,
  CORNERS_NONE,
  CROSS_DOWN_SIDE,
  CROSS_DOWN_SIDE_TRY,
  CROSS_FLIPPED,
  CROSS_FLIPPED_TRY,
  CROSS_GUARD,
  CROSS_GUARD_TRY,
  CROSS_MIDDLE,
  CROSS_MIDDLE_R,
  CROSS_WRONG_TOP,
  CROSS_WRONG_TOP_TRY,
  DOT_TO_CROSS,
  EDGE_OPPOSITE,
  EDGE_SWAP,
  EO,
  FROM_RIGHT,
  RIGHT,
  TWIST_THREE,
  TWIST_TWO,
} from "../learn/lessons-333";
import type { DrillCase } from "./types";

const cross = (
  id: string,
  name: string,
  c: { setup: string; alg: string },
): DrillCase => ({
  id: `beginner-cross-${id}`,
  name,
  algs: [c.alg],
  setup: c.setup,
});

/** 흰 십자: 엣지 하나를 F·D·y로 올린다(흰 면 위, 기본 방향) */
export const BEGINNER_CROSS: DrillCase[] = [
  cross("middle", "가운데 줄, 옆색이 앞과 같음", CROSS_MIDDLE),
  cross("middle-front", "가운데 줄, 흰색이 앞", CROSS_MIDDLE_R),
  cross("down-side", "아래층, 흰색이 옆", CROSS_DOWN_SIDE),
  cross("down-front", "아래층, 흰색이 앞", CROSS_DOWN_SIDE_TRY),
  cross("guard", "가운데 줄, 옆색이 다른 면", CROSS_GUARD),
  cross("guard-right", "가운데 줄, 옆색이 다른 면(오른쪽)", CROSS_GUARD_TRY),
  cross("flipped", "윗층 제자리에서 뒤집힘", CROSS_FLIPPED),
  cross("flipped-right", "윗층 오른쪽에서 뒤집힘", CROSS_FLIPPED_TRY),
  cross("wrong-top", "윗층 엉뚱한 자리", CROSS_WRONG_TOP),
  cross("wrong-top-right", "윗층 엉뚱한 자리(오른쪽)", CROSS_WRONG_TOP_TRY),
];

/** 둘째 층: 앞-오른쪽 칸에 넣는 두 공식과, 뒤집혀 들어간 엣지 */
export const BEGINNER_SECOND: DrillCase[] = [
  { id: "beginner-second-front", name: "앞에서 넣기", algs: [RIGHT] },
  { id: "beginner-second-right", name: "오른쪽에서 넣기", algs: [FROM_RIGHT] },
  {
    id: "beginner-second-flipped",
    name: "칸에서 뒤집힌 엣지",
    algs: [`${RIGHT} U2 ${RIGHT}`],
  },
];

/** 노란 십자: 가로줄 한 번, ㄱ자 두 번, 점 세 번 */
export const BEGINNER_YELLOW_CROSS: DrillCase[] = [
  { id: "beginner-yc-line", name: "가로줄", algs: [EO] },
  { id: "beginner-yc-corner", name: "ㄱ자", algs: [`${EO} ${EO}`] },
  { id: "beginner-yc-dot", name: "점", algs: [DOT_TO_CROSS] },
];

/** 옆면 맞추기: 맞은 둘이 이웃(뒤·오른쪽)일 때와 마주 볼 때 */
export const BEGINNER_EDGES: DrillCase[] = [
  { id: "beginner-edges-next", name: "맞은 둘이 이웃", algs: [EDGE_SWAP] },
  {
    id: "beginner-edges-opposite",
    name: "맞은 둘이 마주 봄",
    algs: [EDGE_OPPOSITE],
  },
];

/** 코너 자리: 제자리 코너가 앞-오른쪽 위(한 번·두 번), 제자리 코너가 없음 */
export const BEGINNER_CORNERS: DrillCase[] = [
  { id: "beginner-corners-once", name: "세 코너 돌리기", algs: [CORNER_CYCLE] },
  {
    id: "beginner-corners-twice",
    name: "세 코너 반대로 돌리기",
    algs: [`${CORNER_CYCLE} ${CORNER_CYCLE}`],
  },
  {
    id: "beginner-corners-none",
    name: "제자리 코너 없음",
    algs: [CORNERS_NONE],
  },
];

/** 코너 방향: R' D' R D를 코너마다 되풀이(아래 두 층은 가운데에 흐트러졌다 돌아온다) */
export const BEGINNER_TWIST: DrillCase[] = [
  { id: "beginner-twist-two", name: "돌아간 코너 둘", algs: [TWIST_TWO] },
  { id: "beginner-twist-three", name: "돌아간 코너 셋", algs: [TWIST_THREE] },
];
