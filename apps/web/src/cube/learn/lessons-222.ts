// 2×2 초보자(docs/47 8-2): 첫 층 → 윗면(3×3의 수네 그대로) → 윗층 자리(3×3의 A퍼뮤 그대로).
// 그다음 빠른 해법 오르테가를 소개한다. 2×2는 꼭짓점 여덟 개뿐이고 기준이 될 가운데가 없다.
import { setupFor } from "./notation";
import type { Course, Lesson } from "./types";

const SEXY = "R U R' U'";
const SUNE = "R U R' U R U2 R'";
const A_PERM = "R' F R' B2 R F' R' B2 R2";
const T_PERM = "R U R' U' R' F R2 U' R' U' R U R' F'";
const Y_PERM = "F R U' R' U' R U R' F' R U R' U' R' F R F'";

const flip = (solution: string) => ({ alg: setupFor(solution, "z2") });

const intro: Lesson = {
  id: "222-intro",
  size: 2,
  title: "2×2 살펴보기",
  summary: "가운데도 모서리도 없는 작은 큐브. 3×3에서 배운 공식을 그대로 쓴다.",
  steps: [
    {
      kind: "text",
      body: "2×2는 꼭짓점 여덟 개로만 되어 있다. 가운데 칸이 없어서 면의 색을 알려 주는 기준이 없다. 그래서 「흰 면이 몇 색 옆에 있어야 하나」는 꼭짓점끼리 서로 맞춰서 정한다.",
    },
    {
      kind: "text",
      body: "표기는 3×3과 같다(R U F, ', 2). 3×3을 맞출 줄 안다면 꼭짓점 단계만 따라 하면 된다. 몰라도 이 과정만으로 맞출 수 있다.",
    },
    { kind: "demo", body: "R U R' U': 3×3과 똑같이 돈다.", alg: SEXY },
  ],
};

const firstLayer: Lesson = {
  id: "222-first-layer",
  size: 2,
  title: "첫 층",
  summary: "흰 꼭짓점 넷을 아래에 모은다. 옆면 색까지 서로 맞게.",
  steps: [
    {
      kind: "text",
      body: "흰 꼭짓점 하나를 아래층에 두고 기준으로 삼는다. 나머지 흰 꼭짓점은 3×3 첫 층과 같다. 넣을 자리 위(앞-오른쪽 위)로 옮기고 R U R' U'을 맞을 때까지 되풀이한다.",
    },
    {
      kind: "text",
      body: "넣을 자리는 옆색으로 정한다. 꼭짓점의 두 옆색이 이미 아래에 있는 흰 꼭짓점들의 옆색과 이어져야 한다. 흰색이 오른쪽을 보면 한 번, 위를 보면 세 번, 앞을 보면 다섯 번.",
    },
    {
      kind: "demo",
      body: "흰색이 위를 본다. 세 번.",
      setup: flip(`${SEXY} ${SEXY} ${SEXY}`),
      alg: `${SEXY} ${SEXY} ${SEXY}`,
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "흰색이 오른쪽을 본다.",
      setup: flip(SEXY),
      alg: SEXY,
      goal: "2x2-first-layer",
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "흰색이 앞을 본다.",
      setup: flip(`${SEXY} ${SEXY} ${SEXY} ${SEXY} ${SEXY}`),
      alg: `${SEXY} ${SEXY} ${SEXY} ${SEXY} ${SEXY}`,
      goal: "2x2-first-layer",
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "섞인 2×2에서 첫 층을 만든다.",
      setup: { rule: "2x2-random" },
      goal: "2x2-first-layer",
      mask: "first-layer",
    },
    {
      kind: "text",
      body: "흔한 실수: 흰 면만 모으고 옆색을 안 보는 것. 옆에서 봤을 때 아래 두 칸이 같은 색이어야 한다.",
    },
  ],
};

const topFace: Lesson = {
  id: "222-top-face",
  size: 2,
  title: "윗면",
  summary: "3×3 노란 면과 같다. 쥐는 법을 지켜 수네를 되풀이.",
  steps: [
    {
      kind: "text",
      body: "위를 보는 노란 칸이 하나면 그것을 왼쪽 앞에 두고 수네(R U R' U R U2 R'). 없으면 왼쪽 앞 꼭짓점의 노란색이 왼쪽 면을 보게, 둘이면 앞면을 보게 들고 수네. 다 될 때까지 되풀이한다.",
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
      body: "수네 한 번.",
      setup: flip(SUNE),
      alg: SUNE,
      goal: "2x2-top-face",
      mask: "oll",
    },
    {
      kind: "try",
      body: "위를 보는 노란 칸이 없다.",
      setup: { alg: setupFor("R U2 R' U' R U R' U' R U' R'", "z2") },
      alg: `U ${SUNE} ${SUNE}`,
      goal: "2x2-top-face",
      mask: "oll",
    },
    {
      kind: "try",
      body: "첫 층이 맞은 2×2에서 윗면을 끝낸다.",
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
  summary: "헤드라이트를 뒤에 두고 A퍼뮤. 마지막에 윗면을 돌려 맞춘다.",
  steps: [
    {
      kind: "text",
      body: "옆면 윗줄 두 칸이 같은 색이면 헤드라이트다. 헤드라이트를 뒤로 두고 R' F R' B2 R F' R' B2 R2. 헤드라이트가 없으면 한 번 해서 만든 뒤 다시 한다. 끝나면 윗면을 돌려 아래층 색과 맞춘다.",
    },
    {
      kind: "demo",
      body: "헤드라이트가 뒤에 있다.",
      setup: flip(A_PERM),
      alg: A_PERM,
      mask: "pll",
    },
    {
      kind: "try",
      body: "헤드라이트가 다른 쪽에 있다.",
      setup: { alg: setupFor(T_PERM, "z2") },
      alg: `U ${A_PERM} U2`,
      goal: "solved",
      mask: "pll",
    },
    {
      kind: "try",
      body: "헤드라이트가 없다. 한 번 하고, 뒤로 옮겨 한 번 더.",
      setup: { alg: setupFor(Y_PERM, "z2") },
      alg: `${A_PERM} U ${A_PERM} U2`,
      goal: "solved",
      mask: "pll",
    },
    {
      kind: "try",
      body: "윗면까지 맞은 2×2를 끝낸다.",
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
      kind: "text",
      body: "오르테가는 세 단계다. ① 흰 칸 넷을 한 면에 모은다(옆색은 안 봐도 된다). ② 그 면을 아래로 두고 윗면을 노랗게(OLL 7가지). ③ 위층과 아래층의 자리를 한 번에 맞춘다(PBL 5가지).",
    },
    {
      kind: "text",
      body: "옆색을 안 보니 첫 단계가 아주 짧다. 대신 마지막에 아래층 자리까지 함께 고친다. 각 층은 맞음·이웃 둘 바꿈(헤드라이트 하나)·대각 둘 바꿈(헤드라이트 없음) 셋 중 하나다.",
    },
    {
      kind: "demo",
      body: "위·아래 모두 대각 바꿈: R2 F2 R2 세 수로 끝.",
      setup: { alg: setupFor("R2 F2 R2", "z2") },
      alg: "R2 F2 R2",
    },
    {
      kind: "try",
      body: "흰 칸 넷을 한 면에 모은다(옆색은 신경 쓰지 않는다).",
      setup: { rule: "2x2-random" },
      goal: "2x2-first-face",
    },
    {
      kind: "try",
      body: "위아래 면을 다 만들었다고 치고, 위층만 이웃 둘이 바뀐 상황을 푼다(T퍼뮤와 같다).",
      setup: { alg: setupFor(T_PERM, "z2") },
      alg: T_PERM,
      goal: "solved",
    },
    {
      kind: "text",
      body: "나머지 공식은 훈련의 「오르테가 OLL」「오르테가 PBL」 묶음에서 하나씩 연습한다.",
    },
  ],
};

export const BEGINNER_222: Course = {
  id: "222-beginner",
  size: 2,
  title: "2×2 처음 맞추기",
  summary:
    "첫 층 → 윗면 → 윗층 자리. 3×3 공식 두 개면 된다. 끝에 오르테가 소개.",
  lessons: [intro, firstLayer, topFace, topLayer, ortega],
};
