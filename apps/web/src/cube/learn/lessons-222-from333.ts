// 3×3을 아는 사람의 2×2(2026-11-04 사용자 요청): 2×2는 3×3의 꼭짓점만 남긴 큐브라
// 3×3 초보자 과정의 꼭짓점 단계(첫 층 꼭짓점·꼭짓점 자리·꼭짓점 방향)를 같은 이름·같은 공식으로 그대로 쓴다.
// 다른 점은 둘: 가운데가 없어 제자리를 꼭짓점끼리의 관계로 보고, 모서리 단계(흰 십자·둘째 층·노란 십자·옆면 맞추기)가 없다.
// 모서리가 없으니 「꼭짓점 자리」에서 윗면(U)을 돌려도 된다. 그래서 제자리 꼭짓점이 꼭 하나인 U 자리를 찾는다.
// 공식 상수는 3×3 레슨에서 가져오고, 판정은 2×2 목표(2x2-first-layer·2x2-corners-placed·solved)를 쓴다.
import { firstLayerUpSteps, T_PERM, Y_PERM } from "./lessons-222";
import { CORNER_CYCLE, CORNER_TWIST, TWIST_TWO } from "./lessons-333";
import { setupFor } from "./notation";
import type { Course, Lesson } from "./types";

const flip = (solution: string) => ({ alg: setupFor(solution, "z2") });

/** 2×2 대각 바꿈(Y퍼뮤 상황, 어느 U에서도 제자리가 꼭 하나가 아님) */
export const DIAGONAL_222 = Y_PERM;
/** 그 풀이: U로 제자리 0인 자리 → 한 번 → 앞-왼쪽 위가 제자리 → y'로 쥐고 한 번(from333.test.ts가 확인) */
export const DIAGONAL_222_SOLVE = `U ${CORNER_CYCLE} y' ${CORNER_CYCLE}`;
/** 이웃 둘 바뀜(T퍼뮤 상황): U 한 번이면 앞-오른쪽 위가 제자리 하나 → 한 번 */
export const NEIGHBORS_222_SOLVE = `U ${CORNER_CYCLE}`;

const corners: Lesson = {
  id: "222-from333-corners",
  size: 2,
  title: "2×2는 3×3의 꼭짓점이에요",
  summary: "3×3에서 모서리와 가운데를 지우면 2×2. 꼭짓점 공식은 그대로 써요.",
  steps: [
    {
      kind: "quiz",
      body: "위 그림은 3×3에서 모서리와 가운데를 까맣게 지운 모습이고, 아래는 2×2예요. 3×3에서 모서리와 가운데를 지우면 2×2가 돼요. 그래서 3×3을 맞출 줄 알면 2×2도 맞출 수 있어요.",
      beside: {
        size: 3,
        caption: "3×3에서 꼭짓점만 보이게 한 모습",
        mask: "corners",
      },
      mask: "all",
      quiz: {
        question: "3×3 공식 중 2×2에서도 그대로 쓸 수 있는 것은?",
        choices: [
          `꼭짓점만 바꾸거나, 모서리는 흐트러져도 되는 공식(${CORNER_TWIST}, ${CORNER_CYCLE})`,
          "모서리만 옮기는 공식(옆면 맞추기)",
          "가운데 줄을 돌리는 공식(M)",
        ],
        answer: 0,
        why: "2×2에는 모서리와 가운데가 없어요. 꼭짓점이 3×3에서와 똑같이 움직이는 공식이면 그대로 돼요.",
      },
    },
    {
      kind: "quiz",
      body: `둘 다 ${CORNER_TWIST}를 한 큐브예요. 3×3에서는 모서리도 흐트러지지만, 꼭짓점만 보면 2×2와 똑같아요.`,
      beside: {
        size: 3,
        caption: `3×3에 ${CORNER_TWIST}(꼭짓점만 보임)`,
        setup: { alg: CORNER_TWIST },
        mask: "corners",
      },
      setup: { alg: CORNER_TWIST },
      mask: "all",
      quiz: {
        question: `${CORNER_TWIST}는 3×3에서 모서리도 움직여요. 2×2에서 써도 될까요?`,
        choices: [
          "네, 2×2에는 모서리가 없으니 꼭짓점 움직임만 보면 돼요",
          "아니요, 모서리가 흐트러지니 못 써요",
        ],
        answer: 0,
        why: "꼭짓점이 3×3과 똑같이 움직여요. 그래서 첫 층 꼭짓점 공식을 그대로 써요.",
      },
    },
    {
      kind: "find",
      body: "다른 점 하나: 2×2에는 가운데가 없어서 면 색을 정해 주지 않아요. 먼저 맞출 꼭짓점 하나를 기준으로 정하고, 다른 꼭짓점을 그 기준에 맞춰 놓아요. 흰-초록-빨강 꼭짓점을 기준으로 삼을게요. 찾아 눌러 보세요.",
      setup: { alg: "R U F" },
      mask: "all",
      find: { piece: "corner", colors: ["U", "F", "R"] },
    },
    {
      kind: "quiz",
      body: "3×3에서는 조각의 제자리를 가운데 색으로 판단했어요.",
      setup: { alg: "R U F" },
      mask: "all",
      quiz: {
        question: "2×2에서는 꼭짓점의 제자리를 무엇으로 판단할까요?",
        choices: [
          "아래층 꼭짓점끼리 옆색이 이어지는지로",
          "면 가운데 칸의 색으로",
          "흰 칸이 몇 개 위를 보는지로",
        ],
        answer: 0,
        why: "기준 꼭짓점 옆에 붙는 꼭짓점은 옆색이 이어져야 해요. 예를 들어 흰-초록-빨강 옆에는 흰-초록-주황이 와요.",
      },
    },
    {
      kind: "quiz",
      body: "다른 점 둘: 2×2에는 모서리가 없어요.",
      mask: "all",
      quiz: {
        question: "3×3 초보자 과정에서 2×2에는 없는 단계는?",
        choices: [
          "흰 십자, 둘째 층 모서리, 노란 십자, 옆면 맞추기",
          "첫 층 꼭짓점과 꼭짓점 자리",
          "꼭짓점 방향",
        ],
        answer: 0,
        why: "모두 모서리를 맞추는 단계예요. 2×2는 첫 층 → 꼭짓점 자리 → 꼭짓점 방향, 세 단계면 끝나요.",
      },
    },
  ],
};

const firstLayer: Lesson = {
  id: "222-from333-first-layer-up",
  size: 2,
  title: "첫 층",
  summary: "3×3의 「첫 층 꼭짓점」과 같아요. 흰 면 위에서 R' D' R D 하나로.",
  steps: [
    ...firstLayerUpSteps(
      "3×3에서 했던 「첫 층 꼭짓점」 단계와 같아요. 흰 면을 위에 두고, 아래층의 흰 꼭짓점을 칸 밑으로 옮겨 R' D' R D를 되풀이해요. 먼저 기준이 될 흰 꼭짓점을 아무거나 하나 눌러 보세요.",
    ),
    {
      kind: "quiz",
      body: "2×2만의 함정: 첫 층이 다 됐는데 옆에서 보면 위층과 색이 어긋나 보일 수 있어요. 3×3에는 가운데가 있어 이렇게 보이지 않았어요.",
      setup: { alg: "z2 U" },
      mask: "all",
      quiz: {
        question:
          "아래층 흰 꼭짓점 넷은 옆색까지 서로 이어져요. 첫 층이 틀렸을까요?",
        choices: [
          "아니요, 첫 층은 맞아요. 위층은 U를 돌려 맞추면 돼요",
          "네, 처음부터 다시 해야 해요",
        ],
        answer: 0,
        why: "가운데가 없으니 층끼리 어긋나 보여도 U나 D를 돌리면 맞아요.",
      },
    },
  ],
};

const cornerPlace: Lesson = {
  id: "222-from333-corner-place",
  size: 2,
  title: "꼭짓점 자리",
  summary:
    "3×3의 「꼭짓점 자리」와 같아요. U R U' L' U R' U' L, 다만 윗면을 돌려 제자리를 찾아요.",
  steps: [
    {
      kind: "quiz",
      body: "3×3에서 했던 「꼭짓점 자리」 단계와 같아요. 방향은 상관없이, 위 꼭짓점의 두 옆색이 그 밑 아래층 꼭짓점의 옆색과 이어지면 제자리예요. 3×3과 다른 점: 위 모서리가 없으니 윗면(U)을 돌려도 돼요. U를 돌려 가며 제자리 꼭짓점이 꼭 하나인 자리를 찾아 그것을 앞-오른쪽 위에 둬요.",
      setup: flip(`U ${CORNER_CYCLE}`),
      mask: "all",
      quiz: {
        question:
          "지금은 제자리 꼭짓점이 둘이에요. 공식을 하기 전에 무엇을 할까요?",
        choices: [
          "U를 돌려 제자리가 꼭 하나인 자리를 찾아요",
          "그대로 공식을 해요",
          "처음부터 다시 해요",
        ],
        answer: 0,
        why: "제자리가 둘인 자리에서는 공식이 맞지 않아요. U를 한 칸 돌리면 제자리가 하나가 돼요.",
      },
    },
    {
      kind: "try",
      body: "U로 제자리가 하나인 자리를 찾고(U), 그 꼭짓점이 앞-오른쪽 위에 있으니 공식을 해요.",
      setup: flip(`U ${CORNER_CYCLE}`),
      alg: `U ${CORNER_CYCLE}`,
      goal: "2x2-corners-placed",
      mask: "all",
    },
    {
      kind: "try",
      body: "3×3처럼 한 번에 안 되면 같은 쥐는 법으로 한 번 더 해요.",
      setup: flip(`${CORNER_CYCLE} ${CORNER_CYCLE}`),
      alg: `${CORNER_CYCLE} ${CORNER_CYCLE}`,
      goal: "2x2-corners-placed",
      mask: "all",
    },
    {
      kind: "quiz",
      body: "2×2만의 함정: 대각선 두 꼭짓점이 바뀌어 있으면 U를 어떻게 돌려도 제자리가 둘이거나 없어요.",
      setup: flip(DIAGONAL_222),
      mask: "all",
      quiz: {
        question: "U를 돌려도 제자리가 꼭 하나인 자리가 없어요. 어떻게 할까요?",
        choices: [
          "제자리가 없는 자리에서 아무 쪽으로나 공식을 한 번 하고 다시 찾아요",
          "제자리가 둘인 자리에서 공식을 해요",
        ],
        answer: 0,
        why: "한 번 하면 U로 제자리가 하나인 자리가 생겨요. 그다음은 앞의 방법대로 해요.",
      },
    },
    {
      kind: "try",
      body: "대각선 두 꼭짓점이 바뀌었어요. U를 돌려 제자리가 없는 자리에서 한 번 하고, 생긴 제자리 꼭짓점(앞-왼쪽 위)을 앞-오른쪽 위로 쥐고(y') 다시.",
      setup: flip(DIAGONAL_222),
      alg: DIAGONAL_222_SOLVE,
      goal: "2x2-corners-placed",
      mask: "all",
    },
    {
      kind: "try",
      body: "이웃한 두 꼭짓점이 바뀐 상황이에요. U를 돌려 제자리가 하나인 자리를 찾고 공식.",
      setup: { alg: setupFor(T_PERM, "z2") },
      alg: NEIGHBORS_222_SOLVE,
      goal: "2x2-corners-placed",
      mask: "all",
    },
    {
      kind: "try",
      body: "첫 층이 맞은 2×2에서 꼭짓점 자리를 맞춰요.",
      setup: { rule: "2x2-first-layer-solved" },
      goal: "2x2-corners-placed",
      mask: "all",
    },
  ],
};

const cornerTwist: Lesson = {
  id: "222-from333-corner-twist",
  size: 2,
  title: "꼭짓점 방향",
  summary:
    "3×3의 「꼭짓점 방향」과 같아요. R' D' R D를 꼭짓점마다 2번 또는 4번.",
  steps: [
    {
      kind: "quiz",
      body: "3×3에서 했던 「꼭짓점 방향」 단계와 같아요. 풀 꼭짓점을 앞-오른쪽 위에 두고 노란색이 위를 볼 때까지 R' D' R D, 다음 꼭짓점은 윗면(U)만 돌려 가져와요. 중간에 아래층이 흐트러져도 끝나면 돌아와요.",
      setup: flip(TWIST_TWO),
      mask: "all",
      quiz: {
        question:
          "앞-오른쪽 위 꼭짓점의 노란색이 오른쪽을 봐요. R' D' R D를 몇 번 할까요?",
        choices: ["두 번", "네 번", "여섯 번"],
        answer: 0,
        why: "3×3과 같아요. 오른쪽이면 두 번, 앞이면 네 번이에요.",
      },
    },
    {
      kind: "try",
      body: "두 번 → U → 네 번 → 마지막에 윗면을 돌려 맞춰요.",
      setup: flip(TWIST_TWO),
      alg: TWIST_TWO,
      goal: "solved",
      mask: "all",
    },
    {
      kind: "try",
      body: "다 맞은 것 같은데 옆색이 층마다 어긋나 보여요. U나 D를 돌려 맞춰요.",
      setup: { alg: "z2 D" },
      alg: "D'",
      goal: "solved",
    },
    {
      kind: "try",
      body: "꼭짓점 자리까지 맞은 2×2를 끝내요.",
      setup: { rule: "2x2-corners-placed" },
      goal: "solved",
      mask: "all",
    },
  ],
};

export const FROM_333_222: Course = {
  id: "222-from333",
  size: 2,
  title: "3×3을 아는 사람의 2×2",
  summary:
    "3×3 초보자 과정을 마쳤다면: 꼭짓점 단계만 떠올려 같은 공식 둘로 맞춰요.",
  lessons: [corners, firstLayer, cornerPlace, cornerTwist],
  recommendAfter: "333-beginner",
};
