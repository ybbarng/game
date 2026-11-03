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

const centers4: Lesson = {
  id: "444-centers",
  size: 4,
  title: "4×4 가운데",
  summary:
    "면마다 가운데 네 칸을 한 색으로. 흰색과 노랑 먼저, 나머지 넷은 순서를 지켜서.",
  steps: [
    {
      kind: "text",
      body: "4×4에는 움직이지 않는 가운데가 없다. 면마다 가운데 2×2 네 칸을 직접 모아야 한다. 먼저 흰 가운데를 만들고, 그 맞은편에 노란 가운데를 만든다.",
    },
    {
      kind: "text",
      body: "가운데 두 칸을 한 줄로 붙인 뒤, 안쪽 층(2R 등)을 돌려 다른 면의 줄과 합친다. 바깥 면(R 등)을 돌려 줄을 옮기고, 안쪽 층을 되돌려 다른 면이 흐트러지지 않게 한다.",
    },
    {
      kind: "text",
      body: "남은 넷(초록·빨강·파랑·주황)은 둘레를 도는 순서가 정해져 있다. 흰 면을 위로 들었을 때 앞 초록, 오른쪽 빨강, 뒤 파랑, 왼쪽 주황. 이 순서가 틀리면 3×3처럼 풀 수 없다.",
    },
    {
      kind: "demo",
      body: "안쪽 층 하나만 돌리기(2R)와 두 층 함께 돌리기(Rw).",
      alg: "2R 2R' Rw Rw'",
    },
    {
      kind: "try",
      body: "섞인 4×4에서 가운데 여섯 면을 맞춘다.",
      setup: { rule: "4x4-random" },
      goal: "centers",
    },
    {
      kind: "text",
      body: "흔한 실수: 마지막 두 면을 맞출 때 이미 맞춘 면을 안쪽 층으로 흐트러뜨리고 되돌리지 않는 것. 안쪽 층을 돌렸으면 반드시 되돌린다.",
    },
  ],
};

const edges4: Lesson = {
  id: "444-edges",
  size: 4,
  title: "4×4 모서리 짝",
  summary: "같은 색 모서리 조각(날개) 두 개를 한 줄로 붙인다. 12쌍.",
  steps: [
    {
      kind: "text",
      body: "4×4의 모서리는 날개 조각 두 개로 되어 있다. 같은 두 색의 날개 둘을 찾아 한 줄로 붙이는 것이 「모서리 짝 맞추기」다.",
    },
    {
      kind: "text",
      body: "짝지을 두 날개를 앞-왼쪽과 앞-오른쪽에 두고, 위아래 두 층(Uw·Dw)을 돌려 줄을 맞춘다. 묶이지 않은 모서리를 오른쪽 칸에 넣었다 빼는 공식(R U R' F R' F' R)으로 바꿔 넣은 뒤 층을 되돌린다.",
    },
    {
      kind: "demo",
      body: "두 모서리를 묶는 한 번의 흐름: Dw → 바꿔 넣기 → Dw'.",
      setup: { alg: setupFor(PAIR) },
      alg: PAIR,
    },
    {
      kind: "try",
      body: "가운데가 맞은 4×4에서 모서리 12쌍을 묶는다.",
      setup: { rule: "4x4-centers-solved" },
      goal: "edges-paired",
    },
    {
      kind: "text",
      body: "처음 8쌍은 쉽게 묶이고, 마지막 4쌍이 어렵다. 묶인 모서리를 윗층과 아랫층에 모아 두고, 남은 것을 가운데 줄에서 묶는다.",
    },
  ],
};

const solve4: Lesson = {
  id: "444-as-333",
  size: 4,
  title: "3×3처럼 풀기와 패리티",
  summary:
    "이제 큰 3×3. 바깥 층만 돌려 푼다. 3×3에서 없는 모양 두 가지는 패리티 공식으로.",
  steps: [
    {
      kind: "text",
      body: "가운데와 모서리를 묶었으면 바깥 층(R U F 등)만 돌려 3×3처럼 푼다. 그런데 4×4에는 3×3에서 나올 수 없는 모양이 두 가지 나온다. 이것을 「패리티」라고 한다.",
    },
    {
      kind: "text",
      body: "OLL 패리티: 노란 십자를 만들 때 모서리 하나만 뒤집혀 있다(노란 모서리가 1개나 3개). 뒤집힌 모서리를 앞에 두고 공식을 한다. 아래 두 층은 지키지만 윗층은 흐트러지니 다시 OLL부터.",
    },
    {
      kind: "demo",
      body: "OLL 패리티: 위-앞 모서리 하나를 뒤집는다.",
      setup: { alg: setupFor(OLL_PARITY) },
      alg: OLL_PARITY,
    },
    {
      kind: "text",
      body: "PLL 패리티: 마지막에 모서리 둘만, 또는 꼭짓점 둘만 서로 바뀌어 있다. 바꿀 모서리 둘을 앞·뒤에 두고 공식을 한다.",
    },
    {
      kind: "demo",
      body: "PLL 패리티: 위-앞과 위-뒤 모서리를 맞바꾼다.",
      setup: { alg: setupFor(PLL_PARITY) },
      alg: PLL_PARITY,
    },
    {
      kind: "try",
      body: "가운데와 모서리가 묶인 4×4를 끝까지 맞춘다.",
      setup: { rule: "4x4-reduced" },
      goal: "solved",
    },
    {
      kind: "text",
      body: "흔한 실수: Rw를 R로, 2R을 Rw로 바꿔 돌리는 것. 패리티 공식은 층 수를 틀리면 가운데가 흐트러진다.",
    },
  ],
};

const centers5: Lesson = {
  id: "555-centers",
  size: 5,
  title: "5×5 가운데",
  summary:
    "면마다 가운데 3×3 아홉 칸. 가운데 칸이 고정이라 색 순서는 저절로 정해진다.",
  steps: [
    {
      kind: "text",
      body: "5×5는 면 한가운데 칸이 움직이지 않아 3×3처럼 면 색이 정해져 있다. 그 둘레 여덟 칸을 모은다. 먼저 가운데 줄(가운데 칸 + 양옆 두 칸, 세 칸 막대)을 만들고, 막대를 이어 붙여 아홉 칸을 채운다.",
    },
    {
      kind: "text",
      body: "4×4와 같이 안쪽 층(2R)을 돌려 다른 면의 막대를 가져오고, 바깥 면을 돌려 옮긴 뒤 안쪽 층을 되돌린다. 흰색·노랑 먼저, 나머지 넷은 마지막에.",
    },
    {
      kind: "try",
      body: "섞인 5×5에서 가운데를 맞춘다.",
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
      kind: "text",
      body: "5×5의 모서리는 가운데 조각 하나와 날개 둘, 세 조각이다. 가운데 조각을 기준으로 같은 색 날개를 하나씩 붙인다. 붙이는 흐름은 4×4와 같다(층을 맞추고 → 바꿔 넣고 → 되돌리기).",
    },
    {
      kind: "demo",
      body: "두 모서리를 묶는 한 번의 흐름.",
      setup: { alg: setupFor(PAIR) },
      alg: PAIR,
    },
    {
      kind: "try",
      body: "가운데가 맞은 5×5에서 모서리를 묶는다(마지막 둘 전까지).",
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
    "남은 두 모서리를 앞-왼쪽·앞-오른쪽에 두고 묶는다. 날개가 뒤집혔으면 뒤집기 공식.",
  steps: [
    {
      kind: "text",
      body: "마지막 두 모서리는 빈 자리가 없어 다른 모서리를 흐트러뜨리지 않고 묶어야 한다. 둘을 앞-왼쪽·앞-오른쪽에 두고, 맞출 날개끼리 한 줄이 되게 아래 두 층(Dw)을 돌린 뒤 바꿔 넣고 되돌린다.",
    },
    {
      kind: "demo",
      body: "마지막 두 모서리 묶기.",
      setup: { alg: setupFor(PAIR) },
      alg: PAIR,
    },
    {
      kind: "text",
      body: "마지막 모서리의 가운데 조각은 맞는데 양쪽 날개만 서로 바뀐 모양이 나올 수 있다(5×5의 패리티). 그 모서리를 위-앞에 두고 뒤집기 공식을 한다.",
    },
    {
      kind: "demo",
      body: "날개 뒤집기: 위-앞 모서리의 두 날개만 바꾼다.",
      setup: { alg: setupFor(FLIP_5) },
      alg: FLIP_5,
    },
    {
      kind: "try",
      body: "모서리 둘만 남은 5×5를 묶는다.",
      setup: { rule: "5x5-two-edges-left" },
      goal: "edges-paired",
    },
    {
      kind: "text",
      body: "모서리를 다 묶으면 3×3처럼 푼다. 5×5는 가운데가 고정이라 4×4의 PLL 패리티는 나오지 않는다.",
    },
    {
      kind: "try",
      body: "섞인 5×5를 끝까지.",
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
