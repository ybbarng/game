// 프리드리히(CFOP) 소개(docs/47 8-2 고급). 십자를 아래에서 → F2L 짝 → 2단계 OLL·PLL → 전체 OLL 57·PLL 21.
// 상황 연습(훈련)은 algs-*.ts의 상황 묶음을 쓰고, 여기는 개념을 익히는 단원이다.
import { setupFor } from "./notation";
import type { Course, Lesson } from "./types";

const flip = (solution: string) => ({ alg: setupFor(solution, "z2") });

const overview: Lesson = {
  id: "cfop-overview",
  size: 3,
  title: "프리드리히(CFOP) 한눈에",
  summary: "Cross·F2L·OLL·PLL 네 단계. 대회 선수 대부분이 쓰는 방법.",
  steps: [
    {
      kind: "text",
      body: "CFOP는 단계 이름의 첫 글자다. Cross(십자), F2L(First Two Layers, 아래 두 층 한꺼번에), OLL(Orientation of the Last Layer, 윗면 한 색), PLL(Permutation of the Last Layer, 윗층 자리). 만든 사람 이름을 따 프리드리히 방법이라고도 한다.",
    },
    {
      kind: "text",
      body: "층별 맞추기와 다른 점은 셋이다. 십자를 처음부터 아래에 만든다. 첫 층 꼭짓점과 둘째 층 모서리를 짝으로 묶어 한 번에 넣는다. 마지막 층을 공식 두 번(OLL, PLL)으로 끝낸다.",
    },
    {
      kind: "text",
      body: "한 번에 다 외우지 않아도 된다. 먼저 2단계 OLL(10개)·2단계 PLL(6개)로 시작하고, 자주 나오는 것부터 전체 OLL 57·PLL 21로 넓힌다.",
    },
  ],
};

const cross: Lesson = {
  id: "cfop-cross",
  size: 3,
  title: "십자를 아래에서",
  summary:
    "흰 십자를 아래에 바로 만든다. 살펴보기 15초 안에 계획하고 8수 안에.",
  steps: [
    {
      kind: "text",
      body: "흰 면을 아래로 들고 십자를 만든다. 위에 만든 뒤 뒤집는 것보다 수가 적고, 다음 단계(F2L)의 조각이 바로 보인다. 어떤 십자도 8수 안에 만들 수 있다.",
    },
    {
      kind: "text",
      body: "살펴보기(대회에서는 15초) 동안 흰 모서리 넷의 자리를 찾고 순서를 계획한다. 처음엔 둘씩 계획하는 것부터.",
    },
    {
      kind: "demo",
      body: "흰 모서리가 흩어져 있다. 뒤집지 않고 아래에서 바로 맞춘다.",
      setup: flip("F2 D' R2 U L2"),
      alg: "F2 D' R2 U L2",
      mask: "cross",
    },
    {
      kind: "try",
      body: "흰 면을 아래로 둔 채 십자를 만든다.",
      setup: flip("R' F D2 B2"),
      alg: "R' F D2 B2",
      goal: "cross",
      mask: "cross",
    },
    {
      kind: "try",
      body: "섞인 큐브에서 아래 십자.",
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
  summary: "꼭짓점과 모서리를 위에서 짝으로 붙인 뒤 한 번에 칸에 넣는다.",
  steps: [
    {
      kind: "text",
      body: "십자를 아래에 두면 네 귀퉁이에 「칸」이 남는다. 칸 하나에는 흰 꼭짓점 하나와 가운데 줄 모서리 하나가 들어간다. 둘을 윗층에서 붙여 짝을 만든 뒤 넣는다.",
    },
    {
      kind: "text",
      body: "가장 쉬운 넷: 짝이 이미 붙어 있으면 R U R'(오른쪽에서) 또는 F' U' F(앞에서). 떨어져 있지만 바로 들어갈 자리면 U R U' R' 또는 U' F' U F.",
    },
    {
      kind: "demo",
      body: "붙어 있는 짝을 오른쪽에서 넣는다.",
      setup: flip("R U R'"),
      alg: "R U R'",
      mask: "f2l",
    },
    {
      kind: "demo",
      body: "떨어진 짝: 위에서 붙인 뒤 넣는다.",
      setup: flip("U' R U R' U2 R U' R'"),
      alg: "U' R U R' U2 R U' R'",
      mask: "f2l",
    },
    {
      kind: "try",
      body: "앞-오른쪽 칸에 짝을 넣는다.",
      setup: flip("U R U' R'"),
      alg: "U R U' R'",
      goal: "f2l-pair:FR",
      mask: "f2l",
    },
    {
      kind: "try",
      body: "흰색이 위를 보는 꼭짓점. 먼저 모서리와 붙인다.",
      setup: flip("R U2 R' U' R U R'"),
      alg: "R U2 R' U' R U R'",
      goal: "f2l-pair:FR",
      mask: "f2l",
    },
    {
      kind: "try",
      body: "십자와 칸 셋이 맞은 큐브에서 마지막 짝을 넣는다.",
      setup: { rule: "f2l-one-slot" },
      goal: "f2l",
      mask: "f2l",
    },
    {
      kind: "text",
      body: "41가지 상황이 있지만 외우기보다 「짝을 만든다 → 넣는다」로 이해하는 것이 먼저다. 훈련의 F2L 41 묶음에서 상황별 공식을 볼 수 있다.",
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
      kind: "text",
      body: "OLL을 두 번에 나눈다. 먼저 모서리: 가로줄 F R U R' U' F', ㄱ자 F U R U' R' F', 점은 둘을 이어서. 다음 꼭짓점: 수네·안티수네 등 일곱 공식. 초보자 과정의 노란 십자·노란 면과 같은 일을 짧게 한다.",
    },
    {
      kind: "demo",
      body: "꼭짓점 단계 중 H 모양: 양옆에 헤드라이트가 마주 본다.",
      setup: flip("R U2 R' U' R U R' U' R U' R'"),
      alg: "R U2 R' U' R U R' U' R U' R'",
      mask: "oll",
    },
    {
      kind: "try",
      body: "F2L이 맞은 큐브에서 윗면을 노랗게(2단계로).",
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
      kind: "text",
      body: "먼저 꼭짓점: 헤드라이트가 하나 있으면 왼쪽에 두고 T퍼뮤, 하나도 없으면 Y퍼뮤. 다음 모서리: U퍼뮤 두 가지, 맞은편끼리 바꾸는 H, 이웃끼리 바꾸는 Z.",
    },
    {
      kind: "demo",
      body: "T퍼뮤: 헤드라이트를 왼쪽에.",
      setup: flip("R U R' U' R' F R2 U' R' U' R U R' F'"),
      alg: "R U R' U' R' F R2 U' R' U' R U R' F'",
      mask: "pll",
    },
    {
      kind: "try",
      body: "윗면이 노란 큐브에서 윗층 자리를 맞춘다(2단계로).",
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
  summary: "2단계에 익숙해지면 한 번에 끝내는 공식을 늘린다.",
  steps: [
    {
      kind: "text",
      body: "PLL 21개를 먼저 다 외우는 사람이 많다(OLL보다 적고 자주 쓴다). OLL 57개는 모양 묶음(점·네모·번개·물고기 등)으로 나눠 조금씩.",
    },
    {
      kind: "text",
      body: "훈련에서 묶음을 고르면 상황이 무작위로 나온다. 「가리기」를 켜면 필요한 칸만 색으로 보이고, 「보통 큐브」는 나머지도 실제처럼 섞여 보인다. 느린 상황은 더 자주 나온다.",
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
