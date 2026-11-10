// 4×4·5×5 축소법(docs/47 8-2): 센터를 맞추고 엣지를 묶어 「큰 3×3」으로 만든 뒤 3×3처럼 푼다.
// 표기: Rw = 바깥 두 층, 2R = 바깥에서 둘째 층 하나만, Uw·Dw = 위·아래 두 층.
import { solvedCube } from "@game/cube-engine";

import { EDGES_5X5, PARITY_4X4 } from "./algs-big";
import { play, runStage, stepMoves } from "./beginner-path";
import {
  CENTER_IN,
  CENTER_IN_DOWN,
  CROSS_IN,
  EDGE_FLIP,
  holdFor,
} from "./big-path";
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

// 센터 만들기 작은 상황. 모범 답은 big-path.ts 규칙이 그 상황에서 내는 수와 같다(big-path.test.ts가 엔진으로 확인)
/** 흰 센터 블럭 하나: F로 앞면 오른쪽 아래 칸에, U로 윗면 왼쪽 뒤 칸에 흰색이 아닌 센터 블럭을 두고 넣기 */
export const CENTER_HOLD = `F U' ${CENTER_IN}`;
/** 흰 센터 블럭이 아랫면에: D로 아랫면 오른쪽 뒤 칸에, U로 윗면 왼쪽 뒤 칸을 맞추고 넣기 */
export const CENTER_DOWN = `D' U2 ${CENTER_IN_DOWN}`;
/** 노란 센터(노란 면을 위로 쥐었다): 오른쪽 옆면의 노란 센터 블럭을 y로 앞으로 가져와 넣기 */
export const CENTER_YELLOW = `y F2 U ${CENTER_IN}`;
export const CENTER_YELLOW_SETUP = `x2 ${setupFor(CENTER_YELLOW)}`;
/** 마지막 두 면: 파란 면을 위로, 흰 면을 오른쪽으로 쥐면 앞면이 주황 면이다 */
export const LAST_TWO_HOLD = holdFor(4, 5);
export const CENTER_LAST_TWO = `F U ${CENTER_IN}`;
export const CENTER_LAST_TWO_SETUP = `${LAST_TWO_HOLD} ${setupFor(CENTER_LAST_TWO)}`;
/** 5×5 십자 쪽 센터 블럭 하나(다른 센터 블럭은 그대로) */
export const CROSS_ONE = CROSS_IN;
/** 엣지 묶기: Dw로 짝 날개를 앞-오른쪽 아래로 → 엣지 뒤집기로 위로 → Dw'로 비켰던 아래 날개가 돌아와 붙음 */
export const EDGE_PAIR_DOWN = PAIR;
/** 같은 흐름을 위 두 층으로 */
export const EDGE_PAIR_UP = `Uw ${EDGE_FLIP} Uw'`;
/** 위 두 층 흐름의 왼쪽 거울 */
export const EDGE_PAIR_UP_LEFT = "Uw' L' U' L F' L F L' Uw";
/** 마지막 엣지 넷: 위 날개 경우(앞-왼쪽 위의 짝을 Uw'로) → 묶이지 않은 앞-왼쪽 줄을 y'로 쥐고 아래 날개 경우 */
export const EDGE_HIGH_CASE = `Uw' ${EDGE_FLIP} Uw y' Dw ${EDGE_FLIP} Dw'`;
/** 마지막 엣지 넷: 짝을 데려올 수 없는 경우는 엣지 뒤집기 한 번 → 아래 날개 경우 */
export const EDGE_FLIP_CASE = `${EDGE_FLIP} Dw ${EDGE_FLIP} Dw'`;
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
    "표기(2R·Rw·Uw) → 센터 블럭 하나씩 넣기(2R U 2R') → 흰 → 노랑 → 초록·빨강·파랑, 주황은 저절로.",
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
      body: "4×4에는 움직이지 않는 센터 블럭이 없어서, 어느 면을 무슨 색으로 할지 먼저 정해요. 지금 윗면을 흰 면, 앞면을 초록 면으로 삼아요. 면마다 센터 블럭 네 칸(2×2)을 모으는데, 흰 센터부터 만들어요. 흩어진 흰 센터 블럭 넷을 모두 찾아 눌러 보세요(뒤쪽은 거울에서).",
      setup: { alg: "2R" },
      find: { piece: "center", colors: ["U"] },
      count: 4,
    },
    {
      kind: "try",
      body: "센터 블럭은 하나씩 넣어요. 공식은 2R U 2R' 하나예요. 2R로 앞면 오른쪽 안쪽 줄을 위로 올리고, U로 올라간 블럭을 옆으로 비킨 뒤, 2R'로 줄을 되돌려요. 그러면 앞면 오른쪽 아래 센터 블럭이 윗면에 들어가고, 윗면 왼쪽 뒤 센터 블럭이 앞면으로 내려가요. 윗면과 앞면 말고는 센터 블럭이 그대로예요. 지금 흰 센터 블럭 하나가 앞면 오른쪽 아래에 있고, 윗면 왼쪽 뒤 칸에는 흰색이 아닌 센터 블럭이 있어요. 2R U 2R'을 쳐 보세요.",
      setup: { alg: setupFor(CENTER_IN) },
      alg: CENTER_IN,
      goal: "centers",
    },
    {
      kind: "quiz",
      body: "공식 앞에 늘 같은 차례로 쥐어요. ① 넣을 흰 센터 블럭이 있는 옆면을 y로 앞으로 가져와요. ② F를 돌려 그 블럭을 앞면 오른쪽 아래 칸에 둬요. ③ U를 돌려 윗면 왼쪽 뒤 칸에 흰색이 아닌 센터 블럭을 둬요. U는 윗면 안에서만 돌리니 이미 넣은 흰 센터 블럭은 윗면에 그대로 있어요. 그다음 2R U 2R'을 치면 흰 센터 블럭이 꼭 하나 늘어요.",
      quiz: {
        question:
          "넣을 흰 센터 블럭이 앞면 왼쪽 위에 있어요. F를 어떻게 돌리면 오른쪽 아래 칸에 올까요?",
        choices: ["F2", "F", "F'"],
        answer: 0,
        why: "왼쪽 위와 오른쪽 아래는 서로 마주 보는 칸이라 반 바퀴(F2)예요.",
      },
    },
    {
      kind: "try",
      body: "흰 센터 블럭 하나가 앞면에 남았어요. F로 그 블럭을 앞면 오른쪽 아래 칸에, U로 윗면 왼쪽 뒤 칸에 흰색이 아닌 센터 블럭을 둔 뒤 2R U 2R'을 쳐 보세요.",
      setup: { alg: setupFor(CENTER_HOLD) },
      alg: CENTER_HOLD,
      goal: "centers",
    },
    {
      kind: "try",
      body: "넣을 흰 센터 블럭이 아랫면에 있으면 2R2 U 2R2를 써요. 2R2가 아랫면 오른쪽 안쪽 줄을 위로 올리고, U로 비킨 뒤, 2R2로 줄을 되돌려요. 아랫면 오른쪽 뒤 센터 블럭이 윗면에 들어가고, 윗면 왼쪽 뒤 센터 블럭이 아랫면으로 내려가요. D로 흰 센터 블럭을 아랫면 오른쪽 뒤 칸에, U로 윗면 왼쪽 뒤 칸에 흰색이 아닌 센터 블럭을 둔 뒤 쳐 보세요.",
      setup: { alg: setupFor(CENTER_DOWN) },
      alg: CENTER_DOWN,
      goal: "centers",
    },
    {
      kind: "try",
      body: "흰 센터를 다 만들면 맞은편에 노란 센터를 만들어요. x2로 큐브를 뒤집어 노란 면을 위로 쥐었어요. 흰 면은 아래예요. 같은 공식을 써요. 2R이 흰 면의 줄을 잠깐 옮겨도 2R'이 되돌려 흰 센터는 그대로예요. 노란 센터 블럭은 옆면 넷에서 가져와요(흰 면에는 없어요). 지금 노란 센터 블럭 하나가 오른쪽 옆면에 있어요. y로 그 면을 앞으로 가져오고, F와 U로 쥔 뒤 2R U 2R'을 쳐 보세요.",
      setup: { alg: CENTER_YELLOW_SETUP },
      alg: CENTER_YELLOW,
      goal: "centers",
    },
    {
      kind: "quiz",
      body: "남은 넷(초록·빨강·파랑·주황)은 둘레를 도는 순서가 정해져 있어요. 흰 면을 위로 들었을 때 앞 초록, 오른쪽 빨강, 뒤 파랑, 왼쪽 주황. 이 순서가 틀리면 3×3처럼 풀 수 없어요. 처음에 앞면을 초록 면으로 정했으니 나머지 자리도 정해져 있어요.",
      quiz: {
        question:
          "흰 면이 위, 초록이 앞이에요. 오른쪽에는 무슨 색 센터가 와야 할까요?",
        choices: ["빨강", "파랑", "주황"],
        answer: 0,
        why: "앞 초록, 오른쪽 빨강, 뒤 파랑, 왼쪽 주황 차례예요.",
      },
    },
    {
      kind: "quiz",
      body: "옆면 넷은 초록 → 빨강 → 파랑 차례로 만들어요. 만들 면을 위로, 흰 면을 오른쪽으로 쥐어요(노란 면은 왼쪽). 공식은 윗면과 앞면만 바꾸니, 가져올 센터 블럭은 앞면이나 뒷면에서 가져오고(뒷면이면 y2로 앞으로), 아랫면이면 2R2 U 2R2로 가져와요. 흰·노란 면과 이미 만든 면에서는 가져오지 않아요. 파랑까지 만들면 남은 주황은 저절로 맞아요.",
      quiz: {
        question:
          "빨간 면을 위로, 흰 면을 오른쪽으로 쥐었어요. 앞은 파란 면, 뒤는 이미 만든 초록 면, 아래는 주황 면이에요. 빨간 센터 블럭이 아랫면에 있으면?",
        choices: [
          "D로 아랫면 오른쪽 뒤 칸에 두고, U로 윗면 왼쪽 뒤 칸을 맞춘 뒤 2R2 U 2R2",
          "y2로 아랫면을 앞으로 가져와요",
          "초록 면에서 먼저 가져와요",
        ],
        answer: 0,
        why: "아랫면에 있는 센터 블럭은 아랫면 공식으로 바로 올려요. y2는 앞과 뒤를 바꿀 뿐이고, 초록 면은 이미 만든 면이에요.",
      },
    },
    {
      kind: "try",
      body: "마지막 두 면도 같은 공식이에요. 파란 면을 위로, 흰 면을 오른쪽으로 쥐었어요. 앞면이 남은 주황 면이에요. 파란 센터 블럭을 하나씩 넣으면, 윗면에서 내려간 블럭이 주황 센터 블럭이라 두 면이 함께 맞아요. F와 U로 쥔 뒤 2R U 2R'을 쳐 보세요.",
      setup: { alg: CENTER_LAST_TWO_SETUP },
      alg: CENTER_LAST_TWO,
      goal: "centers",
    },
    {
      kind: "quiz",
      body: "자주 하는 실수: 2R 뒤에 2R'을 빼먹는 것. 2R은 아랫면과 뒷면의 줄도 함께 옮겨서, 되돌리지 않으면 이미 만든 면이 흐트러져요.",
      setup: { alg: "2R" },
      quiz: {
        question:
          "2R을 쳤더니 흰 센터가 흐트러졌어요. U를 친 다음 무엇을 할까요?",
        choices: ["그대로 두고 다음 블럭으로 가요", "2R'로 안쪽 층을 되돌려요"],
        answer: 1,
        why: "2R'로 되돌려야 다른 면의 줄이 돌아와요.",
      },
    },
    {
      kind: "try",
      body: "섞인 4×4에서 여섯 면의 센터를 만들어요. 지금 윗면을 흰 면, 앞면을 초록 면으로 정하고 흰 → 노랑 → 초록 → 빨강 → 파랑 차례로, 만들 면을 위로 쥐고 하나씩 넣어요.",
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
    "같은 색 날개 둘을 한 줄로: Dw로 짝 데려오기 → 엣지 뒤집기 → 되돌리기. 마지막 넷은 경우 셋.",
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
      body: "아래 두 층만 돌아가 있으니 Dw로 되돌리면 빨강-초록 날개 둘이 다시 한 줄로 붙어요. Dw를 쳐 보세요.",
      setup: { alg: "Dw'" },
      alg: "Dw",
    },
    {
      kind: "demo",
      body: "섞인 큐브에서는 Dw로 한 줄을 붙이면 다른 줄이 떨어지고 센터도 흐트러져요. 그래서 묶을 줄을 앞-오른쪽에 두고 세 걸음으로 붙여요. ① 앞-오른쪽 줄 아래 날개의 짝을 다른 줄의 아래에서 찾아, Dw로 앞-오른쪽 아래로 데려와요(앞-왼쪽이면 Dw, 뒤-오른쪽이면 Dw', 뒤-왼쪽이면 Dw2). 원래 아래 날개는 옆 줄로 비켜요. ② R U R' F R' F' R로 앞-오른쪽 줄을 뒤집어요. 데려온 날개가 위로 올라가고 위 날개가 아래로 내려가요. 이 공식을 「엣지 뒤집기」라고 불러요. 위 층 엣지는 자리만 돌고 날개 짝은 그대로예요. ③ Dw를 되돌리면 비켰던 아래 날개가 돌아와 데려온 날개와 한 줄로 붙어요. 센터도 다시 맞아요.",
      setup: { alg: setupFor(EDGE_PAIR_DOWN) },
      alg: EDGE_PAIR_DOWN,
    },
    {
      kind: "quiz",
      body: "아래 날개의 짝이 다른 줄의 위에 있으면 Dw로는 데려올 수 없어요. 그때는 위 날개를 봐요. 위 날개의 짝이 다른 줄의 위에 있으면 위 두 층(Uw)으로 같은 일을 해요. Uw로 짝을 앞-오른쪽 위로 데려오고(뒤-오른쪽이면 Uw, 앞-왼쪽이면 Uw', 뒤-왼쪽이면 Uw2), 엣지 뒤집기로 아래로 내린 뒤, Uw를 되돌리면 비켰던 위 날개가 돌아와 붙어요.",
      quiz: {
        question:
          "앞-오른쪽 위 날개의 짝이 뒤-오른쪽 줄의 위에 있어요. 먼저 무엇을 칠까요?",
        choices: ["Uw", "Uw'", "Dw"],
        answer: 0,
        why: "Uw는 위 두 층을 U와 같은 쪽으로 돌려 뒤-오른쪽 위를 앞-오른쪽 위로 데려와요.",
      },
    },
    {
      kind: "quiz",
      body: "처음 8쌍은 위 층과 아래 층 엣지 자리도 쓰며 쉽게 묶이고, 마지막 4쌍이 어려워요. 묶인 엣지 여덟을 위 층과 아래 층에 모아 두고, 남은 넷을 가운데 줄 네 자리(앞-오른쪽·앞-왼쪽·뒤-오른쪽·뒤-왼쪽)에서 묶어요. 엣지 뒤집기와 Dw·Uw는 위·아래 층의 묶인 엣지를 짝째로 옮기기만 해서 풀지 않아요.",
      quiz: {
        question: "마지막 4쌍은 어디에서 묶을까요?",
        choices: [
          "묶인 엣지를 위·아래 층에 모아 두고 가운데 줄에서",
          "묶인 엣지를 가운데 줄에 모아 두고 위 층에서",
        ],
        answer: 0,
        why: "가운데 줄에서 묶어야 Dw·Uw로 다른 묶음을 흐트러뜨리지 않아요.",
      },
    },
    {
      kind: "try",
      body: "마지막 넷은 한 줄씩 이 차례로 해요. ① 묶이지 않은 줄 하나를 y로 앞-오른쪽에 둬요. ② 아래 날개의 짝이 다른 줄 아래에 있으면 Dw 경우. ③ 아니면 위 날개의 짝이 다른 줄 위에 있는지 보고 Uw 경우. 이 큐브는 앞-오른쪽 줄 아래 날개의 짝이 위에 있고, 위 날개의 짝은 앞-왼쪽 위에 있어요. Uw' 경우로 앞-오른쪽을 묶은 뒤, 묶이지 않은 앞-왼쪽 줄을 y'로 앞-오른쪽에 두고 Dw 경우를 해 보세요.",
      setup: { alg: setupFor(EDGE_HIGH_CASE) },
      alg: EDGE_HIGH_CASE,
      goal: "edges-paired",
    },
    {
      kind: "quiz",
      body: "아래 날개의 짝은 다른 줄의 위에, 위 날개의 짝은 다른 줄의 아래에 있을 때가 있어요. 그러면 Dw로도 Uw로도 짝을 데려올 수 없어요.",
      quiz: {
        question: "그럴 때는 어떻게 할까요?",
        choices: [
          "엣지 뒤집기를 한 번 쳐서 앞-오른쪽 줄의 위·아래 날개를 바꾼 뒤 Dw 경우로",
          "Dw2로 아래 두 층을 반 바퀴 돌려 둬요",
        ],
        answer: 0,
        why: "엣지 뒤집기는 앞-오른쪽 줄의 두 날개 자리를 바꿔요. 위 날개의 짝은 다른 줄 아래에 있었으니, 아래로 내려온 그 날개는 Dw 경우가 돼요.",
      },
    },
    {
      kind: "try",
      body: "이 큐브가 그 경우예요. 엣지 뒤집기 한 번 → Dw로 짝 데려오기 → 엣지 뒤집기 → Dw'. 공식 한 번에 한 줄씩 묶이고, 마지막 두 줄은 함께 묶여요.",
      setup: { alg: setupFor(EDGE_FLIP_CASE) },
      alg: EDGE_FLIP_CASE,
      goal: "edges-paired",
    },
    {
      kind: "try",
      body: "센터와 엣지 여덟이 묶인 4×4에서 가운데 줄의 남은 넷을 묶어요. 묶이지 않은 줄을 앞-오른쪽에 두고 Dw 경우 → Uw 경우 → 엣지 뒤집기 차례로 봐요.",
      setup: { rule: "4x4-last-four-edges" },
      goal: "edges-paired",
    },
    {
      kind: "try",
      body: "센터가 다 맞은 4×4에서 엣지 12쌍을 묶어요. 처음 여덟은 같은 세 걸음으로 앞-오른쪽에서 묶고, 묶은 줄은 위 층에 올려 모아요. U로 위 층의 묶이지 않은 엣지를 위-뒤에 두고 R U R'을 치면, 앞-오른쪽의 묶은 줄이 위-앞으로 올라가고 위-뒤 엣지가 앞-오른쪽으로 내려와요. 위 층 넷이 묶인 줄로 차면 x2로 뒤집어 새 위 층을 같은 법으로 채워요. 마지막 넷은 앞에서 본 차례로 묶어요.",
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
    "면마다 센터 블럭 3×3 아홉 칸. 대각선 쪽 넷(2R U 2R') → 십자 쪽 넷(3R U 2L' U' 3R' U 2L U'). 색 순서는 한가운데 칸이 정해요.",
  steps: [
    {
      kind: "find",
      body: "앞 단원에서 5×5의 조각을 봤어요. 이번에는 센터를 만들어요. 5×5는 면 한가운데 칸이 움직이지 않아 3×3처럼 면마다 제자리가 정해져 있어요. 그 둘레 여덟 칸을 모아요. 앞면에서 초록 센터 블럭을 셋 눌러 보세요.",
      find: { piece: "center", colors: ["F"] },
      count: 3,
    },
    {
      kind: "quiz",
      body: "둘레 여덟 칸은 두 종류예요. 구석 쪽 넷(한가운데 칸과 대각선으로 닿은 칸, 「대각선 쪽」)과 한가운데 칸에 변으로 붙은 넷(「십자 쪽」). 어떻게 돌려도 대각선 쪽 센터 블럭은 대각선 쪽 칸으로, 십자 쪽 센터 블럭은 십자 쪽 칸으로만 가요. 그래서 두 종류를 따로 넣어요.",
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
      kind: "try",
      goal: "centers",
      body: "면마다 대각선 쪽 넷을 먼저, 십자 쪽 넷을 다음에 넣어요. 대각선 쪽은 4×4와 같은 공식 2R U 2R'이에요(앞면 오른쪽 아래 → 윗면, 윗면 왼쪽 뒤 → 앞면). 다만 5×5에서는 십자 쪽 센터 블럭도 하나 함께 옮겨져요. 대각선 쪽을 넣는 동안은 십자 쪽을 보지 않아요. 지금 흰 대각선 쪽 센터 블럭 하나가 앞면 오른쪽 아래 구석에 있고, 윗면 왼쪽 뒤 구석에는 흰색이 아닌 센터 블럭이 있어요. 2R U 2R'을 쳐 보세요.",
      setup: { alg: setupFor(CENTER_IN) },
      alg: CENTER_IN,
    },
    {
      kind: "turn",
      body: "십자 쪽 공식에는 한가운데 층이 필요해요. 3R은 바깥에서 셋째 층, 곧 5×5의 한가운데 층을 R과 같은 쪽으로 돌려요(M과는 반대쪽). 2L은 왼쪽에서 둘째 층을 L과 같은 쪽으로 돌려요. 3R을 쳐 보세요.",
      alg: "3R",
    },
    {
      kind: "try",
      body: "십자 쪽 공식은 3R U 2L' U' 3R' U 2L U'이에요. 앞면 아래 십자 칸의 센터 블럭은 윗면 앞 십자 칸으로, 윗면 앞 십자 칸에 있던 블럭은 앞면 왼쪽 십자 칸으로, 앞면 왼쪽 십자 칸의 블럭은 앞면 아래 십자 칸으로, 이 셋만 돌아가요. 다른 센터 블럭은 모두 그대로라 먼저 넣은 대각선 쪽도 흐트러지지 않아요. F로 넣을 블럭을 앞면 아래 십자 칸에, U로 윗면 앞 십자 칸에 흰색이 아닌 센터 블럭을 두고 쳐요. 지금은 그렇게 놓여 있어요. 쳐 보세요.",
      setup: { alg: setupFor(CROSS_ONE) },
      alg: CROSS_ONE,
      goal: "centers",
    },
    {
      kind: "quiz",
      body: "넣을 센터 블럭이 아랫면에 있으면 아랫면 공식을 써요. 대각선 쪽은 2R2 U 2R2(아랫면 오른쪽 뒤 구석 → 윗면), 십자 쪽은 3R2 U 2L2 U' 3R2 U 2L2 U'(아랫면 뒤 십자 칸 → 윗면 앞 십자 칸)예요. D로 블럭을 그 칸에, U로 윗면 칸을 맞춘 뒤 쳐요.",
      quiz: {
        question:
          "흰 십자 쪽 센터 블럭이 아랫면 뒤 십자 칸에 있어요. 어느 공식을 칠까요?",
        choices: [
          "3R2 U 2L2 U' 3R2 U 2L2 U'",
          "2R2 U 2R2",
          "3R U 2L' U' 3R' U 2L U'",
        ],
        answer: 0,
        why: "십자 쪽이고 아랫면에 있으니 아랫면 십자 쪽 공식이에요. 2R2 U 2R2는 대각선 쪽, 3R U 2L' …은 앞면에서 가져오는 공식이에요.",
      },
    },
    {
      kind: "quiz",
      body: "면 차례와 쥐는 법은 4×4와 같아요. 흰 → 노랑(x2로 위로) → 초록 → 빨강 → 파랑, 만들 면을 위로 쥐고 옆면은 흰 면을 오른쪽에 둬요. 가져올 곳도 같아요(흰·노란 면을 만들 때는 옆면 넷과 아랫면, 옆면을 만들 때는 앞·뒤 면과 아랫면, 이미 만든 면은 빼고). 5×5는 한가운데 칸이 면 색을 정해 주니, 색을 고를 일은 없어요.",
      quiz: {
        question: "흰 면을 위로 쥐었을 때 초록 센터를 만들 면은?",
        choices: ["초록 한가운데 칸이 있는 면", "아무 옆면이나 골라요"],
        answer: 0,
        why: "한가운데 칸은 움직이지 않아 그 면의 색을 정해요.",
      },
    },
    {
      kind: "try",
      body: "섞인 5×5에서 여섯 면의 센터를 만들어요. 면마다 대각선 쪽 넷 → 십자 쪽 넷.",
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
      body: "앞 단원에서 센터를 맞췄어요. 이번에는 엣지를 묶어요. 5×5의 엣지는 가운데 엣지 블럭 하나와 날개 둘, 세 블럭이에요. 가운데 엣지 블럭을 기준으로 같은 색 날개를 하나씩 붙여요. 붙이는 흐름은 4×4와 같아요(짝 날개를 데려오고 → 엣지 뒤집기 → 되돌리기). 흩어진 흰-초록 엣지 블럭 셋을 모두 찾아 눌러 보세요.",
      setup: { alg: "2R" },
      find: { piece: "edge", colors: ["U", "F"] },
      count: 3,
    },
    {
      kind: "demo",
      body: "가운데 엣지 블럭에 날개 하나 붙이기: 앞-오른쪽 줄에 붙일 날개가 뒤-오른쪽 위에 있어요. Uw로 그 날개를 앞-오른쪽 위로 데려오고(원래 위 날개는 비켜요), 엣지 뒤집기 R U R' F R' F' R로 아래로 내린 뒤, Uw'로 되돌리면 비켰던 위 날개가 돌아와 세 블럭이 한 줄로 붙어요.",
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
      body: "앞 단원에서 엣지를 열 개 묶었어요. 마지막 두 엣지는 빈 자리가 없어 다른 엣지를 흐트러뜨리지 않고 묶어야 해요. 둘을 앞-왼쪽·앞-오른쪽에 두고, 4×4와 같은 세 걸음으로 묶어요. Dw로 앞-왼쪽 아래 날개를 앞-오른쪽 아래로 데려오고, 엣지 뒤집기로 위로 올린 뒤, Dw'로 되돌려요.",
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
      body: "마지막 두 엣지 묶기. 엣지 뒤집기 R U R' F R' F' R은 앞-오른쪽 줄만 뒤집고, 위 층 엣지는 묶인 채 자리만 돌려요. 그래서 다른 엣지가 흐트러지지 않아요.",
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
