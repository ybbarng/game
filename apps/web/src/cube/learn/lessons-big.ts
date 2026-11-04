// 4×4·5×5 축소법(docs/47 8-2): 가운데를 맞추고 모서리를 묶어 「큰 3×3」으로 만든 뒤 3×3처럼 푼다.
// 표기: Rw = 바깥 두 층, 2R = 바깥에서 둘째 층 하나만, Uw·Dw = 위·아래 두 층.
import { EDGES_5X5, PARITY_4X4 } from "./algs-big";
import { setupFor } from "./notation";
import type { Course, Lesson } from "./types";

const algOf = (list: { id: string; algs: string[] }[], id: string): string => {
  const a = list.find((c) => c.id === id)?.algs[0];
  if (a === undefined) throw new Error(`공식 없음: ${id}`);
  return a;
};

const PAIR = algOf(EDGES_5X5, "edges-5x5-pair");
const FLIP_5 = algOf(EDGES_5X5, "edges-5x5-flip");
const OLL_PARITY = algOf(PARITY_4X4, "parity-4x4-oll");
const PLL_PARITY = algOf(PARITY_4X4, "parity-4x4-pll");

// 조각(2026-11-04): 3×3 「큐브의 조각」처럼 무엇이 움직이고 무엇이 고정인지 먼저 본다
const pieces4: Lesson = {
  id: "444-pieces",
  size: 4,
  title: "4×4의 조각",
  summary: "가운데 칸이 한 면에 넷이고 움직여요. 모서리는 두 칸짜리 짝이에요.",
  steps: [
    {
      kind: "find",
      body: "4×4는 면마다 가운데 칸이 넷이에요. 3×3의 가운데처럼 보이지만 넷이 하나하나 따로 움직이는 조각이에요. 초록 가운데 칸 넷을 모두 눌러 보세요.",
      mask: "all",
      find: { piece: "center", colors: ["F"] },
      count: 4,
    },
    {
      kind: "turn",
      body: "안쪽 한 층(2R)을 돌려 보세요. 가운데 칸이 다른 면으로 옮겨 가요.",
      mask: "all",
      alg: "2R",
    },
    {
      kind: "quiz",
      body: "3×3에서는 가운데가 움직이지 않아 면 색을 정해 줬어요. 4×4의 가운데는 움직여요.",
      setup: { alg: "2R" },
      mask: "all",
      quiz: {
        question: "그럼 4×4는 무엇부터 맞출까요?",
        choices: [
          "가운데 칸을 모아 면 색부터 정해요",
          "3×3처럼 흰 십자부터",
          "꼭짓점부터",
        ],
        answer: 0,
        why: "가운데가 움직이니 면 색이 정해져 있지 않아요. 가운데부터 모아야 다른 조각의 제자리도 정해져요.",
      },
    },
    {
      kind: "find",
      body: "모서리는 두 칸짜리 짝(날개)이에요. 2R로 흰-초록 날개 둘이 떨어졌어요. 둘 다 찾아 눌러 보세요.",
      setup: { alg: "2R" },
      mask: "all",
      find: { piece: "edge", colors: ["U", "F"] },
      count: 2,
    },
    {
      kind: "quiz",
      body: "가운데를 모으고, 날개 짝을 붙이면 3×3과 같은 모양이 돼요. 이것을 「축소법」이라고 해요.",
      mask: "all",
      quiz: {
        question: "4×4 축소법의 차례는?",
        choices: [
          "가운데 → 모서리 짝 → 3×3처럼",
          "3×3처럼 → 가운데 → 모서리 짝",
          "모서리 짝 → 꼭짓점 → 가운데",
        ],
        answer: 0,
        why: "가운데로 면 색을 정하고, 모서리 짝을 붙인 뒤, 3×3처럼 풀어요.",
      },
    },
  ],
};

const pieces5: Lesson = {
  id: "555-pieces",
  size: 5,
  title: "5×5의 조각",
  summary:
    "한가운데 칸은 고정, 둘레 여덟 칸은 움직여요. 모서리는 세 칸 한 줄이에요.",
  steps: [
    {
      kind: "turn",
      body: "안쪽 한 층(2R)을 돌려 보며 면 한가운데 칸을 지켜보세요.",
      mask: "all",
      alg: "2R",
    },
    {
      kind: "quiz",
      body: "2R을 돌린 5×5예요. 가운데 아홉 칸 중 몇 칸이 옆면으로 옮겨 갔어요.",
      setup: { alg: "2R" },
      mask: "all",
      quiz: {
        question: "흰 면 한가운데 칸은 어떻게 됐나요?",
        choices: ["그대로 흰색이에요", "다른 면으로 옮겨 갔어요"],
        answer: 0,
        why: "5×5의 한가운데 칸은 3×3 가운데처럼 고정이라 면 색을 정해 줘요. 둘레 여덟 칸은 4×4처럼 움직여요.",
      },
    },
    {
      kind: "find",
      body: "5×5 모서리는 세 칸 한 줄이에요(가운데 모서리 하나 + 날개 둘). 2R로 떨어진 흰-초록 모서리 조각 셋을 모두 찾아 눌러 보세요.",
      setup: { alg: "2R" },
      mask: "all",
      find: { piece: "edge", colors: ["U", "F"] },
      count: 3,
    },
    {
      kind: "quiz",
      body: "면 색은 한가운데 칸이 정해 주지만, 둘레 가운데 칸과 모서리 셋은 모아야 해요.",
      mask: "all",
      quiz: {
        question: "5×5 축소법의 차례는?",
        choices: [
          "가운데 → 모서리 셋 묶기 → 3×3처럼",
          "모서리 셋 묶기 → 3×3처럼 → 가운데",
          "3×3처럼 → 가운데 → 모서리",
        ],
        answer: 0,
        why: "4×4와 같은 차례예요. 다만 면 색은 처음부터 정해져 있어요.",
      },
    },
  ],
};

const centers4: Lesson = {
  id: "444-centers",
  size: 4,
  title: "4×4 가운데",
  summary:
    "면마다 가운데 네 칸을 한 색으로. 흰색과 노랑 먼저, 나머지 넷은 순서를 지켜서.",
  steps: [
    {
      kind: "find",
      body: "4×4에는 움직이지 않는 가운데가 없어요. 면마다 가운데 2×2 네 칸을 직접 모아야 해요. 먼저 흰 가운데를 만들고, 그 맞은편에 노란 가운데를 만들어요. 흩어진 흰 가운데 조각 넷을 모두 찾아 눌러 보세요(뒤쪽은 펼친 그림에서).",
      setup: { alg: "2R" },
      find: { piece: "center", colors: ["U"] },
      count: 4,
    },
    {
      kind: "turn",
      body: "가운데 두 칸을 한 줄로 붙인 뒤, 안쪽 층(2R 등)을 돌려 다른 면의 줄과 합쳐요. 바깥 면(R 등)을 돌려 줄을 옮기고, 안쪽 층을 되돌려 다른 면이 흐트러지지 않게 해요. 위로 올라간 흰 줄을 2R'로 되돌려 보세요.",
      setup: { alg: "2R" },
      alg: "2R'",
    },
    {
      kind: "quiz",
      body: "남은 넷(초록·빨강·파랑·주황)은 둘레를 도는 순서가 정해져 있어요. 흰 면을 위로 들었을 때 앞 초록, 오른쪽 빨강, 뒤 파랑, 왼쪽 주황. 이 순서가 틀리면 3×3처럼 풀 수 없어요.",
      quiz: {
        question:
          "흰 면이 위, 초록이 앞이에요. 오른쪽에는 무슨 색 가운데가 와야 할까요?",
        choices: ["빨강", "파랑", "주황"],
        answer: 0,
        why: "앞 초록, 오른쪽 빨강, 뒤 파랑, 왼쪽 주황 차례예요.",
      },
    },
    {
      kind: "demo",
      body: "안쪽 층 하나만 돌리기(2R)와 두 층 함께 돌리기(Rw).",
      alg: "2R 2R' Rw Rw'",
    },
    {
      kind: "try",
      body: "섞인 4×4에서 가운데 여섯 면을 맞춰요.",
      setup: { rule: "4x4-random" },
      goal: "centers",
    },
    {
      kind: "quiz",
      body: "흔한 실수: 마지막 두 면을 맞출 때 이미 맞춘 면을 안쪽 층으로 흐트러뜨리고 되돌리지 않는 것. 안쪽 층을 돌렸으면 반드시 되돌려요.",
      setup: { alg: "2R" },
      quiz: {
        question:
          "줄을 옮기려고 2R을 했더니 흰 가운데가 흐트러졌어요. 줄을 옮긴 뒤 어떻게 할까요?",
        choices: ["그대로 두고 다음 면으로 가요", "2R'로 안쪽 층을 되돌려요"],
        answer: 1,
        why: "안쪽 층을 되돌려야 맞춘 가운데가 돌아와요.",
      },
    },
  ],
};

const edges4: Lesson = {
  id: "444-edges",
  size: 4,
  title: "4×4 모서리 짝",
  summary: "같은 색 모서리 조각(날개) 두 개를 한 줄로 붙여요. 12쌍.",
  steps: [
    {
      kind: "find",
      body: "4×4의 모서리는 날개 조각 두 개로 되어 있어요. 같은 두 색의 날개 둘을 찾아 한 줄로 붙이는 것이 「모서리 짝 맞추기」예요. 떨어진 흰-초록 날개 둘을 찾아 눌러 보세요.",
      setup: { alg: "2R" },
      find: { piece: "edge", colors: ["U", "F"] },
      count: 2,
    },
    {
      kind: "turn",
      body: "짝지을 두 날개를 앞-왼쪽과 앞-오른쪽에 두고, 위아래 두 층(Uw·Dw)을 돌려 줄을 맞춰요. 묶이지 않은 모서리를 오른쪽 칸에 넣었다 빼는 공식(R U R' F R' F' R)으로 바꿔 넣은 뒤 층을 되돌려요. 아래 두 층을 함께 돌리는 Dw를 쳐 보세요.",
      alg: "Dw",
    },
    {
      kind: "demo",
      body: "두 모서리를 묶는 한 번의 흐름: Dw → 바꿔 넣기 → Dw'.",
      setup: { alg: setupFor(PAIR) },
      alg: PAIR,
    },
    {
      kind: "try",
      body: "가운데가 맞은 4×4에서 모서리 12쌍을 묶어요.",
      setup: { rule: "4x4-centers-solved" },
      goal: "edges-paired",
    },
    {
      kind: "quiz",
      body: "처음 8쌍은 쉽게 묶이고, 마지막 4쌍이 어려워요. 묶인 모서리를 윗층과 아랫층에 모아 두고, 남은 것을 가운데 줄에서 묶어요.",
      quiz: {
        question: "마지막 4쌍은 어디에서 묶을까요?",
        choices: [
          "묶인 모서리를 위·아래층에 모아 두고 가운데 줄에서",
          "묶인 모서리를 가운데 줄에 모아 두고 윗층에서",
        ],
        answer: 0,
        why: "가운데 줄에서 묶어야 Dw로 다른 묶음을 흐트러뜨리지 않아요.",
      },
    },
  ],
};

const solve4: Lesson = {
  id: "444-as-333",
  size: 4,
  title: "3×3처럼 풀기와 패리티",
  summary:
    "이제 큰 3×3. 바깥 층만 돌려 풀어요. 3×3에서 없는 모양 두 가지는 패리티 공식으로.",
  steps: [
    {
      kind: "quiz",
      body: "가운데와 모서리를 묶었으면 바깥 층(R U F 등)만 돌려 3×3처럼 풀어요. 그런데 4×4에는 3×3에서 나올 수 없는 모양이 두 가지 나와요. 이것을 「패리티」라고 해요.",
      setup: { alg: setupFor(PLL_PARITY) },
      quiz: {
        question: "패리티는 무엇일까요?",
        choices: [
          "3×3에서는 나올 수 없는 모양",
          "가운데를 잘못 맞춘 모양",
          "섞기를 잘못한 큐브",
        ],
        answer: 0,
        why: "4×4는 모서리가 날개 둘이라 3×3에서 없는 모양이 생겨요. 공식 하나씩으로 고쳐요.",
      },
    },
    {
      kind: "quiz",
      body: "OLL 패리티: 노란 십자를 만들 때 모서리 하나만 뒤집혀 있어요(노란 모서리가 1개나 3개). 뒤집힌 모서리를 앞에 두고 공식을 해요. 아래 두 층은 지키지만 윗층은 흐트러지니 다시 OLL부터.",
      setup: { alg: `z2 ${setupFor(OLL_PARITY)}` },
      quiz: {
        question: "위를 보는 노란 모서리가 몇 개일 때 OLL 패리티일까요?",
        choices: ["0개, 2개, 4개", "1개나 3개"],
        answer: 1,
        why: "3×3에서는 노란 모서리가 늘 짝수 개예요. 홀수면 패리티예요.",
      },
    },
    {
      kind: "demo",
      body: "OLL 패리티: 위-앞 모서리 하나를 뒤집어요.",
      setup: { alg: setupFor(OLL_PARITY) },
      alg: OLL_PARITY,
    },
    {
      kind: "quiz",
      body: "PLL 패리티: 마지막에 모서리 둘만, 또는 꼭짓점 둘만 서로 바뀌어 있어요. 바꿀 모서리 둘을 앞·뒤에 두고 공식을 해요.",
      setup: { alg: setupFor(PLL_PARITY) },
      quiz: {
        question: "PLL 패리티 공식을 할 때 바꿀 모서리 둘은 어디에 둘까요?",
        choices: ["앞과 뒤", "왼쪽과 오른쪽", "앞과 오른쪽"],
        answer: 0,
        why: "이 공식은 위-앞과 위-뒤 모서리를 맞바꿔요.",
      },
    },
    {
      kind: "demo",
      body: "PLL 패리티: 위-앞과 위-뒤 모서리를 맞바꿔요.",
      setup: { alg: setupFor(PLL_PARITY) },
      alg: PLL_PARITY,
    },
    {
      kind: "try",
      body: "가운데와 모서리가 묶인 4×4를 끝까지 맞춰요.",
      setup: { rule: "4x4-reduced" },
      goal: "solved",
    },
    {
      kind: "quiz",
      body: "흔한 실수: Rw를 R로, 2R을 Rw로 바꿔 돌리는 것. 패리티 공식은 층 수를 틀리면 가운데가 흐트러져요.",
      quiz: {
        question: "Rw는 어떻게 돌릴까요?",
        choices: [
          "바깥 오른쪽 한 층만",
          "바깥 오른쪽 두 층을 함께",
          "바깥에서 둘째 층 하나만",
        ],
        answer: 1,
        why: "w는 넓게(두 층)예요. 둘째 층 하나만은 2R이에요.",
      },
    },
  ],
};

const centers5: Lesson = {
  id: "555-centers",
  size: 5,
  title: "5×5 가운데",
  summary:
    "면마다 가운데 3×3 아홉 칸. 가운데 칸이 고정이라 색 순서는 저절로 정해져요.",
  steps: [
    {
      kind: "find",
      body: "5×5는 면 한가운데 칸이 움직이지 않아 3×3처럼 면 색이 정해져 있어요. 그 둘레 여덟 칸을 모아요. 먼저 가운데 줄(가운데 칸 + 양옆 두 칸, 세 칸 막대)을 만들고, 막대를 이어 붙여 아홉 칸을 채워요. 앞면에서 초록 가운데 조각을 셋 눌러 보세요.",
      find: { piece: "center", colors: ["F"] },
      count: 3,
    },
    {
      kind: "turn",
      body: "4×4와 같이 안쪽 층(2R)을 돌려 다른 면의 막대를 가져오고, 바깥 면을 돌려 옮긴 뒤 안쪽 층을 되돌려요. 흰색·노랑 먼저, 나머지 넷은 마지막에. 2R을 쳐서 안쪽 층 하나만 돌려 보세요.",
      alg: "2R",
    },
    {
      kind: "try",
      body: "섞인 5×5에서 가운데를 맞춰요.",
      setup: { rule: "5x5-random" },
      goal: "centers",
    },
  ],
};

const edges5: Lesson = {
  id: "555-edges",
  size: 5,
  title: "5×5 모서리 셋 묶기",
  summary: "모서리 가운데 조각에 같은 색 날개 둘을 붙여 세 칸 한 줄로.",
  steps: [
    {
      kind: "find",
      body: "5×5의 모서리는 가운데 조각 하나와 날개 둘, 세 조각이에요. 가운데 조각을 기준으로 같은 색 날개를 하나씩 붙여요. 붙이는 흐름은 4×4와 같아요(층을 맞추고 → 바꿔 넣고 → 되돌리기). 흩어진 흰-초록 모서리 세 조각을 모두 찾아 눌러 보세요.",
      setup: { alg: "2R" },
      find: { piece: "edge", colors: ["U", "F"] },
      count: 3,
    },
    {
      kind: "demo",
      body: "두 모서리를 묶는 한 번의 흐름.",
      setup: { alg: setupFor(PAIR) },
      alg: PAIR,
    },
    {
      kind: "try",
      body: "가운데가 맞은 5×5에서 모서리를 묶어요(마지막 둘 전까지).",
      setup: { rule: "5x5-centers-solved" },
      goal: "edges-paired",
    },
  ],
};

const lastEdges5: Lesson = {
  id: "555-last-two-edges",
  size: 5,
  title: "5×5 마지막 두 모서리",
  summary:
    "남은 두 모서리를 앞-왼쪽·앞-오른쪽에 두고 묶어요. 날개가 뒤집혔으면 뒤집기 공식.",
  steps: [
    {
      kind: "quiz",
      body: "마지막 두 모서리는 빈 자리가 없어 다른 모서리를 흐트러뜨리지 않고 묶어야 해요. 둘을 앞-왼쪽·앞-오른쪽에 두고, 맞출 날개끼리 한 줄이 되게 아래 두 층(Dw)을 돌린 뒤 바꿔 넣고 되돌려요.",
      setup: { alg: setupFor(PAIR) },
      quiz: {
        question: "남은 두 모서리는 어디에 둘까요?",
        choices: ["앞-왼쪽과 앞-오른쪽", "위-앞과 아래-앞", "위-앞과 위-뒤"],
        answer: 0,
        why: "가운데 줄 양쪽에 두어야 Dw로 날개끼리 맞출 수 있어요.",
      },
    },
    {
      kind: "demo",
      body: "마지막 두 모서리 묶기.",
      setup: { alg: setupFor(PAIR) },
      alg: PAIR,
    },
    {
      kind: "quiz",
      body: "마지막 모서리의 가운데 조각은 맞는데 양쪽 날개만 서로 바뀐 모양이 나올 수 있어요(5×5의 패리티). 그 모서리를 위-앞에 두고 뒤집기 공식을 해요.",
      setup: { alg: setupFor(FLIP_5) },
      quiz: {
        question: "가운데 조각은 맞는데 양쪽 날개만 바뀌었어요. 어떻게 할까요?",
        choices: [
          "그 모서리를 위-앞에 두고 뒤집기 공식을 해요",
          "그대로 3×3처럼 풀어요",
        ],
        answer: 0,
        why: "3×3처럼 풀면 이 모양은 고칠 수 없어요. 뒤집기 공식이 필요해요.",
      },
    },
    {
      kind: "demo",
      body: "날개 뒤집기: 위-앞 모서리의 두 날개만 바꿔요.",
      setup: { alg: setupFor(FLIP_5) },
      alg: FLIP_5,
    },
    {
      kind: "try",
      body: "모서리 둘만 남은 5×5를 묶어요.",
      setup: { rule: "5x5-two-edges-left" },
      goal: "edges-paired",
    },
    {
      kind: "quiz",
      body: "모서리를 다 묶으면 3×3처럼 풀어요. 5×5는 가운데가 고정이라 4×4의 PLL 패리티는 나오지 않아요.",
      quiz: {
        question: "5×5에서 나오지 않는 것은?",
        choices: ["4×4의 PLL 패리티", "마지막 모서리 날개 뒤집힘"],
        answer: 0,
        why: "가운데가 고정이라 윗층 자리가 3×3과 똑같이 나와요.",
      },
    },
    {
      kind: "try",
      body: "섞인 5×5를 끝까지 맞춰요.",
      setup: { rule: "5x5-random" },
      goal: "solved",
    },
  ],
};

export const REDUCTION_444: Course = {
  id: "444-reduction",
  size: 4,
  title: "4×4 축소법",
  summary: "가운데 → 모서리 짝 → 3×3처럼 → 패리티 둘.",
  lessons: [pieces4, centers4, edges4, solve4],
};

export const REDUCTION_555: Course = {
  id: "555-reduction",
  size: 5,
  title: "5×5 축소법",
  summary:
    "가운데(가운데 줄 먼저) → 모서리 셋 묶기 → 마지막 두 모서리 → 3×3처럼.",
  lessons: [pieces5, centers5, edges5, lastEdges5],
};
