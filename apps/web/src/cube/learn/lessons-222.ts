// 2×2 초보자(docs/47 8-2): 첫 층 → 윗면(3×3의 수네 그대로) → 윗층 자리(3×3의 A퍼뮤 그대로).
// 그다음 빠른 해법 오르테가를 소개한다. 2×2는 꼭짓점 여덟 개뿐이고 기준이 될 가운데가 없다.
import { setupFor } from "./notation";
import type { Course, Lesson } from "./types";

const SEXY = "R U R' U'";
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
      kind: "quiz",
      body: "2×2를 둘러보세요. 칸 하나하나가 아니라 조각으로 보면 어떤 조각이 있나요? 칸 셋이 한 조각이에요.",
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
  summary: "가운데도 모서리도 없는 작은 큐브. 3×3에서 배운 공식을 그대로 써요.",
  steps: [
    {
      kind: "find",
      body: "2×2는 꼭짓점 여덟 개로만 되어 있어요. 가운데 칸이 없어서 면의 색을 알려 주는 기준이 없어요. 그래서 「흰 면이 몇 색 옆에 있어야 하나」는 꼭짓점끼리 서로 맞춰서 정해요. 흰-초록-빨강 꼭짓점을 찾아 눌러 보세요.",
      find: { piece: "corner", colors: ["U", "F", "R"] },
    },
    {
      kind: "turn",
      body: "표기는 3×3과 같아요(R U F, ', 2). 3×3을 맞출 줄 안다면 꼭짓점 단계만 따라 하면 돼요. 몰라도 이 과정만으로 맞출 수 있어요. R 다음 U를 쳐 보세요.",
      alg: "R U",
    },
    { kind: "demo", body: "R U R' U': 3×3과 똑같이 돌아요.", alg: SEXY },
  ],
};

const firstLayer: Lesson = {
  id: "222-first-layer",
  size: 2,
  title: "첫 층",
  summary: "흰 꼭짓점 넷을 아래에 모아요. 옆면 색까지 서로 맞게.",
  steps: [
    {
      kind: "look",
      body: "흰 꼭짓점 하나를 아래층에 두고 기준으로 삼아요. 나머지 흰 꼭짓점은 3×3 첫 층과 같아요. 넣을 자리 위(앞-오른쪽 위)로 옮기고 R U R' U'을 맞을 때까지 되풀이해요. 먼저 큐브 전체를 돌려 흰 면을 아래로 보내 보세요.",
      mask: "first-layer",
      look: { color: "U", on: "D" },
    },
    {
      kind: "quiz",
      body: "넣을 자리는 옆색으로 정해요. 꼭짓점의 두 옆색이 이미 아래에 있는 흰 꼭짓점들의 옆색과 이어져야 해요. 흰색이 오른쪽을 보면 한 번, 위를 보면 세 번, 앞을 보면 다섯 번.",
      setup: flip(`${SEXY} ${SEXY} ${SEXY} ${SEXY} ${SEXY}`),
      mask: "first-layer",
      quiz: {
        question:
          "앞-오른쪽 위 꼭짓점은 흰색이 앞을 봐요. R U R' U'을 몇 번 할까요?",
        choices: ["한 번", "세 번", "다섯 번"],
        answer: 2,
        why: "흰색이 앞을 보면 다섯 번이에요.",
      },
    },
    {
      kind: "demo",
      body: "흰색이 위를 봐요. 세 번.",
      setup: flip(`${SEXY} ${SEXY} ${SEXY}`),
      alg: `${SEXY} ${SEXY} ${SEXY}`,
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "흰색이 오른쪽을 봐요.",
      setup: flip(SEXY),
      alg: SEXY,
      goal: "2x2-first-layer",
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "흰색이 앞을 봐요.",
      setup: flip(`${SEXY} ${SEXY} ${SEXY} ${SEXY} ${SEXY}`),
      alg: `${SEXY} ${SEXY} ${SEXY} ${SEXY} ${SEXY}`,
      goal: "2x2-first-layer",
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "섞인 2×2에서 첫 층을 만들어요.",
      setup: { rule: "2x2-random" },
      goal: "2x2-first-layer",
      mask: "first-layer",
    },
    {
      kind: "quiz",
      body: "흔한 실수: 흰 면만 모으고 옆색을 안 보는 것. 옆에서 봤을 때 아래 두 칸이 같은 색이어야 해요.",
      setup: { alg: "z2" },
      mask: "first-layer",
      quiz: {
        question: "첫 층이 다 됐는지 어떻게 알까요?",
        choices: [
          "아랫면 네 칸이 모두 흰색이면 돼요",
          "아랫면이 흰색이고, 옆에서 볼 때 아래 두 칸도 같은 색이어야 해요",
        ],
        answer: 1,
        why: "옆색까지 이어져야 다음 단계에서 깨지지 않아요.",
      },
    },
  ],
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
      body: "오르테가는 세 단계예요. ① 흰 칸 넷을 한 면에 모아요(옆색은 안 봐도 돼요). ② 그 면을 아래로 두고 윗면을 노랗게(OLL 7가지). ③ 위층과 아래층의 자리를 한 번에 맞춰요(PBL 5가지).",
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
    "첫 층 → 윗면 → 윗층 자리. 3×3 공식 세 개(R U R' U', 수네, A퍼뮤)면 돼요. 끝에 오르테가 소개.",
  lessons: [pieces, intro, firstLayer, topFace, topLayer, ortega],
};
