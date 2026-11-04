// 3×3 초보자 층별 맞추기(docs/47 8-2). 처음부터 끝까지 순서대로 따라 하면 다 맞춘다.
// 처음엔 기본 방향(위 흰, 앞 초록)으로 들고 흰 십자를 만든 뒤, 큐브를 뒤집어(z2) 흰 면을 아래로 둔다.
// 「직접 해보기」의 상황은 모범 답의 거꾸로로 만든다(setupFor). 시험이 상황 → 모범 답 → 목표를 확인한다.
// 글만 읽고 넘기는 단계는 두지 않는다: 설명은 둘러보기·조각 찾기·고르기 문제·따라 하기에 얹는다(types.ts).
import { setupFor } from "./notation";
import type { Course, Lesson } from "./types";

const SEXY = "R U R' U'";
const RIGHT = "U R U' R' U' F' U F";
const LEFT = "U' L' U L U F U' F'";
const EO = "F R U R' U' F'";
const EO_L = "F U R U' R' F'";
const SUNE = "R U R' U R U2 R'";
const A_PERM = "R' F R' B2 R F' R' B2 R2";
const U_PERM = "R U' R U R U R U' R' U' R2";
const U_PERM_B = "R2 U R U R' U' R' U' R' U R'";

const flip = (solution: string) => ({ alg: setupFor(solution, "z2") });

const SIDES = ["앞", "오른쪽", "뒤", "왼쪽"];

// 「큐브의 조각」에서 따라가는 수와 마무리 해 보기(시험이 엔진으로 자리·정답을 확인한다)
/** 흰-초록-빨강 꼭짓점을 R U2로 옮기면 위-앞-왼쪽 자리로 간다. 되돌리기 U2 R' */
export const TRACK_CORNER = "R U2";
/** 흰-초록 모서리를 F R로 옮기면 위-오른쪽 자리로 간다. 되돌리기 R' F' */
export const TRACK_EDGE = "F R";
/** 흰-초록 모서리가 제자리에서 뒤집힘(다른 조각은 가린다) */
export const FLIPPED_EDGE = "R U' R' F'";
/** 흰-초록-빨강 꼭짓점이 제자리에서 돌아감 */
export const TWISTED_CORNER = "R' F'";

/**
 * 공식보다 먼저: 큐브는 색이 아니라 조각 26개다(2026-11-04 사용자 요청).
 * 세 종류의 조각을 찾고, 가운데는 움직이지 않고, 조각의 색은 함께 다니고, 제자리는 가운데 색이 정하고,
 * 같은 자리에서도 방향이 있다는 것을 직접 눌러 보고 돌려 보며 익힌다. 공식은 하나도 외우지 않는다.
 */
const pieces: Lesson = {
  id: "333-pieces",
  size: 3,
  title: "큐브의 조각",
  summary:
    "큐브는 스티커 54장이 아니라 조각 26개예요. 색이 아니라 조각을 옮겨요.",
  steps: [
    {
      kind: "find",
      body: "큐브를 스티커 한 장 한 장으로 보지 말고 조각으로 봐요. 면 한가운데 칸은 색이 하나뿐인 「가운데 조각」이에요. 흰 가운데를 눌러 보세요.",
      mask: "all",
      find: { piece: "center", colors: ["U"] },
    },
    {
      kind: "find",
      body: "두 면이 만나는 곳에는 색이 둘 붙은 「모서리 조각」이 있어요. 흰-초록 모서리를 눌러 보세요. 흰 칸을 눌러도 초록 칸을 눌러도 같은 조각이에요.",
      mask: "all",
      find: { piece: "edge", colors: ["U", "F"] },
    },
    {
      kind: "find",
      body: "세 면이 만나는 구석에는 색이 셋 붙은 「꼭짓점 조각」이 있어요. 흰-초록-빨강 꼭짓점을 눌러 보세요.",
      mask: "all",
      find: { piece: "corner", colors: ["U", "F", "R"] },
    },
    {
      kind: "find",
      body: "노란색이 붙은 모서리 조각을 넷 모두 찾아 보세요. 아랫면은 왼쪽 위 펼친 그림에서 누르면 쉬워요.",
      mask: "all",
      find: { piece: "edge", has: ["D"] },
      count: 4,
    },
    {
      kind: "quiz",
      body: "가운데는 면마다 하나라 여섯 개예요. 모서리는 면과 면이 만나는 선마다 하나, 꼭짓점은 구석마다 하나 있어요. 큐브를 둘러보며 세어 보세요.",
      mask: "all",
      quiz: {
        question: "모서리 조각은 몇 개이고, 색은 몇 개씩 붙어 있나요?",
        choices: ["8개, 색 셋씩", "12개, 색 둘씩", "24개, 색 하나씩"],
        answer: 1,
        why: "선이 열두 개라 모서리도 열두 개, 색은 둘씩이에요. 꼭짓점은 여덟 개이고 색이 셋씩이에요.",
      },
    },
    {
      kind: "quiz",
      body: "가운데 6, 모서리 12, 꼭짓점 8. 큐브 속 한가운데는 축이라 돌아가지 않아요.",
      mask: "all",
      quiz: {
        question: "큐브를 이루는 조각은 모두 몇 개일까요?",
        choices: ["54개", "27개", "26개"],
        answer: 2,
        why: "6 + 12 + 8 = 26개예요. 54는 스티커 수예요. 큐브를 맞춘다는 건 스티커 54장이 아니라 조각 26개를 제자리에 두는 거예요.",
      },
    },
    {
      kind: "turn",
      body: "이제 몇 수 돌려 봐요. R U F'을 쳐 보며 면 한가운데 칸을 지켜보세요.",
      mask: "all",
      alg: "R U F'",
    },
    {
      kind: "quiz",
      body: "방금처럼 돌린 큐브예요. 모서리와 꼭짓점은 흩어졌어요. 가운데는 어떻게 됐을까요?",
      setup: { alg: "R U F'" },
      mask: "all",
      quiz: {
        question: "흰 가운데는 지금 어디 있나요?",
        choices: ["위 그대로", "앞으로 옮겨 갔어요", "아래로 옮겨 갔어요"],
        answer: 0,
        why: "면을 돌려도 가운데는 제자리에서 돌기만 해요. 가운데끼리의 자리는 바뀌지 않아요. 그래서 가운데 색이 그 면의 색이에요.",
      },
    },
    {
      kind: "quiz",
      body: "가운데는 서로 자리가 정해져 있어요. 흰 가운데 맞은편은 언제나 노랑이에요.",
      mask: "centers",
      quiz: {
        question: "초록 가운데의 맞은편은 무슨 색일까요?",
        choices: ["노랑", "파랑", "빨강"],
        answer: 1,
        why: "흰↔노랑, 초록↔파랑, 빨강↔주황이 맞은편이에요. 큐브를 둘러보며 확인해 보세요.",
      },
    },
    {
      kind: "turn",
      body: "조각의 색은 함께 다녀요. 흰-초록-빨강 꼭짓점만 보이게 가렸어요. R을 쳐 보며 이 꼭짓점이 어디로 가는지 눈으로 따라가 보세요.",
      mask: "piece:UFR",
      alg: "R",
    },
    {
      kind: "find",
      body: "R을 돌렸어요. 이번에는 가운데만 보여요. 흰-초록-빨강 꼭짓점은 지금 어디 있나요? 눌러 보세요.",
      setup: { alg: "R" },
      mask: "centers",
      find: { piece: "corner", colors: ["U", "F", "R"] },
    },
    {
      kind: "demo",
      body: `같은 꼭짓점을 ${TRACK_CORNER}로 옮겨 봐요. 세 색이 늘 붙어서 한 조각으로 움직여요.`,
      alg: TRACK_CORNER,
      mask: "piece:UFR",
    },
    {
      kind: "find",
      body: `${TRACK_CORNER}을 돌렸어요. 흰-초록-빨강 꼭짓점은 지금 어디 있나요? 막히면 「보통」으로 색을 볼 수 있어요.`,
      setup: { alg: TRACK_CORNER },
      mask: "centers",
      find: { piece: "corner", colors: ["U", "F", "R"] },
    },
    {
      kind: "demo",
      body: `이번엔 흰-초록 모서리를 ${TRACK_EDGE}로 옮겨요. 두 색은 절대 떨어지지 않아요.`,
      alg: TRACK_EDGE,
      mask: "piece:UF",
    },
    {
      kind: "find",
      body: `${TRACK_EDGE}을 돌렸어요. 흰-초록 모서리는 지금 어디 있나요? 눌러 보세요.`,
      setup: { alg: TRACK_EDGE },
      mask: "centers",
      find: { piece: "edge", colors: ["U", "F"] },
    },
    {
      kind: "quiz",
      body: "앞에서 따라간 꼭짓점과 모서리가 어디로 갔는지 떠올려 보세요.",
      setup: { alg: "R U F" },
      mask: "all",
      quiz: {
        question: "흰-초록-빨강 꼭짓점이 갈 수 있는 자리는 어디일까요?",
        choices: [
          "꼭짓점 자리 여덟 곳 중 하나",
          "모서리 자리에도 갈 수 있어요",
          "아무 자리나 갈 수 있어요",
        ],
        answer: 0,
        why: "꼭짓점은 꼭짓점 자리로만, 모서리는 모서리 자리로만 가요. 어떻게 돌려도 섞이지 않아요.",
      },
    },
    {
      kind: "quiz",
      body: "조각마다 돌아갈 「제자리」가 있어요. 가운데는 움직이지 않으니, 제자리는 조각의 색과 같은 가운데들이 정해요.",
      setup: { alg: "R U F" },
      mask: "centers",
      quiz: {
        question: "흰-빨강 모서리의 제자리는 어디일까요?",
        choices: [
          "흰 가운데와 빨강 가운데 사이",
          "흰 가운데와 초록 가운데 사이",
          "지금 그 조각이 있는 곳",
        ],
        answer: 0,
        why: "모서리의 두 색과 같은 가운데 둘 사이가 제자리예요.",
      },
    },
    {
      kind: "find",
      body: "그럼 초록-주황 모서리의 제자리는 어디일까요? 조각이 아니라 자리를 찾아요. 그 자리의 칸을 눌러 보세요.",
      setup: { alg: "R U F" },
      mask: "centers",
      find: { at: ["F", "L"] },
    },
    {
      kind: "find",
      body: "노랑-파랑-빨강 꼭짓점의 제자리를 눌러 보세요. 세 가운데가 만나는 구석이에요.",
      setup: { alg: "R U F" },
      mask: "centers",
      find: { at: ["D", "B", "R"] },
    },
    {
      kind: "quiz",
      body: "같은 자리에 있어도 뒤집혀 있을 수 있어요. 흰-초록 모서리만 보이게 가렸어요. 흰 가운데와 초록 가운데를 보며 판단해요.",
      setup: { alg: FLIPPED_EDGE },
      mask: "piece:UF",
      quiz: {
        question: "흰-초록 모서리는 지금 어떤 상태인가요?",
        choices: ["제자리, 바른 방향", "제자리지만 뒤집혔어요", "다른 자리"],
        answer: 1,
        why: "흰 가운데와 초록 가운데 사이에 있지만 흰 칸이 초록 면을 봐요. 모서리는 한 자리에서 두 가지 방향이 있어요.",
      },
    },
    {
      kind: "quiz",
      body: "꼭짓점도 제자리에서 돌아가 있을 수 있어요. 흰-초록-빨강 꼭짓점이 제자리에 있지만 흰색이 위를 보지 않아요.",
      setup: { alg: TWISTED_CORNER },
      mask: "piece:UFR",
      quiz: {
        question: "꼭짓점은 한 자리에서 몇 가지 방향으로 놓일 수 있을까요?",
        choices: ["두 가지", "세 가지", "네 가지"],
        answer: 1,
        why: "흰색이 위, 앞, 오른쪽을 보는 세 가지예요. 바른 방향은 그중 하나뿐이에요.",
      },
    },
    {
      kind: "try",
      body: "흰-초록-빨강 꼭짓점만 보여요. 이 조각을 제자리(흰·초록·빨강 가운데 사이)로, 흰색이 위를 보게 돌려 놓아 보세요. 다른 조각은 신경 쓰지 않아도 돼요.",
      setup: { alg: TRACK_CORNER },
      alg: "U2 R'",
      goal: "piece:UFR",
      mask: "piece:UFR",
    },
    {
      kind: "try",
      body: "이번엔 흰-초록 모서리예요. 흰 가운데와 초록 가운데 사이로, 흰 칸이 위를 보게 돌려 놓아 보세요.",
      setup: { alg: TRACK_EDGE },
      alg: "R' F'",
      goal: "piece:UF",
      mask: "piece:UF",
    },
    {
      kind: "quiz",
      body: "앞으로 배울 공식은 모두 「어떤 조각을 어디로 옮기는가」예요. 스티커 색이 아니라 조각을 보고 제자리·바른 방향으로 옮겨요.",
      mask: "all",
      quiz: {
        question:
          "다음 단원들에서 배울 「흰 십자」는 무엇을 옮기는 단계일까요?",
        choices: [
          "흰색이 붙은 모서리 조각 넷을 제자리로",
          "흰 스티커 아무거나 위로",
          "흰색이 붙은 꼭짓점 넷을 제자리로",
        ],
        answer: 0,
        why: "흰 십자는 흰 모서리 조각 넷을 흰 가운데와 옆 가운데 사이(제자리)로, 흰 칸이 위를 보게 옮기는 단계예요.",
      },
    },
  ],
};

const notation: Lesson = {
  id: "333-notation",
  size: 3,
  title: "표기 읽기",
  summary: "공식을 읽는 법. 면 이름 여섯 개와 돌리는 방향만 알면 돼요.",
  steps: [
    {
      kind: "find",
      body: "큐브의 여섯 면에는 이름이 있어요. U 위, D 아래, R 오른쪽, L 왼쪽, F 앞, B 뒤. 처음에는 위가 흰색, 앞이 초록, 오른쪽이 빨강이 되게 들어요(아래 노랑, 뒤 파랑, 왼쪽 주황). R 면의 가운데 칸을 눌러 보세요.",
      find: { piece: "center", colors: ["R"] },
    },
    {
      kind: "quiz",
      body: "글자만 있으면 그 면을 마주 보고 시계 방향으로 한 번(90도) 돌려요. 작은따옴표(R')가 붙으면 반대 방향, 2가 붙으면(R2) 반 바퀴예요.",
      quiz: {
        question: "R'은 어떻게 돌릴까요?",
        choices: [
          "오른쪽 면을 오른쪽에서 볼 때 시계 방향으로 90도",
          "오른쪽 면을 오른쪽에서 볼 때 반시계 방향으로 90도",
          "오른쪽 면을 반 바퀴",
        ],
        answer: 1,
        why: "작은따옴표는 반대 방향이에요. 반 바퀴는 R2예요.",
      },
    },
    {
      kind: "demo",
      body: "R: 오른쪽 면을 오른쪽에서 봤을 때 시계 방향. 앞면 칸이 위로 올라가요.",
      alg: "R",
    },
    {
      kind: "demo",
      body: "R': 반대 방향. 위 칸이 앞으로 내려와요.",
      alg: "R'",
    },
    {
      kind: "demo",
      body: "U와 U': 윗면을 위에서 봤을 때 시계, 반시계. U는 앞면 칸이 왼쪽으로 가요.",
      alg: "U U'",
    },
    {
      kind: "demo",
      body: "F와 F2: 앞면을 마주 보고 시계 방향, 그리고 반 바퀴.",
      alg: "F F2",
    },
    {
      kind: "look",
      body: "x·y·z는 큐브 전체를 돌려요(x는 R 방향, y는 U 방향, z는 F 방향). Rw(또는 r)는 오른쪽 두 층을 함께, M은 가운데 세로줄을 L 방향으로 돌려요. 큐브 전체를 돌려 초록 면이 위로 오게 해 보세요.",
      look: { color: "F", on: "U" },
    },
    {
      kind: "demo",
      body: "z2: 큐브 전체를 앞면 축으로 반 바퀴. 흰 면이 아래로 가요.",
      alg: "z2",
    },
    {
      kind: "try",
      body: "오른쪽 면이 한 번 돌아가 있어요. 되돌려 보세요.",
      setup: { alg: "R" },
      alg: "R'",
      goal: "solved",
    },
    {
      kind: "try",
      body: "윗면이 반 바퀴 돌아가 있어요.",
      setup: { alg: "U2" },
      alg: "U2",
      goal: "solved",
    },
    {
      kind: "try",
      body: "R 다음 U를 돌렸어요. 되돌릴 때는 거꾸로, 나중 것부터: U' 다음 R'.",
      setup: { alg: "R U" },
      alg: "U' R'",
      goal: "solved",
    },
    {
      kind: "try",
      body: "F R' U2를 돌린 큐브예요. 순서를 뒤집고 방향도 뒤집어요.",
      setup: { alg: "F R' U2" },
      alg: "U2 R F'",
      goal: "solved",
    },
    {
      kind: "turn",
      body: "흔한 실수: 뒤에서 볼 면(B, L, D)의 시계 방향을 앞에서 본 방향으로 돌리는 것. 그 면을 마주 본다고 생각하고 돌려요. 왼쪽 면을 마주 본다고 생각하며 L을 쳐 보세요. 앞면 왼쪽 줄이 아래로 내려가요.",
      alg: "L",
    },
  ],
};

const whiteCross: Lesson = {
  id: "333-white-cross",
  size: 3,
  title: "흰 십자",
  summary: "흰 가운데 둘레에 흰 모서리 넷을 붙여요. 옆면 색까지 맞춰야 해요.",
  steps: [
    {
      kind: "find",
      body: "앞에서 본 것처럼 가운데는 움직이지 않고, 모서리 조각의 제자리는 두 가운데 사이예요. 흰 면을 위로 들고, 흰색이 붙은 모서리 조각 넷을 흰 가운데 둘레의 제자리로 옮겨요. 먼저 흰-초록 모서리를 찾아 눌러 보세요.",
      setup: { alg: "F2" },
      mask: "cross",
      find: { piece: "edge", colors: ["U", "F"] },
    },
    {
      kind: "quiz",
      body: "흰색만 위를 보면 안 돼요. 모서리의 다른 색이 옆면 가운데 색과 같아야 해요. 초록-흰 모서리는 앞(초록) 위로, 빨강-흰 모서리는 오른쪽(빨강) 위로 가요.",
      setup: { alg: "R2" },
      mask: "cross",
      quiz: {
        question: "아래로 내려간 흰-빨강 모서리는 어디로 가야 할까요?",
        choices: [
          "앞(초록) 면 위",
          "오른쪽(빨강) 면 위",
          "흰색만 위를 보면 어디든 괜찮아요",
        ],
        answer: 1,
        why: "옆색 빨강이 빨강 가운데와 만나야 해요. R2로 올리면 돼요.",
      },
    },
    {
      kind: "demo",
      body: "흰 모서리가 아래층에 있고 옆색(초록)이 이미 앞 가운데와 같아요. 앞면을 반 바퀴 돌리면 위로 올라가요.",
      setup: { alg: "F2" },
      alg: "F2",
      mask: "cross",
    },
    {
      kind: "demo",
      body: "흰 모서리가 아래층 오른쪽에 있어요. 옆색이 앞 가운데와 같아질 때까지 아랫면을 돌린 뒤(D') 앞면을 반 바퀴.",
      setup: { alg: "F2 D" },
      alg: "D' F2",
      mask: "cross",
    },
    {
      kind: "demo",
      body: "흰 모서리가 가운데 줄에 있어요(앞-오른쪽, 흰색이 오른쪽을 봐요). 앞면을 반시계로 한 번 돌리면 올라가요.",
      setup: { alg: "F" },
      alg: "F'",
      mask: "cross",
    },
    {
      kind: "try",
      body: "흰 모서리 하나가 아래에 있어요. 옆색을 맞추고 올려 보세요.",
      setup: { alg: "R2 D2" },
      alg: "D2 R2",
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "try",
      body: "흰 모서리 둘이 아래층에 있어요. 하나씩 옆색을 맞춰 올려요.",
      setup: { alg: "F2 R2 D" },
      alg: "D' F2 R2",
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "try",
      body: "흰 모서리 둘이 흐트러져 있어요(하나는 가운데 줄, 하나는 아래층). 하나를 올릴 때 다른 것이 내려가지 않는지 보며 하나씩 올려요.",
      setup: { alg: "R' F" },
      alg: "F' R",
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "try",
      body: "아무렇게나 섞인 큐브에서 흰 십자를 만들어요.",
      setup: { rule: "random-cross" },
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "quiz",
      body: "흔한 실수: 흰색만 위로 모으고(흰 꽃) 옆색을 안 보는 것. 옆면을 돌려 보면 십자 둘레 색이 가운데와 달라요. 모서리를 올리기 전에 아랫면을 돌려 옆색부터 맞춰요.",
      setup: { alg: "U" },
      mask: "cross",
      quiz: {
        question: "이 큐브의 흰 십자는 다 됐을까요?",
        choices: [
          "네, 흰색이 모두 위를 봐요",
          "아니요, 옆색이 옆면 가운데와 달라요",
        ],
        answer: 1,
        why: "옆색까지 맞아야 십자예요. 이 큐브는 U'로 윗면을 돌리면 맞아요.",
      },
    },
  ],
};

const firstCorners: Lesson = {
  id: "333-first-corners",
  size: 3,
  title: "첫 층 꼭짓점",
  summary:
    "큐브를 뒤집어 흰 면을 아래로 두고, 흰 꼭짓점 넷을 R U R' U' 하나로 넣어요.",
  steps: [
    {
      kind: "look",
      body: "이제 큐브를 뒤집어(z2) 흰 십자를 아래로, 노란 가운데를 위로 둬요. 앞은 그대로 초록이에요. 큐브 전체를 돌려 흰 면을 아래로 보내 보세요.",
      mask: "first-layer",
      look: { color: "U", on: "D" },
    },
    {
      kind: "find",
      body: "흰색이 붙은 꼭짓점을 윗층에서 찾아요. 앞에서 본 것처럼 꼭짓점의 제자리는 세 색 가운데가 만나는 구석이에요. 다른 두 색을 보고, 넣을 자리 바로 위로 윗면을 돌려 옮겨요. 그 자리를 앞-오른쪽으로 오게 들고 R U R' U'을 맞을 때까지 되풀이해요. 윗층의 흰 꼭짓점을 눌러 보세요.",
      setup: flip(SEXY),
      mask: "first-layer",
      find: { piece: "corner", colors: ["U", "F", "L"] },
    },
    {
      kind: "quiz",
      body: "되풀이 횟수는 흰색이 보는 쪽으로 정해져요. 흰색이 오른쪽을 보면 한 번, 위를 보면 세 번, 앞을 보면 다섯 번.",
      setup: flip(`${SEXY} ${SEXY} ${SEXY}`),
      mask: "first-layer",
      quiz: {
        question:
          "앞-오른쪽 위 꼭짓점은 흰색이 위를 봐요. R U R' U'을 몇 번 할까요?",
        choices: ["한 번", "세 번", "다섯 번"],
        answer: 1,
        why: "흰색이 위를 보면 세 번이에요. 다음 시연에서 확인해 보세요.",
      },
    },
    {
      kind: "demo",
      body: "흰색이 오른쪽을 봐요. R U R' U' 한 번.",
      setup: flip(SEXY),
      alg: SEXY,
      mask: "first-layer",
    },
    {
      kind: "demo",
      body: "흰색이 위를 봐요. R U R' U'을 세 번.",
      setup: flip(`${SEXY} ${SEXY} ${SEXY}`),
      alg: `${SEXY} ${SEXY} ${SEXY}`,
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "흰색이 앞을 봐요. 다섯 번 돌려 넣어 보세요.",
      setup: flip(`${SEXY} ${SEXY} ${SEXY} ${SEXY} ${SEXY}`),
      alg: `${SEXY} ${SEXY} ${SEXY} ${SEXY} ${SEXY}`,
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "꼭짓점이 넣을 자리 위에 있지 않아요. 먼저 윗면을 돌려(U') 자리 위로 옮겨요.",
      setup: flip(`U' ${SEXY}`),
      alg: `U' ${SEXY}`,
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "꼭짓점이 제자리에 들어가 있지만 돌아가 있어요(흰색이 옆을 봐요). 같은 공식을 더 돌리면 맞아요.",
      setup: flip(`${SEXY} ${SEXY} ${SEXY} ${SEXY}`),
      alg: `${SEXY} ${SEXY} ${SEXY} ${SEXY}`,
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "흰 십자만 맞은 큐브에서 첫 층을 끝내요.",
      setup: { rule: "cross-solved" },
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "quiz",
      body: "흔한 실수: 공식을 하다 말고 큐브를 다른 쪽으로 다시 드는 것. 한 꼭짓점이 맞을 때까지는 쥔 방향을 바꾸지 않아요. 다른 꼭짓점이 잠깐 흐트러져도 공식을 끝까지 하면 돌아와요.",
      setup: { alg: "z2 R U" },
      mask: "first-layer",
      quiz: {
        question:
          "R U R' U'을 하다가 R U까지 했더니 다른 꼭짓점이 흐트러졌어요. 어떻게 할까요?",
        choices: [
          "큐브를 다시 들고 흐트러진 꼭짓점부터 고쳐요",
          "쥔 방향 그대로 R' U'까지 끝내요",
        ],
        answer: 1,
        why: "공식을 끝까지 하면 흐트러진 조각이 돌아와요.",
      },
    },
  ],
};

const secondLayer: Lesson = {
  id: "333-second-layer",
  size: 3,
  title: "둘째 층 모서리",
  summary:
    "윗층의 노란색 없는 모서리를 가운데 줄로 내려요. 오른쪽·왼쪽 넣기 공식 두 개.",
  steps: [
    {
      kind: "find",
      body: "윗층에서 노란색이 없는 모서리를 찾아요. 그 모서리의 앞쪽 색이 앞 가운데와 같아지게 윗면을 돌려요(뒤집힌 T 모양). 노란색이 없는 윗층 모서리를 눌러 보세요.",
      setup: flip(RIGHT),
      mask: "all",
      find: { piece: "edge", colors: ["F", "L"] },
    },
    {
      kind: "quiz",
      body: "모서리의 위쪽 색이 오른쪽 면 색이면 오른쪽으로, 왼쪽 면 색이면 왼쪽으로 넣어요.",
      setup: flip(RIGHT),
      mask: "all",
      quiz: {
        question:
          "앞 위 모서리는 위쪽 색이 주황이에요. 오른쪽 면도 주황이에요. 어느 쪽으로 넣을까요?",
        choices: ["오른쪽으로", "왼쪽으로"],
        answer: 0,
        why: "위쪽 색과 같은 색 면 쪽으로 넣어요. 다음 시연이 바로 이 모양이에요.",
      },
    },
    {
      kind: "demo",
      body: "오른쪽으로 넣기: U R U' R' U' F' U F를 해요.",
      setup: flip(RIGHT),
      alg: RIGHT,
      mask: "f2l",
    },
    {
      kind: "demo",
      body: "왼쪽으로 넣기: U' L' U L U F U' F'를 해요.",
      setup: flip(LEFT),
      alg: LEFT,
      mask: "f2l",
    },
    {
      kind: "try",
      body: "오른쪽으로 넣어 보세요.",
      setup: flip(RIGHT),
      alg: RIGHT,
      goal: "second-layer",
      mask: "f2l",
    },
    {
      kind: "try",
      body: "왼쪽으로 넣어 보세요.",
      setup: flip(LEFT),
      alg: LEFT,
      goal: "second-layer",
      mask: "f2l",
    },
    {
      kind: "try",
      body: "모서리가 앞-오른쪽 칸에 들어가 있지만 뒤집혀 있어요. 오른쪽 넣기 공식으로 일단 빼내고(아무 모서리나 넣으면 빠져요), 다시 찾아 넣어요.",
      setup: flip(`${RIGHT} U2 ${RIGHT}`),
      alg: `${RIGHT} U2 ${RIGHT}`,
      goal: "second-layer",
      mask: "f2l",
    },
    {
      kind: "try",
      body: "첫 층만 맞은 큐브에서 둘째 층을 끝내요.",
      setup: { rule: "first-layer-solved" },
      goal: "second-layer",
      mask: "f2l",
    },
    {
      kind: "find",
      body: "흔한 실수: 노란색이 붙은 모서리를 넣으려는 것. 노란 모서리는 윗층 것이에요. 넣을 모서리가 위에 하나도 없으면 칸에 잘못 들어간 모서리를 빼내요. 넣으면 안 되는 모서리(노란색이 붙은 것)를 하나 눌러 보세요.",
      setup: flip(RIGHT),
      mask: "all",
      find: { piece: "edge", has: ["D"] },
    },
  ],
};

const yellowCross: Lesson = {
  id: "333-yellow-cross",
  size: 3,
  title: "노란 십자",
  summary:
    "윗면 모서리를 노랗게. 모양(점·ㄱ자·가로줄)을 보고 F R U R' U' F'을 써요.",
  steps: [
    {
      kind: "quiz",
      body: "윗면에서 노란 모서리만 봐요(꼭짓점은 아직 안 봐요). 가운데만 노란 「점」, 둘이 꺾인 「ㄱ자」, 둘이 마주 본 「가로줄」, 다 된 「십자」 넷 중 하나예요.",
      setup: flip(EO),
      mask: "oll",
      quiz: {
        question: "이 큐브의 윗면 모서리는 넷 중 어느 모양일까요?",
        choices: ["점", "ㄱ자", "가로줄", "십자"],
        answer: 2,
        why: "노란 모서리 둘이 마주 보고 있어요. 다음 시연이 이 모양을 십자로 만들어요.",
      },
    },
    {
      kind: "demo",
      body: "가로줄: 줄이 가로(왼쪽-오른쪽)가 되게 들고 F R U R' U' F'.",
      setup: flip(EO),
      alg: EO,
      mask: "oll",
    },
    {
      kind: "demo",
      body: "ㄱ자: 노란 모서리 둘이 왼쪽과 뒤에 오게 들고 F U R U' R' F'.",
      setup: flip(EO_L),
      alg: EO_L,
      mask: "oll",
    },
    {
      kind: "try",
      body: "가로줄을 십자로 만들어 보세요.",
      setup: flip(EO),
      alg: EO,
      goal: "yellow-cross",
      mask: "oll",
    },
    {
      kind: "try",
      body: "ㄱ자를 십자로 만들어 보세요.",
      setup: flip(EO_L),
      alg: EO_L,
      goal: "yellow-cross",
      mask: "oll",
    },
    {
      kind: "try",
      body: "점: F R U R' U' F'을 하면 ㄱ자가 돼요. 윗면을 돌려 ㄱ자를 왼쪽·뒤에 두고 ㄱ자 공식.",
      setup: flip(`${EO} U2 ${EO_L}`),
      alg: `${EO} U2 ${EO_L}`,
      goal: "yellow-cross",
      mask: "oll",
    },
    {
      kind: "try",
      body: "둘째 층까지 맞은 큐브에서 노란 십자를 만들어요.",
      setup: { rule: "second-layer-solved" },
      goal: "yellow-cross",
      mask: "oll",
    },
    {
      kind: "turn",
      body: "흔한 실수: ㄱ자를 다른 방향으로 들고 공식을 하는 것. 그러면 다시 ㄱ자나 점이 돼요. 노란 두 칸이 왼쪽과 뒤에 오는지 확인해요. 이 ㄱ자는 한 칸 비껴 있어요. U를 쳐서 왼쪽과 뒤로 옮겨 보세요.",
      setup: { alg: `${setupFor(EO_L, "z2")} U'` },
      alg: "U",
      mask: "oll",
    },
  ],
};

const yellowFace: Lesson = {
  id: "333-yellow-face",
  size: 3,
  title: "노란 면",
  summary: "꼭짓점까지 윗면을 모두 노랗게. 수네(R U R' U R U2 R') 하나로 돼요.",
  steps: [
    {
      kind: "quiz",
      body: "위를 보는 노란 꼭짓점 수를 세요. 하나면 그 꼭짓점을 왼쪽 앞에 둬요. 하나도 없으면 왼쪽 앞 꼭짓점의 노란색이 왼쪽 면을 보게, 둘이면 왼쪽 앞 꼭짓점의 노란색이 앞면을 보게 들어요.",
      setup: flip(SUNE),
      mask: "oll",
      quiz: {
        question: "위를 보는 노란 꼭짓점은 몇 개일까요?",
        choices: ["0개", "1개", "2개"],
        answer: 1,
        why: "하나예요. 그 꼭짓점을 왼쪽 앞에 두고 수네를 해요.",
      },
    },
    {
      kind: "find",
      body: "그렇게 들고 수네(R U R' U R U2 R')를 해요. 한 번에 안 끝나면 다시 세어서 되풀이해요. 노란 십자는 깨지지 않아요. 왼쪽 앞에 둘 꼭짓점(노란색이 위를 보는 것)을 눌러 보세요.",
      setup: flip(SUNE),
      mask: "oll",
      find: { piece: "corner", colors: ["D", "L", "B"] },
    },
    {
      kind: "demo",
      body: "노란 꼭짓점 하나가 왼쪽 앞: 수네 한 번이면 끝.",
      setup: flip(SUNE),
      alg: SUNE,
      mask: "oll",
    },
    {
      kind: "try",
      body: "수네를 한 번 해 보세요.",
      setup: flip(SUNE),
      alg: SUNE,
      goal: "oll",
      mask: "oll",
    },
    {
      kind: "try",
      body: "위를 보는 노란 꼭짓점이 하나지만 다른 자리에 있어요. 왼쪽 앞으로 옮기고 수네, 다시 세어 수네.",
      setup: { alg: setupFor("R U2 R' U' R U' R'", "z2") },
      alg: `U2 ${SUNE} U2 ${SUNE}`,
      goal: "oll",
      mask: "oll",
    },
    {
      kind: "try",
      body: "위를 보는 노란 꼭짓점이 없어요. 쥐는 법대로 돌린 뒤 수네, 다시 세어 수네.",
      setup: { alg: setupFor("R U2 R' U' R U R' U' R U' R'", "z2") },
      alg: `U ${SUNE} ${SUNE}`,
      goal: "oll",
      mask: "oll",
    },
    {
      kind: "try",
      body: "위를 보는 노란 꼭짓점이 둘(대각선)이에요. 수네를 세 번 하게 돼요.",
      setup: { alg: setupFor("F' r U R' U' r' F R", "z2") },
      alg: `U' ${SUNE} ${SUNE} U2 ${SUNE}`,
      goal: "oll",
      mask: "oll",
    },
    {
      kind: "try",
      body: "노란 십자까지 맞은 큐브에서 윗면을 끝내요.",
      setup: { rule: "yellow-cross-solved" },
      goal: "oll",
      mask: "oll",
    },
    {
      kind: "quiz",
      body: "흔한 실수: 수네 중간에 윗면이 엉망이 된 것 같아 멈추는 것. 아래 두 층은 공식이 끝나면 돌아와요. 일곱 수를 끝까지 해요.",
      setup: { alg: `${setupFor(SUNE, "z2")} R U R'` },
      mask: "oll",
      quiz: {
        question:
          "수네를 R U R'까지 했더니 아래 두 층이 흐트러져 보여요. 어떻게 할까요?",
        choices: ["멈추고 처음부터 다시 해요", "남은 U R U2 R'까지 끝내요"],
        answer: 1,
        why: "일곱 수를 다 하면 아래 두 층이 돌아와요.",
      },
    },
  ],
};

const yellowCorners: Lesson = {
  id: "333-yellow-corners",
  size: 3,
  title: "위 꼭짓점 자리",
  summary: "윗층 꼭짓점을 제자리로. 헤드라이트를 뒤에 두고 A퍼뮤 하나.",
  steps: [
    {
      kind: "quiz",
      body: "옆면에서 위층 꼭짓점 두 칸이 같은 색이면 「헤드라이트」라고 해요. 헤드라이트가 있는 면을 뒤로 두고 R' F R' B2 R F' R' B2 R2를 해요. 큐브를 끌어 옆면을 둘러보세요.",
      setup: flip(A_PERM),
      mask: "pll",
      quiz: {
        question: "헤드라이트는 어느 면에 있을까요?",
        choices: SIDES,
        answer: 2,
        why: "뒤에 있어요. 그대로 공식을 하면 돼요.",
      },
    },
    {
      kind: "quiz",
      body: "헤드라이트가 하나도 없으면 아무 쪽에서나 한 번 하면 헤드라이트가 생겨요. 네 면 모두 헤드라이트면 꼭짓점은 다 맞았어요. 끝나면 윗면을 돌려 옆색을 맞춰요.",
      setup: flip(`${A_PERM} U ${A_PERM}`),
      mask: "pll",
      quiz: {
        question: "헤드라이트가 하나도 없어요. 어떻게 할까요?",
        choices: [
          "아무 쪽에서나 공식을 한 번 해요",
          "윗면만 돌려 맞춰요",
          "처음부터 다시 섞어요",
        ],
        answer: 0,
        why: "한 번 하면 헤드라이트가 생겨요. 그 면을 뒤로 두고 한 번 더 해요.",
      },
    },
    {
      kind: "demo",
      body: "헤드라이트가 뒤에 있어요.",
      setup: flip(A_PERM),
      alg: A_PERM,
      mask: "pll",
    },
    {
      kind: "try",
      body: "헤드라이트를 뒤에 두고 해 보세요.",
      setup: flip(A_PERM),
      alg: A_PERM,
      goal: "yellow-corners",
      mask: "pll",
    },
    {
      kind: "try",
      body: "헤드라이트가 다른 쪽에 있어요. 윗면을 돌려 뒤로 옮겨요.",
      setup: flip(`U ${A_PERM}`),
      alg: `U ${A_PERM}`,
      goal: "yellow-corners",
      mask: "pll",
    },
    {
      kind: "try",
      body: "헤드라이트가 없어요. 한 번 하고, 생긴 헤드라이트를 뒤로 옮겨 한 번 더.",
      setup: flip(`${A_PERM} U ${A_PERM}`),
      alg: `${A_PERM} U ${A_PERM}`,
      goal: "yellow-corners",
      mask: "pll",
    },
    {
      kind: "try",
      body: "윗면이 노란 큐브에서 꼭짓점 자리를 맞춰요.",
      setup: { rule: "yellow-face-solved" },
      goal: "yellow-corners",
      mask: "pll",
    },
    {
      kind: "turn",
      body: "흔한 실수: B2를 B로 한 번만 돌리는 것. 뒷면은 반 바퀴예요. 뒤를 돌리기 어려우면 x를 넣은 같은 공식(x R' U R' D2 R U' R' D2 R2 x')을 써도 돼요. B2를 직접 쳐 보세요.",
      alg: "B2",
    },
  ],
};

const yellowEdges: Lesson = {
  id: "333-yellow-edges",
  size: 3,
  title: "위 모서리 자리",
  summary: "마지막 단계. 다 맞은 면을 뒤에 두고 U퍼뮤.",
  steps: [
    {
      kind: "quiz",
      body: "옆면 하나가 통째로 맞았으면 그 면을 뒤로 두고 R U' R U R U R U' R' U' R2를 해요. 안 맞으면 한 번 더 하면 돼요(반대로 도는 공식 R2 U R U R' U' R' U' R' U R'을 외워도 좋아요). 큐브를 끌어 옆면을 둘러보세요.",
      setup: flip(U_PERM),
      quiz: {
        question: "통째로 맞은 옆면은 어디일까요?",
        choices: SIDES,
        answer: 2,
        why: "뒤가 통째로 맞아 있어요. 그대로 공식을 하면 돼요.",
      },
    },
    {
      kind: "turn",
      body: "통째로 맞은 면이 없으면 아무 쪽에서나 한 번 하면 생겨요. 마지막에 윗면을 돌려 맞춰요. 이 큐브는 윗면만 한 칸 돌아가 있어요. U'를 쳐서 맞춰 보세요.",
      setup: { alg: "z2 U" },
      alg: "U'",
    },
    {
      kind: "demo",
      body: "맞은 면이 뒤에 있어요.",
      setup: flip(U_PERM),
      alg: U_PERM,
    },
    {
      kind: "try",
      body: "맞은 면을 뒤에 두고 해 보세요.",
      setup: flip(U_PERM),
      alg: U_PERM,
      goal: "solved",
    },
    {
      kind: "try",
      body: "반대 방향이에요. 같은 공식을 두 번 해도 되고, 반대 공식을 한 번 해도 돼요.",
      setup: flip(U_PERM_B),
      alg: U_PERM_B,
      goal: "solved",
    },
    {
      kind: "try",
      body: "맞은 면이 없어요(맞은편끼리 바뀜). 한 번 하고, 생긴 맞은 면을 뒤로 옮겨 다시.",
      setup: flip(`${U_PERM} U ${U_PERM} U'`),
      alg: `${U_PERM} U ${U_PERM} U'`,
      goal: "solved",
    },
    {
      kind: "try",
      body: "꼭짓점까지 맞은 큐브를 끝내요. 축하해요, 큐브를 다 맞췄어요!",
      setup: { rule: "corners-placed" },
      goal: "solved",
    },
    {
      kind: "quiz",
      body: "흔한 실수: 공식 끝의 R2를 R로 돌리는 것. 마지막은 반 바퀴예요. 다 맞추면 처음부터 다시 섞어, 단계 이름을 떠올리며 끝까지 해 봐요.",
      quiz: {
        question: "R U' R U R U R U' R' U' R2의 마지막 수는 어떻게 돌릴까요?",
        choices: [
          "오른쪽 면을 한 번(90도)",
          "오른쪽 면을 반 바퀴(180도)",
          "오른쪽 면을 반대로 한 번",
        ],
        answer: 1,
        why: "R2는 반 바퀴예요. 여기서 R만 하면 큐브가 다 맞지 않아요.",
      },
    },
  ],
};

export const BEGINNER_333: Course = {
  id: "333-beginner",
  size: 3,
  title: "3×3 처음 맞추기(층별)",
  summary:
    "조각과 표기부터 마지막 층까지 아홉 단원. 공식 여덟 개로 끝까지 맞춰요.",
  lessons: [
    pieces,
    notation,
    whiteCross,
    firstCorners,
    secondLayer,
    yellowCross,
    yellowFace,
    yellowCorners,
    yellowEdges,
  ],
};
