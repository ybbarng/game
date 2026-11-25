// 프리드리히(CFOP) 소개(docs/47 8-2 고급). 십자를 아래에서 → F2L 짝 → 전체 OLL 57·PLL 21.
// 마지막 층의 2단계 OLL·PLL은 앞 과정 「마지막 층을 공식으로」(lessons-2look.ts)에서 배운다(docs/47 16-24).
// 상황 연습(훈련)은 algs-*.ts의 상황 묶음을 쓰고, 여기는 개념을 익히는 단원이다.
// 단계 글이 말하는 모양(짝이 붙었나 등)은 flow-advanced.test.ts가 엔진으로 확인한다.
import { flip } from "./lessons-2look";
import type { Course, Lesson } from "./types";

// 시연용: @game/cube-ai의 solveCfop가 3×3 섞기 씨앗 21(루 소개와 같은 섞기)을 푼 단계별 수
const S21 = "L2 D2 U' L2 F2 D F2 U2 B2 D' L' F' R2 B U' F2 U R B L R2";
export const CFOP21 = {
  cross: "z2 L' B R L2 F' D",
  f2l: [
    "F L2 F2 L2 F'",
    "B2 R' U2 R U2 B2",
    "B' R B' R' B2",
    "U F' U2 F R U R'",
  ],
  oll: "U R U R' U R U2 R'",
  pll: "U R U R' U' D R2 U' R U' R' U R' U R2 D' U",
};

// F2L 짝 단원의 상황(모두 앞-오른쪽 칸에 넣는 풀이)
/** 붙은 짝: 엣지가 위-오른쪽, 코너 흰색이 앞 */
export const PAIR_RIGHT = "U R U' R'";
/** 붙은 짝: 엣지가 위-앞, 코너 흰색이 오른쪽 */
export const PAIR_FRONT = "U' F' U F";
/** 가짜 짝: 코너(위-앞-오른쪽)와 엣지(위-앞)가 나란하지만 색이 어긋남(F2L 13) */
export const FAKE_PAIR = "U F' U F U' F' U' F";
/** 떨어진 짝인데 칸을 올리는 동안 붙는 자리 */
export const JOIN_RIGHT = "R U R'";
export const JOIN_FRONT = "F' U' F";
/** 떨어진 짝: U' R U R'로 붙인 뒤 U2 R U' R'로 넣는다(F2L 5) */
export const SPLIT_RIGHT = "U' R U R' U2 R U' R'";
export const SPLIT_FRONT = "U F' U' F U2 F' U F";
/** 흰색이 위: R U2 R' U'로 흰색을 옆으로 돌리면 R U R' 자리가 된다(F2L 17) */
export const WHITE_UP = "R U2 R' U' R U R'";
/** 코너가 칸에 박힘: R U R' U'로 꺼내면 R U R' 자리(F2L 30) */
export const CORNER_STUCK = "R U R' U' R U R'";
/** 엣지가 칸에 뒤집혀 박힘: F' U' F로 꺼내면 붙은 짝, 그다음 U R U' R' */
export const EDGE_STUCK = "F' U' F U R U' R'";

// 아래 십자: 엣지 하나씩(흰-초록을 앞 아래로)
/** 위 층에서 흰색이 위: U'로 초록 면 위에 옮긴 뒤 F2 */
export const CROSS_TOP_UP = "U' F2";
export const CROSS_TOP_UP_TRY = "U2 R2";
/** 가운데 줄: 앞면을 한 번 돌려 내린다 */
export const CROSS_MIDDLE = "F";
/** 위층에서 흰색이 옆(앞): U'로 비켜 R'로 내리고 F로 넣은 뒤 R로 되돌린다 */
export const CROSS_TOP_SIDE = "U' R' F R";

const overview: Lesson = {
  id: "cfop-overview",
  size: 3,
  title: "프리드리히(CFOP) 한눈에",
  summary: "Cross·F2L·OLL·PLL 네 단계. 대회 선수 대부분이 쓰는 방법이에요.",
  steps: [
    {
      kind: "quiz",
      body: "앞 과정 「마지막 층을 공식으로」에서 아래 두 층은 초보자 해법으로 맞추고, 마지막 층은 2단계 OLL·PLL로 끝냈어요. 이번 과정에서는 아래 두 층도 빠르게 맞추는, 대회 선수 대부분이 쓰는 방법을 배워요. CFOP는 네 단계 이름의 첫 글자예요. Cross(십자), F2L(First Two Layers, 아래 두 층을 한꺼번에), OLL(Orientation of the Last Layer, 마지막 층 조각의 방향을 맞춰 노란 스티커가 모두 위를 보게), PLL(Permutation of the Last Layer, 마지막 층 조각의 자리 맞추기). 만든 사람 이름을 따 프리드리히 방법이라고도 해요.",
      setup: { alg: "z2" },
      mask: "f2l",
      quiz: {
        question:
          "그림에 보이는 아래 두 층을 한꺼번에 맞추는 단계는 무엇일까요?",
        choices: ["Cross", "F2L", "OLL", "PLL"],
        answer: 1,
        why: "F2L은 First Two Layers, 아래 두 층이에요.",
      },
    },
    {
      kind: "demo",
      body: "섞인 큐브를 CFOP로 끝까지 맞춰 볼게요. 흰 면을 아래로 들고 십자 → 코너 블럭 하나와 엣지 블럭 하나를 짝으로 묶어 아래 두 층의 네 자리에 하나씩 넣기(F2L) → 윗면 노랗게(OLL) → 위 층 자리(PLL) 차례예요. 시연의 마지막 층은 OLL·PLL을 공식 한 번씩으로 끝내는 전체 공식으로 쳤어요(이 과정 끝 단원에서 넓히는 공식이에요).",
      setup: { alg: S21 },
      alg: [CFOP21.cross, ...CFOP21.f2l, CFOP21.oll, CFOP21.pll].join(" "),
    },
    {
      kind: "quiz",
      body: "초보자 해법의 아래 두 층과 다른 점은 둘이에요. 십자를 처음부터 아래에 만들어요. 첫 층 코너와 둘째 층 엣지를 짝으로 묶어 한 번에 넣어요. 마지막 층은 앞 과정과 같아요.",
      setup: { alg: "z2" },
      mask: "cross",
      quiz: {
        question: "CFOP에서 흰 십자는 어디에 만들까요?",
        choices: ["위에 만든 뒤 큐브를 뒤집어요", "처음부터 아래에 만들어요"],
        answer: 1,
        why: "아래에 바로 만들면 수가 적고 다음 조각이 잘 보여요.",
      },
    },
    {
      kind: "quiz",
      body: "마지막 층 공식은 한 번에 다 외우지 않아도 돼요. 앞 과정에서 익힌 **2단계 OLL**(10개)·**2단계 PLL**(6개)로 시작하고, 손에 익으면 자주 나오는 것부터 전체 OLL 57·PLL 21로 넓혀요(이 과정의 끝 단원). 그래서 이 과정에서 새로 익힐 것은 아래 십자와 F2L 짝이에요.",
      setup: { alg: "z2" },
      mask: "oll",
      quiz: {
        question: "처음 CFOP로 맞출 때 마지막 층은 어떻게 할까요?",
        choices: [
          "OLL 57개와 PLL 21개를 한꺼번에 외워요",
          "앞 과정의 2단계 OLL·PLL로 해요",
        ],
        answer: 1,
        why: "공식 16개로 시작해 조금씩 넓히면 돼요.",
      },
    },
  ],
};

const cross: Lesson = {
  id: "cfop-cross",
  size: 3,
  title: "십자를 아래에서",
  summary:
    "흰 십자를 아래에 바로 만들어요. 흰 엣지를 하나씩 넣는 요령 셋, 그다음 살펴보기 15초 안에 계획.",
  steps: [
    {
      kind: "look",
      body: "앞 단원에서 CFOP의 네 단계를 훑어봤어요. 이번에는 첫 단계, 흰 십자를 처음부터 아래에 만들어요. 위에 만든 뒤 뒤집는 것보다 수가 적고, 다음 단계(F2L)의 조각이 바로 보여요. 어떤 십자도 8수 안에 만들 수 있어요. 큐브 전체를 돌려 흰 면을 아래로 보내 보세요.",
      mask: "cross",
      look: { color: "U", on: "D" },
    },
    {
      kind: "quiz",
      body: "아래에서 맞출 때는 흰 엣지를 흰색이 아래를 보게 넣어요. 넣기 전에 그 엣지 블럭을 제자리 바로 위, 곧 짝 색과 같은 색 센터가 있는 면 위로 옮기는데, 이 일은 아직 비어 있는 윗면을 돌려(U) 하니 이미 넣은 엣지가 흐트러지지 않아요. 흰-초록 엣지 블럭이 위 층에서 흰색이 위를 보고 있어요.",
      setup: flip(CROSS_TOP_UP),
      mask: "cross",
      quiz: {
        question: "흰-초록 엣지 블럭을 앞 아래에 어떻게 넣을까요?",
        choices: [
          "바로 F2",
          "U'로 초록 면 위에 옮긴 뒤 F2",
          "U'로 초록 면 위에 옮긴 뒤 F",
        ],
        answer: 1,
        why: "윗면을 돌려 그 엣지 블럭을 제자리 면, 곧 초록 센터가 있는 앞면 위로 옮긴 뒤, 앞면을 두 번 돌리면 흰색이 아래를 보며 제자리에 들어가요.",
      },
    },
    {
      kind: "try",
      body: "흰색이 위를 보는 흰 엣지: U로 그 엣지 블럭을 제자리 면 위에 옮긴 뒤 그 면을 두 번 돌려 내려요.",
      setup: flip(CROSS_TOP_UP_TRY),
      alg: CROSS_TOP_UP_TRY,
      goal: "cross",
      mask: "cross",
    },
    {
      kind: "try",
      body: "가운데 층에 있는 흰 엣지: 짝 색(초록) 쪽이 제자리 면에 붙어 있으면, 그 면을 한 번 돌려 흰색이 아래로 가게 내려요. 엣지 블럭이 그 면의 오른쪽에 있으면 F, 왼쪽에 있으면 F'처럼, 흰 스티커가 아래로 내려가는 쪽으로 돌려요.",
      setup: flip(CROSS_MIDDLE),
      alg: CROSS_MIDDLE,
      goal: "cross",
      mask: "cross",
    },
    {
      kind: "try",
      body: "위 층에서 흰색이 옆(앞)을 보는 흰 엣지: U'로 오른쪽 위에 비켜 놓고, R'로 가운데 줄에 내린 뒤 F로 넣어요. 마지막 R은 R'로 잠깐 올라간 오른쪽 십자 엣지 블럭을 되돌려요.",
      setup: flip(CROSS_TOP_SIDE),
      alg: CROSS_TOP_SIDE,
      goal: "cross",
      mask: "cross",
    },
    {
      kind: "find",
      body: "살펴보기(대회에서는 15초) 동안 흰 엣지 넷의 자리를 찾고 순서를 계획해요. 처음엔 둘씩 계획하는 것부터. 흰 엣지 넷을 모두 찾아 눌러 보세요(뒤쪽은 거울에서).",
      setup: flip("F2 D' R2 U L2"),
      mask: "cross",
      find: { piece: "edge", has: ["U"] },
      count: 4,
    },
    {
      kind: "demo",
      body: "흰 엣지가 흩어져 있어요. 뒤집지 않고 아래에서 바로 맞춰요.",
      setup: flip("F2 D' R2 U L2"),
      alg: "F2 D' R2 U L2",
      mask: "cross",
    },
    {
      kind: "try",
      body: "흰 면을 아래로 둔 채 십자를 만들어요.",
      setup: flip("R' F D2 B2"),
      alg: "R' F D2 B2",
      goal: "cross",
      mask: "cross",
    },
    {
      kind: "try",
      body: "섞인 큐브에서 아래 십자를 만들어요. 흰 엣지마다 위 셋 가운데 어느 경우인지 먼저 보세요. 흰 엣지가 아래 층의 다른 자리에 있거나 제자리에서 뒤집혀 있으면, 그 면을 한 번 돌려 위 층이나 가운데 층으로 올린 뒤 위 경우대로 해요. 그 면에 이미 넣은 흰 엣지가 있으면, 올린 엣지 블럭을 U로 비켜 놓고 그 면을 되돌려 놓아요.",
      setup: { rule: "random-cross" },
      goal: "cross",
      mask: "cross",
    },
  ],
};

const PAIR_CHOICES = [
  "붙었어요(진짜 짝)",
  "나란하지만 칸에 들어갈 모양이 아니에요(가짜 짝)",
  "떨어져 있어요",
];

const f2lPair: Lesson = {
  id: "cfop-f2l-pair",
  size: 3,
  title: "F2L 짝",
  summary:
    "흰 코너 블럭과 그 옆 엣지 블럭을 위에서 짝으로 붙인 뒤 한 번에 칸에 넣어요. 쉬운 것부터 칸에 박힌 조각 빼내기까지.",
  drill: "f2l",
  steps: [
    {
      kind: "find",
      body: "앞 단원에서 아래 십자를 만들었어요. 이번에는 아래 두 층의 남은 조각을 한꺼번에 채워요. 십자를 아래에 두면 네 귀퉁이에 「칸」이 남아요. 칸 하나에는 흰 코너 하나와 가운데 층 엣지 하나가 들어가요. 둘을 위 층에서 붙여 「짝」을 만든 뒤 함께 넣어요. 앞-오른쪽 칸(초록-주황)에 들어갈 코너 블럭과 엣지 블럭을 둘 다 눌러 보세요.",
      setup: flip(JOIN_RIGHT),
      mask: "f2l",
      find: { has: ["F", "L"] },
      count: 2,
    },
    {
      kind: "quiz",
      body: "「붙은 짝」은 코너 블럭과 엣지 블럭이 칸에 들어갈 때와 같은 모양으로 나란히 붙은 것이에요. 알아볼 때는 둘이 맞닿은 곳의 스티커를 봐요. 칸에 들어갈 모양이면 맞닿은 스티커가 같은 색끼리 이어져 있어요. 앞-오른쪽 위 코너 블럭과 위-오른쪽 엣지 블럭을 보세요.",
      setup: flip(PAIR_RIGHT),
      mask: "f2l",
      quiz: {
        question: "이 두 블럭은 짝으로 붙었나요?",
        choices: PAIR_CHOICES,
        answer: 0,
        why: "칸에 들어갈 때와 같은 모양으로 붙어 있어요. 윗면에서도 오른쪽 면에서도 맞닿은 스티커가 같은 색으로 이어진 것이 그 표시예요. 그대로 넣을 수 있어요.",
      },
    },
    {
      kind: "quiz",
      body: "나란히 있어도 칸에 들어갈 모양이 아니면 「가짜 짝」이에요. 맞닿은 스티커의 색이 이어지지 않는 것이 그 표시예요. 그대로 넣으면 칸에 틀리게 들어가요. 앞-오른쪽 위 코너 블럭과 위-앞 엣지 블럭을 보세요.",
      setup: flip(FAKE_PAIR),
      mask: "f2l",
      quiz: {
        question: "이 두 블럭은 짝으로 붙었나요?",
        choices: PAIR_CHOICES,
        answer: 1,
        why: "엣지 블럭이 뒤집힌 채 붙어 있어 칸에 들어갈 모양이 아니에요. 윗면에서 맞닿은 스티커의 색이 이어지지 않는 것이 그 표시예요. 떼었다가 다시 붙여야 해요.",
      },
    },
    {
      kind: "turn",
      body: "붙은 짝 넣기: 엣지 블럭이 위-오른쪽에 있으면 오른쪽에서 넣어요. U로 짝을 비켜 놓고, R로 칸을 올리고, U'로 짝을 칸 위에 되돌린 뒤 R'로 함께 내려요. U R U' R'를 쳐 보세요.",
      setup: flip(PAIR_RIGHT),
      alg: PAIR_RIGHT,
      mask: "f2l",
    },
    {
      kind: "quiz",
      body: "붙은 짝의 엣지 블럭이 위-앞에 있으면 앞에서 넣어요. 오른쪽에서 넣기의 왼쪽과 오른쪽을 뒤바꾼 꼴이라, R 자리에 F를 쓰고 돌리는 방향은 모두 반대예요.",
      setup: flip(PAIR_FRONT),
      mask: "f2l",
      quiz: {
        question: "이 붙은 짝은 어느 쪽에서 넣을까요?",
        choices: ["오른쪽에서 U R U' R'", "앞에서 U' F' U F"],
        answer: 1,
        why: "엣지 블럭이 위-앞에 있으니 앞면을 올렸다 내려요.",
      },
    },
    {
      kind: "turn",
      body: "앞에서 넣기 U' F' U F를 쳐 보세요.",
      setup: flip(PAIR_FRONT),
      alg: PAIR_FRONT,
      mask: "f2l",
    },
    {
      kind: "turn",
      body: "떨어져 있지만 바로 들어가는 자리도 있어요. 코너 블럭이 앞-오른쪽 위에서 흰색이 오른쪽을 보고 엣지 블럭이 위-뒤에 있으면 R U R'. R로 칸을 올리는 동안 짝이 붙어요.",
      setup: flip(JOIN_RIGHT),
      alg: JOIN_RIGHT,
      mask: "f2l",
    },
    {
      kind: "turn",
      body: "왼쪽·오른쪽을 뒤바꾼 같은 경우: 코너 블럭이 앞-오른쪽 위에서 흰색이 앞을 보고 엣지 블럭이 위-왼쪽에 있으면 F' U' F.",
      setup: flip(JOIN_FRONT),
      alg: JOIN_FRONT,
      mask: "f2l",
    },
    {
      kind: "demo",
      body: "떨어진 짝은 먼저 붙여요. U' R U R'로 코너 블럭을 칸에 잠깐 넣었다 빼면 뒤-오른쪽에 붙은 짝이 생겨요. U2로 짝을 옮긴 뒤 R U' R'로 넣어요.",
      setup: flip(SPLIT_RIGHT),
      alg: SPLIT_RIGHT,
      mask: "f2l",
    },
    {
      kind: "try",
      body: "이번엔 앞에서: U F' U' F로 붙이고 U2 F' U F로 넣어요.",
      setup: flip(SPLIT_FRONT),
      alg: SPLIT_FRONT,
      goal: "f2l-pair:FR",
      mask: "f2l",
    },
    {
      kind: "try",
      body: "흰 코너가 앞-오른쪽 위에서 흰색이 위를 볼 때: R U2 R' U'로 그 코너 블럭을 돌려 흰색을 오른쪽으로 보내면, 앞에서 본 R U R' 자리가 돼요.",
      setup: flip(WHITE_UP),
      alg: WHITE_UP,
      goal: "f2l-pair:FR",
      mask: "f2l",
    },
    {
      kind: "demo",
      body: "앞-오른쪽 칸에 코너 블럭이 돌아간 채 박혀 있으면 먼저 꺼내요. R U R' U'로 그 블럭을 위로 빼면 R U R' 자리가 돼요.",
      setup: flip(CORNER_STUCK),
      alg: CORNER_STUCK,
      mask: "f2l",
    },
    {
      kind: "try",
      body: "엣지 블럭이 칸에 뒤집혀 박혀 있어요. F' U' F로 그 블럭을 꺼내면 위-오른쪽에 붙은 짝이 생겨요. 그다음 U R U' R'로 넣어요.",
      setup: flip(EDGE_STUCK),
      alg: EDGE_STUCK,
      goal: "f2l-pair:FR",
      mask: "f2l",
    },
    {
      kind: "quiz",
      body: "F2L에서 쓰는 손놀림은 셋이에요. 칸을 올렸다 내려 박힌 조각 「빼내기」, 윗면을 돌려 「붙이기」, 붙은 짝 「넣기」.",
      setup: flip(CORNER_STUCK),
      mask: "f2l",
      quiz: {
        question: "짝 조각이 칸에 잘못 박혀 있으면 먼저 무엇을 할까요?",
        choices: [
          "R U R'처럼 칸을 올렸다 내려 위로 꺼내요",
          "그대로 두고 다른 칸부터 넣어요",
        ],
        answer: 0,
        why: "위로 꺼내면 앞에서 익힌 쉬운 경우가 돼요. 박힌 채로 두면 이 칸은 끝내 맞지 않아요.",
      },
    },
    {
      kind: "try",
      body: "십자와 칸 셋이 맞은 큐브에서 마지막 짝을 넣어요. 빼내기 → 붙이기 → 넣기 차례로 생각해요.",
      setup: { rule: "f2l-one-slot" },
      goal: "f2l",
      mask: "f2l",
    },
    {
      kind: "quiz",
      body: "41가지 상황이 있지만 외우기보다 「짝을 만든다 → 넣는다」로 이해하는 것이 먼저예요. 단원 끝 「이 공식 훈련하기」에서 41가지를 하나씩 연습할 수 있어요.",
      setup: { alg: "z2" },
      mask: "f2l",
      quiz: {
        question: "F2L을 처음 익힐 때 알맞은 것은?",
        choices: [
          "41가지 공식을 먼저 다 외워요",
          "짝을 만들고 넣는 흐름을 먼저 이해해요",
        ],
        answer: 1,
        why: "흐름을 알면 처음 보는 상황도 풀 수 있어요. 공식은 훈련에서 조금씩 늘려요.",
      },
    },
  ],
};

const fullSets: Lesson = {
  id: "cfop-full",
  size: 3,
  title: "전체 OLL·PLL로 넓히기",
  summary: "2단계에 익숙해지면 한 번에 끝내는 공식을 늘려요.",
  drill: "pll",
  steps: [
    {
      kind: "quiz",
      body: "앞 단원까지 아래 십자와 F2L 짝을 익혔으니, 마지막 층을 앞 과정의 2단계 OLL·PLL로 하면 CFOP로 끝까지 맞출 수 있어요. 2단계 OLL·PLL에 익숙해지면, 마지막 층을 공식 한 번씩으로 끝내는 전체 공식으로 넓혀요. PLL 21개를 먼저 다 외우는 사람이 많아요. 21개 가운데 2단계 PLL 6개는 이미 알고, OLL 57개보다 적어요. OLL 57개는 비슷한 모양끼리 묶어 조금씩 외워요.",
      setup: { rule: "oll-solved" },
      mask: "pll",
      quiz: {
        question: "전체 공식으로 넓힐 때 보통 무엇부터 다 외울까요?",
        choices: ["PLL 21개", "OLL 57개"],
        answer: 0,
        why: "PLL은 21개로 OLL보다 적고, 그 가운데 6개는 2단계 PLL로 이미 알아요. 공식 훈련에서 하나씩 연습해 보세요.",
      },
    },
    {
      kind: "try",
      body: "윗면이 노란 큐브에서, 공식 훈련에서 익힌 PLL이 있으면 하나로 끝내 보세요. 모르는 모양이면 2단계로 풀어요.",
      setup: { rule: "oll-solved" },
      goal: "ll",
      mask: "pll",
    },
  ],
};

export const CFOP_INTRO: Course = {
  id: "cfop",
  size: 3,
  title: "프리드리히(CFOP)",
  summary:
    "아래 십자 → F2L 짝 → 전체 OLL·PLL. 마지막 층은 앞 과정의 2단계 OLL·PLL로 시작해요.",
  lessons: [overview, cross, f2lPair, fullSets],
};
