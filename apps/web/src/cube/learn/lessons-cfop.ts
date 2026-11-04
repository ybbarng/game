// 프리드리히(CFOP) 소개(docs/47 8-2 고급). 십자를 아래에서 → F2L 짝 → 2단계 OLL·PLL → 전체 OLL 57·PLL 21.
// 상황 연습(훈련)은 algs-*.ts의 상황 묶음을 쓰고, 여기는 개념을 익히는 단원이다.
import { setupFor } from "./notation";
import type { Course, Lesson } from "./types";

const flip = (solution: string) => ({ alg: setupFor(solution, "z2") });

const T_PERM = "R U R' U' R' F R2 U' R' U' R U R' F'";

const overview: Lesson = {
  id: "cfop-overview",
  size: 3,
  title: "프리드리히(CFOP) 한눈에",
  summary: "Cross·F2L·OLL·PLL 네 단계. 대회 선수 대부분이 쓰는 방법이에요.",
  steps: [
    {
      kind: "quiz",
      body: "CFOP는 단계 이름의 첫 글자예요. Cross(십자), F2L(First Two Layers, 아래 두 층 한꺼번에), OLL(Orientation of the Last Layer, 윗면 한 색), PLL(Permutation of the Last Layer, 윗층 자리). 만든 사람 이름을 따 프리드리히 방법이라고도 해요.",
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
      kind: "quiz",
      body: "층별 맞추기와 다른 점은 셋이에요. 십자를 처음부터 아래에 만들어요. 첫 층 꼭짓점과 둘째 층 모서리를 짝으로 묶어 한 번에 넣어요. 마지막 층을 공식 두 번(OLL, PLL)으로 끝내요.",
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
      body: "한 번에 다 외우지 않아도 돼요. 먼저 2단계 OLL(10개)·2단계 PLL(6개)로 시작하고, 자주 나오는 것부터 전체 OLL 57·PLL 21로 넓혀요.",
      setup: { alg: "z2" },
      mask: "oll",
      quiz: {
        question: "처음 CFOP를 배울 때 무엇부터 할까요?",
        choices: [
          "OLL 57개와 PLL 21개를 한꺼번에 외워요",
          "2단계 OLL(10개)·2단계 PLL(6개)부터 해요",
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
    "흰 십자를 아래에 바로 만들어요. 살펴보기 15초 안에 계획하고 8수 안에.",
  steps: [
    {
      kind: "look",
      body: "흰 면을 아래로 들고 십자를 만들어요. 위에 만든 뒤 뒤집는 것보다 수가 적고, 다음 단계(F2L)의 조각이 바로 보여요. 어떤 십자도 8수 안에 만들 수 있어요. 큐브 전체를 돌려 흰 면을 아래로 보내 보세요.",
      mask: "cross",
      look: { color: "U", on: "D" },
    },
    {
      kind: "find",
      body: "살펴보기(대회에서는 15초) 동안 흰 모서리 넷의 자리를 찾고 순서를 계획해요. 처음엔 둘씩 계획하는 것부터. 흰 모서리 넷을 모두 찾아 눌러 보세요(뒤쪽은 왼쪽 위 펼친 그림에서).",
      setup: flip("F2 D' R2 U L2"),
      mask: "cross",
      find: { piece: "edge", has: ["U"] },
      count: 4,
    },
    {
      kind: "demo",
      body: "흰 모서리가 흩어져 있어요. 뒤집지 않고 아래에서 바로 맞춰요.",
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
      body: "섞인 큐브에서 아래 십자를 만들어요.",
      setup: { rule: "random-cross" },
      goal: "cross",
      mask: "cross",
    },
  ],
};

const f2lPair: Lesson = {
  id: "cfop-f2l-pair",
  size: 3,
  title: "F2L 짝",
  summary: "꼭짓점과 모서리를 위에서 짝으로 붙인 뒤 한 번에 칸에 넣어요.",
  steps: [
    {
      kind: "find",
      body: "십자를 아래에 두면 네 귀퉁이에 「칸」이 남아요. 칸 하나에는 흰 꼭짓점 하나와 가운데 줄 모서리 하나가 들어가요. 둘을 윗층에서 붙여 짝을 만든 뒤 넣어요. 앞-오른쪽 칸(초록-주황)에 들어갈 꼭짓점과 모서리를 둘 다 눌러 보세요.",
      setup: flip("R U R'"),
      mask: "f2l",
      find: { has: ["F", "L"] },
      count: 2,
    },
    {
      kind: "turn",
      body: "가장 쉬운 넷: 짝이 이미 붙어 있으면 R U R'(오른쪽에서) 또는 F' U' F(앞에서). 떨어져 있지만 바로 들어갈 자리면 U R U' R' 또는 U' F' U F. 붙은 짝을 앞에서 넣는 F' U' F를 쳐 보세요.",
      setup: flip("F' U' F"),
      alg: "F' U' F",
      mask: "f2l",
    },
    {
      kind: "demo",
      body: "붙어 있는 짝을 오른쪽에서 넣어요.",
      setup: flip("R U R'"),
      alg: "R U R'",
      mask: "f2l",
    },
    {
      kind: "demo",
      body: "떨어진 짝: 위에서 붙인 뒤 넣어요.",
      setup: flip("U' R U R' U2 R U' R'"),
      alg: "U' R U R' U2 R U' R'",
      mask: "f2l",
    },
    {
      kind: "try",
      body: "앞-오른쪽 칸에 짝을 넣어요.",
      setup: flip("U R U' R'"),
      alg: "U R U' R'",
      goal: "f2l-pair:FR",
      mask: "f2l",
    },
    {
      kind: "try",
      body: "흰색이 위를 보는 꼭짓점이에요. 먼저 모서리와 붙여요.",
      setup: flip("R U2 R' U' R U R'"),
      alg: "R U2 R' U' R U R'",
      goal: "f2l-pair:FR",
      mask: "f2l",
    },
    {
      kind: "try",
      body: "십자와 칸 셋이 맞은 큐브에서 마지막 짝을 넣어요.",
      setup: { rule: "f2l-one-slot" },
      goal: "f2l",
      mask: "f2l",
    },
    {
      kind: "quiz",
      body: "41가지 상황이 있지만 외우기보다 「짝을 만든다 → 넣는다」로 이해하는 것이 먼저예요.",
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

const twoLookOll: Lesson = {
  id: "cfop-2look-oll",
  size: 3,
  title: "2단계 OLL",
  summary: "노란 십자(공식 3개) → 노란 꼭짓점(공식 7개).",
  steps: [
    {
      kind: "quiz",
      body: "OLL을 두 번에 나눠요. 먼저 모서리: 가로줄 F R U R' U' F', ㄱ자 F U R U' R' F', 점은 둘을 이어서. 다음 꼭짓점: 수네·안티수네 등 일곱 공식. 초보자 과정의 노란 십자·노란 면과 같은 일을 짧게 해요.",
      setup: flip("F R U R' U' F'"),
      mask: "oll",
      quiz: {
        question: "이 큐브는 2단계 OLL에서 어느 단계부터 할까요?",
        choices: ["모서리(노란 십자)", "꼭짓점(노란 면)"],
        answer: 0,
        why: "노란 십자가 아직 없어요. 가로줄이니 F R U R' U' F'부터 해요.",
      },
    },
    {
      kind: "demo",
      body: "꼭짓점 단계 중 H 모양: 앞과 뒤 옆면에 노란 칸이 둘씩 마주 봐요.",
      setup: flip("R U2 R' U' R U R' U' R U' R'"),
      alg: "R U2 R' U' R U R' U' R U' R'",
      mask: "oll",
    },
    {
      kind: "try",
      body: "F2L이 맞은 큐브에서 윗면을 노랗게(2단계로) 만들어요.",
      setup: { rule: "f2l-solved" },
      goal: "oll",
      mask: "oll",
    },
  ],
};

const twoLookPll: Lesson = {
  id: "cfop-2look-pll",
  size: 3,
  title: "2단계 PLL",
  summary: "꼭짓점 자리(공식 2개) → 모서리 자리(공식 4개).",
  steps: [
    {
      kind: "quiz",
      body: "먼저 꼭짓점: 헤드라이트가 하나 있으면 왼쪽에 두고 T퍼뮤, 하나도 없으면 Y퍼뮤. 다음 모서리: U퍼뮤 두 가지, 맞은편끼리 바꾸는 H, 이웃끼리 바꾸는 Z.",
      setup: flip(T_PERM),
      mask: "pll",
      quiz: {
        question: "헤드라이트가 하나 있어요. 어디에 두고 T퍼뮤를 할까요?",
        choices: ["왼쪽", "오른쪽", "앞"],
        answer: 0,
        why: "헤드라이트를 왼쪽에 두고 T퍼뮤를 하면 꼭짓점 자리가 맞아요.",
      },
    },
    {
      kind: "demo",
      body: "T퍼뮤: 헤드라이트를 왼쪽에.",
      setup: flip(T_PERM),
      alg: T_PERM,
      mask: "pll",
    },
    {
      kind: "try",
      body: "윗면이 노란 큐브에서 윗층 자리를 맞춰요(2단계로).",
      setup: { rule: "oll-solved" },
      goal: "ll",
      mask: "pll",
    },
  ],
};

const fullSets: Lesson = {
  id: "cfop-full",
  size: 3,
  title: "전체 OLL·PLL로 넓히기",
  summary: "2단계에 익숙해지면 한 번에 끝내는 공식을 늘려요.",
  steps: [
    {
      kind: "quiz",
      body: "PLL 21개를 먼저 다 외우는 사람이 많아요(OLL보다 적고 자주 써요). OLL 57개는 모양 묶음(점·네모·번개·물고기 등)으로 나눠 조금씩.",
      setup: { rule: "oll-solved" },
      mask: "pll",
      quiz: {
        question: "전체 공식으로 넓힐 때 보통 무엇부터 다 외울까요?",
        choices: ["PLL 21개", "OLL 57개"],
        answer: 0,
        why: "PLL이 더 적고 자주 써요. 공식 훈련에서 하나씩 연습해 보세요.",
      },
    },
    {
      kind: "try",
      body: "윗면이 노란 큐브에서 PLL 하나로 끝내 보세요. 모르는 모양이면 2단계로 풀어도 돼요.",
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
  summary: "아래 십자 → F2L 짝 → 2단계 OLL·PLL → 전체 공식.",
  lessons: [overview, cross, f2lPair, twoLookOll, twoLookPll, fullSets],
};
