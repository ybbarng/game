// 4×4·5×5 축소법(docs/47 8-2): 센터를 맞추고 엣지를 묶어 「큰 3×3」으로 만든 뒤 3×3처럼 푼다.
// 표기: Rw = 바깥 두 층, 2R = 바깥에서 둘째 층 하나만, Uw·Dw = 위·아래 두 층.
import { solvedCube } from "@game/cube-engine";

import { EDGES_5X5, PARITY_4X4 } from "./algs-big";
import { play, runStage, stepMoves } from "./beginner-path";
import { invertAlg, setupFor } from "./notation";
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

// 센터 만들기 작은 상황(flow-advanced.test.ts가 엔진으로 확인)
/** 앞면의 흰 막대를 F'로 오른쪽 줄에 세우고 2R로 올려 흰 막대 둘을 합친다 */
export const CENTER_BARS = "F' 2R";
/** 흰 면을 지키며 노란 막대를 아래로: 2R로 흰 줄을 비키고, F2로 노란 막대를 옮기고, 2R'로 내리며 흰 줄을 되돌린다 */
export const CENTER_YELLOW = "2R F2 2R'";
/** 마지막 두 면(위·앞)에서 막대 하나씩 맞바꾸기 */
export const CENTER_LAST_TWO = "Rw U2 Rw'";
/** 엣지 묶기: 아래 두 층으로 날개를 한 줄로 → 바꿔 넣기 → 되돌리기 */
export const EDGE_PAIR_DOWN = PAIR;
/** 같은 흐름을 위 두 층으로 */
export const EDGE_PAIR_UP = "Uw R U R' F R' F' R Uw'";
/** 위 두 층 흐름의 왼쪽 거울 */
export const EDGE_PAIR_UP_LEFT = "Uw' L' U' L F' L F L' Uw";
/**
 * 4×4 위 층 코너 둘만 바뀐 모양(흰 면 아래). 이 과정은 3×3 처음 맞추기만 먼저 배우므로(T퍼뮤는 CFOP) 푸는 수는
 * PLL 패리티 뒤 3×3 처음 맞추기의 마지막 층 규칙(beginner-path.ts: 옆면 맞추기 → 코너 자리 → 코너 방향)이 낸 수다.
 * 패리티 뒤의 4×4는 바깥 층만 보면 3×3의 같은 상황과 같아, 3×3에서 규칙을 돌려 수를 얻는다(flow-advanced.test.ts가 4×4로 확인)
 */
const T_PERM = "R U R' U' R' F R2 U' R' U' R U R' F'";
export const CORNER_SWAP_444_SETUP = setupFor(
  `${PLL_PARITY} y ${T_PERM} y'`,
  "z2",
);
/** 패리티 뒤 3×3에서 같은 상황(흰 면 아래) */
const AFTER_PARITY_333 = `z2 ${invertAlg(`y ${T_PERM} y'`)}`;
export const CORNER_SWAP_444_LL = (() => {
  let s = play(solvedCube(3), AFTER_PARITY_333);
  const parts: string[] = [];
  for (const id of ["edges", "corner-place", "corner-twist"] as const) {
    const r = runStage(id, s);
    s = r.state;
    parts.push(...r.steps.map(stepMoves));
  }
  return parts.join(" ");
})();
export const CORNER_SWAP_444 = `${PLL_PARITY} ${CORNER_SWAP_444_LL}`;

// 조각(2026-11-04): 3×3 「큐브의 조각」처럼 무엇이 움직이고 무엇이 고정인지 먼저 본다
const pieces4: Lesson = {
  id: "444-pieces",
  size: 4,
  title: "4×4의 조각",
  summary: "센터 블럭이 한 면에 넷이고 움직여요. 엣지는 날개 둘이 짝이에요.",
  steps: [
    {
      kind: "find",
      body: "3×3 처음 맞추기를 마쳤다면 더 큰 4×4도 맞출 수 있어요. 먼저 4×4의 조각이 3×3과 어떻게 다른지 봐요. 4×4는 면마다 센터 블럭이 넷이에요. 3×3의 센터 블럭 하나처럼 보이지만 넷이 하나하나 따로 움직여요. 초록 센터 블럭 넷을 모두 눌러 보세요.",
      mask: "all",
      find: { piece: "center", colors: ["F"] },
      count: 4,
    },
    {
      kind: "play",
      body: "초록 센터 블럭 넷만 색이 있어요. 바깥 면인 앞면을 돌리면 넷이 함께 돌고, 바깥에서 둘째 층인 안쪽 층을 돌리면 다른 면으로 흩어져요. 마음대로 돌려 보세요.",
      play: {
        focus: { piece: "center", colors: ["F"] },
        turns: 4,
        choose: true,
      },
    },
    {
      kind: "quiz",
      body: "3×3에서는 센터 블럭이 움직이지 않아 조각의 제자리를 정해 줬어요. 4×4의 센터 블럭은 움직여요.",
      setup: { alg: "2R" },
      mask: "all",
      quiz: {
        question: "그럼 4×4는 무엇부터 맞출까요?",
        choices: [
          "센터 블럭을 모아 면마다 제자리를 정해 줄 센터부터 만들어요",
          "3×3처럼 흰 십자부터",
          "코너 블럭부터",
        ],
        answer: 0,
        why: "센터 블럭이 움직이니 어느 면이 무슨 색인지 정해져 있지 않아요. 센터 블럭부터 모아야 다른 조각의 제자리도 정해져요.",
      },
    },
    {
      kind: "find",
      body: "4×4의 엣지는 두 면 사이 한 줄에 엣지 블럭 둘이 짝을 이뤄요. 이 둘을 「날개」라고 하고, 날개 둘이 붙은 한 줄을 그냥 「엣지」라고 불러요. 오른쪽 안쪽 층을 한 번 돌려서 흰-초록 날개 둘이 떨어졌어요. 둘 다 찾아 눌러 보세요.",
      setup: { alg: "2R" },
      mask: "all",
      find: { piece: "edge", colors: ["U", "F"] },
      count: 2,
    },
    {
      kind: "quiz",
      body: "센터 블럭을 모으고, 날개 짝을 붙이면 3×3과 같은 모양이 돼요. 이것을 「축소법」이라고 해요.",
      mask: "all",
      quiz: {
        question: "4×4 축소법의 차례는?",
        choices: [
          "센터 → 엣지 짝 → 3×3처럼",
          "3×3처럼 → 센터 → 엣지 짝",
          "엣지 짝 → 코너 블럭 → 센터 블럭",
        ],
        answer: 0,
        why: "센터 블럭을 모아 면마다 제자리를 정하고, 엣지 짝을 붙인 뒤, 3×3처럼 풀어요. 3×3처럼 풀 때 3×3에는 없는 모양이 나올 수 있는데, 이것을 「패리티」라고 해요. 마지막 단원에서 고치는 법을 배워요.",
      },
    },
  ],
};

const pieces5: Lesson = {
  id: "555-pieces",
  size: 5,
  title: "5×5의 조각",
  summary:
    "한가운데 칸은 고정, 둘레 여덟 칸은 움직여요. 엣지는 세 칸 한 줄이에요.",
  steps: [
    {
      kind: "play",
      body: "4×4 축소법을 마쳤다면 5×5도 같은 생각으로 맞춰요. 먼저 5×5의 조각을 봐요. 흰 면의 센터 블럭 아홉 칸만 색이 있어요. 2R·2U 같은 안쪽 층을 돌려 보세요. 둘레 여덟 칸은 옮겨 가지만 한가운데 칸은 늘 제자리예요. 다만 L과 R 사이 한가운데 층을 돌리는 M(L과 같은 쪽으로 돌아요)은 한가운데 칸까지 함께 옮겨요. 그래도 여섯 한가운데 칸끼리의 자리는 큐브 전체를 돌린 것처럼 그대로라, 면마다 제자리는 늘 한가운데 칸이 정해요.",
      play: {
        focus: { piece: "center", colors: ["U"] },
        turns: 4,
        choose: true,
      },
    },
    {
      kind: "quiz",
      body: "2R을 돌린 5×5예요. 흰 면의 센터 블럭 아홉 가운데 몇 개가 옆면으로 옮겨 갔어요.",
      setup: { alg: "2R" },
      mask: "all",
      quiz: {
        question: "흰 면 한가운데 칸은 어떻게 됐나요?",
        choices: ["그대로 흰색이에요", "다른 면으로 옮겨 갔어요"],
        answer: 0,
        why: "5×5의 한가운데 칸은 3×3의 센터 블럭처럼 고정이라 조각의 제자리를 정해 줘요. 둘레 여덟 칸은 4×4처럼 움직여요.",
      },
    },
    {
      kind: "find",
      body: "5×5 엣지는 세 칸 한 줄이에요(가운데 엣지 블럭 하나 + 날개 둘). 2R로 떨어진 흰-초록 엣지 블럭 셋을 모두 찾아 눌러 보세요.",
      setup: { alg: "2R" },
      mask: "all",
      find: { piece: "edge", colors: ["U", "F"] },
      count: 3,
    },
    {
      kind: "quiz",
      body: "제자리는 한가운데 칸이 정해 주지만, 둘레의 센터 블럭과 한 줄의 엣지 블럭 셋은 모아야 해요.",
      mask: "all",
      quiz: {
        question: "5×5 축소법의 차례는?",
        choices: [
          "센터 블럭 → 엣지 셋 묶기 → 3×3처럼",
          "엣지 셋 묶기 → 3×3처럼 → 센터 블럭",
          "3×3처럼 → 센터 블럭 → 엣지",
        ],
        answer: 0,
        why: "4×4와 같은 차례예요. 다만 한가운데 칸이 고정이라 면마다 제자리는 처음부터 정해져 있어요.",
      },
    },
  ],
};

const centers4: Lesson = {
  id: "444-centers",
  size: 4,
  title: "4×4 센터",
  summary:
    "표기(2R·Rw·Uw) → 막대를 만들어 합치기 → 흰색과 노랑 → 나머지 넷은 순서를 지켜서 → 마지막 두 면.",
  steps: [
    {
      kind: "demo",
      body: "앞 단원에서 4×4는 센터 블럭부터 모은다는 걸 봤어요. 이번 단원에서 센터를 만들어요. 먼저 표기예요. 큰 큐브는 층이 많아 표기가 둘 더 있어요. 숫자를 앞에 붙인 2R은 바깥에서 둘째 층 하나, w를 붙인 Rw는 바깥 두 층을 함께 돌려요. 센터 블럭을 옮길 때는 안쪽 층 하나를 써요. 2R과 Rw를 차례로 보세요.",
      alg: "2R 2R' Rw Rw'",
    },
    {
      kind: "quiz",
      body: "w는 넓게(바깥에서 두 층)라는 뜻이에요. 2R은 바깥에서 둘째 층 하나예요. 둘을 바꿔 돌리면 센터 블럭이 흐트러져요.",
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
      kind: "turn",
      body: "위·아래도 같아요. Uw는 위 두 층, Dw는 아래 두 층을 함께 돌려요(엣지 짝을 맞출 때 써요). Uw를 쳐 보세요.",
      alg: "Uw",
    },
    {
      kind: "find",
      body: "4×4에는 움직이지 않는 센터 블럭이 없어요. 면마다 센터 블럭 2×2 네 칸을 직접 모아야 해요. 먼저 흰 센터를 만들고, 그 맞은편에 노란 센터를 만들어요. 흩어진 흰 센터 블럭 넷을 모두 찾아 눌러 보세요(뒤쪽은 거울에서).",
      setup: { alg: "2R" },
      find: { piece: "center", colors: ["U"] },
      count: 4,
    },
    {
      kind: "try",
      body: "같은 색 센터 블럭 두 칸을 한 줄(막대)로 붙인 뒤, 막대끼리 합쳐요. 위에 흰 막대 하나, 앞면에 흰 막대 하나가 누워 있어요. F'로 앞면을 돌려 막대를 오른쪽 줄에 세우고, 2R로 안쪽 층을 올려 위의 막대 옆에 붙여요. 아직 맞춘 면이 없으니 2R을 되돌리지 않아도 돼요.",
      setup: { alg: setupFor(CENTER_BARS) },
      alg: CENTER_BARS,
      goal: "centers",
    },
    {
      kind: "try",
      body: "흰 센터를 위에 두고 노랑을 맞은편(아래)에 모아요. 안쪽 층을 그냥 돌리면 흰 줄도 함께 움직이니, 2R로 흰 줄을 잠깐 뒤로 비키고, F2로 앞면의 노란 막대를 오른쪽 줄로 옮긴 뒤, 2R'로 노란 막대를 아래로 보내면서 흰 줄을 돌려놓아요.",
      setup: { alg: setupFor(CENTER_YELLOW) },
      alg: CENTER_YELLOW,
      goal: "yau-ud-centers",
    },
    {
      kind: "quiz",
      body: "남은 넷(초록·빨강·파랑·주황)은 둘레를 도는 순서가 정해져 있어요. 흰 면을 위로 들었을 때 앞 초록, 오른쪽 빨강, 뒤 파랑, 왼쪽 주황. 이 순서가 틀리면 3×3처럼 풀 수 없어요.",
      quiz: {
        question:
          "흰 면이 위, 초록이 앞이에요. 오른쪽에는 무슨 색 센터가 와야 할까요?",
        choices: ["빨강", "파랑", "주황"],
        answer: 0,
        why: "앞 초록, 오른쪽 빨강, 뒤 파랑, 왼쪽 주황 차례예요.",
      },
    },
    {
      kind: "try",
      body: "마지막 두 면이 가장 어려워요. 남은 두 면을 위와 앞에 두면 막대가 하나씩 바뀌어 있어요. Rw로 앞의 막대를 위로 올리고, U2로 윗면을 돌려 바꿀 막대를 그 줄에 둔 뒤, Rw'로 되돌려요. 여기서는 Rw를 써도 돼요. Rw의 바깥 층은 오른쪽 면의 센터 블럭을 그 자리에서 돌리기만 해서 흐트러뜨리지 않아요.",
      setup: { alg: `z ${setupFor(CENTER_LAST_TWO)}` },
      alg: CENTER_LAST_TWO,
      goal: "centers",
    },
    {
      kind: "quiz",
      body: "자주 하는 실수: 막대를 옮기려고 안쪽 층을 돌린 뒤 되돌리지 않아 이미 맞춘 면을 흐트러뜨리는 것. 안쪽 층을 돌렸으면 반드시 되돌려요.",
      setup: { alg: "2R" },
      quiz: {
        question:
          "줄을 옮기려고 2R을 했더니 흰 센터가 흐트러졌어요. 줄을 옮긴 뒤 어떻게 할까요?",
        choices: ["그대로 두고 다음 면으로 가요", "2R'로 안쪽 층을 되돌려요"],
        answer: 1,
        why: "안쪽 층을 되돌려야 맞춘 센터가 돌아와요.",
      },
    },
    {
      kind: "try",
      body: "섞인 4×4에서 여섯 면의 센터를 맞춰요. 흰색 → 노랑 → 둘레 넷(순서대로) → 마지막 두 면.",
      setup: { rule: "4x4-random" },
      goal: "centers",
    },
  ],
};

const edges4: Lesson = {
  id: "444-edges",
  size: 4,
  title: "4×4 엣지 짝",
  summary:
    "같은 색 날개 둘을 한 줄로: 층 맞추기 → 바꿔 넣기 → 되돌리기. 한 쌍씩, 그다음 12쌍.",
  steps: [
    {
      kind: "find",
      body: "앞 단원에서 센터를 다 맞췄어요. 이번에는 엣지를 묶어요. 4×4의 엣지는 엣지 블럭(날개) 두 개로 되어 있어요. 같은 두 색의 날개 둘을 한 줄로 붙이는 것이 「엣지 짝 맞추기」예요. 이 큐브는 아래 두 층만 한 번 돌아가 있어요. 앞-오른쪽 위 날개와 같은 색(빨강-초록) 날개 둘을 찾아 눌러 보세요.",
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
      body: "실제로는 한 줄을 맞추면 아래 층이 돌아간 채예요. 그래서 흐름은 셋이에요. ① Dw로 날개를 한 줄로. ② R U R' F R' F' R로 앞-오른쪽 줄을 위 층의 다른 엣지와 바꿔 넣어요(묶은 엣지는 위 층으로 올라가요). ③ Dw'로 아래 두 층을 되돌려요. 되돌리지 않으면 아래 두 층과 함께 돈 센터가 흐트러진 채 남아요. 바꿔 넣을 위 층 엣지는 아직 묶이지 않은 것을 골라요.",
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
      body: "처음 8쌍은 쉽게 묶이고, 마지막 4쌍이 어려워요. 묶인 엣지를 위 층과 아래 층에 모아 두고, 남은 것을 가운데 줄에서 묶어요.",
      quiz: {
        question: "마지막 4쌍은 어디에서 묶을까요?",
        choices: [
          "묶인 엣지를 위·아래 층에 모아 두고 가운데 줄에서",
          "묶인 엣지를 가운데 줄에 모아 두고 위 층에서",
        ],
        answer: 0,
        why: "가운데 줄에서 묶어야 Dw로 다른 묶음을 흐트러뜨리지 않아요.",
      },
    },
    {
      kind: "try",
      body: "센터가 다 맞은 4×4에서 엣지 12쌍을 묶어요.",
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
      body: "앞 단원에서 센터를 모으고 엣지를 다 묶었어요. 이제 바깥 층(R U F 등)만 돌려 3×3처럼 풀어요. 그런데 4×4에는 3×3에서 나올 수 없는 모양이 두 가지 나와요. 이것을 「패리티」라고 해요.",
      setup: { alg: setupFor(PLL_PARITY, "z2") },
      quiz: {
        question: "패리티는 무엇일까요?",
        choices: [
          "3×3에서는 나올 수 없는 모양",
          "센터 블럭을 잘못 모은 모양",
          "섞기를 잘못한 큐브",
        ],
        answer: 0,
        why: "4×4는 엣지가 날개 둘이라 3×3에서 없는 모양이 생겨요. 공식 하나씩으로 고쳐요.",
      },
    },
    {
      kind: "quiz",
      body: "첫째는 노란 십자를 만들 때 나와요. 위를 보는 노란 엣지가 1개나 3개로, 엣지 한 줄만 뒤집혀 있어요. 이것을 OLL 패리티라고 불러요. OLL은 윗면을 노랗게 맞추는 단계를 부르는 영어 줄임말이에요. 뒤집힌 엣지를 앞에 두고 공식을 해요. 아래 두 층은 지키지만 위 층은 흐트러지니 노란 십자부터 다시 해요.",
      setup: { alg: `z2 ${setupFor(OLL_PARITY)}` },
      quiz: {
        question: "위를 보는 노란 엣지가 몇 개일 때 OLL 패리티일까요?",
        choices: ["0개, 2개, 4개", "1개나 3개"],
        answer: 1,
        why: "3×3에서는 노란 엣지가 늘 짝수 개예요. 홀수면 패리티예요.",
      },
    },
    {
      kind: "demo",
      body: "OLL 패리티: 위-앞 엣지 하나를 뒤집어요. 공식 속 Lw는 왼쪽 두 층, x는 큐브 전체를 R 쪽으로 돌려 쥐는 수예요.",
      setup: { alg: setupFor(OLL_PARITY, "z2") },
      alg: OLL_PARITY,
    },
    {
      kind: "quiz",
      body: "둘째는 마지막 층 조각의 자리를 맞출 때 나와요. 3×3에서 나올 수 없는 자리 바꿈이 남아요. 이것을 PLL 패리티라고 불러요. PLL은 마지막 층 조각의 자리를 맞추는 단계를 부르는 영어 줄임말이에요. 엣지 둘만 맞바뀌었으면 그 둘을 앞·뒤에 두고 공식을 해요.",
      setup: { alg: setupFor(PLL_PARITY, "z2") },
      quiz: {
        question: "PLL 패리티 공식을 할 때 바꿀 엣지 둘은 어디에 둘까요?",
        choices: ["앞과 뒤", "왼쪽과 오른쪽", "앞과 오른쪽"],
        answer: 0,
        why: "이 공식은 위-앞과 위-뒤 엣지를 맞바꿔요.",
      },
    },
    {
      kind: "demo",
      body: "PLL 패리티: 위-앞과 위-뒤 엣지를 맞바꿔요.",
      setup: { alg: setupFor(PLL_PARITY, "z2") },
      alg: PLL_PARITY,
    },
    {
      kind: "try",
      body: "위 층 코너 블럭 둘만 맞바뀌고 엣지는 다 맞은 모양도 PLL 패리티예요. 먼저 PLL 패리티 공식으로 위-앞·위-뒤 엣지를 바꿔요. 그러면 3×3에서도 나오는 모양이 되니, 3×3 처음 맞추기의 마지막 층 차례대로 옆면 맞추기 → 코너 자리 → 코너 방향으로 끝내요. 힌트의 모범 답이 그 차례예요.",
      setup: { alg: CORNER_SWAP_444_SETUP },
      alg: CORNER_SWAP_444,
      goal: "solved",
    },
    {
      kind: "try",
      body: "센터가 맞고 엣지가 다 묶인 4×4를 끝까지 맞춰요.",
      setup: { rule: "4x4-reduced" },
      goal: "solved",
    },
    {
      kind: "quiz",
      body: "자주 하는 실수: 패리티 공식의 Rw를 R로, 2R을 Rw로 바꿔 돌리는 것. 층 수를 틀리면 센터 블럭이 흐트러져요.",
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
  title: "5×5 센터",
  summary:
    "면마다 센터 블럭 3×3 아홉 칸. 한가운데 칸이 고정이라 색 순서는 저절로 정해져요.",
  steps: [
    {
      kind: "find",
      body: "앞 단원에서 5×5의 조각을 봤어요. 이번에는 센터를 만들어요. 5×5는 면 한가운데 칸이 움직이지 않아 3×3처럼 면마다 제자리가 정해져 있어요. 그 둘레 여덟 칸을 모아요. 먼저 가운데 줄(가운데 칸 + 양옆 두 칸, 세 칸 막대)을 만들고, 막대를 이어 붙여 아홉 칸을 채워요. 앞면에서 초록 센터 블럭을 셋 눌러 보세요.",
      find: { piece: "center", colors: ["F"] },
      count: 3,
    },
    {
      kind: "quiz",
      body: "둘레 여덟 칸은 두 종류예요. 귀퉁이 쪽(대각선) 넷과 한가운데 칸에 붙은 십자 쪽 넷. 어떻게 돌려도 대각선 조각은 대각선 자리로, 십자 조각은 십자 자리로만 가요. 막대를 만들 때 두 종류를 따로 세요.",
      quiz: {
        question: "대각선 자리의 센터 블럭을 십자 자리로 옮길 수 있을까요?",
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
      body: "섞인 5×5에서 여섯 면의 센터를 맞춰요.",
      setup: { rule: "5x5-random" },
      goal: "centers",
    },
  ],
};

const edges5: Lesson = {
  id: "555-edges",
  size: 5,
  title: "5×5 엣지 셋 묶기",
  summary:
    "가운데 엣지 블럭에 같은 색 날개를 하나씩 붙여 세 칸 한 줄로. 마지막 둘 전까지.",
  steps: [
    {
      kind: "find",
      body: "앞 단원에서 센터를 맞췄어요. 이번에는 엣지를 묶어요. 5×5의 엣지는 가운데 엣지 블럭 하나와 날개 둘, 세 블럭이에요. 가운데 엣지 블럭을 기준으로 같은 색 날개를 하나씩 붙여요. 붙이는 흐름은 4×4와 같아요(층을 맞추고 → 바꿔 넣고 → 되돌리기). 흩어진 흰-초록 엣지 블럭 셋을 모두 찾아 눌러 보세요.",
      setup: { alg: "2R" },
      find: { piece: "edge", colors: ["U", "F"] },
      count: 3,
    },
    {
      kind: "demo",
      body: "가운데 엣지 블럭에 위 날개 하나 붙이기: Uw로 위 날개만 옮겨 가운데 엣지 블럭 옆에 맞추고, R U R' F R' F' R로 바꿔 넣은 뒤 Uw'로 되돌려요.",
      setup: { alg: setupFor(EDGE_PAIR_UP) },
      alg: EDGE_PAIR_UP,
    },
    {
      kind: "try",
      body: "왼쪽에서 같은 흐름(거울): Uw' → L' U' L F' L F L' → Uw. 날개 하나를 붙여 엣지를 다 묶어요.",
      setup: { alg: setupFor(EDGE_PAIR_UP_LEFT) },
      alg: EDGE_PAIR_UP_LEFT,
      goal: "edges-paired",
    },
    {
      kind: "try",
      body: "센터가 다 맞은 5×5에서 엣지를 열 개 묶어요. 마지막 두 엣지는 빈 자리가 없어 다음 단원에서 따로 배워요(둘이 남으면 통과).",
      setup: { rule: "5x5-centers-solved" },
      goal: "edges-ten",
    },
  ],
};

const lastEdges5: Lesson = {
  id: "555-last-two-edges",
  size: 5,
  title: "5×5 마지막 두 엣지",
  drill: "edges-5x5",
  summary:
    "남은 두 엣지를 앞-왼쪽·앞-오른쪽에 두고 묶어요. 날개가 뒤집혔으면 뒤집기 공식.",
  steps: [
    {
      kind: "quiz",
      body: "앞 단원에서 엣지를 열 개 묶었어요. 마지막 두 엣지는 빈 자리가 없어 다른 엣지를 흐트러뜨리지 않고 묶어야 해요. 둘을 앞-왼쪽·앞-오른쪽에 두고, 맞출 날개끼리 한 줄이 되게 아래 두 층(Dw)을 돌린 뒤 바꿔 넣고 되돌려요.",
      setup: { alg: setupFor(PAIR) },
      quiz: {
        question: "남은 두 엣지는 어디에 둘까요?",
        choices: ["앞-왼쪽과 앞-오른쪽", "위-앞과 아래-앞", "위-앞과 위-뒤"],
        answer: 0,
        why: "가운데 줄 양쪽에 두어야 Dw로 날개끼리 맞출 수 있어요.",
      },
    },
    {
      kind: "demo",
      body: "마지막 두 엣지 묶기. 이제는 위 층 엣지가 모두 묶인 것이라, R U R' F R' F' R은 묶인 엣지 하나를 깨지 않고 통째로 옮겨 바꿔 넣어요. 그래서 다른 엣지가 흐트러지지 않아요.",
      setup: { alg: setupFor(PAIR) },
      alg: PAIR,
    },
    {
      kind: "quiz",
      body: "마지막 엣지에서 가운데 엣지 블럭은 맞는데 양쪽 날개만 서로 바뀐 모양이 나올 수 있어요(5×5의 패리티). 그 엣지를 위-앞에 두고 뒤집기 공식을 해요.",
      setup: { alg: setupFor(FLIP_5) },
      quiz: {
        question:
          "가운데 엣지 블럭은 맞는데 양쪽 날개만 바뀌었어요. 어떻게 할까요?",
        choices: [
          "그 엣지를 위-앞에 두고 뒤집기 공식을 해요",
          "그대로 3×3처럼 풀어요",
        ],
        answer: 0,
        why: "3×3처럼 풀면 이 모양은 고칠 수 없어요. 뒤집기 공식이 필요해요.",
      },
    },
    {
      kind: "demo",
      body: "날개 뒤집기: 위-앞 엣지의 두 날개만 바꿔요.",
      setup: { alg: setupFor(FLIP_5) },
      alg: FLIP_5,
    },
    {
      kind: "try",
      body: "엣지 둘만 남은 5×5를 묶어요.",
      setup: { rule: "5x5-two-edges-left" },
      goal: "edges-paired",
    },
    {
      kind: "quiz",
      body: "엣지를 다 묶으면 3×3처럼 풀어요. 5×5는 한가운데 칸이 고정이라 4×4의 PLL 패리티는 나오지 않아요.",
      quiz: {
        question: "5×5에서 나오지 않는 것은?",
        choices: ["4×4의 PLL 패리티", "마지막 엣지의 날개 뒤집힘"],
        answer: 0,
        why: "한가운데 칸이 고정이라 위 층 자리가 3×3과 똑같이 나와요.",
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
  summary: "센터 → 엣지 짝 → 3×3처럼 → 패리티 둘.",
  lessons: [pieces4, centers4, edges4, solve4],
};

export const REDUCTION_555: Course = {
  id: "555-reduction",
  size: 5,
  title: "5×5 축소법",
  summary: "센터(가운데 줄 먼저) → 엣지 셋 묶기 → 마지막 두 엣지 → 3×3처럼.",
  lessons: [pieces5, centers5, edges5, lastEdges5],
};
