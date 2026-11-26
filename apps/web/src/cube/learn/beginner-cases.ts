// 3×3 처음 맞추기 단계마다 나올 수 있는 모든 경우(docs/47 16-32, docs/standing-rules.md 1절 「각 단계는 모든 경우를
// 가르친다」). 단계 첫머리 쪽이 이 그림을 늘어놓고, 경우마다 「이 모양이면 → 이렇게」를 한 줄로 닫는다. 그림은 흰 십자·
// 첫 층·둘째 층이 비스듬한 큐브(위·앞·오른쪽), 마지막 층이 윗면 평면도다(전개도 아님). 경우마다 그 상황을 만드는 수와
// 경우별 정해진 길(beginner-path.ts)의 경우 이름을 두어, 시험(beginner-cases.test.ts)이 그림이 정말 그 경우인지 본다.
import { type PathStageId, TWIST } from "./beginner-path";
import {
  CORNER_CYCLE,
  CORNER_CYCLE_BACK,
  CORNERS_NONE,
  CROSS_DOWN_SIDE_TRY,
  CROSS_FLIPPED,
  CROSS_GUARD,
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
  EDGES_NEIGHBOR,
  EDGES_OPPOSITE,
  FACE_NONE,
  FACE_SIDES,
  FACE_TWO_APART,
  FACE_TWO_DIAGONAL,
  FACE_TWO_SAME,
  CORNERS_NONE as TF_CORNERS_NONE,
} from "./lessons-twist-first";
import { setupFor } from "./notation";
import {
  CORNER_SWAP,
  EDGE_CYCLE,
  EDGE_CYCLE_LEFT,
  type TwistFirstStageId,
  YELLOW_FACE,
  YELLOW_FACE_BACK,
} from "./twist-first-path";
import type { AlgSet, MaskName, SheetName } from "./types";

export interface BeginnerCase {
  /** 경우별 정해진 길의 경우 이름(`PathCase.id`). 끝난 모양은 "done" */
  id: string;
  /** 맞춘 큐브(흰 면 위)에서 이 상황을 만드는 수 */
  alg: string;
  /** 모양 */
  caption: string;
  /** 이 모양이면 무엇을 하는지 */
  action: string;
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
  "beginner-cross": {
    stage: { path: "beginner", id: "cross" },
    set: "f2l",
    mask: "cross",
    title: "흰 엣지 블럭의 여섯 경우",
    cases: [
      {
        id: "down",
        alg: "F2",
        caption: "첫째 기본 모양: 아래 층, 흰색이 아래",
        action: "짝 색 센터 바로 밑으로 옮겨 앞면 반 바퀴로 올려요.",
      },
      {
        id: "middle",
        alg: "F",
        caption:
          "둘째 기본 모양: 가운데 층, 짝 색 스티커가 붙은 면의 센터도 짝 색",
        action:
          "짝 색 스티커가 보는 면을 앞으로 돌려 쥐고 앞면 한 번으로 올려요.",
      },
      {
        id: "middle-other",
        alg: CROSS_GUARD.setup,
        caption: "가운데 층, 짝 색 스티커가 붙은 면의 센터가 다른 색",
        action: "아래 층으로 내려 첫째 기본 모양으로 만들어요.",
      },
      {
        id: "down-side",
        alg: CROSS_DOWN_SIDE_TRY.setup,
        caption: "아래 층, 흰색이 옆",
        action: "가운데 층으로 올려 둘째 기본 모양으로 만들어요.",
      },
      {
        id: "top-side",
        alg: CROSS_FLIPPED.setup,
        caption: "위 층, 흰색이 옆",
        action: "가운데 층으로 내린 뒤 가운데 층 두 경우 가운데 하나대로 해요.",
      },
      {
        id: "top-wrong",
        alg: CROSS_TOP_WRONG.setup,
        caption: "위 층, 흰색이 위인데 다른 자리",
        action: "아래 층으로 내려 첫째 기본 모양으로 만들어요.",
      },
    ],
  },
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
  // 코너 방향 먼저(lessons-twist-first.ts, docs/47 16-33)
  "beginner-tf-face": {
    stage: { path: "twist-first", id: "face" },
    set: "2look-oll",
    mask: "oll",
    title: "노란 십자가 맞은 윗면 모양 여덟",
    cases: [
      {
        id: "one-front",
        alg: flip(YELLOW_FACE),
        caption: "하나, 앞-오른쪽 위 노란색이 앞",
        action: "위를 보는 코너 블럭을 앞-왼쪽 위에 두고 한 번 쳐요.",
      },
      {
        id: "one-right",
        alg: flip(YELLOW_FACE_BACK),
        caption: "하나, 앞-왼쪽 위에 두면 앞-오른쪽 위 노란색이 오른쪽",
        action: "위를 보는 코너 블럭을 뒤-오른쪽 위에 두고 거꾸로 한 번 쳐요.",
      },
      {
        id: "none-sides",
        alg: flip(FACE_SIDES),
        caption: "없음, 마주 보는 두 옆면에 둘씩",
        action: "둘씩을 왼쪽과 오른쪽 면에 두고 두 번 쳐요.",
      },
      {
        id: "none",
        alg: flip(FACE_NONE),
        caption: "없음, 노란색 둘인 옆면이 하나",
        action: "그 면을 왼쪽에 두고 한 번 치면 하나인 모양이 돼요.",
      },
      {
        id: "two",
        alg: flip(FACE_TWO_SAME),
        caption: "둘, 이웃하고 옆을 보는 둘이 한 면",
        action:
          "앞-왼쪽 위 노란색이 앞을 보게 두고 한 번 치면 하나인 모양이 돼요.",
      },
      {
        id: "two",
        alg: flip(FACE_TWO_APART),
        caption: "둘, 이웃하고 옆을 보는 둘이 다른 면",
        action:
          "앞-왼쪽 위 노란색이 앞을 보게 두고 한 번 치면 하나인 모양이 돼요.",
      },
      {
        id: "two",
        alg: flip(FACE_TWO_DIAGONAL),
        caption: "둘, 대각선",
        action:
          "앞-왼쪽 위 노란색이 앞을 보게 두고 한 번 치면 하나인 모양이 돼요.",
      },
      { id: "done", alg: "z2", caption: "넷 다 위", action: "끝이에요." },
    ],
  },
  "beginner-tf-corners": {
    stage: { path: "twist-first", id: "corners" },
    set: "2look-pll",
    title: "바른 짝으로 가르는 네 경우",
    cases: [
      {
        id: "done",
        alg: "z2",
        caption: "네 면 모두 바른 짝, 코너 블럭 모두 제자리",
        action: "끝이에요.",
      },
      {
        id: "align",
        alg: flip("U"),
        caption: "네 면 모두 바른 짝, 위 층이 비켜남",
        action: "윗면을 돌려 코너 블럭을 제자리에 넣어요. 많아야 세 번이에요.",
      },
      {
        id: "one",
        alg: flip(CORNER_SWAP),
        caption: "바른 짝 한 면",
        action: "그 면을 뒤에 두고 한 번 쳐요.",
      },
      {
        id: "none",
        alg: flip(TF_CORNERS_NONE),
        caption: "바른 짝 없음",
        action: "그대로 한 번 치면 바른 짝이 한 면 생겨요.",
      },
    ],
  },
  "beginner-tf-edges": {
    stage: { path: "twist-first", id: "edges" },
    set: "2look-pll",
    title: "제자리 엣지 블럭으로 가르는 여섯 경우",
    cases: [
      { id: "done", alg: "z2", caption: "넷 다 제자리", action: "끝이에요." },
      {
        id: "right-first",
        alg: flip(EDGE_CYCLE),
        caption: "하나, 뒤에 두면 앞 블럭의 제자리가 왼쪽",
        action: "오른손 먼저 한 번 쳐요.",
      },
      {
        id: "left-first",
        alg: flip(EDGE_CYCLE_LEFT),
        caption: "하나, 뒤에 두면 앞 블럭의 제자리가 오른쪽",
        action: "왼손 먼저 한 번 쳐요.",
      },
      {
        id: "none",
        alg: flip(EDGES_OPPOSITE),
        caption: "없음, 마주 보는 둘씩 바뀜",
        action: "그대로 오른손 먼저를 한 번 치면 하나가 생겨요.",
      },
      {
        id: "none",
        alg: flip(EDGES_NEIGHBOR),
        caption: "없음, 이웃한 둘씩 바뀜",
        action: "그대로 오른손 먼저를 한 번 치면 하나가 생겨요.",
      },
      {
        id: "turn",
        alg: `${flip(EDGE_CYCLE)} U`,
        caption: "위 층이 통째로 비켜남",
        action: "윗면을 돌려 코너 블럭을 먼저 제자리에 넣어요.",
      },
    ],
  },
};

export const isBeginnerSheet = (
  name: SheetName,
): name is keyof typeof BEGINNER_CASE_SHEETS => name in BEGINNER_CASE_SHEETS;

/** 표의 글(용어 순서 시험이 단계 글과 함께 읽는다) */
export function beginnerSheetText(name: keyof typeof BEGINNER_CASE_SHEETS) {
  const s = BEGINNER_CASE_SHEETS[name];
  return [s.title, ...s.cases.flatMap((c) => [c.caption, c.action])].join("\n");
}
