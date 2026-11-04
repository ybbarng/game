// 2×2 초보자(docs/47 8-2): 첫 층(흰 면 위, R' D' R D) → 윗면(수네) → 윗층 자리(A퍼뮤).
// 그다음 빠른 해법 오르테가를 소개한다. 2×2는 꼭짓점 여덟 개뿐이고 기준이 될 가운데가 없다.
import { CORNER_TWIST, reps, STUCK_CORNER_UP } from "./lessons-333";
import { setupFor } from "./notation";
import type { Course, Lesson, LessonStep } from "./types";

const SUNE = "R U R' U R U2 R'";
const A_PERM = "R' F R' B2 R F' R' B2 R2";
export const T_PERM = "R U R' U' R' F R2 U' R' U' R U R' F'";
export const Y_PERM = "F R U' R' U' R U R' F' R U R' U' R' F R F'";

const flip = (solution: string) => ({ alg: setupFor(solution, "z2") });

// 조각(2026-11-04): 2×2는 꼭짓점뿐이라 면 색을 정해 줄 가운데가 없다
const pieces: Lesson = {
  id: "222-pieces",
  size: 2,
  title: "2×2의 조각",
  summary: "꼭짓점 여덟 개뿐이에요. 가운데가 없어서 조각끼리 맞춰요.",
  steps: [
    {
      kind: "find",
      body: "2×2를 칸 하나하나가 아니라 조각으로 봐요. 칸 셋이 한 조각이에요. 까만 2×2에서 조각을 모두 눌러 세어 보세요. 누르면 색이 드러나요. 뒤쪽은 끌어서 둘러보거나 펼친 그림에서 눌러요.",
      mask: "none",
      find: { piece: "corner" },
      count: 8,
    },
    {
      kind: "quiz",
      body: "몇 개를 셌나요? 조각마다 색이 몇 개 붙어 있었는지도 떠올려 보세요.",
      mask: "all",
      quiz: {
        question: "2×2를 이루는 조각은?",
        choices: [
          "꼭짓점 8개뿐",
          "가운데 6개 + 꼭짓점 8개",
          "모서리 12개 + 꼭짓점 8개",
        ],
        answer: 0,
        why: "2×2는 구석마다 꼭짓점 하나, 모두 여덟 개예요. 가운데도 모서리도 없어요.",
      },
    },
    {
      kind: "find",
      body: "흰색이 붙은 꼭짓점을 넷 모두 눌러 보세요.",
      setup: { alg: "R U" },
      mask: "all",
      find: { piece: "corner", has: ["U"] },
      count: 4,
    },
    {
      kind: "play",
      body: "흰-초록-빨강 꼭짓점만 색이 있어요. 아무 면이나 돌려 보세요. 어디로 가든 세 색은 늘 함께 다녀요. 큐브의 칸을 눌러 다른 꼭짓점도 따라가 보세요.",
      play: { focus: { colors: ["U", "F", "R"] }, moved: 3, choose: true },
    },
    {
      kind: "quiz",
      body: "3×3에서는 움직이지 않는 가운데 색이 면 색과 조각의 제자리를 정했어요. 2×2에는 그 가운데가 없어요.",
      setup: { alg: "R U" },
      mask: "all",
      quiz: {
        question: "그럼 2×2에서 조각의 제자리는 무엇으로 정할까요?",
        choices: [
          "꼭짓점 하나를 기준으로 삼고, 이웃 꼭짓점의 색이 이어지게",
          "면 가운데 칸의 색으로",
          "흰 스티커가 많은 쪽으로",
        ],
        answer: 0,
        why: "기준 꼭짓점 하나를 정하면 나머지는 그 조각과 색이 이어지게 붙여요. 큐브를 어느 쪽으로 들어도 돼요.",
      },
    },
    {
      kind: "find",
      body: "흰-초록-빨강 꼭짓점을 기준으로 삼아요. 흰색과 초록을 함께 나눠 가질 이웃, 흰-초록-주황 꼭짓점을 찾아 눌러 보세요.",
      setup: { alg: "R U" },
      mask: "all",
      find: { piece: "corner", colors: ["U", "F", "L"] },
    },
  ],
};

const intro: Lesson = {
  id: "222-intro",
  size: 2,
  title: "2×2 살펴보기",
  summary:
    "가운데가 없는 작은 큐브. 색의 짝과 차례로 자리를 정하고, 3×3 공식을 그대로 써요.",
  steps: [
    {
      kind: "quiz",
      body: "가운데가 없어도 색의 짝은 3×3과 같아요: 흰↔노랑, 초록↔파랑, 빨강↔주황이 언제나 맞은편이에요. 그래서 한 꼭짓점에 맞은편 두 색은 함께 붙지 않아요.",
      mask: "all",
      quiz: {
        question: "빨강의 맞은편 색은 무엇일까요?",
        choices: ["주황", "노랑", "초록"],
        answer: 0,
        why: "빨강↔주황이 맞은편이에요. 큐브를 둘러보며 확인해 보세요.",
      },
    },
    {
      kind: "quiz",
      body: "둘레 색의 차례도 정해져 있어요. 흰 면을 위로, 초록을 앞으로 들면 오른쪽은 빨강, 뒤는 파랑, 왼쪽은 주황이에요. 그래서 기준 꼭짓점 하나만 있으면 이웃 꼭짓점의 색이 정해져요.",
      mask: "all",
      quiz: {
        question:
          "흰-초록-빨강 꼭짓점이 위-앞-오른쪽에 있어요. 위-앞-왼쪽에 올 꼭짓점은?",
        choices: ["흰-초록-주황", "흰-파랑-빨강", "흰-초록-노랑"],
        answer: 0,
        why: "흰과 초록을 함께 나누고, 오른쪽 빨강의 맞은편인 주황이 왼쪽에 와요. 흰-초록-노랑은 맞은편 색이 함께 붙어서 없는 꼭짓점이에요.",
      },
    },
    {
      kind: "find",
      body: "표기는 3×3과 같아요(R U F, ', 2). 2×2에서 R을 돌리면 오른쪽 층의 꼭짓점 넷이 통째로 돌아요. 지금은 맞춘 큐브라 빨강이 붙은 꼭짓점이 그 넷이에요. 넷 모두 눌러 보세요.",
      mask: "all",
      find: { piece: "corner", has: ["R"] },
      count: 4,
    },
    {
      kind: "demo",
      body: "R' D' R D: 3×3과 똑같이 돌아요. 첫 층은 이 공식 하나로 맞춰요. 3×3을 맞출 줄 안다면 꼭짓점 단계만 따라 하면 되고, 몰라도 이 과정만으로 맞출 수 있어요.",
      alg: CORNER_TWIST,
    },
  ],
};

/**
 * 2×2 첫 층(2026-11-04): 3×3 첫 층 꼭짓점과 같이 흰 면을 위에 둔 채 아래층의 꼭짓점을 칸 밑으로 옮겨
 * R' D' R D를 흰색이 위로 올 때까지 되풀이한다. 다 되면 뒤집어 흰 면을 아래로 둔다.
 * 「3×3을 아는 사람의 2×2」도 이 단계를 쓴다(첫 설명만 다르다).
 */
export function firstLayerUpSteps(first: string): LessonStep[] {
  return [
    {
      kind: "find",
      body: first,
      setup: { alg: "R U F' R2 U'" },
      mask: "all",
      find: { piece: "corner", has: ["U"] },
    },
    {
      kind: "find",
      body: "기준 꼭짓점은 흰색이 위를 보게 위층에 둬요. 지금 흰-초록-주황이 기준으로 앞-왼쪽 위에 있어요. 그 오른쪽(앞-오른쪽 위)에 올 꼭짓점은 흰·초록을 함께 나누고 주황의 맞은편 빨강이 붙은 것이에요. 아래층에서 찾아 눌러 보세요.",
      setup: { alg: setupFor(`D ${CORNER_TWIST}`) },
      mask: "all",
      find: { piece: "corner", colors: ["U", "F", "R"] },
    },
    {
      kind: "turn",
      body: "3×3처럼 아랫면을 돌려 그 꼭짓점을 넣을 칸 바로 밑(앞-오른쪽 아래)으로 옮겨요. D를 쳐 보세요.",
      setup: { alg: setupFor(`D ${CORNER_TWIST}`) },
      mask: "first-layer",
      alg: "D",
    },
    {
      kind: "quiz",
      body: "칸 밑에 왔으면 R' D' R D를 흰색이 위를 볼 때까지 되풀이해요. 흰색이 오른쪽을 보면 한 번, 아래를 보면 세 번, 앞을 보면 다섯 번.",
      setup: { alg: setupFor(reps(CORNER_TWIST, 5)) },
      mask: "first-layer",
      quiz: {
        question:
          "앞-오른쪽 아래 꼭짓점은 흰색이 앞을 봐요. R' D' R D를 몇 번 할까요?",
        choices: ["한 번", "세 번", "다섯 번"],
        answer: 2,
        why: "흰색이 앞을 보면 다섯 번이에요.",
      },
    },
    {
      kind: "demo",
      body: "흰색이 아래를 봐요. 세 번.",
      setup: { alg: setupFor(reps(CORNER_TWIST, 3)) },
      alg: reps(CORNER_TWIST, 3),
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "흰색이 오른쪽을 봐요. 칸 밑으로 옮기고(D) 한 번.",
      setup: { alg: setupFor(`D ${CORNER_TWIST}`) },
      alg: `D ${CORNER_TWIST}`,
      goal: "2x2-first-layer",
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "흰색이 앞을 봐요.",
      setup: { alg: setupFor(reps(CORNER_TWIST, 5)) },
      alg: reps(CORNER_TWIST, 5),
      goal: "2x2-first-layer",
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "앞-오른쪽 위 칸에 다른 흰 꼭짓점이 박혀 있어요. 칸을 앞-오른쪽에 둔 채 R' D' R D 한 번으로 빼고, 빠진 것은 아랫면을 돌려(D) 제 칸 밑으로 옮긴 뒤 큐브를 돌려(y) 쥐고 넣어요.",
      setup: { alg: setupFor(STUCK_CORNER_UP) },
      alg: STUCK_CORNER_UP,
      goal: "2x2-first-layer",
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "섞인 2×2에서 첫 층을 만들어요. 기준 꼭짓점 하나를 흰색이 위를 보게 두고, 옆색이 이어지는 꼭짓점을 차례로 넣어요.",
      setup: { rule: "2x2-random" },
      goal: "2x2-first-layer",
      mask: "first-layer",
    },
    {
      kind: "quiz",
      body: "흔한 실수: 흰 면만 모으고 옆색을 안 보는 것. 옆에서 봤을 때 위 두 칸이 같은 색이어야 해요.",
      mask: "first-layer",
      quiz: {
        question: "첫 층이 다 됐는지 어떻게 알까요?",
        choices: [
          "윗면 네 칸이 모두 흰색이면 돼요",
          "윗면이 흰색이고, 옆에서 볼 때 위 두 칸도 같은 색이어야 해요",
        ],
        answer: 1,
        why: "옆색까지 이어져야 다음 단계에서 깨지지 않아요.",
      },
    },
    {
      kind: "look",
      body: "첫 층이 끝났어요. 다음 단계부터는 흰 면을 아래에 두고 해요. 큐브 전체를 뒤집어(z2) 흰 면을 아래로 보내 보세요.",
      mask: "first-layer",
      look: { color: "U", on: "D" },
    },
  ];
}

const firstLayer: Lesson = {
  id: "222-first-layer-up",
  size: 2,
  title: "첫 층",
  summary:
    "흰 면을 위에 둔 채 흰 꼭짓점 넷을 R' D' R D로 모아요. 옆면 색까지 서로 맞게.",
  steps: firstLayerUpSteps(
    "섞인 2×2에서는 먼저 흰 꼭짓점 아무거나 하나를 기준으로 골라요. 이 조각을 흰색이 위를 보게 위층에 두고 나머지를 여기에 맞춰 붙여요. 흰 꼭짓점을 하나 눌러 보세요.",
  ),
};

const topFace: Lesson = {
  id: "222-top-face",
  size: 2,
  title: "윗면",
  summary: "3×3 노란 면과 같아요. 쥐는 법을 지켜 수네를 되풀이.",
  steps: [
    {
      kind: "quiz",
      body: "위를 보는 노란 칸이 하나면 그것을 왼쪽 앞에 두고 수네(R U R' U R U2 R'). 없으면 왼쪽 앞 꼭짓점의 노란색이 왼쪽 면을 보게, 둘이면 앞면을 보게 들고 수네. 다 될 때까지 되풀이해요.",
      setup: flip(SUNE),
      mask: "oll",
      quiz: {
        question: "위를 보는 노란 칸은 몇 개일까요?",
        choices: ["0개", "1개", "2개"],
        answer: 1,
        why: "하나가 왼쪽 앞에 있어요. 수네 한 번이면 돼요.",
      },
    },
    {
      kind: "demo",
      body: "노란 칸 하나가 왼쪽 앞.",
      setup: flip(SUNE),
      alg: SUNE,
      mask: "oll",
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
      body: "위를 보는 노란 칸이 없어요.",
      setup: { alg: setupFor("R U2 R' U' R U R' U' R U' R'", "z2") },
      alg: `U ${SUNE} ${SUNE}`,
      goal: "2x2-top-face",
      mask: "oll",
    },
    {
      kind: "try",
      body: "첫 층이 맞은 2×2에서 윗면을 끝내요.",
      setup: { rule: "2x2-first-layer-solved" },
      goal: "2x2-top-face",
      mask: "oll",
    },
  ],
};

const topLayer: Lesson = {
  id: "222-top-layer",
  size: 2,
  title: "윗층 자리",
  summary: "헤드라이트를 뒤에 두고 A퍼뮤. 마지막에 윗면을 돌려 맞춰요.",
  steps: [
    {
      kind: "quiz",
      body: "옆면 윗줄 두 칸이 같은 색이면 헤드라이트예요. 헤드라이트를 뒤로 두고 R' F R' B2 R F' R' B2 R2. 헤드라이트가 없으면 한 번 해서 만든 뒤 다시 해요. 끝나면 윗면을 돌려 아래층 색과 맞춰요. 큐브를 끌어 옆면을 둘러보세요.",
      setup: flip(A_PERM),
      mask: "pll",
      quiz: {
        question: "헤드라이트는 어느 면에 있을까요?",
        choices: ["앞", "오른쪽", "뒤", "왼쪽"],
        answer: 2,
        why: "뒤에 있어요. 그대로 공식을 하면 돼요.",
      },
    },
    {
      kind: "demo",
      body: "헤드라이트가 뒤에 있어요.",
      setup: flip(A_PERM),
      alg: A_PERM,
      mask: "pll",
    },
    {
      kind: "try",
      body: "헤드라이트가 다른 쪽에 있어요.",
      setup: { alg: setupFor(T_PERM, "z2") },
      alg: `U ${A_PERM} U2`,
      goal: "solved",
      mask: "pll",
    },
    {
      kind: "try",
      body: "헤드라이트가 없어요. 한 번 하고, 뒤로 옮겨 한 번 더.",
      setup: { alg: setupFor(Y_PERM, "z2") },
      alg: `${A_PERM} U ${A_PERM} U2`,
      goal: "solved",
      mask: "pll",
    },
    {
      kind: "try",
      body: "윗면까지 맞은 2×2를 끝내요.",
      setup: { rule: "2x2-top-face-solved" },
      goal: "solved",
    },
  ],
};

const ortega: Lesson = {
  id: "222-ortega",
  size: 2,
  title: "오르테가 소개",
  summary: "빠른 해법. 흰 면 → 윗면 → 위아래 층 한꺼번에(공식 12개 안팎).",
  steps: [
    {
      kind: "quiz",
      body: "오르테가는 세 단계예요. ① 흰 칸 넷을 한 면에 모아요(옆색은 안 봐도 돼요). ② 그 면을 아래로 두고 윗면을 노랗게(OLL 7가지). ③ 위층과 아래층의 자리를 한 번에 맞춰요(PBL 5가지, 영어 Permutation of Both Layers의 줄임말로 「두 층 자리 바꾸기」).",
      setup: { alg: setupFor("R2 F2 R2", "z2") },
      quiz: {
        question: "오르테가 첫 단계에서 할 일은 무엇일까요?",
        choices: [
          "흰 칸 넷을 한 면에 모으기(옆색은 안 봐요)",
          "흰 꼭짓점 넷을 옆색까지 맞추기",
          "노란 면부터 만들기",
        ],
        answer: 0,
        why: "옆색을 안 보니 첫 단계가 아주 짧아요.",
      },
    },
    {
      kind: "quiz",
      body: "옆색을 안 보니 첫 단계가 아주 짧아요. 대신 마지막에 아래층 자리까지 함께 고쳐요. 각 층은 맞음·이웃 둘 바꿈(헤드라이트 하나)·대각 둘 바꿈(헤드라이트 없음) 셋 중 하나예요. 큐브를 끌어 위층 옆면을 둘러보세요.",
      setup: { alg: setupFor("R2 F2 R2", "z2") },
      quiz: {
        question: "이 큐브의 위층은 셋 중 무엇일까요?",
        choices: [
          "맞음",
          "이웃 둘 바꿈(헤드라이트 하나)",
          "대각 둘 바꿈(헤드라이트 없음)",
        ],
        answer: 2,
        why: "헤드라이트가 하나도 없어요. 아래층도 같아서 R2 F2 R2 세 수로 끝나요.",
      },
    },
    {
      kind: "demo",
      body: "위·아래 모두 대각 바꿈: R2 F2 R2 세 수로 끝.",
      setup: { alg: setupFor("R2 F2 R2", "z2") },
      alg: "R2 F2 R2",
    },
    {
      kind: "try",
      body: "흰 칸 넷을 한 면에 모아요(옆색은 신경 쓰지 않아요).",
      setup: { rule: "2x2-random" },
      goal: "2x2-first-face",
    },
    {
      kind: "try",
      body: "둘째 단계: 흰 면을 아래로 두고 윗면을 노랗게 해요. 노란 칸 하나가 왼쪽 앞에 있는 모양은 초보자 과정과 같은 수네(R U R' U R U2 R') 한 번이에요. 오르테가에서는 이런 윗면 공식 일곱 개를 모양마다 하나씩 써요.",
      setup: flip(SUNE),
      alg: SUNE,
      goal: "2x2-both-faces",
    },
    {
      kind: "try",
      body: "위아래 면을 다 만들었다고 치고, 위층만 이웃 둘이 바뀐 상황을 풀어요(T퍼뮤와 같아요).",
      setup: { alg: setupFor(T_PERM, "z2") },
      alg: T_PERM,
      goal: "solved",
    },
  ],
};

export const BEGINNER_222: Course = {
  id: "222-beginner",
  size: 2,
  title: "2×2 처음 맞추기",
  summary:
    "첫 층 → 윗면 → 윗층 자리. 공식 세 개(R' D' R D, 수네, A퍼뮤)면 돼요. 끝에 오르테가 소개.",
  lessons: [pieces, intro, firstLayer, topFace, topLayer, ortega],
};
