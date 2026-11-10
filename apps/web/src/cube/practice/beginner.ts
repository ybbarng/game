// 공식 연습(docs/47 16-9)의 초보자 묶음. 3×3 처음 맞추기 단원(lessons-333.ts)과 같은 경우 나눔·공식을 쓴다.
// 2026-11-10: 상황마다 경우별 정해진 길(learn/beginner-path.ts)이 그 시작 모양에서 내는 수 그대로다
// (「노란색 오른쪽 → R' D' R D 두 번, 노란색 앞 → 거꾸로 D' R' D R 두 번」처럼). 시작 모양(공식의 거꾸로)에
// 공식을 치면 그 단계가 끝나고, 규칙으로 풀어도 같은 수가 나온다(stages.test.ts).
import {
  CORNER_CYCLE,
  CORNER_CYCLE_BACK,
  EDGE_SWAP,
  FROM_RIGHT,
  RIGHT,
  reps,
  TWIST,
  TWIST_BACK,
  YELLOW_CROSS,
  YELLOW_CROSS_BACK,
} from "../learn/beginner-path";
import {
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
  TWIST_THREE,
  TWIST_TWO_BACK,
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

/** 흰 십자: 엣지 하나를 F·D·y로 올린다(흰 면 위, 기본 방향). 단원의 다섯 경우 */
export const BEGINNER_CROSS: DrillCase[] = [
  cross("middle", "가운데 층, 바로 올리기", CROSS_MIDDLE),
  cross("middle-front", "가운데 층, 돌려 쥐고 바로 올리기", CROSS_MIDDLE_R),
  cross("down-side", "아래 층, 흰색이 옆", CROSS_DOWN_SIDE),
  cross("down-front", "아래 층, 흰색이 앞", CROSS_DOWN_SIDE_TRY),
  cross("guard", "가운데 층, 내렸다 올리기", CROSS_GUARD),
  cross("guard-right", "가운데 층, 돌려 쥐고 내렸다 올리기", CROSS_GUARD_TRY),
  cross("flipped", "위 층, 흰색이 옆", CROSS_FLIPPED),
  cross("flipped-right", "위 층, 흰색이 옆(위-오른쪽에서)", CROSS_FLIPPED_TRY),
  cross("wrong-top", "위 층, 자리가 바뀐 엣지 둘", CROSS_WRONG_TOP),
  cross(
    "wrong-top-right",
    "위 층, 자리가 바뀐 엣지 둘(오른쪽·왼쪽)",
    CROSS_WRONG_TOP_TRY,
  ),
];

/** 둘째 층: 위 색이 오른쪽 센터 색이면 앞에서, 왼쪽 센터 색이면 오른쪽에서. 잘못 든 엣지는 앞에서 넣기로 뺀다 */
export const BEGINNER_SECOND: DrillCase[] = [
  {
    id: "beginner-second-front",
    name: "위 색이 오른쪽 센터 색: 앞에서 넣기",
    algs: [RIGHT],
  },
  {
    id: "beginner-second-right",
    name: "위 색이 왼쪽 센터 색: 오른쪽에서 넣기",
    algs: [FROM_RIGHT],
  },
  {
    id: "beginner-second-flipped",
    name: "자리에서 뒤집힌 엣지",
    algs: [`${RIGHT} U2 ${RIGHT}`],
  },
];

/** 노란 십자: 일자 공식 한 번, ㄱ자 거꾸로 한 번, 점 공식 한 번 뒤 ㄱ자 */
export const BEGINNER_YELLOW_CROSS: DrillCase[] = [
  {
    id: "beginner-yc-line",
    name: "일자: 가로로 쥐고 공식 한 번",
    algs: [YELLOW_CROSS],
  },
  {
    id: "beginner-yc-corner",
    name: "ㄱ자: 뒤·왼쪽에 두고 거꾸로 한 번",
    algs: [YELLOW_CROSS_BACK],
  },
  {
    id: "beginner-yc-dot",
    name: "점: 공식 한 번 → U2 → 거꾸로 한 번",
    algs: [DOT_TO_CROSS],
  },
];

/** 옆면 맞추기: 맞은 둘이 이웃(뒤·오른쪽에 쥐고 한 번)일 때와 마주 볼 때(앞·뒤에 두고 한 번 → U' y' → 한 번) */
export const BEGINNER_EDGES: DrillCase[] = [
  {
    id: "beginner-edges-next",
    name: "맞은 둘이 이웃: 뒤·오른쪽에 쥐고 한 번",
    algs: [EDGE_SWAP],
  },
  {
    id: "beginner-edges-opposite",
    name: "맞은 둘이 마주 봄: 앞·뒤에 두고 한 번, U' y' 뒤 한 번",
    algs: [`${EDGE_SWAP} U' y' ${EDGE_SWAP}`],
  },
];

/** 코너 자리: 앞-왼쪽 위 코너의 제자리가 대각선 건너편이면 공식, 바로 뒤면 거꾸로. 제자리가 없으면 그대로 한 번 */
export const BEGINNER_CORNERS: DrillCase[] = [
  {
    id: "beginner-corners-once",
    name: "앞-왼쪽 위 코너가 대각선 건너편으로: 공식 한 번",
    algs: [CORNER_CYCLE],
  },
  {
    id: "beginner-corners-twice",
    name: "앞-왼쪽 위 코너가 바로 뒤로: 거꾸로 한 번",
    algs: [CORNER_CYCLE_BACK],
  },
  {
    id: "beginner-corners-none",
    name: "제자리 코너 없음: 그대로 한 번 → 쥐고 한 번",
    algs: [CORNERS_NONE],
  },
];

/** 코너 방향: 노란색 오른쪽 → R' D' R D 두 번, 노란색 앞 → 거꾸로 D' R' D R 두 번. 코너 사이에는 U만 */
export const BEGINNER_TWIST: DrillCase[] = [
  {
    id: "beginner-twist-two",
    name: "노란색 오른쪽 → 다음 코너 노란색 앞",
    algs: [TWIST_TWO_BACK],
  },
  {
    id: "beginner-twist-front-right",
    name: "노란색 앞 → 다음 코너 노란색 오른쪽",
    algs: [`${reps(TWIST_BACK, 2)} U ${reps(TWIST, 2)} U'`],
  },
  {
    id: "beginner-twist-three",
    name: "돌아간 코너 셋 모두 노란색 오른쪽",
    algs: [TWIST_THREE],
  },
  {
    id: "beginner-twist-three-front",
    name: "돌아간 코너 셋 모두 노란색 앞",
    algs: [
      `${reps(TWIST_BACK, 2)} U ${reps(TWIST_BACK, 2)} U ${reps(TWIST_BACK, 2)} U2`,
    ],
  },
];
