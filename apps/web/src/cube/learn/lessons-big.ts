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

// 가운데 만들기 작은 상황(big-flow.test.ts가 엔진으로 확인)
/** 앞면의 흰 막대를 F'로 오른쪽 줄에 세우고 2R로 올려 흰 막대 둘을 합친다 */
export const CENTER_BARS = "F' 2R";
/** 흰 면을 지키며 노란 막대를 아래로: 2R로 흰 줄을 비키고, F2로 노란 막대를 옮기고, 2R'로 내리며 흰 줄을 되돌린다 */
export const CENTER_YELLOW = "2R F2 2R'";
/** 마지막 두 면(위·앞)에서 막대 하나씩 맞바꾸기 */
export const CENTER_LAST_TWO = "Rw U2 Rw'";
/** 모서리 묶기: 아래 두 층으로 날개를 한 줄로 → 바꿔 넣기 → 되돌리기 */
export const EDGE_PAIR_DOWN = PAIR;
/** 같은 흐름을 위 두 층으로 */
export const EDGE_PAIR_UP = "Uw R U R' F R' F' R Uw'";
/** 위 두 층 흐름의 왼쪽 거울 */
export const EDGE_PAIR_UP_LEFT = "Uw' L' U' L F' L F L' Uw";
/** 4×4 꼭짓점 둘만 바뀐 모양: PLL 패리티로 모서리 둘을 바꿔 T퍼뮤 모양으로 만든 뒤 T퍼뮤(y로 돌려 쥠) */
export const CORNER_SWAP_444 = `${PLL_PARITY} y R U R' U' R' F R2 U' R' U' R U R' F' y'`;

const centers4: Lesson = {
  id: "444-centers",
  size: 4,
  title: "4×4 가운데",
  summary:
    "막대를 만들어 합치기 → 흰색과 노랑 → 나머지 넷은 순서를 지켜서 → 마지막 두 면.",
  steps: [
    {
      kind: "find",
      body: "4×4에는 움직이지 않는 가운데가 없어요. 면마다 가운데 2×2 네 칸을 직접 모아야 해요. 먼저 흰 가운데를 만들고, 그 맞은편에 노란 가운데를 만들어요. 흩어진 흰 가운데 조각 넷을 모두 찾아 눌러 보세요(뒤쪽은 펼친 그림에서).",
      setup: { alg: "2R" },
      find: { piece: "center", colors: ["U"] },
      count: 4,
    },
    {
      kind: "demo",
      body: "안쪽 층 하나만 돌리기(2R)와 두 층 함께 돌리기(Rw). 가운데를 옮길 때는 안쪽 층 하나를 써요.",
      alg: "2R 2R' Rw Rw'",
    },
    {
      kind: "quiz",
      body: "w는 넓게(바깥에서 두 층)라는 뜻이에요. 2R은 바깥에서 둘째 층 하나예요. 둘을 바꿔 돌리면 가운데가 흐트러져요.",
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
    {
      kind: "try",
      body: "가운데 두 칸을 한 줄(막대)로 붙인 뒤, 막대끼리 합쳐요. 위에 흰 막대 하나, 앞면에 흰 막대 하나가 누워 있어요. F'로 앞면을 돌려 막대를 오른쪽 줄에 세우고, 2R로 안쪽 층을 올려 위의 막대 옆에 붙여요.",
      setup: { alg: setupFor(CENTER_BARS) },
      alg: CENTER_BARS,
      goal: "centers",
    },
    {
      kind: "try",
      body: "흰 가운데를 위에 두고 노랑을 맞은편(아래)에 모아요. 안쪽 층을 그냥 돌리면 흰 줄도 함께 움직이니, 2R로 흰 줄을 잠깐 뒤로 비키고, F2로 앞면의 노란 막대를 오른쪽 줄로 옮긴 뒤, 2R'로 노란 막대를 아래로 보내면서 흰 줄을 돌려놓아요.",
      setup: { alg: setupFor(CENTER_YELLOW) },
      alg: CENTER_YELLOW,
      goal: "yau-ud-centers",
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
      kind: "try",
      body: "마지막 두 면이 가장 어려워요. 남은 두 면을 위와 앞에 두면 막대가 하나씩 바뀌어 있어요. Rw로 앞의 막대를 위로 올리고, U2로 윗면을 돌려 바꿀 막대를 그 줄에 둔 뒤, Rw'로 되돌려요.",
      setup: { alg: `z ${setupFor(CENTER_LAST_TWO)}` },
      alg: CENTER_LAST_TWO,
      goal: "centers",
    },
    {
      kind: "quiz",
      body: "흔한 실수: 막대를 옮기려고 안쪽 층을 돌린 뒤 되돌리지 않아 이미 맞춘 면을 흐트러뜨리는 것. 안쪽 층을 돌렸으면 반드시 되돌려요.",
      setup: { alg: "2R" },
      quiz: {
        question:
          "줄을 옮기려고 2R을 했더니 흰 가운데가 흐트러졌어요. 줄을 옮긴 뒤 어떻게 할까요?",
        choices: ["그대로 두고 다음 면으로 가요", "2R'로 안쪽 층을 되돌려요"],
        answer: 1,
        why: "안쪽 층을 되돌려야 맞춘 가운데가 돌아와요.",
      },
    },
    {
      kind: "try",
      body: "섞인 4×4에서 가운데 여섯 면을 맞춰요. 흰색 → 노랑 → 둘레 넷(순서대로) → 마지막 두 면.",
      setup: { rule: "4x4-random" },
      goal: "centers",
    },
  ],
};

const edges4: Lesson = {
  id: "444-edges",
  size: 4,
  title: "4×4 모서리 짝",
  summary:
    "같은 색 날개 둘을 한 줄로: 층 맞추기 → 바꿔 넣기 → 되돌리기. 한 쌍씩, 그다음 12쌍.",
  steps: [
    {
      kind: "find",
      body: "4×4의 모서리는 날개 조각 두 개로 되어 있어요. 같은 두 색의 날개 둘을 한 줄로 붙이는 것이 「모서리 짝 맞추기」예요. 이 큐브는 아래 두 층만 한 번 돌아가 있어요. 앞-오른쪽 위 날개와 같은 색(빨강-초록) 날개 둘을 찾아 눌러 보세요.",
      setup: { alg: "Dw'" },
      find: { piece: "edge", colors: ["R", "F"] },
      count: 2,
    },
    {
      kind: "turn",
      body: "짝지을 두 날개를 가운데 줄 양쪽(앞-오른쪽 위, 앞-왼쪽 아래)에 두고, 아래 두 층(Dw)을 돌려 한 줄로 맞춰요. Dw를 쳐 보세요.",
      setup: { alg: "Dw'" },
      alg: "Dw",
    },
    {
      kind: "demo",
      body: "실제로는 한 줄을 맞추면 아래 층이 돌아간 채예요. 그래서 흐름은 셋이에요. ① Dw로 날개를 한 줄로. ② R U R' F R' F' R로 앞-오른쪽 줄을 윗층의 다른 모서리와 바꿔 넣어요(묶은 모서리는 위로 올라가요). ③ Dw'로 아래 층을 되돌려요.",
      setup: { alg: setupFor(EDGE_PAIR_DOWN) },
      alg: EDGE_PAIR_DOWN,
    },
    {
      kind: "try",
      body: "이번엔 위 날개끼리 맞춰요. 같은 흐름을 위 두 층으로: Uw → R U R' F R' F' R → Uw'.",
      setup: { alg: setupFor(EDGE_PAIR_UP) },
      alg: EDGE_PAIR_UP,
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
    {
      kind: "try",
      body: "가운데가 맞은 4×4에서 모서리 12쌍을 묶어요.",
      setup: { rule: "4x4-centers-solved" },
      goal: "edges-paired",
    },
  ],
};

const solve4: Lesson = {
  id: "444-as-333",
  size: 4,
  title: "3×3처럼 풀기와 패리티",
  drill: "parity-4x4",
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
      body: "PLL 패리티: 마지막에 3×3에서 나올 수 없는 자리 바꿈이 남아요. 모서리 둘만 맞바뀌었으면 그 둘을 앞·뒤에 두고 공식을 해요.",
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
      body: "꼭짓점 둘만 맞바뀌고 모서리는 다 맞은 모양도 PLL 패리티예요. 먼저 PLL 패리티 공식으로 위-앞·위-뒤 모서리를 바꾸면 3×3의 T퍼뮤 모양이 돼요. 그다음 y로 쥐고 T퍼뮤, y'로 돌아와요.",
      setup: { alg: setupFor(CORNER_SWAP_444) },
      alg: CORNER_SWAP_444,
      goal: "solved",
    },
    {
      kind: "try",
      body: "가운데와 모서리가 묶인 4×4를 끝까지 맞춰요.",
      setup: { rule: "4x4-reduced" },
      goal: "solved",
    },
    {
      kind: "quiz",
      body: "흔한 실수: 패리티 공식의 Rw를 R로, 2R을 Rw로 바꿔 돌리는 것. 층 수를 틀리면 가운데가 흐트러져요.",
      quiz: {
        question: "패리티 공식 2R2 U2 2R2 …의 2R2는 어떻게 돌릴까요?",
        choices: [
          "바깥 오른쪽 두 층을 함께 두 번",
          "바깥에서 둘째 층 하나만 두 번",
          "바깥 오른쪽 한 층만 두 번",
        ],
        answer: 1,
        why: "숫자를 앞에 붙인 2R은 바깥에서 둘째 층 하나예요.",
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
      kind: "quiz",
      body: "둘레 여덟 칸은 두 종류예요. 귀퉁이 쪽(대각선) 넷과 가운데 칸에 붙은 십자 쪽 넷. 어떻게 돌려도 대각선 조각은 대각선 자리로, 십자 조각은 십자 자리로만 가요. 막대를 만들 때 두 종류를 따로 세요.",
      quiz: {
        question: "대각선 자리의 가운데 조각을 십자 자리로 옮길 수 있을까요?",
        choices: [
          "네, 안쪽 층을 돌리면 돼요",
          "아니요, 대각선 자리끼리만 오가요",
        ],
        answer: 1,
        why: "조각 모양이 달라 서로의 자리로 갈 수 없어요. 대각선 칸이 모자라면 다른 면의 대각선 칸에서 가져와요.",
      },
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
  summary:
    "모서리 가운데 조각에 같은 색 날개를 하나씩 붙여 세 칸 한 줄로. 마지막 둘 전까지.",
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
      body: "가운데 조각에 위 날개 하나 붙이기: Uw로 위 날개만 옮겨 가운데 조각 옆에 맞추고, R U R' F R' F' R로 바꿔 넣은 뒤 Uw'로 되돌려요.",
      setup: { alg: setupFor(EDGE_PAIR_UP) },
      alg: EDGE_PAIR_UP,
    },
    {
      kind: "try",
      body: "왼쪽에서 같은 흐름(거울): Uw' → L' U' L F' L F L' → Uw. 날개 하나를 붙여 모서리를 다 묶어요.",
      setup: { alg: setupFor(EDGE_PAIR_UP_LEFT) },
      alg: EDGE_PAIR_UP_LEFT,
      goal: "edges-paired",
    },
    {
      kind: "try",
      body: "가운데가 맞은 5×5에서 모서리를 열 개 묶어요. 마지막 두 모서리는 빈 자리가 없어 다음 단원에서 따로 배워요(둘이 남으면 통과).",
      setup: { rule: "5x5-centers-solved" },
      goal: "edges-ten",
    },
  ],
};

const lastEdges5: Lesson = {
  id: "555-last-two-edges",
  size: 5,
  title: "5×5 마지막 두 모서리",
  drill: "edges-5x5",
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
  lessons: [centers4, edges4, solve4],
};

export const REDUCTION_555: Course = {
  id: "555-reduction",
  size: 5,
  title: "5×5 축소법",
  summary:
    "가운데(가운데 줄 먼저) → 모서리 셋 묶기 → 마지막 두 모서리 → 3×3처럼.",
  lessons: [centers5, edges5, lastEdges5],
};
