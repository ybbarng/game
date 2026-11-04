// 프리드리히(CFOP) 소개(docs/47 8-2 고급). 십자를 아래에서 → F2L 짝 → 2단계 OLL·PLL → 전체 OLL 57·PLL 21.
// 상황 연습(훈련)은 algs-*.ts의 상황 묶음을 쓰고, 여기는 개념을 익히는 단원이다.
// 단계 글이 말하는 모양(짝이 붙었나, 노랑이 어느 쪽을 보나, 헤드라이트 자리 등)은 cfop-flow.test.ts가 엔진으로 확인한다.
import { TWO_LOOK_OLL, TWO_LOOK_PLL } from "./algs-2look";
import { setupFor } from "./notation";
import type {
  AlgCase,
  Course,
  GoalName,
  Lesson,
  LessonStep,
  MaskName,
} from "./types";

/** 흰 면을 아래로 쥔(z2) 맞춘 큐브에서, 이 풀이로 풀리는 상황 */
export const flip = (solution: string) => ({ alg: setupFor(solution, "z2") });

const algOf = (list: AlgCase[], id: string): string => {
  const a = list.find((c) => c.id === id)?.algs[0];
  if (a === undefined) throw new Error(`공식 없음: ${id}`);
  return a;
};

export const T_PERM = algOf(TWO_LOOK_PLL, "2look-pll-headlights");
export const Y_PERM = algOf(TWO_LOOK_PLL, "2look-pll-diagonal");
/** Z퍼뮤는 꼭짓점을 옆 가운데에 맞춘 채로 보면 공식 뒤에 U'가 하나 더 붙는다 */
export const Z_PERM_AUF = `${algOf(TWO_LOOK_PLL, "2look-pll-z")} U'`;

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
/** 붙은 짝: 모서리가 위-오른쪽, 꼭짓점 흰색이 앞 */
export const PAIR_RIGHT = "U R U' R'";
/** 붙은 짝: 모서리가 위-앞, 꼭짓점 흰색이 오른쪽 */
export const PAIR_FRONT = "U' F' U F";
/** 가짜 짝: 꼭짓점(위-앞-오른쪽)과 모서리(위-앞)가 나란하지만 색이 어긋남(F2L 13) */
export const FAKE_PAIR = "U F' U F U' F' U' F";
/** 떨어진 짝인데 칸을 올리는 동안 붙는 자리 */
export const JOIN_RIGHT = "R U R'";
export const JOIN_FRONT = "F' U' F";
/** 떨어진 짝: U' R U R'로 붙인 뒤 U2 R U' R'로 넣는다(F2L 5) */
export const SPLIT_RIGHT = "U' R U R' U2 R U' R'";
export const SPLIT_FRONT = "U F' U' F U2 F' U F";
/** 흰색이 위: R U2 R' U'로 흰색을 옆으로 돌리면 R U R' 자리가 된다(F2L 17) */
export const WHITE_UP = "R U2 R' U' R U R'";
/** 꼭짓점이 칸에 박힘: R U R' U'로 꺼내면 R U R' 자리(F2L 30) */
export const CORNER_STUCK = "R U R' U' R U R'";
/** 모서리가 칸에 뒤집혀 박힘: F' U' F로 꺼내면 붙은 짝, 그다음 U R U' R' */
export const EDGE_STUCK = "F' U' F U R U' R'";

// 아래 십자: 모서리 하나씩(흰-초록을 앞 아래로)
/** 위층에서 흰색이 위: U'로 초록 면 위에 옮긴 뒤 F2 */
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
      kind: "demo",
      body: "섞인 큐브를 CFOP로 끝까지 맞춰 볼게요. 흰 면을 아래로 들고 십자 → 칸 넷에 짝을 하나씩 → 윗면 노랗게(OLL) → 윗층 자리(PLL) 차례예요.",
      setup: { alg: S21 },
      alg: [CFOP21.cross, ...CFOP21.f2l, CFOP21.oll, CFOP21.pll].join(" "),
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
    "흰 십자를 아래에 바로 만들어요. 모서리 하나씩 넣는 요령 셋, 그다음 살펴보기 15초 안에 계획.",
  steps: [
    {
      kind: "look",
      body: "흰 면을 아래로 들고 십자를 만들어요. 위에 만든 뒤 뒤집는 것보다 수가 적고, 다음 단계(F2L)의 조각이 바로 보여요. 어떤 십자도 8수 안에 만들 수 있어요. 큐브 전체를 돌려 흰 면을 아래로 보내 보세요.",
      mask: "cross",
      look: { color: "U", on: "D" },
    },
    {
      kind: "quiz",
      body: "아래에서 맞출 때는 흰색이 아래를 보게 넣어요. 옆색 맞추기는 아직 비어 있는 윗면을 돌려(U) 하니 이미 넣은 모서리가 흐트러지지 않아요. 흰-초록 모서리가 위층에서 흰색이 위를 보고 있어요.",
      setup: flip(CROSS_TOP_UP),
      mask: "cross",
      quiz: {
        question: "흰-초록 모서리를 앞 아래에 어떻게 넣을까요?",
        choices: [
          "바로 F2",
          "U'로 초록 면 위에 옮긴 뒤 F2",
          "U'로 초록 면 위에 옮긴 뒤 F",
        ],
        answer: 1,
        why: "윗면을 돌려 초록이 초록 가운데 위에 오게 한 뒤, 앞면을 두 번 돌리면 흰색이 아래를 봐요.",
      },
    },
    {
      kind: "try",
      body: "흰색이 위를 보는 모서리: U로 옆색이 같은 면 위에 옮긴 뒤 그 면을 두 번 돌려 내려요.",
      setup: flip(CROSS_TOP_UP_TRY),
      alg: CROSS_TOP_UP_TRY,
      goal: "cross",
      mask: "cross",
    },
    {
      kind: "try",
      body: "가운데 줄 모서리: 옆색(초록)이 붙은 면을 한 번 돌려 흰색이 아래로 가게 내려요. 시계·반시계 중 흰색이 아래로 가는 쪽이에요.",
      setup: flip(CROSS_MIDDLE),
      alg: CROSS_MIDDLE,
      goal: "cross",
      mask: "cross",
    },
    {
      kind: "try",
      body: "위층에서 흰색이 옆(앞)을 보는 모서리: U'로 오른쪽 위에 비켜 놓고, R'로 가운데 줄에 내린 뒤 F로 넣어요. 마지막 R은 R'로 잠깐 올라간 오른쪽 십자 모서리를 되돌려요.",
      setup: flip(CROSS_TOP_SIDE),
      alg: CROSS_TOP_SIDE,
      goal: "cross",
      mask: "cross",
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
      body: "섞인 큐브에서 아래 십자를 만들어요. 모서리마다 셋 중 어느 경우인지 먼저 보세요.",
      setup: { rule: "random-cross" },
      goal: "cross",
      mask: "cross",
    },
  ],
};

const PAIR_CHOICES = [
  "붙었어요(진짜 짝)",
  "나란하지만 색이 어긋나요(가짜 짝)",
  "떨어져 있어요",
];

const f2lPair: Lesson = {
  id: "cfop-f2l-pair",
  size: 3,
  title: "F2L 짝",
  summary:
    "꼭짓점과 모서리를 위에서 짝으로 붙인 뒤 한 번에 칸에 넣어요. 쉬운 것부터 칸에 박힌 조각 빼내기까지.",
  drill: "f2l",
  steps: [
    {
      kind: "find",
      body: "십자를 아래에 두면 네 귀퉁이에 「칸」이 남아요. 칸 하나에는 흰 꼭짓점 하나와 가운데 줄 모서리 하나가 들어가요. 둘을 윗층에서 붙여 「짝」을 만든 뒤 함께 넣어요. 앞-오른쪽 칸(초록-주황)에 들어갈 꼭짓점과 모서리를 둘 다 눌러 보세요.",
      setup: flip(JOIN_RIGHT),
      mask: "f2l",
      find: { has: ["F", "L"] },
      count: 2,
    },
    {
      kind: "quiz",
      body: "「붙은 짝」은 꼭짓점과 모서리가 나란히 있고, 맞닿은 두 면의 색이 서로 같은 것이에요(초록 옆에 초록, 주황 옆에 주황). 위-앞-오른쪽 꼭짓점과 위-오른쪽 모서리를 보세요.",
      setup: flip(PAIR_RIGHT),
      mask: "f2l",
      quiz: {
        question: "이 꼭짓점과 모서리는 짝으로 붙었나요?",
        choices: PAIR_CHOICES,
        answer: 0,
        why: "윗면 칸도 초록끼리, 오른쪽 칸도 주황끼리 같아요. 그대로 넣을 수 있어요.",
      },
    },
    {
      kind: "quiz",
      body: "나란히 있어도 색이 어긋나면 「가짜 짝」이에요. 그대로 넣으면 칸에 틀리게 들어가요. 위-앞-오른쪽 꼭짓점과 위-앞 모서리를 보세요.",
      setup: flip(FAKE_PAIR),
      mask: "f2l",
      quiz: {
        question: "이 꼭짓점과 모서리는 짝으로 붙었나요?",
        choices: PAIR_CHOICES,
        answer: 1,
        why: "윗면 칸이 꼭짓점은 초록, 모서리는 주황이라 어긋나요. 떼었다가 다시 붙여야 해요.",
      },
    },
    {
      kind: "turn",
      body: "붙은 짝 넣기: 모서리가 위-오른쪽에 있으면 오른쪽에서 넣어요. U로 짝을 비켜 놓고, R로 칸을 올리고, U'로 짝을 칸 위에 되돌린 뒤 R'로 함께 내려요. U R U' R'를 쳐 보세요.",
      setup: flip(PAIR_RIGHT),
      alg: PAIR_RIGHT,
      mask: "f2l",
    },
    {
      kind: "quiz",
      body: "붙은 짝의 모서리가 위-앞에 있으면 앞에서 넣어요(오른쪽에서 넣기를 거울에 비춘 수).",
      setup: flip(PAIR_FRONT),
      mask: "f2l",
      quiz: {
        question: "이 붙은 짝은 어느 쪽에서 넣을까요?",
        choices: ["오른쪽에서 U R U' R'", "앞에서 U' F' U F"],
        answer: 1,
        why: "모서리가 위-앞에 있으니 앞면을 올렸다 내려요.",
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
      body: "떨어져 있지만 바로 들어가는 자리도 있어요. 꼭짓점의 흰색이 오른쪽을 보고 모서리가 위-뒤에 있으면 R U R'. R로 칸을 올리는 동안 짝이 붙어요.",
      setup: flip(JOIN_RIGHT),
      alg: JOIN_RIGHT,
      mask: "f2l",
    },
    {
      kind: "turn",
      body: "거울 쪽: 꼭짓점의 흰색이 앞을 보고 모서리가 위-왼쪽에 있으면 F' U' F.",
      setup: flip(JOIN_FRONT),
      alg: JOIN_FRONT,
      mask: "f2l",
    },
    {
      kind: "demo",
      body: "떨어진 짝은 먼저 붙여요. U' R U R'로 꼭짓점을 칸에 잠깐 넣었다 빼면 뒤-오른쪽에 붙은 짝이 생겨요. U2로 짝을 옮긴 뒤 R U' R'로 넣어요.",
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
      body: "흰색이 위를 보는 꼭짓점: R U2 R' U'로 꼭짓점을 돌려 흰색을 오른쪽으로 보내면, 앞에서 본 R U R' 자리가 돼요.",
      setup: flip(WHITE_UP),
      alg: WHITE_UP,
      goal: "f2l-pair:FR",
      mask: "f2l",
    },
    {
      kind: "demo",
      body: "칸에 꼭짓점이 돌아간 채 박혀 있으면 먼저 꺼내요. R U R' U'로 꼭짓점을 위로 빼면 R U R' 자리가 돼요.",
      setup: flip(CORNER_STUCK),
      alg: CORNER_STUCK,
      mask: "f2l",
    },
    {
      kind: "try",
      body: "모서리가 칸에 뒤집혀 박혀 있어요. F' U' F로 모서리를 꺼내면 위-오른쪽에 붙은 짝이 생겨요. 그다음 U R U' R'로 넣어요.",
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

const caseOf = (list: AlgCase[], id: string): AlgCase => {
  const c = list.find((x) => x.id === id);
  if (!c) throw new Error(`상황 없음: ${id}`);
  return c;
};
const OLL_CORNER_IDS = [27, 26, 21, 22, 23, 24, 25].map(
  (n) => `2look-oll-${n}`,
);
const shortName = (c: AlgCase) => c.name.replace(/^꼭짓점: /, "");

/** 2단계 공식 하나 해 보기(상황은 그 공식으로 풀리는 모양) */
const caseTry = (
  c: AlgCase,
  alg: string,
  goal: GoalName,
  mask: MaskName,
): LessonStep => ({
  kind: "try",
  body: `${c.name}. ${c.note ?? ""}`.trim(),
  setup: flip(alg),
  alg,
  goal,
  mask,
});

const twoLookOll: Lesson = {
  id: "cfop-2look-oll",
  size: 3,
  title: "2단계 OLL",
  summary:
    "노란 십자(공식 3개) → 노란 꼭짓점(공식 7개). 모양마다 하나씩 해 봐요.",
  drill: "2look-oll",
  steps: [
    {
      kind: "quiz",
      body: "OLL을 두 번에 나눠요. 먼저 모서리를 위로(노란 십자, 공식 3개), 다음 꼭짓점을 위로(공식 7개). 초보자 과정의 노란 십자·노란 면과 같은 일을 짧게 해요.",
      setup: flip("F R U R' U' F'"),
      mask: "oll",
      quiz: {
        question: "이 큐브는 2단계 OLL에서 어느 단계부터 할까요?",
        choices: ["모서리(노란 십자)", "꼭짓점(노란 면)"],
        answer: 0,
        why: "노란 십자가 아직 없어요. 가로줄이니 F R U R' U' F'부터 해요.",
      },
    },
    ...TWO_LOOK_OLL.filter((c) => c.group === "edges").map((c) =>
      caseTry(c, c.algs[0] as string, "yellow-cross", "oll"),
    ),
    {
      kind: "quiz",
      body: "꼭짓점 일곱 모양은 위를 보는 노란 꼭짓점 수(0·1·2개)와 옆면 노랑의 자리로 알아봐요. 노란 꼭짓점이 하나면 수네나 안티수네예요. 수네(Sune)는 R U R' U R U2 R', 안티수네는 그 거꾸로예요.",
      setup: flip(algOf(TWO_LOOK_OLL, "2look-oll-27")),
      mask: "oll",
      quiz: {
        question:
          "노란 꼭짓점 하나가 앞-왼쪽에서 위를 보고, 앞-오른쪽 꼭짓점의 노랑이 앞을 봐요. 무슨 모양일까요?",
        choices: ["수네", "안티수네", "H", "파이"],
        answer: 0,
        why: "앞-오른쪽 노랑이 앞을 보면 수네예요. 뒤-오른쪽에 노란 꼭짓점이 있고 앞-왼쪽 노랑이 앞을 보면 안티수네예요.",
      },
    },
    ...OLL_CORNER_IDS.map((id) => {
      const c = caseOf(TWO_LOOK_OLL, id);
      return caseTry(
        { ...c, name: `꼭짓점 ${shortName(c)}` },
        c.algs[0] as string,
        "oll",
        "oll",
      );
    }),
    {
      kind: "try",
      body: "F2L이 맞은 큐브에서 윗면을 노랗게(2단계로) 만들어요. 모양이 그림과 다르게 돌아가 있으면 U로 돌려 맞춰 쥐어요.",
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
  summary: "꼭짓점 자리(T·Y퍼뮤) → 모서리 자리(Ua·Ub·H·Z). 하나씩 해 봐요.",
  drill: "2look-pll",
  steps: [
    {
      kind: "quiz",
      body: "PLL도 두 번에 나눠요. 먼저 꼭짓점, 다음 모서리. 「퍼뮤」는 조각의 자리를 바꾸는 공식이에요(영어 permutation). 옆면 한 줄의 양 끝 꼭짓점 칸이 같은 색이면 「헤드라이트」라고 해요. 헤드라이트가 한 면에만 있으면 T퍼뮤, 하나도 없으면 Y퍼뮤예요.",
      setup: flip(T_PERM),
      mask: "pll",
      quiz: {
        question: "헤드라이트가 하나 있어요. 어디에 두고 T퍼뮤를 할까요?",
        choices: ["왼쪽", "오른쪽", "앞"],
        answer: 0,
        why: "T퍼뮤는 오른쪽 두 꼭짓점을 맞바꿔요. 이미 서로 맞은 헤드라이트는 건드리지 않는 왼쪽에 둬요.",
      },
    },
    {
      kind: "find",
      body: "T퍼뮤는 오른쪽 두 꼭짓점(앞-오른쪽·뒤-오른쪽)만 맞바꿔요. 초보자 과정의 A퍼뮤는 꼭짓점 셋을 돌려서 헤드라이트를 뒤에 뒀지만, 공식마다 바꾸는 자리가 달라 헤드라이트를 두는 곳도 달라요. T퍼뮤가 맞바꿀 꼭짓점 둘(노랑-주황이 붙은 것)을 눌러 보세요.",
      setup: flip(T_PERM),
      mask: "pll",
      find: { piece: "corner", has: ["D", "L"] },
      count: 2,
    },
    caseTry(caseOf(TWO_LOOK_PLL, "2look-pll-headlights"), T_PERM, "ll", "pll"),
    {
      kind: "quiz",
      body: "어느 옆면에도 헤드라이트가 없으면 대각선 꼭짓점 둘을 바꿔요.",
      setup: flip(Y_PERM),
      mask: "pll",
      quiz: {
        question: "헤드라이트가 하나도 없어요. 무엇을 할까요?",
        choices: ["Y퍼뮤 한 번", "T퍼뮤 한 번", "꼭짓점 단계를 건너뛰어요"],
        answer: 0,
        why: "헤드라이트가 없으면 대각선 꼭짓점이 바뀐 거예요. Y퍼뮤가 대각선 둘을 바꿔요.",
      },
    },
    caseTry(caseOf(TWO_LOOK_PLL, "2look-pll-diagonal"), Y_PERM, "ll", "pll"),
    {
      kind: "quiz",
      body: "네 옆면 모두 헤드라이트면 꼭짓점은 이미 맞아요. 꼭짓점 단계를 건너뛰고 모서리로 가요.",
      setup: flip(algOf(TWO_LOOK_PLL, "2look-pll-ua")),
      mask: "pll",
      quiz: {
        question: "네 면 모두 헤드라이트예요. 다음은?",
        choices: ["T퍼뮤", "꼭짓점은 건너뛰고 모서리 공식"],
        answer: 1,
        why: "꼭짓점 넷이 서로 맞았으니 모서리만 남았어요.",
      },
    },
    {
      kind: "quiz",
      body: "모서리 공식은 넷이에요. 한 면이 통째로 맞고 셋이 돌면 Ua·Ub(U퍼뮤), 맞은편끼리 바뀌면 H, 옆에 붙은 면끼리 바뀌면 Z.",
      setup: flip(algOf(TWO_LOOK_PLL, "2look-pll-h")),
      mask: "pll",
      quiz: {
        question:
          "앞·뒤 모서리끼리, 왼쪽·오른쪽 모서리끼리 바뀌었어요. 무슨 모양일까요?",
        choices: ["Ua·Ub(셋 돌리기)", "H(맞은편끼리)", "Z(이웃끼리)"],
        answer: 1,
        why: "맞은편끼리 두 쌍이 바뀌면 H퍼뮤예요.",
      },
    },
    ...["2look-pll-ua", "2look-pll-ub", "2look-pll-h"].map((id) => {
      const c = caseOf(TWO_LOOK_PLL, id);
      return caseTry(c, c.algs[0] as string, "ll", "pll");
    }),
    caseTry(caseOf(TWO_LOOK_PLL, "2look-pll-z"), Z_PERM_AUF, "ll", "pll"),
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
  drill: "pll",
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
