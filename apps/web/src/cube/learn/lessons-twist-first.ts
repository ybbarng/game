// 3×3 초보자(코너 방향 먼저)의 일곱 단계(docs/47 16-33). 예전 문방구 큐브(신광사)에 들어 있던 설명서의 해법을 설명서 공식
// 그대로 가르친다: 흰 십자 → 첫 층 코너 → 둘째 층 엣지 → 엣지 방향 → 엣지 위치 → 코너 방향 → 코너 위치. 3×3 처음 맞추기
// 강의와는 따로다. 단계마다 첫머리에서 모든 경우를 그림으로 훑고(beginner-cases.ts `beginner-tf-*`), 경우마다
// 「이 모양이면 → 이렇게 쥐고 → 이 공식 n번」으로 닫는다. 코너 방향은 모양마다 그림처럼 쥐고 한 번 치면 어느 모양이 되는지
// 관계도(`tf-flow`)로도 보인다. 경우와 공식·횟수의 원본은 twist-first-path.ts이고, 쪽의 모범 답은 그 규칙이 같은
// 상황에서 내는 수와 같다(twist-first-lessons.test.ts). 덩어리 글이 말한 일은 twist-first-algs.test.ts가 엔진으로 확인한다.
// 설명서 그림·글은 옮기지 않고 공식만 쓴다. 퍼뮤·수네 같은 전문 이름은 쓰지 않는다.
import { setupFor } from "./notation";
import {
  CORNER_A,
  CORNER_B,
  CORNER_DOWN,
  CORNER_FRONT,
  CORNER_IN,
  CORNER_PULL,
  CORNER_TURN,
  CROSS_FRONT,
  CROSS_MIDDLE,
  CROSS_PULL,
  EDGE_CYCLE,
  EDGE_FLIP,
  SECOND_A,
  SECOND_B,
} from "./twist-first-path";
import type { Course, Lesson, LessonStep } from "./types";

/** 흰 면 위로 쥐고 이 풀이로 맞는 시작 상황(1·2단계) */
const up = (solution: string) => ({ alg: setupFor(solution) });
/** 흰 면 아래로 쥐고 이 풀이로 맞는 시작 상황 */
const flip = (solution: string) => ({ alg: setupFor(solution, "z2") });

// 1·2단계 경우별 상황(흰 면 위). 시험이 규칙으로 푼 수가 풀이와 같은지 본다
/** 흰 십자: 가운데 층(앞-오른쪽) → 빼서 아래-앞, 흰색 아래 → F2 */
export const CROSS_MID_SOLVE = `${CROSS_MIDDLE} F2`;
/** 흰 십자: 위-오른쪽에 뒤집혀 들어감 → 빼서 아래 층(흰색이 옆) → 짝 색 센터를 앞으로 쥐고 바로 아래로 → 옆에서 올리기 */
export const CROSS_TOP_SOLVE = `${CROSS_PULL} y D' ${CROSS_FRONT}`;
/** 첫 층 코너: 자리 밑, 흰색 아래 → 다시 놓고 D → 넣기 */
export const CORNER_DOWN_SOLVE = `${CORNER_DOWN} D ${CORNER_IN}`;
/** 첫 층 코너: 자리 밑, 흰색 앞 → D2로 비키고 빼기 → 넣기 */
export const CORNER_FRONT_SOLVE = `${CORNER_FRONT} ${CORNER_IN}`;
/** 첫 층 코너: 앞-오른쪽 위에 돌아간 채 들어감 → 빼기 → D → 넣기 */
export const CORNER_SLOT_SOLVE = `${CORNER_PULL} D ${CORNER_IN}`;
/** 쥐기 문제의 물음(시험이 이 글로 쥐기 문제를 찾는다) */
export const GRIP_QUESTION = "공식을 치기 전에 어떻게 잡아야 할까요?";

/**
 * 쥐기 문제(2026-11-27 사용자): 같은 큐브를 y로 넷 쥔 그림 가운데 공식을 칠 쥐기를 고른다. 틀린 그림은 자주 하는 실수
 * (기준 조각이 뒤·옆). 고리는 쥐는 기준 조각(`focus`, 그림마다 같은 조각을 따라간다). 시험이 맞는 그림만 공식 한 번으로
 * 그 걸음을 끝내는지 엔진으로 본다
 */
function gripQuiz(
  body: string,
  setup: { alg: string },
  focus: string[],
  mask: LessonStep["mask"],
  pictures: [string, string][],
  why: string,
): LessonStep {
  const answer = pictures.findIndex(([y]) => y === "");
  return {
    kind: "quiz",
    body,
    setup,
    focus,
    ...(mask ? { mask } : {}),
    quiz: {
      question: GRIP_QUESTION,
      choices: pictures.map(([, c]) => c),
      answer,
      why,
      pictures: pictures.map(([y]) => ({ alg: y })),
    },
  };
}

const A3 = SECOND_A;
const B3 = SECOND_B;
const F4 = EDGE_FLIP;
const C5 = EDGE_CYCLE;
const T = CORNER_TURN;
const A = CORNER_A;
const B = CORNER_B;

// 경우별 상황(풀이의 거꾸로로 만든다, 쥐기는 그 경우의 쥐기 그대로). 시험이 규칙으로 푼 수가 풀이와 같은지 본다
/** 둘째 층: 앞-오른쪽에 엣지 블럭이 뒤집혀 들어감 → A로 빼고 → U2 → A */
export const SECOND_STUCK = `${A3} U2 ${A3}`;
/** 엣지 방향: 일자(앞뒤로 세움) → 한 번 → 기본형(쥔 그대로) → 한 번 */
export const EO_LINE = `${F4} ${F4}`;
/** 엣지 방향: 점 → 한 번 → 가로 일자 → U로 세우고 두 번 */
export const EO_DOT = `${F4} U ${F4} ${F4}`;
/** 엣지 위치: 이웃한 둘을 맞춘 뒤 반시계로 한 칸 더(U') 돌리면 뒤 하나만 맞음 */
export const EP_ADJACENT = `U' ${C5}`;
/** 엣지 위치: 마주 보는 둘 → 한 번 → 윗면을 돌려 이웃한 둘 */
export const EP_OPPOSITE = `${C5} U ${C5}`;
/** 코너 방향: 둘, 옆을 보는 둘이 마주 봄 → 한 번 → 기본형(쥔 그대로) */
export const TW_A = `${T} ${T}`;
/** 코너 방향: 둘, 옆을 보는 둘이 한 면 → 한 번 → y로 쥐면 기본형 */
export const TW_B = `${T} y ${T}`;
/** 코너 방향: 하나, 앞-왼쪽 위 노란색이 앞 → 한 번 → y2로 쥐면 기본형 */
export const TW_C = `${T} y2 ${T}`;
/** 코너 방향: 하나, 앞-왼쪽 위 노란색이 왼쪽 → 한 번 → y'로 쥐면 기본형 */
export const TW_D = `${T} y' ${T}`;
/** 코너 방향: 없음, 마주 보는 두 옆면에 둘씩 → 한 번 → 하나(앞-왼쪽이 왼쪽) */
export const TW_CROSS = `${T} ${TW_D}`;
/** 코너 방향: 없음, 노란색 둘인 옆면 하나 → 한 번 → 둘(옆이 한 면) */
export const TW_BAR = `${T} ${TW_B}`;
/** 코너 위치: 제자리 없음 → A 한 번 → 하나(시계) → y로 쥐고 A */
export const PLACE_NONE = `${A} y ${A}`;
/** 코너 위치: 제자리 없음 → A 한 번 → 하나(반시계) → y'로 쥐고 B */
export const PLACE_NONE_B = `${A} y' ${B}`;

const cross: Lesson = {
  id: "333-tf-cross",
  size: 3,
  title: "흰 십자",
  summary:
    "흰 센터 둘레에 흰 엣지 넷을 올려요. 넣을 블럭을 짝 색 센터 바로 아래로 데려와 흰색이 어디를 보는지에 따라 올려요.",
  steps: [
    {
      kind: "quiz",
      body: "예전 문방구에서 팔던 신광사 큐브 설명서의 해법이에요. 이 강의는 그 설명서의 공식으로 처음부터 끝까지 맞춰요. 먼저 흰 면을 위로 들고, 흰 센터 둘레에 흰 엣지 블럭 넷을 올려 흰 십자를 만들어요. 흰 엣지 블럭에서 흰색이 아닌 쪽 색을 「짝 색」이라고 부를게요. 흰 엣지 블럭의 제자리는 흰 센터와 짝 색 센터 사이예요.",
      setup: up("F2"),
      mask: "cross",
      quiz: {
        question: "흰-초록 엣지 블럭은 지금 어디에 있을까요?",
        choices: ["아래-앞", "위-앞"],
        answer: 0,
        why: "초록 센터 바로 아래, 아래-앞에 있어요. 흰색은 아래를 봐요.",
      },
    },
    {
      kind: "turn",
      body: "흰 십자를 만드는 동안 어디를 돌려도 되는지 먼저 봐요. 지금은 흰 십자가 다 맞아 있어요. 흰 십자는 윗면에 만드니, 윗면을 돌리면 올린 흰 엣지 블럭이 함께 돌아요. U를 쳐 보세요.",
      alg: "U",
      mask: "cross",
      passedText:
        "흰 엣지 블럭 넷이 모두 짝 색 센터에서 한 칸씩 벗어났어요. 흰색은 위를 봐도 제자리가 아니에요.",
    },
    {
      kind: "turn",
      body: "벗어난 흰 엣지 블럭은 윗면을 거꾸로 돌리면 돌아와요. U'를 쳐 보세요.",
      setup: { alg: "U" },
      alg: "U'",
      mask: "cross",
      passedText: "흰 십자가 다시 맞았어요.",
    },
    {
      kind: "turn",
      body: "옆면을 돌리면 그 면에 붙은 흰 엣지 블럭이 아래로 내려가요. R을 쳐 보세요. 위-오른쪽 흰 엣지 블럭이 앞-오른쪽으로 내려가요. 그래서 흰 십자 공식은 옆면을 돌렸으면 끝에 되돌려요. 빼기 R2 D R2는 R2를 R2로, 옆에서 올리기 D R F' R'는 R을 R'로 되돌려요.",
      alg: "R",
      mask: "cross",
      passedText:
        "위-오른쪽 흰 엣지 블럭이 내려갔어요. R'로 되돌리면 다시 올라와요.",
    },
    {
      kind: "turn",
      body: "아랫면은 흰 십자에 닿지 않아요. 아랫면은 몇 번을 돌려도 흰 십자가 그대로라, 블럭을 데려올 때 마음껏 돌려요. D를 두 번 쳐 보세요.",
      alg: "D D",
      mask: "cross",
      passedText: "흰 십자는 그대로예요.",
    },
    {
      kind: "quiz",
      body: "흰 엣지 블럭은 어디에 있든 그림의 네 경우 가운데 하나예요. 아래 층에 있으면 짝 색 센터가 앞에 오게 큐브를 y로 돌려 쥐고, 아랫면을 돌려 블럭을 바로 아래(아래-앞)로 데려와요. 그다음 흰색이 아래를 보면 F2, 앞을 보면 「옆에서 올리기」 D R F' R'를 쳐요. 가운데 층이나 위 층에 잘못 들어가 있으면 먼저 아래 층으로 빼서, 아래 층일 때처럼 올려요.",
      setup: up("F2"),
      mask: "cross",
      sheet: "beginner-tf-cross",
      quiz: {
        question:
          "흰-초록 엣지 블럭은 아래-앞에 있고 흰색이 아래를 봐요. 무엇을 칠까요?",
        choices: ["F2", "D R F' R'"],
        answer: 0,
        why: "흰색이 아래면 앞면을 반 바퀴(F2) 돌려 곧장 올려요.",
      },
    },
    {
      kind: "demo",
      body: "흰색이 아래를 보면 앞면을 반 바퀴 돌려요. 아래-앞 블럭이 위-앞으로 올라가면서 흰색이 위를, 짝 색이 앞을 봐요.",
      focus: ["DF", "F"],
      setup: up("F2"),
      alg: "F2",
      mask: "cross",
    },
    gripQuiz(
      "같은 큐브를 네 가지로 쥐었어요. 노란 고리는 올릴 엣지 블럭과 짝 색 센터예요. F2로 올리려면 어떻게 쥘까요?",
      up("F2"),
      ["DF", "F"],
      "cross",
      [
        ["y'", "블럭과 짝 색 센터가 오른쪽"],
        ["", "블럭과 짝 색 센터가 앞"],
        ["y2", "블럭과 짝 색 센터가 뒤"],
        ["y", "블럭과 짝 색 센터가 왼쪽"],
      ],
      "F2는 앞면을 반 바퀴 돌려요. 올릴 블럭과 짝 색 센터가 앞에 와야 블럭이 제자리로 올라가요.",
    ),
    {
      kind: "try",
      body: "흰-빨강 엣지 블럭이 아래 층에 있어요. 빨강 센터가 앞에 오게 큐브를 돌려 쥐고, 아랫면을 돌려 블럭을 바로 아래로 데려온 뒤 올려 보세요.",
      focus: ["DF", "R"],
      setup: up("y D F2"),
      alg: "y D F2",
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "demo",
      body: "흰색이 앞을 보면 F2로는 흰색이 앞을 본 채 올라가요. 그래서 블럭을 옆으로 옮겨 올리는 「옆에서 올리기」 D R F' R'를 쳐요. 가운데 R F' R'는 R로 비키고, F' 한 수로 넣고, R'로 되돌리는 짜임이에요.",
      focus: ["DF", "F"],
      setup: up(CROSS_FRONT),
      alg: CROSS_FRONT,
      mask: "cross",
      chunks: [
        {
          moves: "D",
          says: "아랫면을 돌려 엣지 블럭을 아래-오른쪽으로 비켜요.",
        },
        {
          moves: "R",
          says: "오른쪽 층을 돌려 엣지 블럭을 앞-오른쪽 자리로 올려요. 위-오른쪽 흰 엣지 블럭은 뒤로 비켜요.",
        },
        {
          moves: "F'",
          says: "앞면을 돌려 엣지 블럭을 위-앞에 넣어요. 이번에는 흰색이 위를 봐요.",
        },
        {
          moves: "R'",
          says: "오른쪽 층을 되돌려요. 뒤로 비켰던 흰 엣지 블럭이 제자리로 돌아와요.",
        },
      ],
    },
    {
      kind: "try",
      body: "흰색이 앞을 보는 블럭이에요. 짝 색 센터가 앞에 오게 돌려 쥐고 옆에서 올리기를 쳐 보세요.",
      focus: ["DL", "L"],
      setup: up(`y' ${CROSS_FRONT}`),
      alg: `y' ${CROSS_FRONT}`,
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "demo",
      body: "흰 엣지 블럭이 위 층의 다른 자리에 들었거나 제자리에서 뒤집혀 있으면, 그 자리에 다른 블럭을 넣는다고 생각해요. 넣으면 들어 있던 블럭이 밀려 나와요. 「빼기」 R2 D R2는 아래 층 엣지 블럭 하나를 위-오른쪽 자리에 올려 넣는 수라, 잘못 든 블럭을 위-오른쪽에 두고 치면 그 블럭이 아래 층으로 밀려 나와요. 가운데 D는 내려간 블럭을 옆으로 비키는 수라, 아랫면을 어느 쪽으로 돌려도 돼요. 지금은 위-오른쪽 흰 엣지 블럭이 제자리에서 뒤집혀 있어요. 빼기 한 번을 쳐서 밀려 나오는 것을 보세요.",
      focus: ["UR", "R"],
      setup: up(CROSS_TOP_SOLVE),
      alg: CROSS_PULL,
      mask: "cross",
      chunks: [
        {
          moves: "R2",
          says: "위-오른쪽 엣지 블럭을 아래-오른쪽으로 내려요.",
        },
        {
          moves: "D",
          says: "아랫면을 돌려 내려간 블럭을 옆으로 비켜요. 어느 쪽으로 돌려도 돼요. 그 대신 다른 아래 층 블럭이 아래-오른쪽으로 와요.",
        },
        {
          moves: "R2",
          says: "오른쪽 층을 되돌려요. 데려온 블럭이 위-오른쪽에 들어가고, 밀려 나온 블럭은 아래 층에 남아 흰색이 옆을 봐요.",
        },
      ],
    },
    {
      kind: "try",
      body: "흰 엣지 블럭이 위 층에서 뒤집혀 있어요. 그 블럭이 위-오른쪽에 오게 돌려 쥐고 빼기 R2 D R2로 내린 뒤, 아래 층 경우대로 올려 보세요. 내려간 블럭은 흰색이 옆을 봐서, 짝 색 센터 바로 아래로 데려온 뒤 옆에서 올리기를 쳐요.",
      focus: ["UF", "F"],
      setup: up(`y' ${CROSS_TOP_SOLVE}`),
      alg: `y' ${CROSS_TOP_SOLVE}`,
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "try",
      body: "흰 엣지 블럭이 가운데 층 앞-오른쪽에 있어요. 설명서에는 없는 경우라서, 첫 층 코너에서 쓸 빼기 R' D' R로 아래 층에 내려요. 그다음 아래 층 경우대로 올려 보세요.",
      focus: ["FR", "F"],
      setup: up(CROSS_MID_SOLVE),
      alg: CROSS_MID_SOLVE,
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "try",
      body: "이번엔 혼자 흰 십자를 만들어 봐요. 아래 경우 그림대로 하나씩 올려요. 아래 층 블럭부터 하면 편해요.",
      setup: { rule: "random-cross" },
      goal: "white-cross",
      mask: "cross",
      sheet: "beginner-tf-cross",
    },
  ],
};

const corners: Lesson = {
  id: "333-tf-corners",
  size: 3,
  title: "첫 층 코너",
  summary:
    "흰 코너 블럭 넷을 넣어 흰 면과 첫 층을 맞춰요. 넣는 공식 하나와, 넣기 좋게 다시 놓는 빼기 둘을 써요.",
  steps: [
    {
      kind: "quiz",
      body: "흰 십자를 만들었어요. 이제 흰 코너 블럭 넷을 넣어 흰 면과 첫 층을 맞춰요. 흰 코너 블럭의 제자리는 흰 센터와 나머지 두 색의 센터가 만나는 구석이에요. 넣을 자리가 앞-오른쪽 위에 오게 큐브를 y로 돌려 쥐고, 아랫면을 돌려 코너 블럭을 그 자리 바로 밑(아래-앞-오른쪽)으로 데려와요. 흰 십자 때처럼 아랫면은 마음껏 돌려도 되고, 공식이 옆면(F·R)을 돌렸으면 끝에 되돌려요.",
      setup: up(CORNER_IN),
      mask: "first-layer",
      quiz: {
        question: "자리 밑에 온 코너 블럭의 흰색은 어느 쪽을 볼까요?",
        choices: ["오른쪽", "앞", "아래"],
        answer: 0,
        why: "흰색이 오른쪽을 봐요. 설명서가 넣는 공식을 보인 기본 모양이에요.",
      },
    },
    {
      kind: "quiz",
      body: "코너 블럭은 어디에 있든 그림의 네 경우 가운데 하나예요. 자리 밑에서 흰색이 오른쪽이면 「코너 블럭 넣기」 F' R F R'를 쳐요. 흰색이 아래면 「다시 놓기」 R' D2 R, 흰색이 앞이면 D2와 「빼기」 R' D' R을 쳐서 흰색이 오른쪽인 모양을 만들어요. 위 층의 다른 자리에 들었거나 제자리에서 돌아가 있으면 그 블럭을 앞-오른쪽 위에 두고 빼기로 아래 층에 내려요.",
      setup: up(CORNER_IN),
      mask: "first-layer",
      sheet: "beginner-tf-corners",
      quiz: {
        question: "자리 밑에서 흰색이 오른쪽을 봐요. 무엇을 칠까요?",
        choices: ["코너 블럭 넣기", "다시 놓기"],
        answer: 0,
        why: "흰색이 오른쪽이면 곧장 코너 블럭 넣기예요.",
      },
    },
    {
      kind: "demo",
      body: "코너 블럭 넣기 F' R F R'는 네 수예요. 한 면을 돌리고, 다른 면을 돌리고, 처음 면을 되돌리고, 다른 면도 되돌리는 꼴이에요. 이 꼴은 뒤 단계 공식에도 자주 나와요. 앞면으로 코너 블럭을 올려 오른쪽 층으로 비켜 두고, 앞면을 되돌린 뒤 오른쪽 층을 되돌려 넣어요.",
      focus: ["DFR", "R", "F"],
      setup: up(CORNER_IN),
      alg: CORNER_IN,
      mask: "first-layer",
      chunks: [
        {
          moves: "F'",
          says: "앞면을 돌려 코너 블럭을 앞-오른쪽 위로 올려요. 흰색이 위를 봐요. 흰 십자의 위-앞 엣지 블럭은 옆으로 비켜요.",
        },
        {
          moves: "R",
          says: "오른쪽 층을 돌려 올라온 코너 블럭을 뒤-오른쪽 위로 비켜 둬요. 위-오른쪽 흰 엣지 블럭도 함께 비켜요.",
        },
        {
          moves: "F",
          says: "앞면을 되돌려요. 옆으로 비켰던 위-앞 흰 엣지 블럭이 돌아와요.",
        },
        {
          moves: "R'",
          says: "오른쪽 층을 되돌려요. 비켜 둔 코너 블럭이 앞-오른쪽 위 제자리에 들어가고, 위-오른쪽 흰 엣지 블럭도 돌아와요.",
        },
      ],
    },
    gripQuiz(
      "같은 큐브를 네 가지로 쥐었어요. 노란 고리는 넣을 코너 블럭과 넣을 자리를 알려 주는 옆 센터 둘이에요. 코너 블럭 넣기 F' R F R'로 넣으려면 어떻게 쥘까요?",
      up(CORNER_IN),
      ["DFR", "R", "F"],
      "first-layer",
      [
        ["", "코너 블럭이 앞-오른쪽 아래"],
        ["y", "코너 블럭이 앞-왼쪽 아래"],
        ["y2", "코너 블럭이 뒤-왼쪽 아래"],
        ["y'", "코너 블럭이 뒤-오른쪽 아래"],
      ],
      "코너 블럭 넣기는 앞-오른쪽 위 자리에 넣어요. 넣을 자리가 앞-오른쪽 위에 오고 코너 블럭이 그 바로 밑에 있게 쥐어요.",
    ),
    {
      kind: "try",
      body: "넣을 자리가 다른 구석이고 코너 블럭도 자리 밑이 아니에요. 자리가 앞-오른쪽 위에 오게 돌려 쥐고, 아랫면을 돌려 코너 블럭을 자리 밑으로 데려와 넣어 보세요.",
      focus: ["DLF", "R", "F"],
      setup: up(`D ${CORNER_IN}`),
      alg: `D ${CORNER_IN}`,
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "넣을 자리가 앞-오른쪽 위가 아니에요. 큐브를 y로 돌려 쥐고 넣어 보세요.",
      focus: ["DLF", "F", "L"],
      setup: up(`y' ${CORNER_IN}`),
      alg: `y' ${CORNER_IN}`,
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "demo",
      body: "흰색이 바닥을 보는 코너 블럭은 어느 쪽으로 올려도 흰색이 위로 오지 않아요. 그래서 먼저 흰색이 옆을 보게 눕혀요. 그 일을 하는 것이 다시 놓기 R' D2 R이에요. 그림에는 그 코너 블럭과 넣을 자리를 알려 주는 옆 센터 둘에 노란 고리를 둘렀어요. R'로 오른쪽 층을 돌리면 블럭이 층과 함께 굴러 바닥을 보던 흰색이 뒤를 봐요. D2로 그 블럭을 오른쪽 층 밖(아래-앞-왼쪽)으로 비켜 두고, R로 오른쪽 층을 되돌려요. 블럭은 흰색이 옆(앞)을 본 채 남아요. 그다음 D로 자리 밑에 데려오면 흰색이 오른쪽이라 코너 블럭 넣기로 넣어요(다음 해 보기).",
      focus: ["DFR", "R", "F"],
      setup: up(CORNER_DOWN_SOLVE),
      alg: CORNER_DOWN,
      mask: "first-layer",
      chunks: [
        {
          moves: "R'",
          says: "오른쪽 층을 돌려요. 코너 블럭이 층과 함께 굴러 아래-뒤-오른쪽으로 가고, 바닥을 보던 흰색이 뒤를 봐요.",
        },
        {
          moves: "D2",
          says: "아랫면을 반 바퀴 돌려 그 블럭을 오른쪽 층 밖, 아래-앞-왼쪽으로 비켜 둬요. 흰색은 앞을 봐요.",
        },
        {
          moves: "R",
          says: "오른쪽 층을 되돌려요. 흰 십자는 그대로이고, 비켜 둔 블럭은 흰색이 옆을 본 채 남아요.",
        },
      ],
    },
    {
      kind: "try",
      body: "흰색이 아래를 보는 코너 블럭이에요. 넣을 자리가 앞-오른쪽 위에 오게 돌려 쥐고 다시 놓기부터 해 보세요.",
      focus: ["DRB", "B", "R"],
      setup: up(`y ${CORNER_DOWN_SOLVE}`),
      alg: `y ${CORNER_DOWN_SOLVE}`,
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "자리 밑에서 흰색이 앞을 봐요. 설명서에는 없는 경우라서, 아랫면을 D2로 돌려 비킨 뒤 빼기 R' D' R을 치면 흰색이 오른쪽인 모양이 돼요. 그다음 코너 블럭 넣기로 넣어 보세요.",
      focus: ["DFR", "F", "R"],
      setup: up(CORNER_FRONT_SOLVE),
      alg: CORNER_FRONT_SOLVE,
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "demo",
      body: "코너 블럭이 제자리에 들었는데 흰색이 옆을 보면 돌아가 있는 거예요. 위 층 다른 자리에 잘못 든 블럭도 같아요. 그 자리에 다른 코너 블럭을 넣는다고 생각해요. 넣으면 들어 있던 블럭이 밀려 나와요. 빼기 R' D' R은 아래 층 코너 블럭 하나를 위-앞-오른쪽 자리에 올려 넣는 수예요. 그 자리를 앞-오른쪽 위에 두고 치면, 들어 있던 블럭이 아래 층으로 밀려 나와요. 가운데 D'는 내려간 블럭을 옆으로 비키는 수라, 아랫면을 어느 쪽으로 돌려도 돼요. 그림에는 밀려 나올 블럭과 그 블럭의 옆 센터 둘에 노란 고리를 둘렀어요. 나온 블럭은 경우대로 넣어요(다음 해 보기).",
      focus: ["URF", "F", "R"],
      setup: up(CORNER_SLOT_SOLVE),
      alg: CORNER_PULL,
      mask: "first-layer",
      chunks: [
        {
          moves: "R'",
          says: "오른쪽 층을 돌려요. 들어 있던 블럭이 아래-앞-오른쪽으로 내려가요.",
        },
        {
          moves: "D'",
          says: "아랫면을 돌려 내려간 블럭을 옆으로 비켜요. 어느 쪽으로 돌려도 돼요. 그 대신 다른 아래 층 코너 블럭이 아래-앞-오른쪽으로 와요.",
        },
        {
          moves: "R",
          says: "오른쪽 층을 되돌려요. 데려온 블럭이 위 자리에 들어가고, 밀려 나온 블럭은 아래 층에 남아요. 흰 십자는 그대로예요.",
        },
      ],
    },
    {
      kind: "try",
      body: "앞-오른쪽 위가 아닌 구석에 코너 블럭이 돌아간 채 들어가 있어요. 그 블럭을 앞-오른쪽 위에 두고 빼기로 내린 뒤 경우대로 넣어 보세요.",
      focus: ["UFL", "L", "F"],
      setup: up(`y' ${CORNER_SLOT_SOLVE}`),
      alg: `y' ${CORNER_SLOT_SOLVE}`,
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "이번엔 혼자 첫 층을 끝내 봐요. 흰 십자만 맞고 흰 코너 블럭은 흩어져 있어요. 아래 경우 그림대로 하나씩 넣어요. 아래 층 블럭부터 하면 편해요.",
      setup: { rule: "white-cross-up" },
      goal: "first-layer",
      mask: "first-layer",
      sheet: "beginner-tf-corners",
    },
  ],
};

const second: Lesson = {
  id: "333-tf-second",
  size: 3,
  title: "둘째 층 엣지",
  summary:
    "흰 면을 아래로 두고 가운데 층 엣지 넷을 넣어요. 오른쪽으로 넣는 공식과 왼쪽으로 넣는 공식, 둘을 써요.",
  steps: [
    {
      kind: "quiz",
      body: "첫 층을 다 맞췄어요. 설명서대로 맞춘 흰 면을 아래로 보내고, 그 위 가운데 층의 엣지 넷을 넣어요. 넣을 엣지 블럭은 노란색이 없는 엣지 블럭이에요. 위 층 엣지 블럭에서 위를 보는 스티커 색을 「위 색」, 옆을 보는 스티커 색을 「옆 색」이라고 부를게요.",
      setup: flip(A3),
      mask: "f2l",
      quiz: {
        question: "위-앞 엣지 블럭의 옆 색은 바로 아래 센터 색과 같을까요?",
        choices: ["같아요", "달라요"],
        answer: 0,
        why: "옆 색이 앞 센터 색과 같아요. 넣기 전에 이렇게 옆 색 센터 위에 놓아요.",
      },
    },
    {
      kind: "quiz",
      body: "넣을 엣지 블럭은 어디에 있든 그림의 세 경우 가운데 하나예요. 위 층에 있으면 윗면을 돌려 옆 색 센터 위로 옮기고, 그 면이 앞에 오게 큐브를 y로 돌려 쥐어요. 그다음 위 색을 봐요. 위 색이 오른쪽 센터 색이면 제자리는 앞-오른쪽이라 오른쪽으로 넣는 공식 「오른쪽 넣기」를, 왼쪽 센터 색이면 제자리는 앞-왼쪽이라 「왼쪽 넣기」를 쳐요. 가운데 층에 잘못 들어가 있으면 오른쪽 넣기로 빼서 위 층으로 올려요.",
      setup: flip(A3),
      mask: "f2l",
      sheet: "beginner-tf-second",
      quiz: {
        question:
          "위-앞 엣지 블럭의 위 색은 오른쪽 센터 색이에요. 무엇을 칠까요?",
        choices: ["오른쪽 넣기", "왼쪽 넣기"],
        answer: 0,
        why: "위 색이 오른쪽 센터 색이니 제자리가 앞-오른쪽이에요. 오른쪽 넣기예요.",
      },
    },
    {
      kind: "demo",
      body: "오른쪽 넣기는 U R U' R' F R' F' R, 여덟 수예요. 네 수짜리 덩어리 둘로 보면 쉬워요. 두 덩어리 모두 코너 블럭 넣기 F' R F R'와 같은 꼴이에요. 한 면을 돌리고, 다른 면을 돌리고, 처음 면을 되돌리고, 다른 면도 되돌려요. 뒤 덩어리 F R' F' R은 코너 블럭 넣기와 도는 방향만 모두 반대예요.",
      focus: ["UF", "R", "F"],
      setup: flip(A3),
      alg: A3,
      mask: "f2l",
      chunks: [
        {
          moves: "U R U' R'",
          says: "U로 엣지 블럭을 왼쪽에 비켜 두고, R U' R'로 앞-오른쪽 아래 코너 블럭을 위 층으로 꺼내요. 엣지 블럭은 위-앞으로 돌아와 기다리고, 앞-오른쪽 자리에는 위 층 엣지 블럭이 잠깐 들어가요.",
        },
        {
          moves: "F R' F' R",
          says: "꺼낸 코너 블럭을 첫 층으로 되돌려요. 그러면서 잠깐 들어간 블럭은 빠지고, 기다리던 엣지 블럭이 앞-오른쪽 자리에 들어가요.",
        },
      ],
    },
    {
      kind: "demo",
      body: "왼쪽 넣기는 U' L' U L F' L F L'예요. 오른쪽 넣기의 왼쪽과 오른쪽을 바꾼 꼴이라, R 자리에 L이 오고 도는 방향은 모두 반대예요. 앞-왼쪽 자리에 넣어요.",
      focus: ["UF", "L", "F"],
      setup: flip(B3),
      alg: B3,
      mask: "f2l",
      chunks: [
        {
          moves: "U' L' U L",
          says: "엣지 블럭을 오른쪽에 비켜 두고, 앞-왼쪽 아래 코너 블럭을 위 층으로 꺼내요.",
        },
        {
          moves: "F' L F L'",
          says: "코너 블럭을 되돌리면서 엣지 블럭을 앞-왼쪽 자리에 넣어요.",
        },
      ],
    },
    gripQuiz(
      "같은 큐브를 네 가지로 쥐었어요. 노란 고리는 넣을 엣지 블럭과 그 블럭의 두 색 센터예요. 오른쪽 넣기로 넣으려면 어떻게 쥘까요?",
      flip(A3),
      ["UF", "R", "F"],
      "f2l",
      [
        ["y", "엣지 블럭이 왼쪽 위"],
        ["y2", "엣지 블럭이 뒤 위"],
        ["", "엣지 블럭이 앞 위"],
        ["y'", "엣지 블럭이 오른쪽 위"],
      ],
      "오른쪽 넣기는 앞 위 엣지 블럭을 앞-오른쪽 자리로 넣어요. 블럭이 옆 색 센터 위에 있는 면을 앞으로 쥐어요.",
    ),
    {
      kind: "try",
      body: "오른쪽 넣기로 넣어 보세요. 이번 쪽부터는 노란색이 붙은 엣지 블럭을 까맣게 가려 두었어요. 위 층에서 색이 보이는 엣지 블럭이 넣을 블럭이에요.",
      focus: ["UF", "R", "F"],
      setup: flip(A3),
      alg: A3,
      goal: "second-layer",
      mask: "f2l",
    },
    {
      kind: "try",
      body: "왼쪽 넣기로 넣어 보세요.",
      focus: ["UF", "L", "F"],
      setup: flip(B3),
      alg: B3,
      goal: "second-layer",
      mask: "f2l",
    },
    {
      kind: "try",
      body: "엣지 블럭이 아직 옆 색 센터 위에 있지 않아요. 윗면을 돌려 옆 색 센터 위로 옮기고, 그 면을 앞으로 돌려 쥔 뒤 위 색을 보고 넣어 보세요.",
      focus: ["UB", "B", "R"],
      setup: flip(`U y ${A3}`),
      alg: `U y ${A3}`,
      goal: "second-layer",
      mask: "f2l",
    },
    {
      kind: "try",
      body: "이번에도 윗면을 돌려 옮기고, 그 면을 앞으로 쥐고 위 색을 보고 넣어 보세요.",
      focus: ["UB", "B", "L"],
      setup: flip(`U' y' ${B3}`),
      alg: `U' y' ${B3}`,
      goal: "second-layer",
      mask: "f2l",
    },
    {
      kind: "demo",
      body: "위 층에 넣을 엣지 블럭이 없으면 가운데 층에 잘못 든 엣지 블럭이 있어요. 잘못 든 자리를 앞-오른쪽으로 돌려 쥐고 오른쪽 넣기를 한 번 쳐서 빼요. 빼려고 노란 엣지 블럭을 잠깐 넣는 건 괜찮아요. 빠진 블럭은 위 층에 올라오니 경우대로 다시 넣어요(다음 해 보기). 지금은 앞-오른쪽 엣지 블럭이 제자리에서 뒤집혀 있어요. 오른쪽 넣기 한 번으로 그 블럭이 빠지는 것을 보세요.",
      focus: ["FR"],
      setup: flip(SECOND_STUCK),
      alg: A3,
      mask: "f2l",
      chunks: [
        {
          moves: "U R U' R'",
          says: "첫 층 코너 블럭을 위 층으로 꺼내요. 앞-오른쪽 자리에는 위 층의 노란 엣지 블럭이 들어가고, 뒤집혀 있던 엣지 블럭은 위 층으로 올라와요.",
        },
        {
          moves: "F R' F' R",
          says: "코너 블럭을 되돌리며 위-앞의 노란 엣지 블럭을 넣어요. 빠진 엣지 블럭은 위 층에 남아요.",
        },
      ],
    },
    {
      kind: "try",
      body: "이번엔 앞-왼쪽 자리에 엣지 블럭이 잘못 들어가 있어요. 그 자리를 앞-오른쪽으로 돌려 쥐고 오른쪽 넣기로 뺀 뒤, 빠진 블럭을 경우대로 넣어 보세요.",
      focus: ["FL"],
      setup: flip(`y' ${SECOND_STUCK}`),
      alg: `y' ${SECOND_STUCK}`,
      goal: "second-layer",
      mask: "f2l",
    },
    {
      kind: "try",
      body: "이번엔 혼자 둘째 층을 끝내 봐요. 첫 층만 맞고 가운데 층 엣지는 흩어져 있어요. 아래 경우 그림대로 하나씩 넣어요. 어느 것부터 해도 돼요.",
      setup: { rule: "first-layer-solved" },
      goal: "second-layer",
      mask: "f2l",
      sheet: "beginner-tf-second",
    },
  ],
};

const edgeFlip: Lesson = {
  id: "333-tf-eo",
  size: 3,
  title: "엣지 방향",
  summary:
    "위 층 엣지의 노란 스티커를 모두 위로 올려 십자를 만들어요. 모양을 보고 공식 하나를 한 번에서 세 번 쳐요.",
  steps: [
    {
      kind: "quiz",
      body: "아래 두 층이 다 맞았어요. 이제 남은 위 층이에요. 먼저 위 층 엣지 넷의 노란 스티커를 모두 위로 올려, 노란 센터 둘레에 십자를 만들어요. 방향은 노란 스티커가 어느 쪽을 보는지예요. 위 층 코너 블럭은 아직 안 보니 지금은 회색으로 가려 두었어요.",
      setup: flip(F4),
      mask: "ll-cross",
      quiz: {
        question: "십자를 만들 때 보는 것은 무엇일까요?",
        choices: [
          "위 층 엣지 블럭의 노란 스티커",
          "위 층 코너 블럭의 노란 스티커",
        ],
        answer: 0,
        why: "코너 블럭은 나중에 맞춰요. 지금은 엣지 블럭의 노란 스티커만 봐요.",
      },
    },
    {
      kind: "quiz",
      body: "위를 보는 노란 스티커가 노란 센터와 만드는 모양은 그림의 넷 가운데 하나예요. 노란 센터와 꺾여 이어진 「ㄱ자」, 노란 센터를 사이에 두고 한 줄인 「일자」, 노란 센터 하나뿐인 「점」, 넷 다인 「십자」예요. 설명서는 ㄱ자를 「기본형」이라고 불러요. 공식은 하나이고, 일자는 한 번 치면 기본형이, 점은 한 번 치면 일자가 돼요.",
      setup: flip(F4),
      mask: "ll-cross",
      sheet: "beginner-tf-eo",
      quiz: {
        question: "이 큐브의 윗면은 넷 가운데 어느 모양일까요?",
        choices: ["ㄱ자", "일자", "점", "십자"],
        answer: 0,
        why: "위를 보는 노란 스티커 둘이 뒤와 왼쪽에서 노란 센터와 꺾여 이어져요. 기본형이에요.",
      },
    },
    {
      kind: "demo",
      body: "기본형은 노란 스티커 둘이 뒤와 왼쪽에 오게 두고 「엣지 방향」 공식 R' U' F' U F R을 한 번 쳐요. 가운데 네 수 U' F' U F는 코너 블럭 넣기 F' R F R'와 같은 꼴이에요. 그 앞뒤를 R'와 R로 감싸요. R'로 준비하고, 덩어리를 친 뒤, R로 준비를 되돌리는 짜임이에요.",
      focus: ["UB", "UL"],
      setup: flip(F4),
      alg: F4,
      mask: "ll-cross",
      chunks: [
        {
          moves: "R'",
          says: "오른쪽 층을 돌려 준비해요. 위-오른쪽 엣지 블럭이 앞-오른쪽 자리로 내려가요.",
        },
        {
          moves: "U' F' U F",
          says: "윗면과 앞면을 번갈아 돌리고 되돌려요. 위 층 엣지 블럭이 자리를 옮기며 뒤집혀요.",
        },
        {
          moves: "R",
          says: "준비를 되돌려요. 아래 두 층은 다 돌아오고, 위 층 엣지 블럭 셋의 자리와 방향이 바뀌어 노란 십자가 돼요.",
        },
      ],
    },
    gripQuiz(
      "같은 큐브를 네 가지로 쥐었어요. 노란 고리는 ㄱ자를 이루는 엣지 블럭 둘이에요. 엣지 방향 공식으로 십자를 만들려면 어떻게 쥘까요?",
      flip(F4),
      ["UB", "UL"],
      "ll-cross",
      [
        ["y'", "노란 스티커가 왼쪽과 앞"],
        ["y2", "노란 스티커가 앞과 오른쪽"],
        ["y", "노란 스티커가 뒤와 오른쪽"],
        ["", "노란 스티커가 뒤와 왼쪽"],
      ],
      "기본형은 노란 스티커 둘이 뒤와 왼쪽일 때 공식 한 번으로 십자가 돼요. 다른 쪽으로 쥐면 십자가 되지 않아요.",
    ),
    {
      kind: "try",
      body: "기본형이 다른 곳에 있어요. 노란 스티커 둘이 뒤와 왼쪽에 오게 윗면을 돌리고 공식을 한 번 쳐 보세요. 왼쪽과 앞이면 U, 앞과 오른쪽이면 U2, 오른쪽과 뒤면 U'예요.",
      focus: ["UL", "UF"],
      setup: flip(`U ${F4}`),
      alg: `U ${F4}`,
      goal: "yellow-cross",
      mask: "ll-cross",
    },
    {
      kind: "quiz",
      body: "일자는 앞뒤로 세워 두고 공식을 한 번 쳐요. 그러면 노란 스티커 둘이 뒤와 왼쪽인 기본형이 돼서, 쥔 그대로 한 번 더 치면 십자예요. 가로로 누워 있으면 먼저 U를 한 번 쳐서 세워요.",
      setup: flip(EO_LINE),
      mask: "ll-cross",
      quiz: {
        question: "일자에서 시작하면 공식을 모두 몇 번 칠까요?",
        choices: ["한 번", "두 번", "세 번"],
        answer: 1,
        why: "일자에서 한 번이면 기본형, 기본형에서 한 번이면 십자예요. 모두 두 번이에요.",
      },
    },
    {
      kind: "try",
      body: "일자가 앞뒤로 서 있어요. 공식을 한 번 쳐서 기본형을 보고, 쥔 그대로 한 번 더 쳐 보세요.",
      focus: ["UF", "UB"],
      setup: flip(EO_LINE),
      alg: EO_LINE,
      goal: "yellow-cross",
      mask: "ll-cross",
    },
    {
      kind: "try",
      body: "일자가 가로로 누워 있어요. U로 세우고 공식을 두 번 쳐 보세요.",
      focus: ["UR", "UL"],
      setup: flip(`U ${EO_LINE}`),
      alg: `U ${EO_LINE}`,
      goal: "yellow-cross",
      mask: "ll-cross",
    },
    {
      kind: "turn",
      body: "점이에요. 지금 쥔 그대로 공식을 한 번 쳐 보세요. 노란 스티커 둘이 왼쪽과 오른쪽인 일자가 생겨요.",
      setup: flip(EO_DOT),
      alg: F4,
      mask: "ll-cross",
    },
    {
      kind: "quiz",
      body: "점에서 공식을 한 번 치면 늘 가로 일자가 생겨요. U로 세우고 두 번 더 치면 십자예요.",
      setup: flip(`U ${EO_LINE}`),
      mask: "ll-cross",
      quiz: {
        question: "점에서 시작하면 공식을 모두 몇 번 칠까요?",
        choices: ["한 번", "두 번", "세 번"],
        answer: 2,
        why: "점에서 한 번이면 일자, 일자에서 한 번이면 기본형, 기본형에서 한 번이면 십자예요. 모두 세 번이에요.",
      },
    },
    {
      kind: "try",
      body: "점에서 십자까지 가 보세요. 공식 한 번, U, 공식 두 번 차례예요.",
      setup: flip(EO_DOT),
      alg: EO_DOT,
      goal: "yellow-cross",
      mask: "ll-cross",
    },
    {
      kind: "try",
      body: "이번엔 혼자 십자를 만들어 봐요. 아래 모양 그림대로 쳐요.",
      setup: { rule: "second-layer-solved" },
      goal: "yellow-cross",
      mask: "ll-cross",
      sheet: "beginner-tf-eo",
    },
  ],
};

const edgePlace: Lesson = {
  id: "333-tf-ep",
  size: 3,
  title: "엣지 위치",
  summary:
    "위 층 엣지 넷을 제자리로 옮겨요. 윗면을 돌려 하나만 맞게 하고, 그 하나를 뒤에 두고 공식을 쳐요.",
  steps: [
    {
      kind: "quiz",
      body: "노란 십자가 생겼어요. 그런데 노란 스티커가 위를 본다고 엣지 블럭이 제자리에 있는 건 아니에요. 위 층 엣지 블럭은 옆 색과 같은 색 센터 바로 위가 제자리예요. 이번에는 엣지 넷을 제자리로 옮겨요. 위 층 코너 블럭은 아직 안 보니 회색으로 가려 두었어요.",
      setup: flip(C5),
      mask: "ll-edges",
      quiz: {
        question: "지금 제자리에 든 엣지 블럭은 몇 개일까요?",
        choices: ["하나", "둘", "넷"],
        answer: 0,
        why: "뒤 엣지 블럭 하나만 옆 색이 바로 아래 센터와 같아요.",
      },
    },
    {
      kind: "demo",
      body: "제자리 엣지 블럭이 하나뿐이고 그것이 뒤에 있으면 「엣지 위치」 공식 R' U' R U' R' U2 R을 한 번 쳐요. 뒤 엣지 블럭은 그대로 두고, 나머지 셋을 앞 → 왼쪽 → 오른쪽 → 앞으로 한 칸씩 돌려 넷 다 제자리에 넣어요. 공식은 R' U' R과 R' U2 R, 같은 꼴 둘 사이에 U'를 끼운 거예요. 둘째 덩어리만 가운데가 반 바퀴 U2예요.",
      focus: ["UB"],
      setup: flip(C5),
      alg: C5,
      mask: "ll-edges",
      chunks: [
        {
          moves: "R' U' R",
          says: "오른쪽 층을 내리고, 윗면을 돌리고, 오른쪽 층을 올려요.",
        },
        { moves: "U'", says: "윗면을 반시계 방향으로 한 칸 돌려요." },
        {
          moves: "R' U2 R",
          says: "같은 꼴을 가운데만 반 바퀴로 쳐요. 뒤 엣지 블럭은 그대로이고 나머지 셋이 제자리에 들어요. 위 층 코너 블럭은 흐트러져도 괜찮아요. 다음 단계에서 맞춰요.",
        },
      ],
    },
    gripQuiz(
      "같은 큐브를 네 가지로 쥐었어요. 노란 고리는 제자리 엣지 블럭이에요. 엣지 위치 공식으로 넷을 맞추려면 어떻게 쥘까요?",
      flip(C5),
      ["UB"],
      "ll-edges",
      [
        ["", "제자리 엣지 블럭이 뒤"],
        ["y2", "제자리 엣지 블럭이 앞"],
        ["y", "제자리 엣지 블럭이 오른쪽"],
        ["y'", "제자리 엣지 블럭이 왼쪽"],
      ],
      "엣지 위치 공식은 뒤 엣지 블럭을 그대로 두고 나머지 셋을 옮겨요. 제자리 블럭이 뒤에 오게 쥐어요.",
    ),
    {
      kind: "quiz",
      body: "처음부터 하나만 맞는 일은 드물어서, 윗면을 돌려 그 모양을 만들어요. 윗면을 위에서 보아 반시계 방향으로 한 칸씩(U') 돌리며 제자리 엣지 블럭을 세어, 둘 이상이면 멈춰요. 그런 곳이 꼭 있고, 많아야 세 번이면 찾아요. 그때 모양은 그림의 셋 가운데 하나예요. 넷 다면 끝이에요. 둘이 이웃해 있으면 U'를 한 칸 더 돌려요. 그러면 꼭 하나만 맞아요. 그 하나가 뒤에 오게 큐브를 y로 돌려 쥐고 공식을 쳐요.",
      setup: flip(EP_ADJACENT),
      mask: "ll-edges",
      sheet: "beginner-tf-ep",
      quiz: {
        question:
          "지금은 앞과 왼쪽 엣지 블럭이 제자리예요. 둘이 이웃해 있으면 무엇을 할까요?",
        choices: ["U'를 한 칸 더 돌려 하나만 맞게 해요", "그대로 공식을 쳐요"],
        answer: 0,
        why: "이웃한 둘에서 U'를 한 칸 더 돌리면 하나만 맞아요. 그 하나를 뒤에 두고 쳐요.",
      },
    },
    {
      kind: "try",
      body: "U'로 한 칸 더 돌려 뒤 하나만 맞게 하고 공식을 쳐 보세요.",
      focus: ["UR"],
      setup: flip(EP_ADJACENT),
      alg: EP_ADJACENT,
      goal: "yellow-edges",
      mask: "ll-edges",
    },
    {
      kind: "try",
      body: "이번엔 하나만 맞은 엣지 블럭이 오른쪽에 있어요. 윗면은 돌리지 말고, 큐브를 y로 돌려 쥐어 그것을 뒤로 가져온 뒤 쳐 보세요.",
      focus: ["UL"],
      setup: flip(`y ${C5}`),
      alg: `y ${C5}`,
      goal: "yellow-edges",
      mask: "ll-edges",
    },
    {
      kind: "quiz",
      body: "윗면을 돌려 맞춘 둘이 마주 볼 때도 있어요. 그때는 쥔 그대로 공식을 한 번 쳐요. 그다음 다시 윗면을 반시계 방향으로 돌려 보면 이웃한 둘이 맞는 곳이 생겨요. 거기서부터는 이웃한 둘과 같아요.",
      setup: flip(EP_OPPOSITE),
      mask: "ll-edges",
      quiz: {
        question: "맞춘 둘이 마주 보면 공식을 모두 몇 번 칠까요?",
        choices: ["한 번", "두 번", "세 번"],
        answer: 1,
        why: "쥔 그대로 한 번 치면 이웃한 둘을 찾을 수 있고, 그다음 한 번이면 넷 다 제자리예요. 모두 두 번이에요.",
      },
    },
    {
      kind: "try",
      body: "앞과 뒤 엣지 블럭이 맞고 마주 보고 있어요. 쥔 그대로 공식을 한 번 친 뒤, 윗면을 돌려 이웃한 둘을 찾고 한 칸 더 돌려 쳐 보세요.",
      focus: ["UR", "UL"],
      setup: flip(EP_OPPOSITE),
      alg: EP_OPPOSITE,
      goal: "yellow-edges",
      mask: "ll-edges",
    },
    {
      kind: "try",
      body: "이번엔 혼자 위 층 엣지 넷을 제자리로 옮겨 봐요. 윗면을 반시계 방향으로 돌려 맞는 둘을 찾고, 아래 그림대로 쳐요.",
      setup: { rule: "ll-cross-solved" },
      goal: "yellow-edges",
      mask: "ll-edges",
      sheet: "beginner-tf-ep",
    },
  ],
};

const twist: Lesson = {
  id: "333-tf-twist",
  size: 3,
  title: "코너 방향",
  summary:
    "위 층 코너 블럭의 노란색을 모두 위로 올려요. 모양을 보고 그림처럼 쥔 뒤 공식 하나를 한 번에서 세 번 쳐요.",
  steps: [
    {
      kind: "quiz",
      body: "위 층 엣지 블럭 넷이 제자리에 들었어요. 이번에는 위 층 코너 블럭의 방향을 맞춰요. 방향은 노란색이 어느 쪽을 보는지예요. 노란색을 모두 위로 올려요. 위 층 엣지 블럭은 이미 맞았으니 이제 윗면은 돌리지 않고, 쥘 때는 큐브를 y로 통째로 돌려 쥐어요. 이번 강에서는 위 층 코너 블럭의 노란색만 보니, 코너 블럭의 다른 칸은 회색으로 가려 두었어요.",
      setup: flip(T),
      mask: "ll-twist",
      quiz: {
        question: "노란색이 위를 보는 위 층 코너 블럭은 몇 개일까요?",
        choices: ["하나", "둘", "하나도 없어요"],
        answer: 1,
        why: "앞-오른쪽 위와 뒤-왼쪽 위, 대각선의 둘이 노란색이 위를 봐요.",
      },
    },
    {
      kind: "quiz",
      body: "위 엣지가 맞은 윗면은 그림의 여덟 모양 가운데 하나예요. 위를 보는 노란색이 둘인 모양 셋, 하나인 모양 둘, 하나도 없는 모양 둘, 넷 다인 모양이에요. 그림은 모양마다 쥘 모습대로 놓았고, 아래쪽이 앞이에요. 둘이 대각선인 모양을 설명서는 「기본형」이라고 불러요. 기본형은 그림처럼 쥐고 공식을 한 번 치면 다 맞아요.",
      setup: flip(T),
      mask: "ll-twist",
      sheet: "beginner-tf-twist",
      quiz: {
        question: "이 큐브의 윗면은 어느 모양일까요?",
        choices: [
          "기본형(둘이 대각선)",
          "둘, 옆을 보는 둘이 한 면",
          "하나도 없음",
        ],
        answer: 0,
        why: "위를 보는 둘이 대각선이에요. 앞-왼쪽 위 노란색은 왼쪽, 뒤-오른쪽 위 노란색은 뒤를 봐요. 그림의 기본형과 같은 모습이에요.",
      },
    },
    {
      kind: "demo",
      body: "지금이 기본형을 쥘 모습이에요. 「코너 방향」 공식 R' F' L' F R F' L F를 한 번 치면 다 맞아요. 이 공식은 코너 블럭 넣기 F' R F R'와 같은 꼴이에요. 코너 블럭 넣기는 F'로 흐트러뜨리고, R 한 수로 옮기고, F와 R'로 차례로 되돌렸어요. 이 공식은 R'로 흐트러뜨리고, 한 수 대신 덩어리 F' L' F로 옮기고, R로 되돌린 뒤, 그 덩어리를 되돌리는 F' L F를 쳐요. 되돌리는 덩어리는 가운데 L'만 L로 바뀌어요.",
      focus: ["URF", "ULB"],
      setup: flip(T),
      alg: T,
      chunks: [
        {
          moves: "R'",
          says: "오른쪽 층을 돌려 흐트러뜨려요. 앞-오른쪽 위 코너 블럭이 앞-오른쪽 아래로 내려가요.",
        },
        {
          moves: "F' L' F",
          says: "옮기는 덩어리예요. 앞-왼쪽 위 코너 블럭을 앞-오른쪽 위로 옮겨요. 내려간 블럭은 건드리지 않아요.",
        },
        {
          moves: "R",
          says: "오른쪽 층을 되돌려요. 내려갔던 코너 블럭이 위 층으로 돌아와요.",
        },
        {
          moves: "F' L F",
          says: "덩어리를 되돌려요. 아래 두 층과 위 엣지는 모두 돌아오고, 위 층 코너 셋만 자리와 노란색 방향이 바뀌어요. 뒤-왼쪽 위 코너 블럭은 그대로예요.",
        },
      ],
    },
    {
      kind: "demo",
      body: "나머지 모양도 그림처럼 쥐고 공식을 한 번 치면 다음 모양으로 가요. 아래 그림은 모양마다 그렇게 쥐고 한 번 치면 어느 모양이 되는지 화살표로 이은 관계도예요. 위를 보는 노란색이 하나도 없으면 둘이나 하나인 모양으로, 둘이나 하나인 모양은 모두 기본형으로, 기본형은 다 맞음으로 가요. 어느 모양에서 시작해도 공식을 많아야 세 번 치면 다 맞아요. 화살표 하나가 공식 한 번이에요. 시연은 맨 위 「없음, 둘인 면 하나」에서 공식을 한 번 쳐서 화살표가 가리키는 「둘, 옆이 한 면」이 되는 것을 보여요. 관계도에서 다른 모양을 누르면 그 모양에서 한 번 치는 시연으로 바뀌어요.",
      focus: ["UFL", "ULB"],
      setup: flip(TW_BAR),
      alg: T,
      mask: "ll-twist",
      sheet: "tf-flow",
    },
    gripQuiz(
      "같은 큐브를 네 가지로 쥐었어요. 노란 고리는 노란색이 위를 보는 코너 블럭 둘이에요. 코너 방향 공식 한 번으로 다 맞추려면 어떻게 쥘까요?",
      flip(T),
      ["URF", "ULB"],
      "ll-twist",
      [
        ["y2", "위를 보는 둘이 앞-오른쪽과 뒤-왼쪽, 앞-왼쪽 위 노란색이 앞"],
        ["", "위를 보는 둘이 앞-오른쪽과 뒤-왼쪽, 앞-왼쪽 위 노란색이 왼쪽"],
        [
          "y",
          "위를 보는 둘이 앞-왼쪽과 뒤-오른쪽, 앞-오른쪽 위 노란색이 오른쪽",
        ],
        ["y'", "위를 보는 둘이 앞-왼쪽과 뒤-오른쪽, 앞-오른쪽 위 노란색이 앞"],
      ],
      "기본형은 위를 보는 둘이 앞-오른쪽 위와 뒤-왼쪽 위이고, 앞-왼쪽 위 노란색이 왼쪽을 볼 때 공식 한 번으로 다 맞아요.",
    ),
    {
      kind: "quiz",
      body: "관계도로 횟수를 세어 봐요. 지금 큐브는 위를 보는 노란색이 하나도 없어요.",
      setup: flip(TW_BAR),
      mask: "ll-twist",
      quiz: {
        question:
          "위를 보는 노란색이 하나도 없는 모양에서 시작하면 공식을 모두 몇 번 칠까요?",
        choices: ["한 번", "두 번", "세 번"],
        answer: 2,
        why: "하나도 없음 → 둘이나 하나 → 기본형 → 다 맞음으로 한 번씩, 모두 세 번이에요.",
      },
    },
    {
      kind: "try",
      body: "기본형을 다르게 돌려 놓았어요. 그림처럼 위를 보는 둘이 앞-오른쪽 위와 뒤-왼쪽 위에, 앞-왼쪽 위 노란색이 왼쪽을 보게 큐브를 y로 돌려 쥐고 공식을 한 번 쳐 보세요.",
      focus: ["UBR", "UFL"],
      setup: flip(`y ${T}`),
      alg: `y ${T}`,
      goal: "oll",
      mask: "ll-twist",
    },
    {
      kind: "try",
      body: "위를 보는 둘이 왼쪽에 있고, 오른쪽 둘의 노란색이 앞과 뒤를 봐요. 위를 보는 둘이 왼쪽인 그대로 한 번 치면 기본형이 돼요. 쥔 그대로 한 번 더 쳐 보세요.",
      focus: ["UFL", "ULB"],
      setup: flip(TW_A),
      alg: TW_A,
      goal: "oll",
      mask: "ll-twist",
    },
    {
      kind: "try",
      body: "위를 보는 둘이 오른쪽에 있고, 왼쪽 둘의 노란색이 모두 왼쪽을 봐요. 그대로 한 번 친 뒤, 기본형 모습이 되게 y로 돌려 쥐고 한 번 더 쳐 보세요.",
      focus: ["URF", "UBR"],
      setup: flip(TW_B),
      alg: TW_B,
      goal: "oll",
      mask: "ll-twist",
    },
    {
      kind: "try",
      body: "위를 보는 노란색이 뒤-왼쪽 위 하나이고, 앞-왼쪽 위 노란색이 앞을 봐요. 그대로 한 번 친 뒤, 기본형 모습이 되게 y2로 돌려 쥐고 한 번 더 쳐 보세요.",
      focus: ["ULB"],
      setup: flip(TW_C),
      alg: TW_C,
      goal: "oll",
      mask: "ll-twist",
    },
    {
      kind: "try",
      body: "위를 보는 노란색이 앞-오른쪽 위 하나이고, 앞-왼쪽 위 노란색이 왼쪽을 봐요. 그대로 한 번 친 뒤, 기본형 모습이 되게 y'로 돌려 쥐고 한 번 더 쳐 보세요.",
      focus: ["URF"],
      setup: flip(TW_D),
      alg: TW_D,
      goal: "oll",
      mask: "ll-twist",
    },
    {
      kind: "try",
      body: "위를 보는 노란색이 없고, 마주 보는 두 옆면에 노란색이 둘씩 있어요. 둘씩이 앞과 뒤를 보는 그대로 한 번 치면 하나인 모양이 돼요. 관계도대로 이어서 쳐 보세요.",
      setup: flip(TW_CROSS),
      alg: TW_CROSS,
      goal: "oll",
      mask: "ll-twist",
    },
    {
      kind: "try",
      body: "위를 보는 노란색이 없고, 노란색 둘인 옆면이 왼쪽에 하나 있어요. 그대로 한 번 치면 둘인 모양이 돼요. 관계도대로 이어서 쳐 보세요.",
      focus: ["UFL", "ULB"],
      setup: flip(TW_BAR),
      alg: TW_BAR,
      goal: "oll",
      mask: "ll-twist",
    },
    {
      kind: "try",
      body: "이번엔 혼자 위 층 코너 블럭 넷의 노란색을 모두 위로 올려 봐요. 모양을 보고 아래 관계도대로 쥐고 쳐요.",
      setup: { rule: "ll-edges-solved" },
      goal: "oll",
      mask: "ll-twist",
      sheet: "tf-flow",
    },
  ],
};

const place: Lesson = {
  id: "333-tf-place",
  size: 3,
  title: "코너 위치",
  summary:
    "위 층 코너 블럭 넷을 제자리로 옮겨 다 맞춰요. 제자리 코너 블럭과 같은 색이 나란한 옆면으로 쥐는 법을 정하고, 남은 코너 블럭 셋을 돌리는 공식 둘 가운데 하나를 한 번, 제자리 코너 블럭이 없으면 한 번 더 쳐요.",
  steps: [
    {
      kind: "quiz",
      body: "위 층 코너 블럭의 노란색이 모두 위를 봐요. 이제 위 층 코너 블럭 넷을 제자리로 옮기면 다 맞아요. 코너 블럭의 제자리는 세 색과 같은 색 센터 셋이 만나는 구석이에요. 윗면은 여전히 돌리지 않고 큐브를 y로 돌려 쥐어요.",
      setup: flip(A),
      quiz: {
        question: "지금 제자리에 든 위 층 코너 블럭은 몇 개일까요?",
        choices: ["하나도 없어요", "하나예요", "넷이에요"],
        answer: 1,
        why: "앞-오른쪽 위 코너 블럭 하나만 제자리예요.",
      },
    },
    {
      kind: "quiz",
      body: "옆면을 보면, 위 층 코너 블럭 둘의 스티커가 같은 색으로 나란한 옆면이 있어요. 자동차 앞 등 두 개처럼 보여서 「헤드라이트」라고 불러요. 제자리 코너 블럭이 하나인 모양에는 헤드라이트가 꼭 한 군데 있어요. 쥐는 법은 이 헤드라이트로 정해요.",
      setup: flip(A),
      quiz: {
        question: "헤드라이트는 어느 옆면에 있을까요?",
        choices: ["왼쪽 면", "오른쪽 면", "뒤 면"],
        answer: 0,
        why: "왼쪽 면의 위 층 코너 블럭 두 스티커가 같은 색으로 나란해요.",
      },
    },
    {
      kind: "quiz",
      body: "제자리 코너 블럭을 세면 넷, 하나, 하나도 없음 가운데 하나예요. 둘이나 셋만 제자리인 모양은 나오지 않아요. 하나면 이렇게 쥐어요. 제자리 코너 블럭이 앞면 위에 오고, 헤드라이트가 왼쪽 면이나 오른쪽 면에 오게 큐브를 y로 돌려 쥐어요. 그렇게 쥐는 방향은 하나뿐이에요. 헤드라이트가 왼쪽 면이면(제자리 블럭은 앞-오른쪽 위) 공식 A, 오른쪽 면이면(제자리 블럭은 앞-왼쪽 위) 공식 B를 쳐요. 하나도 없으면 공식 A를 한 번 쳐서 하나를 만들고 같은 법으로 쥐어요.",
      setup: flip(A),
      sheet: "beginner-tf-place",
      quiz: {
        question: "지금 큐브는 어떻게 쥐고 무엇을 칠까요?",
        choices: ["그대로 공식 A", "그대로 공식 B", "y로 돌려 쥐고 공식 B"],
        answer: 0,
        why: "제자리 블럭이 앞-오른쪽 위, 헤드라이트가 왼쪽 면이에요. 그대로 공식 A예요.",
      },
    },
    {
      kind: "demo",
      body: "제자리 코너 블럭이 앞-오른쪽 위, 헤드라이트가 왼쪽 면이에요. 공식 A(R U B L B' R' B L' B' R U' R')를 쳐요. 앞-오른쪽 위는 그대로이고 남은 셋이 위에서 보아 시계 방향으로 한 칸씩 옮겨요. 열두 수지만 손으로 외우기 쉬워요. 앞은 「올리고 돌리고」, 가운데는 뒷면을 타고 「왼쪽으로 가서 내리고, 오른쪽으로 와서 내리고, 왼쪽으로 가서 올리고, 오른쪽으로 와서 올리고」, 끝은 앞을 되돌리는 「돌리고 내리고」예요. 올리고 내리는 것은 앞면에서 본 왼쪽·오른쪽 층의 움직임이에요.",
      focus: ["URF", "UFL", "ULB"],
      setup: flip(A),
      alg: A,
      chunks: [
        {
          moves: "R U",
          says: "올리고 돌리고. 오른쪽 층을 올리고 윗면을 돌려요.",
        },
        {
          moves: "B L",
          says: "뒷면을 돌려 왼쪽으로 가서, 왼쪽 층을 내려요.",
        },
        {
          moves: "B' R'",
          says: "뒷면을 되돌려 오른쪽으로 와서, 오른쪽 층을 내려요.",
        },
        {
          moves: "B L'",
          says: "다시 왼쪽으로 가서, 이번에는 왼쪽 층을 올려요.",
        },
        {
          moves: "B' R",
          says: "오른쪽으로 와서, 오른쪽 층을 올려요.",
        },
        {
          moves: "U' R'",
          says: "돌리고 내리고. 앞의 「올리고 돌리고」를 되돌려요. 아래 두 층과 위 엣지는 모두 돌아오고, 앞-오른쪽 위는 그대로, 남은 위 층 코너 셋이 시계 방향으로 한 칸씩 옮겨 있어요.",
        },
      ],
    },
    gripQuiz(
      "같은 큐브를 네 가지로 쥐었어요. 노란 고리는 제자리 코너 블럭과 헤드라이트 둘이에요. 공식 A로 맞추려면 어떻게 쥘까요?",
      flip(A),
      ["URF", "UFL", "ULB"],
      undefined,
      [
        ["y", "제자리 블럭이 앞-왼쪽 위, 헤드라이트가 뒤"],
        ["y'", "제자리 블럭이 뒤-오른쪽 위, 헤드라이트가 앞"],
        ["", "제자리 블럭이 앞-오른쪽 위, 헤드라이트가 왼쪽"],
        ["y2", "제자리 블럭이 뒤-왼쪽 위, 헤드라이트가 오른쪽"],
      ],
      "공식 A는 앞-오른쪽 위 제자리 블럭을 그대로 두고 남은 셋을 옮겨요. 제자리 블럭이 앞-오른쪽 위에, 헤드라이트가 왼쪽 면에 오게 쥐어요.",
    ),
    {
      kind: "try",
      body: "제자리 코너 블럭이 앞면 위에 있지 않아요. 제자리 블럭이 앞면 위에, 헤드라이트가 왼쪽이나 오른쪽 면에 오게 y로 돌려 쥐고 쳐 보세요.",
      focus: ["UBR", "URF", "UFL"],
      setup: flip(`y ${A}`),
      alg: `y ${A}`,
      goal: "solved",
    },
    {
      kind: "quiz",
      body: "제자리 코너 블럭이 앞-오른쪽 위에 있지만, 헤드라이트가 뒤 면에 있어요. 이렇게 쥐면 안 돼요. 제자리 블럭이 앞면 위에 있으면서 헤드라이트가 왼쪽이나 오른쪽 면에 오는 방향을 찾아 돌려 쥐어요.",
      focus: ["URF", "UBR", "ULB"],
      setup: flip(`y ${B}`),
      quiz: {
        question: "어떻게 쥐고 무엇을 칠까요?",
        choices: [
          "그대로 공식 A",
          "y로 돌려 쥐어 헤드라이트를 오른쪽 면에 두고 공식 B",
        ],
        answer: 1,
        why: "y로 돌려 쥐면 제자리 블럭이 앞-왼쪽 위, 헤드라이트가 오른쪽 면에 와요. 헤드라이트가 오른쪽이면 공식 B예요.",
      },
    },
    {
      kind: "demo",
      body: "공식 B(L' U' B' R' B L B' R B L' U L)는 공식 A를 좌우로 바꾼 꼴이에요. 왼쪽과 오른쪽만 바꿔 같은 말로 쳐요. 「올리고 돌리고」를 왼쪽 층으로 하고, 뒷면을 타고 오른쪽으로 먼저 가요. 제자리 블럭이 앞-왼쪽 위, 헤드라이트가 오른쪽 면일 때 쳐요. 앞-왼쪽 위는 그대로 두고 남은 셋을 반시계 방향으로 옮겨요.",
      focus: ["UFL", "URF", "UBR"],
      setup: flip(B),
      alg: B,
      chunks: [
        {
          moves: "L' U'",
          says: "올리고 돌리고. 왼쪽 층을 올리고 윗면을 돌려요.",
        },
        {
          moves: "B' R'",
          says: "뒷면을 돌려 오른쪽으로 가서, 오른쪽 층을 내려요.",
        },
        {
          moves: "B L",
          says: "뒷면을 되돌려 왼쪽으로 와서, 왼쪽 층을 내려요.",
        },
        {
          moves: "B' R",
          says: "다시 오른쪽으로 가서, 이번에는 오른쪽 층을 올려요.",
        },
        {
          moves: "B L'",
          says: "왼쪽으로 와서, 왼쪽 층을 올려요.",
        },
        {
          moves: "U L",
          says: "돌리고 내리고. 앞을 되돌려요. 위 층 코너 셋이 반시계 방향으로 한 칸씩 옮겨 있어요.",
        },
      ],
    },
    {
      kind: "try",
      body: "앞 문제의 모양이에요. y로 돌려 쥐어 헤드라이트를 오른쪽 면에 두고 공식 B를 한 번 쳐 보세요.",
      focus: ["URF", "UBR", "ULB"],
      setup: flip(`y ${B}`),
      alg: `y ${B}`,
      goal: "solved",
    },
    {
      kind: "quiz",
      body: "제자리 코너 블럭이 하나도 없을 때가 있어요. 코너 블럭 둘씩이 서로 자리를 바꾼 모양이에요.",
      setup: flip(PLACE_NONE),
      quiz: {
        question: "제자리 코너 블럭이 없어요. 어떻게 할까요?",
        choices: [
          "지금 쥔 그대로 공식 A를 한 번 쳐요",
          "윗면을 돌려 코너 블럭을 맞춰요",
        ],
        answer: 0,
        why: "아무 방향으로 쥐고 공식 A를 한 번 치면 제자리 코너 블럭이 꼭 하나 생겨요. 그다음은 하나일 때처럼 해요. 윗면을 돌리면 맞춘 엣지 블럭이 비켜나요.",
      },
    },
    {
      kind: "try",
      body: "그대로 공식 A를 한 번 치면 제자리 코너 블럭이 하나 생겨요. 제자리 블럭이 앞면 위에, 헤드라이트가 왼쪽이나 오른쪽 면에 오게 쥐고 한 번 더 쳐 보세요.",
      setup: flip(PLACE_NONE),
      alg: PLACE_NONE,
      goal: "solved",
    },
    {
      kind: "try",
      body: "제자리 코너 블럭이 또 없어요. 그대로 공식 A를 한 번 치고, 같은 법으로 쥐어 헤드라이트가 왼쪽이면 공식 A, 오른쪽이면 공식 B로 맞춰요.",
      setup: flip(PLACE_NONE_B),
      alg: PLACE_NONE_B,
      goal: "solved",
    },
    {
      kind: "try",
      body: "이번엔 혼자 끝까지 맞춰 봐요. 제자리 코너 블럭을 세어, 하나면 헤드라이트로 쥐고, 없으면 공식 A를 먼저 쳐요. 이것까지 맞추면 코너 방향 먼저 해법을 다 배운 거예요!",
      setup: { rule: "ll-corners-unplaced" },
      goal: "solved",
    },
  ],
};

/** 3×3 초보자(코너 방향 먼저), 신광사 설명서 일곱 단계 */
export const TWIST_FIRST_333: Course = {
  id: "333-twist-first",
  size: 3,
  title: "코너 방향 먼저 맞추기",
  summary:
    "예전 문방구 신광사 큐브 설명서의 해법이에요. 설명서 공식으로 흰 십자, 첫 층 코너, 둘째 층 엣지, 엣지 방향, 엣지 위치, 코너 방향, 코너 위치 차례로 맞춰요.",
  lessons: [cross, corners, second, edgeFlip, edgePlace, twist, place],
};
