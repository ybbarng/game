// 3×3 처음 맞추기 단계마다 나올 수 있는 모든 경우(docs/47 16-32, docs/standing-rules.md 1절 「각 단계는 모든 경우를
// 가르친다」). 단계 첫머리 쪽이 이 그림을 늘어놓고, 경우마다 「이 모양이면 → 이렇게」를 한 줄로 닫는다. 그림은 흰 십자·
// 첫 층·둘째 층이 비스듬한 큐브(위·앞·오른쪽), 마지막 층이 윗면 평면도다(전개도 아님). 경우마다 그 상황을 만드는 수와
// 경우별 정해진 길(beginner-path.ts)의 경우 이름을 두어, 시험(beginner-cases.test.ts)이 그림이 정말 그 경우인지 본다.
import { solvedCube } from "@game/cube-engine";

import { type PathStageId, play, TWIST } from "./beginner-path";
import {
  CORNER_CYCLE,
  CORNER_CYCLE_BACK,
  CORNERS_NONE,
  CROSS_DOWN_MOVE,
  CROSS_FLIP,
  CROSS_FLIPPED,
  CROSS_MIDDLE,
  CROSS_TOP_WRONG,
  DOT_TO_CROSS,
  EDGE_OPPOSITE,
  EDGE_SWAP,
  EO,
  FLIPPED_SLOT_EDGE,
  FROM_RIGHT,
  RIGHT,
  reps,
  STUCK_CORNER_SETUP,
  STUCK_EDGE_ONLY,
  TWIST_BACK,
  TWIST_TWO_BACK,
  TWIST_TWO_FRONT,
  YELLOW_CROSS_BACK,
} from "./lessons-333";
import {
  CORNER_DOWN_SOLVE,
  CORNER_FRONT_SOLVE,
  CORNER_SLOT_SOLVE,
  CROSS_MID_SOLVE,
  CROSS_TOP_SOLVE,
  EO_DOT,
  EO_LINE,
  EP_ADJACENT,
  EP_OPPOSITE,
  PLACE_NONE,
  SECOND_STUCK,
  TW_A,
  TW_B,
  TW_BAR,
  TW_C,
  TW_CROSS,
  TW_D,
} from "./lessons-twist-first";
import { setupFor } from "./notation";
import {
  CORNER_A,
  CORNER_B,
  CORNER_IN,
  CORNER_TURN,
  CROSS_FRONT,
  EDGE_FLIP,
  gripPieces,
  SECOND_A,
  SECOND_B,
  type TwistFirstStageId,
} from "./twist-first-path";
import type { AlgSet, LessonStep, MaskName, SheetName } from "./types";

export interface BeginnerCase {
  /** 경우별 정해진 길의 경우 이름(`PathCase.id`). 끝난 모양은 "done" */
  id: string;
  /** 맞춘 큐브(흰 면 위)에서 이 상황을 만드는 수 */
  alg: string;
  /** 모양 */
  caption: string;
  /** 이 모양이면 무엇을 하는지 */
  action: string;
  /** 헤드라이트(위 층 코너 블럭 둘의 스티커가 같은 색으로 나란한 옆면)를 강조할 쪽(윗면 평면도, 코너 위치) */
  headlights?: "L" | "R";
}

/** 그림이 보이는 단계: 3×3 처음 맞추기(beginner-path.ts) 또는 코너 방향 먼저 마지막 층(twist-first-path.ts) */
export type CaseSheetStage =
  | { path: "beginner"; id: PathStageId }
  | { path: "twist-first"; id: TwistFirstStageId };

export interface BeginnerCaseSheet {
  stage: CaseSheetStage;
  /** 그림 꼴: 마지막 층 묶음이면 윗면 평면도, 아니면 비스듬한 큐브(`AlgPicture`) */
  set: AlgSet;
  mask?: MaskName;
  title: string;
  /** 그림마다 앞 표시(▲ 앞)를 단다(쥘 모습대로 그린 그림) */
  front?: boolean;
  cases: BeginnerCase[];
}

const flip = (solution: string) => setupFor(solution, "z2");

// 코너 돌리기 한 번마다 한 칸씩 옮겨 가는 차례(다 맞음까지 남은 횟수 = 칠 횟수, 거꾸로는 하나 거슬러 간다)
const CORNERS: BeginnerCaseSheet = {
  stage: { path: "beginner", id: "corners" },
  set: "f2l",
  mask: "first-layer",
  title: "흰 코너 블럭의 여섯 경우",
  cases: [
    {
      id: "bottom-front",
      alg: setupFor(TWIST_BACK),
      caption: "자리 밑, 흰색이 앞",
      action: "다섯 번이 남아서 거꾸로 한 번 쳐요.",
    },
    {
      id: "slot-front",
      alg: setupFor(reps(TWIST_BACK, 2)),
      caption: "제자리, 흰색이 앞",
      action: "네 번이 남아서 거꾸로 두 번 쳐요.",
    },
    {
      id: "bottom-down",
      alg: setupFor(reps(TWIST, 3)),
      caption: "자리 밑, 흰색이 아래",
      action: "세 번 쳐요.",
    },
    {
      id: "slot-right",
      alg: setupFor(reps(TWIST, 2)),
      caption: "제자리, 흰색이 오른쪽",
      action: "두 번 쳐요.",
    },
    {
      id: "bottom-right",
      alg: setupFor(TWIST),
      caption: "자리 밑, 흰색이 오른쪽",
      action: "한 번 쳐요.",
    },
    {
      id: "stuck",
      alg: STUCK_CORNER_SETUP,
      caption: "다른 자리에 들어감",
      action: "한 번 쳐서 아래 층으로 빼요.",
    },
  ],
};

// 흰 엣지 블럭이 있을 수 있는 모양(2026-11-26 사용자 차례, docs/47 16-34). 아래 층은 바로 올리고(기본 모양 둘),
// 가운데 층·위 층은 아래 층으로 내린다. 위 층은 흰색이 위든 옆이든 같은 수라 그림 둘에 경우 이름 하나다.
// 제자리에 바르게 든 것(그대로 둠)까지 여섯이면 흰 엣지 블럭 하나가 있을 수 있는 모든 모양이다
const CROSS: BeginnerCaseSheet = {
  stage: { path: "beginner", id: "cross" },
  set: "f2l",
  mask: "cross",
  title: "흰 엣지 블럭의 여섯 모양",
  cases: [
    {
      id: "done",
      alg: "",
      caption: "위 층, 흰색이 위이고 제자리",
      action: "그대로 둬요.",
    },
    {
      id: "down",
      alg: CROSS_DOWN_MOVE.setup,
      caption: "아래 층, 흰색이 아래",
      action: "짝 색 센터를 앞으로 쥐고 아래-앞으로 데려와 F2로 올려요.",
    },
    {
      id: "down-side",
      alg: CROSS_FLIP.setup,
      caption: "아래 층, 흰색이 옆",
      action:
        "짝 색 센터를 앞으로 쥐고 아래-오른쪽으로 데려와 R F' R'로 올려요.",
    },
    {
      id: "middle",
      alg: CROSS_MIDDLE.setup,
      caption: "가운데 층",
      action: "앞-오른쪽에 오게 쥐고 R' D' R로 아래 층에 내려요.",
    },
    {
      id: "top",
      alg: CROSS_TOP_WRONG.setup,
      caption: "위 층, 흰색이 위인데 다른 자리",
      action: "위-앞에 오게 쥐고 F2로 아래 층에 내려요.",
    },
    {
      id: "top",
      alg: CROSS_FLIPPED.setup,
      caption: "위 층, 흰색이 옆",
      action: "위-앞에 오게 쥐고 F2로 아래 층에 내려요.",
    },
  ],
};

export const BEGINNER_CASE_SHEETS: Record<
  Extract<SheetName, `beginner-${string}`>,
  BeginnerCaseSheet
> = {
  // 첫머리에서 훑을 때는 공식을 배우기 전이라 횟수 없이 모양만
  "beginner-corners-look": {
    ...CORNERS,
    cases: CORNERS.cases.map((c) => ({ ...c, action: "" })),
  },
  "beginner-corners": CORNERS,
  // 첫머리에서 훑을 때는 올리는 법을 배우기 전이라 모양만
  "beginner-cross-look": {
    ...CROSS,
    cases: CROSS.cases.map((c) => ({ ...c, action: "" })),
  },
  "beginner-cross": CROSS,
  "beginner-second": {
    stage: { path: "beginner", id: "second" },
    set: "f2l",
    mask: "f2l",
    title: "넣을 엣지 블럭의 네 경우(위 층은 옆 색 센터를 앞에 두고 봐요)",
    cases: [
      {
        id: "front",
        alg: flip(RIGHT),
        caption: "앞에서 넣는 모양: 위 층, 위 색이 오른쪽 센터 색",
        action: "제자리가 앞-오른쪽이에요. 앞면 쪽에서 넣어요.",
      },
      {
        id: "left",
        alg: `z2 y' ${setupFor(FROM_RIGHT)} y`,
        caption: "오른쪽에서 넣는 모양: 위 층, 위 색이 왼쪽 센터 색",
        action: "제자리가 앞-왼쪽이에요. 돌려 쥐고 오른쪽 면 쪽에서 넣어요.",
      },
      {
        id: "stuck",
        alg: flip(FLIPPED_SLOT_EDGE),
        caption: "가운데 층, 제자리에서 뒤집힘",
        action: "한 번 빼서 위 층으로 올려요.",
      },
      {
        id: "stuck",
        alg: flip(STUCK_EDGE_ONLY),
        caption: "가운데 층, 다른 자리에 들어감",
        action: "한 번 빼서 위 층으로 올려요.",
      },
    ],
  },
  "beginner-yellow-cross": {
    stage: { path: "beginner", id: "yellow-cross" },
    set: "2look-oll",
    mask: "ll-cross",
    title: "윗면 모양 넷",
    cases: [
      {
        id: "dot",
        alg: flip(DOT_TO_CROSS),
        caption: "점",
        action: "공식을 한 번 쳐서 ㄱ자로 만들어요.",
      },
      {
        id: "ell",
        alg: flip(YELLOW_CROSS_BACK),
        caption: "ㄱ자",
        action: "뒤와 왼쪽에 두고 거꾸로 한 번 쳐요.",
      },
      {
        id: "line",
        alg: flip(EO),
        caption: "일자",
        action: "가로로 두고 한 번 쳐요.",
      },
      { id: "done", alg: "z2", caption: "십자", action: "끝이에요." },
    ],
  },
  "beginner-edges": {
    stage: { path: "beginner", id: "edges" },
    set: "2look-pll",
    mask: "ll-edges",
    title: "윗면을 돌려 찾은 세 경우",
    cases: [
      {
        id: "align",
        alg: "z2 U",
        caption: "넷 다 제자리",
        action: "끝이에요.",
      },
      {
        id: "next",
        alg: flip(EDGE_SWAP),
        caption: "제자리인 둘이 이웃",
        action: "뒤와 오른쪽에 두고 한 번 쳐요.",
      },
      {
        id: "opposite",
        alg: `${flip(EDGE_OPPOSITE)} U`,
        caption: "제자리인 둘이 마주 봄",
        action:
          "앞과 뒤에 두고 한 번 친 뒤 U'를 치면 앞과 오른쪽이 제자리인 이웃한 둘이 돼요.",
      },
    ],
  },
  "beginner-corner-place": {
    stage: { path: "beginner", id: "corner-place" },
    set: "2look-pll",
    title: "제자리 코너 블럭으로 가르는 네 경우",
    cases: [
      { id: "done", alg: "z2", caption: "넷 다 제자리", action: "끝이에요." },
      {
        id: "diagonal",
        alg: flip(CORNER_CYCLE),
        caption: "하나, 앞-왼쪽 위 블럭의 제자리가 대각선 건너편(뒤-오른쪽 위)",
        action: "공식을 한 번 쳐요.",
      },
      {
        id: "behind",
        alg: flip(CORNER_CYCLE_BACK),
        caption: "하나, 앞-왼쪽 위 블럭의 제자리가 바로 뒤(뒤-왼쪽 위)",
        action: "거꾸로 한 번 쳐요.",
      },
      {
        id: "none",
        alg: flip(CORNERS_NONE),
        caption: "하나도 없음",
        action: "공식을 한 번 치면 하나가 생겨요.",
      },
    ],
  },
  "beginner-corner-twist": {
    stage: { path: "beginner", id: "corner-twist" },
    set: "2look-oll",
    title: "앞-오른쪽 위 코너 블럭으로 보는 네 경우",
    cases: [
      {
        id: "right",
        alg: flip(TWIST_TWO_BACK),
        caption: "노란색이 오른쪽",
        action: "R' D' R D를 두 번 쳐요.",
      },
      {
        id: "front",
        alg: flip(TWIST_TWO_FRONT),
        caption: "노란색이 앞",
        action: "거꾸로 D' R' D R을 두 번 쳐요.",
      },
      {
        id: "right",
        alg: `${flip(TWIST_TWO_BACK)} U2`,
        caption: "노란색이 위인데 다른 코너가 돌아가 있음",
        action: "윗면을 돌려 돌아간 코너 블럭을 앞-오른쪽 위로 가져와요.",
      },
      {
        id: "align",
        alg: "z2 U",
        caption: "노란색이 모두 위",
        action:
          "위 층 엣지 블럭이 옆 색 센터 위에 오게 윗면을 돌리면 끝이에요. 많아야 세 번이에요.",
      },
    ],
  },
  // 코너 방향 먼저(신광사 설명서 1~7단계, lessons-twist-first.ts, docs/47 16-33). 1·2단계는 흰 면 위
  "beginner-tf-cross": {
    stage: { path: "twist-first", id: "cross" },
    set: "f2l",
    mask: "cross",
    title:
      "흰 엣지 블럭의 네 경우(아래 층은 짝 색 센터 바로 아래로 데려와 봐요)",
    cases: [
      {
        id: "down",
        alg: setupFor("F2"),
        caption: "아래-앞, 흰색이 아래",
        action: "F2로 올려요.",
      },
      {
        id: "front",
        alg: setupFor(CROSS_FRONT),
        caption: "아래-앞, 흰색이 앞",
        action: "옆에서 올리기 D R F' R'를 쳐요.",
      },
      {
        id: "middle",
        alg: setupFor(CROSS_MID_SOLVE),
        caption: "가운데 층",
        action: "앞-오른쪽에 두고 빼기 R' D' R로 아래 층에 내려요.",
      },
      {
        id: "top",
        alg: setupFor(CROSS_TOP_SOLVE),
        caption: "위 층에 잘못 들어감",
        action: "위-오른쪽에 두고 빼기 R2 D R2로 아래 층에 내려요.",
      },
    ],
  },
  "beginner-tf-corners": {
    stage: { path: "twist-first", id: "corners" },
    set: "f2l",
    mask: "first-layer",
    title:
      "흰 코너 블럭의 네 경우(아래 층은 넣을 자리 바로 밑으로 데려와 봐요)",
    cases: [
      {
        id: "right",
        alg: setupFor(CORNER_IN),
        caption: "자리 밑, 흰색이 오른쪽",
        action: "코너 블럭 넣기 F' R F R'를 쳐요.",
      },
      {
        id: "down",
        alg: setupFor(CORNER_DOWN_SOLVE),
        caption: "자리 밑, 흰색이 아래",
        action: "다시 놓기 R' D2 R을 치고 D로 자리 밑에 데려와요.",
      },
      {
        id: "front",
        alg: setupFor(CORNER_FRONT_SOLVE),
        caption: "자리 밑, 흰색이 앞",
        action: "D2로 비키고 빼기 R' D' R을 쳐요.",
      },
      {
        id: "slot",
        alg: setupFor(CORNER_SLOT_SOLVE),
        caption: "위 층에 잘못 들어감",
        action: "앞-오른쪽 위에 두고 빼기 R' D' R로 아래 층에 내려요.",
      },
    ],
  },
  "beginner-tf-second": {
    stage: { path: "twist-first", id: "second" },
    set: "f2l",
    mask: "f2l",
    title: "넣을 엣지 블럭의 세 경우(위 층은 옆 색 센터를 앞에 두고 봐요)",
    cases: [
      {
        id: "right",
        alg: flip(SECOND_A),
        caption: "위 색이 오른쪽 센터 색",
        action: "제자리가 앞-오른쪽이에요. 오른쪽 넣기를 쳐요.",
      },
      {
        id: "left",
        alg: flip(SECOND_B),
        caption: "위 색이 왼쪽 센터 색",
        action: "제자리가 앞-왼쪽이에요. 왼쪽 넣기를 쳐요.",
      },
      {
        id: "stuck",
        alg: flip(SECOND_STUCK),
        caption: "가운데 층에 잘못 들어가 있음",
        action:
          "그 자리를 앞-오른쪽으로 돌려 쥐고 오른쪽 넣기를 쳐서 위 층으로 빼요.",
      },
    ],
  },
  "beginner-tf-eo": {
    stage: { path: "twist-first", id: "eo" },
    set: "2look-oll",
    mask: "ll-cross",
    title: "윗면 모양 넷",
    cases: [
      {
        id: "base",
        alg: flip(EDGE_FLIP),
        caption: "기본형: ㄱ자",
        action: "노란 스티커 둘을 뒤와 왼쪽에 두고 한 번 치면 십자예요.",
      },
      {
        id: "line",
        alg: flip(EO_LINE),
        caption: "일자",
        action: "일자를 앞뒤로 세워 두고 한 번 치면 기본형이에요.",
      },
      {
        id: "dot",
        alg: flip(EO_DOT),
        caption: "점",
        action: "그대로 한 번 치면 일자예요.",
      },
      { id: "done", alg: "z2", caption: "십자", action: "끝이에요." },
    ],
  },
  "beginner-tf-ep": {
    stage: { path: "twist-first", id: "ep" },
    set: "2look-pll",
    mask: "ll-edges",
    title: "윗면을 반시계 방향으로 돌려 찾은 세 경우",
    cases: [
      {
        id: "align",
        alg: flip("U"),
        caption: "넷 다 제자리",
        action: "윗면만 돌리면 끝이에요.",
      },
      {
        id: "adjacent",
        alg: flip(EP_ADJACENT),
        caption: "제자리인 둘이 이웃",
        action:
          "윗면을 반시계 방향으로 한 칸 더 돌려 하나만 맞게 하고, 그 하나를 뒤에 두고 한 번 쳐요.",
      },
      {
        id: "opposite",
        alg: flip(EP_OPPOSITE),
        caption: "제자리인 둘이 마주 봄",
        action: "그대로 한 번 치면 이웃한 둘을 찾을 수 있어요.",
      },
    ],
  },
  "beginner-tf-twist": {
    stage: { path: "twist-first", id: "twist" },
    set: "2look-oll",
    mask: "oll",
    title: "위 엣지가 맞은 윗면 모양 여덟(쥘 모습대로 그림)",
    front: true,
    cases: [
      {
        id: "base",
        alg: flip(CORNER_TURN),
        caption: "기본형: 둘이 대각선",
        action: "그림처럼 쥐고 한 번 치면 다 맞아요.",
      },
      {
        id: "a",
        alg: flip(TW_A),
        caption: "둘, 옆을 보는 둘이 마주 봄",
        action: "위를 보는 둘을 왼쪽에 두고 한 번 치면 기본형이에요.",
      },
      {
        id: "b",
        alg: flip(TW_B),
        caption: "둘, 옆을 보는 둘이 한 면",
        action: "위를 보는 둘을 오른쪽에 두고 한 번 치면 기본형이에요.",
      },
      {
        id: "c",
        alg: flip(TW_C),
        caption: "하나, 앞-왼쪽 노란색이 앞",
        action: "위를 보는 블럭을 뒤-왼쪽 위에 두고 한 번 치면 기본형이에요.",
      },
      {
        id: "d",
        alg: flip(TW_D),
        caption: "하나, 앞-왼쪽 노란색이 왼쪽",
        action: "위를 보는 블럭을 앞-오른쪽 위에 두고 한 번 치면 기본형이에요.",
      },
      {
        id: "cross",
        alg: flip(TW_CROSS),
        caption: "없음, 마주 보는 두 옆면에 둘씩",
        action: "둘씩을 앞과 뒤에 두고 한 번 쳐요.",
      },
      {
        id: "bar",
        alg: flip(TW_BAR),
        caption: "없음, 노란색 둘인 옆면 하나",
        action: "그 옆면을 왼쪽에 두고 한 번 쳐요.",
      },
      { id: "done", alg: "z2", caption: "넷 다 위", action: "끝이에요." },
    ],
  },
  "beginner-tf-place": {
    stage: { path: "twist-first", id: "place" },
    set: "2look-pll",
    title: "제자리 코너 블럭과 헤드라이트로 가르는 경우(쥘 모습대로 그림)",
    front: true,
    cases: [
      { id: "done", alg: "z2", caption: "넷 다 제자리", action: "끝이에요." },
      {
        id: "a",
        alg: flip(CORNER_A),
        caption: "하나, 헤드라이트가 왼쪽 면",
        action: "제자리 블럭은 앞-오른쪽 위예요. 공식 A를 한 번 쳐요.",
        headlights: "L",
      },
      {
        id: "b",
        alg: flip(CORNER_B),
        caption: "하나, 헤드라이트가 오른쪽 면",
        action: "제자리 블럭은 앞-왼쪽 위예요. 공식 B를 한 번 쳐요.",
        headlights: "R",
      },
      {
        id: "none",
        alg: flip(PLACE_NONE),
        caption: "없음, 코너 블럭 둘씩이 서로 바뀜",
        action: "그대로 공식 A를 한 번 치면 제자리가 하나 생겨요.",
      },
    ],
  },
};

export interface TwistFlowNode {
  /** 코너 방향 경우 이름(다 맞음은 "done") */
  id: string;
  /** 흰 면 아래로 쥔 맞춘 큐브에서 이 모양을 그 경우의 쥐기대로 만드는 수 */
  alg: string;
  /** 짧은 이름 */
  title: string;
  /** 정한 쥐기로 공식을 한 번 치면 가는 모양(다 맞음은 없음) */
  to?: string;
  /** 관계도에서의 줄(0 위)과 칸(0~3, 넷으로 나눈 폭). 줄 하나에 칸 하나만 쓰면 가운데 */
  row: number;
  col?: number;
}

/**
 * 코너 방향 관계도(2026-11-26 사용자 「각 모양에서 설명서처럼 잡고 공식을 쓰면 어떤 모양이 되는지 서로간의 관계도」).
 * 모양마다 그림처럼 쥐고 공식을 한 번 치면 가는 모양으로 화살표를 잇는다. 위에서 아래로 「하나도 없음 → 둘·하나 →
 * 기본형 → 다 맞음」. 그림은 그 경우의 쥐기대로 놓은 모습이다(아래가 앞). 시험이 엔진으로 본다
 */
export const TWIST_FLOW: TwistFlowNode[] = [
  {
    id: "bar",
    alg: flip(TW_BAR),
    title: "없음, 둘인 면 하나",
    to: "b",
    row: 0,
    col: 1,
  },
  {
    id: "cross",
    alg: flip(TW_CROSS),
    title: "없음, 둘씩 마주 봄",
    to: "d",
    row: 0,
    col: 3,
  },
  {
    id: "a",
    alg: flip(TW_A),
    title: "둘, 옆이 마주 봄",
    to: "base",
    row: 1,
    col: 0,
  },
  {
    id: "b",
    alg: flip(TW_B),
    title: "둘, 옆이 한 면",
    to: "base",
    row: 1,
    col: 1,
  },
  {
    id: "c",
    alg: flip(TW_C),
    title: "하나, 앞-왼쪽이 앞",
    to: "base",
    row: 1,
    col: 2,
  },
  {
    id: "d",
    alg: flip(TW_D),
    title: "하나, 앞-왼쪽이 왼쪽",
    to: "base",
    row: 1,
    col: 3,
  },
  { id: "base", alg: flip(CORNER_TURN), title: "기본형", to: "done", row: 2 },
  { id: "done", alg: "z2", title: "다 맞음", row: 3 },
];

/** 관계도의 글(용어 순서 시험이 단계 글과 함께 읽는다) */
export const twistFlowText = () => TWIST_FLOW.map((n) => n.title).join("\n");

/** 관계도 시연 쪽이 처음 보이는 마디(쪽 자료의 시작 상황과 같다, 시험이 본다) */
export const FLOW_DEMO_START = "bar";

/**
 * 관계도 시연 쪽에서 마디를 고르면, 그 마디 모양에서 코너 방향 공식을 한 번 치는 시연으로 바꾼다(2026-11-27 사용자
 * 「공식 한 번 = 화살표 하나」). 끝 모습은 화살표가 가리키는 마디다. 다 맞음 마디나 관계도가 아닌 쪽은 그대로
 */
export function withFlowPick(
  step: LessonStep,
  pick: string | null,
): LessonStep {
  if (!pick || step.kind !== "demo" || step.sheet !== "tf-flow") return step;
  const node = TWIST_FLOW.find((n) => n.id === pick);
  if (!node?.to) return step;
  // 고른 모양의 쥐는 기준 코너에 노란 고리(learn/focus.ts)
  const focus = gripPieces("twist", play(solvedCube(3), node.alg));
  return { ...step, setup: { alg: node.alg }, alg: CORNER_TURN, focus };
}

export const isBeginnerSheet = (
  name: SheetName,
): name is keyof typeof BEGINNER_CASE_SHEETS => name in BEGINNER_CASE_SHEETS;

/** 표의 글(용어 순서 시험이 단계 글과 함께 읽는다) */
export function beginnerSheetText(name: keyof typeof BEGINNER_CASE_SHEETS) {
  const s = BEGINNER_CASE_SHEETS[name];
  return [s.title, ...s.cases.flatMap((c) => [c.caption, c.action])].join("\n");
}
