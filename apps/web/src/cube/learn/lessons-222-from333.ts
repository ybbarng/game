// 3×3을 아는 사람의 2×2(2026-11-04 사용자 요청): 2×2는 3×3의 꼭짓점만 남긴 큐브라
// 3×3 초보자 과정의 꼭짓점 단계(첫 층 꼭짓점·노란 면·위 꼭짓점 자리)를 같은 이름·같은 공식으로 그대로 쓴다.
// 다른 점은 둘: 가운데가 없어 제자리를 꼭짓점끼리의 관계로 보고, 모서리 단계(흰 십자·둘째 층·노란 십자·위 모서리)가 없다.
// 공식 상수는 3×3 레슨에서 가져오고, 판정은 2×2 목표(2x2-first-layer·2x2-top-face·solved)를 쓴다.
import { T_PERM, Y_PERM } from "./lessons-222";
import { A_PERM, SEXY, SUNE } from "./lessons-333";
import { setupFor } from "./notation";
import type { Course, Lesson } from "./types";

const flip = (solution: string) => ({ alg: setupFor(solution, "z2") });

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
          "꼭짓점만 바꾸거나, 모서리는 흐트러져도 되는 공식(R U R' U', 수네, A퍼뮤)",
          "모서리만 옮기는 공식(U퍼뮤)",
          "가운데 줄을 돌리는 공식(M)",
        ],
        answer: 0,
        why: "2×2에는 모서리와 가운데가 없어요. 꼭짓점이 3×3에서와 똑같이 움직이는 공식이면 그대로 돼요.",
      },
    },
    {
      kind: "quiz",
      body: `둘 다 ${SEXY}를 한 큐브예요. 3×3에서는 모서리도 흐트러지지만, 꼭짓점만 보면 2×2와 똑같아요.`,
      beside: {
        size: 3,
        caption: `3×3에 ${SEXY}(꼭짓점만 보임)`,
        setup: { alg: SEXY },
        mask: "corners",
      },
      setup: { alg: SEXY },
      mask: "all",
      quiz: {
        question: `${SEXY}는 3×3에서 모서리도 움직여요. 2×2에서 써도 될까요?`,
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
          "흰 십자, 둘째 층 모서리, 노란 십자, 위 모서리 자리",
          "첫 층 꼭짓점과 노란 면",
          "위 꼭짓점 자리",
        ],
        answer: 0,
        why: "모두 모서리를 맞추는 단계예요. 2×2는 첫 층 → 노란 면 → 위 꼭짓점 자리, 세 단계면 끝나요.",
      },
    },
  ],
};

const firstLayer: Lesson = {
  id: "222-from333-first-layer",
  size: 2,
  title: "첫 층",
  summary: "3×3의 「첫 층 꼭짓점」과 같아요. R U R' U' 하나로.",
  steps: [
    {
      kind: "look",
      body: "3×3에서 했던 「첫 층 꼭짓점」 단계와 같아요. 흰 꼭짓점 하나를 아래층 기준으로 두고 큐브를 뒤집어 흰 면을 아래로 보내 보세요.",
      mask: "first-layer",
      look: { color: "U", on: "D" },
    },
    {
      kind: "quiz",
      body: "3×3처럼 넣을 자리 위(앞-오른쪽 위)로 옮기고 R U R' U'을 되풀이해요. 횟수도 같아요: 흰색이 오른쪽이면 한 번, 위면 세 번, 앞이면 다섯 번.",
      setup: flip(`${SEXY} ${SEXY} ${SEXY}`),
      mask: "first-layer",
      quiz: {
        question:
          "앞-오른쪽 위 꼭짓점은 흰색이 위를 봐요. R U R' U'을 몇 번 할까요?",
        choices: ["한 번", "세 번", "다섯 번"],
        answer: 1,
        why: "3×3과 같아요. 흰색이 위를 보면 세 번이에요.",
      },
    },
    {
      kind: "try",
      body: "흰색이 위를 봐요. R U R' U'을 세 번.",
      setup: flip(`${SEXY} ${SEXY} ${SEXY}`),
      alg: `${SEXY} ${SEXY} ${SEXY}`,
      goal: "2x2-first-layer",
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "꼭짓점이 넣을 자리 위에 있지 않아요. 3×3처럼 먼저 윗면을 돌려(U') 옮겨요.",
      setup: flip(`U' ${SEXY}`),
      alg: `U' ${SEXY}`,
      goal: "2x2-first-layer",
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "섞인 2×2에서 첫 층을 만들어요. 기준 꼭짓점 하나를 아래에 두고, 옆색이 이어지는 꼭짓점을 차례로 넣어요.",
      setup: { rule: "2x2-random" },
      goal: "2x2-first-layer",
      mask: "first-layer",
    },
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

const yellowFace: Lesson = {
  id: "222-from333-yellow-face",
  size: 2,
  title: "노란 면",
  summary: "3×3의 「노란 면」과 같아요. 수네(R U R' U R U2 R')를 되풀이.",
  steps: [
    {
      kind: "quiz",
      body: "3×3에서 했던 「노란 면」 단계와 같아요. 노란 십자가 없어도 돼요(모서리가 없으니까요). 위를 보는 노란 칸이 하나면 그것을 왼쪽 앞에 두고 수네.",
      setup: flip(SUNE),
      mask: "oll",
      quiz: {
        question: "위를 보는 노란 칸은 몇 개일까요?",
        choices: ["0개", "1개", "2개"],
        answer: 1,
        why: "하나가 왼쪽 앞에 있어요. 3×3처럼 수네 한 번이면 돼요.",
      },
    },
    {
      kind: "try",
      body: "수네를 한 번 해 보세요.",
      setup: flip(SUNE),
      alg: SUNE,
      goal: "2x2-top-face",
      mask: "oll",
    },
    {
      kind: "try",
      body: "위를 보는 노란 칸이 없어요. 3×3처럼 왼쪽 앞 꼭짓점의 노란색이 왼쪽 면을 보게 들고 수네, 그다음 하나 남은 모양으로 한 번 더.",
      // 2×2 초보자 과정과 같은 상황(위를 보는 노란 칸 0개, 시험으로 확인)
      setup: { alg: setupFor("R U2 R' U' R U R' U' R U' R'", "z2") },
      alg: `U ${SUNE} ${SUNE}`,
      goal: "2x2-top-face",
      mask: "oll",
    },
    {
      kind: "try",
      body: "첫 층이 맞은 2×2에서 노란 면을 끝내요.",
      setup: { rule: "2x2-first-layer-solved" },
      goal: "2x2-top-face",
      mask: "oll",
    },
  ],
};

const yellowCorners: Lesson = {
  id: "222-from333-yellow-corners",
  size: 2,
  title: "위 꼭짓점 자리",
  summary: "3×3의 「위 꼭짓점 자리」와 같아요. A퍼뮤 뒤 U로 끝.",
  steps: [
    {
      kind: "quiz",
      body: "3×3에서 했던 「위 꼭짓점 자리」 단계와 같아요. 헤드라이트를 뒤에 두고 A퍼뮤. 2×2는 모서리 단계가 없으니, 끝나면 U를 돌려 맞추면 다 맞아요.",
      setup: flip(`${A_PERM} U2`),
      mask: "pll",
      quiz: {
        question: "A퍼뮤 다음 2×2에서 할 일은?",
        choices: [
          "U를 돌려 위층을 아래층에 맞추면 끝",
          "3×3처럼 U퍼뮤로 모서리를 맞춰요",
        ],
        answer: 0,
        why: "모서리가 없으니 위 모서리 자리 단계는 건너뛰어요.",
      },
    },
    {
      kind: "try",
      body: "헤드라이트를 뒤로 옮겨(U) A퍼뮤, 그리고 U를 돌려 끝내요.",
      setup: { alg: setupFor(`U ${A_PERM} U2`, "z2") },
      alg: `U ${A_PERM} U2`,
      goal: "solved",
      mask: "pll",
    },
    {
      kind: "try",
      body: "2×2만의 함정: 헤드라이트가 하나도 없으면 대각선 두 꼭짓점이 바뀐 거예요. 3×3처럼 A퍼뮤를 한 번 하면 헤드라이트가 생겨요. 그 면을 뒤로 옮겨 한 번 더.",
      setup: { alg: setupFor(Y_PERM, "z2") },
      alg: `${A_PERM} U ${A_PERM} U2`,
      goal: "solved",
      mask: "pll",
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
      body: "헤드라이트가 다른 쪽에 있는 상황이에요(이웃 둘이 바뀜). 마지막까지 맞춰요.",
      setup: { alg: setupFor(T_PERM, "z2") },
      alg: `U ${A_PERM} U2`,
      goal: "solved",
      mask: "pll",
    },
  ],
};

export const FROM_333_222: Course = {
  id: "222-from333",
  size: 2,
  title: "3×3을 아는 사람의 2×2",
  summary:
    "3×3 초보자 과정을 마쳤다면: 꼭짓점 단계만 떠올려 같은 공식 셋으로 맞춰요.",
  lessons: [corners, firstLayer, yellowFace, yellowCorners],
  recommendAfter: "333-beginner",
};
