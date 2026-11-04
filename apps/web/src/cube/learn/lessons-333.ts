// 3×3 초보자 층별 맞추기(docs/47 8-2). 처음부터 끝까지 순서대로 따라 하면 다 맞춘다.
// 처음엔 기본 방향(위 흰, 앞 초록)으로 들고 흰 십자와 첫 층 꼭짓점을 맞춘 뒤, 큐브를 뒤집어(z2) 흰 면을 아래로 둔다.
// 「직접 해보기」의 상황은 모범 답의 거꾸로로 만든다(setupFor). 시험이 상황 → 모범 답 → 목표를 확인한다.
// 글만 읽고 넘기는 단계는 두지 않는다: 설명은 둘러보기·조각 찾기·고르기 문제·따라 하기에 얹는다(types.ts).
import { setupFor } from "./notation";
import type { Course, Lesson } from "./types";

export const SEXY = "R U R' U'";
const RIGHT = "U R U' R' U' F' U F";
const LEFT = "U' L' U L U F U' F'";
const EO = "F R U R' U' F'";
export const SUNE = "R U R' U R U2 R'";
/** 꼭짓점 방향을 먼저 맞추는 방식에서 쓰는 공식(소개만, 방향을 지키며 꼭짓점 셋의 자리를 바꾼다) */
export const A_PERM = "R' F R' B2 R F' R' B2 R2";
/** 옆면 맞추기: 뒤·오른쪽 모서리를 두고 앞·왼쪽 모서리를 바꾼다(수네 + U) */
export const EDGE_SWAP = `${SUNE} U`;
/** 꼭짓점 자리: 앞-오른쪽 위를 두고 나머지 셋의 자리를 돌린다 */
export const CORNER_CYCLE = "U R U' L' U R' U' L";
/** 초보자 꼭짓점 방향 공식. 첫 층(흰 면 위)과 마지막 층 꼭짓점 방향(노란 면 위)에 같은 것을 쓴다 */
export const CORNER_TWIST = "R' D' R D";

/** 같은 공식 k번 */
export const reps = (alg: string, k: number) =>
  Array.from({ length: k }, () => alg).join(" ");

// 마지막 층 상황(풀이의 거꾸로로 만든다). ll-beginner.test.ts가 모양·쥐는 법·횟수를 엔진으로 확인한다
/** 점 → (한 번) ㄱ자 → U2로 뒤·왼쪽 → (한 번) 가로줄 → (한 번) 십자 */
export const DOT_TO_CROSS = `${EO} U2 ${EO} ${EO}`;
/** 맞은 두 모서리가 마주 봄(일자): U로 앞·뒤를 맞추고 한 번 → U'로 앞·오른쪽이 맞음 → y'로 쥐고 한 번 */
export const EDGE_OPPOSITE = `${EDGE_SWAP} U2 ${EDGE_SWAP}`;
/** 제자리 꼭짓점이 없음: 한 번 → 앞-왼쪽 위가 제자리 → y'로 쥐고 한 번 */
export const CORNERS_NONE = `${CORNER_CYCLE} y' ${CORNER_CYCLE}`;
/** 앞-오른쪽 위는 노랑이 오른쪽(두 번), U로 오는 다음 것은 노랑이 앞(네 번) */
export const TWIST_TWO = `${reps(CORNER_TWIST, 2)} U ${reps(CORNER_TWIST, 4)} U'`;
/** 돌아간 꼭짓점 셋, 모두 두 번씩 */
export const TWIST_THREE = `${reps(CORNER_TWIST, 2)} U ${reps(CORNER_TWIST, 2)} U ${reps(CORNER_TWIST, 2)} U2`;
/** 꼭짓점 자리 문제: 앞-오른쪽 위가 제자리지만 돌아가 있음 */
export const CORNER_PLACED_TWISTED = `${CORNER_CYCLE} ${TWIST_TWO}`;

const flip = (solution: string) => ({ alg: setupFor(solution, "z2") });

// 흰 십자의 경우별 풀이(상황은 그 거꾸로, 흰 면 위). where는 처음 모서리 자리. 시험이 엔진으로 자리·방향을 확인한다
/** 가운데 줄, 옆색이 그 면 가운데와 같음: 흰-초록이 앞-오른쪽, 흰색이 오른쪽 */
export const CROSS_MIDDLE = {
  alg: "F'",
  where: "앞-오른쪽, 흰색이 오른쪽을 봐요",
};
/** 가운데 줄: 흰-빨강이 앞-오른쪽, 흰색이 앞(오른쪽 면을 돌려 올림) */
export const CROSS_MIDDLE_R = {
  alg: "R",
  where: "앞-오른쪽, 흰색이 앞을 봐요",
};
/** 가운데 줄, 옆색이 다른 면: 윗면으로 비켜 놓고 올리고 되돌리기 */
export const CROSS_GUARD = {
  alg: "U F' U'",
  where: "앞-오른쪽, 흰색이 오른쪽을 봐요",
};
export const CROSS_GUARD_TRY = { alg: "U' R U", where: "앞-오른쪽" };
/** 아래층, 흰색이 옆: 한 번 돌려 가운데 줄로 올린 뒤 둘째 경우 */
export const CROSS_DOWN_SIDE = { alg: "F' U' R U", where: "아래-앞" };
export const CROSS_DOWN_SIDE_TRY = { alg: "R U F' U'", where: "아래-오른쪽" };
/** 윗층 제자리에서 뒤집힘: 한 번 돌려 가운데 줄로 내린 뒤 둘째 경우 */
export const CROSS_FLIPPED = { alg: "F U' R U", where: "위-앞" };
export const CROSS_FLIPPED_TRY = { alg: "R' U F' U'", where: "위-오른쪽" };
/** 윗층 흰색 위, 엉뚱한 자리: 반 바퀴로 내려 첫째 경우 */
export const CROSS_WRONG_TOP = { alg: "R2 D' F2", where: "위-오른쪽" };
export const CROSS_WRONG_TOP_TRY = { alg: "F2 D R2", where: "위-앞" };

/**
 * 첫 층(흰 면 위): 앞-오른쪽 위 칸에 흰-파랑-빨강이 박힘. R' D' R D로 빼고, D로 제 칸(오른쪽-뒤) 밑에 옮기고,
 * y로 쥐어 넣는다. y'로 돌아오면 처음 칸 밑에 흰-초록-빨강이 흰색 오른쪽으로 와 있어 한 번이면 들어간다
 */
export const STUCK_CORNER_UP = `${CORNER_TWIST} D y ${CORNER_TWIST} y' ${CORNER_TWIST}`;
/** 둘째 층: 앞-오른쪽 칸에 앞-왼쪽 칸의 모서리가 박힘 */
const STUCK_EDGE = `${RIGHT} U' y' ${RIGHT} y`;

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
      body: "R: 오른쪽 면을 오른쪽에서 봤을 때 시계 방향. 오른쪽 층의 조각 아홉 개(가운데 1·모서리 4·꼭짓점 4)가 통째로 돌아, 앞면 칸이 위로 올라가요.",
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
      body: "x·y·z는 면 하나가 아니라 큐브 전체를 돌려 쥐는 거예요(x는 R 방향, y는 U 방향, z는 F 방향). 조각끼리의 자리는 그대로이고 보는 쪽만 바뀌어요. 큐브 전체를 돌려 초록 면이 위로 오게 해 보세요.",
      look: { color: "F", on: "U" },
    },
    {
      kind: "look",
      body: "앞으로 「그 칸을 앞-오른쪽으로 오게 들고」 같은 말이 자주 나와요. 그때는 큐브를 옆으로 돌려 쥐어요(y). 큐브 전체를 옆으로 돌려 빨강 면이 앞에 오게 해 보세요.",
      look: { color: "R", on: "F" },
    },
    {
      kind: "quiz",
      body: "U와 y는 같은 방향으로 돌지만 하는 일이 달라요.",
      setup: { alg: "R U F'" },
      quiz: {
        question: "윗면 돌리기 U와 큐브 돌려 쥐기 y는 무엇이 다를까요?",
        choices: [
          "U는 윗층만 돌아 모양이 바뀌고, y는 큐브 전체가 돌아 섞인 모양은 그대로예요",
          "둘은 똑같아요",
          "y는 아래층만 돌려요",
        ],
        answer: 0,
        why: "y는 손에 쥔 방향만 바꿔요. 조각끼리의 자리는 그대로라 섞인 모양이 바뀌지 않아요.",
      },
    },
    {
      kind: "demo",
      body: "z2: 큐브 전체를 앞면 축으로 반 바퀴. 흰 면이 아래로 가요. 첫 층을 맞춘 뒤 이렇게 뒤집어요.",
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
      body: "첫째 경우: 흰 모서리가 아래층에 있고 흰색이 아래를 봐요. 옆색(초록)이 이미 앞 가운데와 같아요. 그 면(앞)을 반 바퀴 돌리면 모서리 조각이 통째로 위로 올라가요.",
      setup: { alg: "F2" },
      alg: "F2",
      mask: "cross",
    },
    {
      kind: "demo",
      body: "옆색이 가운데와 다르면 아랫면(D)을 돌려 옆색이 같은 가운데 아래로 옮겨요. 아랫면은 흰 십자에 닿지 않아 마음껏 돌려도 돼요. 아랫면을 돌린 뒤(D') 앞면을 반 바퀴.",
      setup: { alg: "F2 D" },
      alg: "D' F2",
      mask: "cross",
    },
    {
      kind: "try",
      body: "흰 모서리 하나가 아래에 있어요(흰색이 아래). 아랫면으로 옆색을 맞추고 반 바퀴로 올려 보세요.",
      setup: { alg: "R2 D2" },
      alg: "D2 R2",
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "demo",
      body: `둘째 경우: 흰 모서리가 가운데 줄에 있어요(${CROSS_MIDDLE.where}). 흰색이 아닌 쪽 색(초록)이 붙은 면, 곧 앞면을 돌리면 흰색이 위로 올라가요. 초록이 앞 가운데와 같으니 반시계로 한 번(F')이면 제자리예요.`,
      setup: { alg: setupFor(CROSS_MIDDLE.alg) },
      alg: CROSS_MIDDLE.alg,
      mask: "cross",
    },
    {
      kind: "quiz",
      body: "가운데 줄 모서리는 흰색이 아닌 쪽 색이 붙은 면을 돌려 올려요. 그 면을 돌려야 흰 칸이 위로 가요.",
      setup: { alg: setupFor(CROSS_MIDDLE_R.alg) },
      mask: "cross",
      quiz: {
        question: `이 모서리(${CROSS_MIDDLE_R.where})는 어느 면을 돌려 올릴까요?`,
        choices: ["앞면", "오른쪽 면", "윗면"],
        answer: 1,
        why: "옆색 빨강이 오른쪽 면에 붙어 있어요. 오른쪽 면을 돌리면(R) 흰 칸이 위로, 빨강은 오른쪽 가운데 위로 가요.",
      },
    },
    {
      kind: "try",
      body: "흰색이 앞을 보는 가운데 줄 모서리예요. 옆색(빨강)이 붙은 오른쪽 면을 돌려 올려 보세요.",
      setup: { alg: setupFor(CROSS_MIDDLE_R.alg) },
      alg: CROSS_MIDDLE_R.alg,
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "demo",
      body: `옆색이 그 면 가운데와 다르면 바로 올리면 안 돼요. 이 모서리(${CROSS_GUARD.where})는 흰-빨강인데 옆색 빨강이 앞면에 붙어 있어요. 이미 넣은 모서리를 지키는 요령: 윗면을 돌려(U) 빨강 자리를 앞으로 데려오고, 앞면으로 올리고(F'), 윗면을 되돌려요(U'). 이미 넣은 흰 모서리도 윗면과 함께 돌았다가 제자리로 돌아와요.`,
      setup: { alg: setupFor(CROSS_GUARD.alg) },
      alg: CROSS_GUARD.alg,
      mask: "cross",
    },
    {
      kind: "try",
      body: "흰-초록 모서리가 가운데 줄에 있는데 옆색 초록이 오른쪽 면에 붙어 있어요. 윗면으로 초록 자리를 비켜 놓고, 올리고, 되돌려 보세요.",
      setup: { alg: setupFor(CROSS_GUARD_TRY.alg) },
      alg: CROSS_GUARD_TRY.alg,
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "quiz",
      body: "셋째 경우: 흰 모서리가 아래층에 있는데 흰색이 옆을 봐요. 이럴 땐 그 면을 한 번 돌려 가운데 줄로 올리면 둘째 경우가 돼요.",
      setup: { alg: setupFor(CROSS_DOWN_SIDE.alg) },
      mask: "cross",
      quiz: {
        question:
          "아래-앞의 흰-초록 모서리는 흰색이 앞을 봐요. 먼저 무엇을 할까요?",
        choices: [
          "앞면을 한 번 돌려 가운데 줄로 올려요",
          "앞면을 반 바퀴 돌려 바로 올려요",
          "아랫면만 돌려요",
        ],
        answer: 0,
        why: "반 바퀴로 올리면 흰색이 앞을 보는 채로 올라가 뒤집혀요. 한 번 돌려 가운데 줄로 보내면 둘째 경우로 풀 수 있어요.",
      },
    },
    {
      kind: "demo",
      body: `앞면을 한 번(F') 돌려 가운데 줄로 올렸어요. 이제 옆색 초록이 오른쪽 면에 붙었으니 둘째 경우의 요령대로: 윗면으로 초록 자리를 비켜 놓고(U'), 오른쪽 면으로 올리고(R), 되돌려요(U).`,
      setup: { alg: setupFor(CROSS_DOWN_SIDE.alg) },
      alg: CROSS_DOWN_SIDE.alg,
      mask: "cross",
    },
    {
      kind: "try",
      body: "흰-빨강 모서리가 아래-오른쪽에 있고 흰색이 오른쪽을 봐요. 한 번 돌려 가운데 줄로 올린 뒤 둘째 경우처럼 올려 보세요.",
      setup: { alg: setupFor(CROSS_DOWN_SIDE_TRY.alg) },
      alg: CROSS_DOWN_SIDE_TRY.alg,
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "demo",
      body: "넷째 경우: 흰 모서리가 윗층 제자리에 있지만 뒤집혔어요(흰색이 앞을 봐요). 앞면을 한 번(F) 돌려 가운데 줄로 내리면 둘째 경우가 돼요. 그다음 비켜 놓고(U'), 올리고(R), 되돌려요(U).",
      setup: { alg: setupFor(CROSS_FLIPPED.alg) },
      alg: CROSS_FLIPPED.alg,
      mask: "cross",
    },
    {
      kind: "try",
      body: "흰-빨강 모서리가 제자리에서 뒤집혔어요. 오른쪽 면을 한 번 돌려 가운데 줄로 내리고, 둘째 경우처럼 올려 보세요.",
      setup: { alg: setupFor(CROSS_FLIPPED_TRY.alg) },
      alg: CROSS_FLIPPED_TRY.alg,
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "demo",
      body: "다섯째 경우: 흰색은 위를 보지만 옆색이 가운데와 달라요(엉뚱한 자리). 그 면을 반 바퀴(R2) 돌려 아래로 내리면 첫째 경우가 돼요. 마침 아래에 있던 흰-빨강이 함께 올라오고, 흰-초록은 아랫면으로 옮겨(D') 앞면으로 올려요.",
      setup: { alg: setupFor(CROSS_WRONG_TOP.alg) },
      alg: CROSS_WRONG_TOP.alg,
      mask: "cross",
    },
    {
      kind: "try",
      body: "흰-빨강 모서리가 앞 위에 잘못 들어가 있어요. 반 바퀴로 내리고, 아랫면으로 옮겨, 빨강 쪽으로 올려 보세요.",
      setup: { alg: setupFor(CROSS_WRONG_TOP_TRY.alg) },
      alg: CROSS_WRONG_TOP_TRY.alg,
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "quiz",
      body: "정리: 어느 경우든 「흰색이 아래를 보는 아래층」이나 「가운데 줄」로 바꾸면 풀 수 있어요. 이 모서리는 다섯 경우 중 어디일까요?",
      setup: { alg: setupFor(CROSS_FLIPPED_TRY.alg) },
      mask: "cross",
      quiz: {
        question: "흰-빨강 모서리는 지금 어떤 경우일까요?",
        choices: [
          "아래층, 흰색이 아래",
          "가운데 줄",
          "아래층, 흰색이 옆",
          "윗층 제자리지만 뒤집힘",
        ],
        answer: 3,
        why: "흰 가운데와 빨강 가운데 사이에 있지만 흰 칸이 오른쪽을 봐요. 한 번 돌려 가운데 줄로 내려요.",
      },
    },
    {
      kind: "quiz",
      body: "흔한 실수: 흰색만 위로 모으고(흰 꽃) 옆색을 안 보는 것. 옆면을 돌려 보면 십자 둘레 색이 가운데와 달라요. 모서리를 올리기 전에 옆색부터 맞춰요.",
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
    {
      kind: "try",
      body: "흰 모서리 둘이 흐트러져 있어요(하나는 가운데 줄, 하나는 아래층). 하나씩 경우를 보고 올려요. 이미 넣은 것이 내려가면 비켜 놓기 요령을 써요.",
      setup: { alg: "R' F" },
      alg: "F' R",
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "try",
      body: "아무렇게나 섞인 큐브에서 흰 십자를 만들어요. 모서리마다 다섯 경우 중 어디인지 보고 하나씩 넣어요.",
      setup: { rule: "random-cross" },
      goal: "white-cross",
      mask: "cross",
    },
  ],
};

/**
 * 첫 층 꼭짓점(2026-11-04 사용자 요청): 흰 십자처럼 흰 면을 위에 둔 채, 흰 꼭짓점을 넣을 칸 바로 밑(앞-오른쪽 아래)으로
 * 가져와 R' D' R D를 흰색이 위로 올 때까지 되풀이한다. 마지막 층 「꼭짓점 방향」에서 같은 공식을 다시 쓴다.
 * 첫 층이 끝나면 큐브를 뒤집어 흰 면을 아래로 둔다(둘째 층부터는 흰 면 아래).
 */
const firstCorners: Lesson = {
  id: "333-first-corners-up",
  size: 3,
  title: "첫 층 꼭짓점",
  summary:
    "흰 면을 위에 둔 채 흰 꼭짓점 넷을 R' D' R D 되풀이로 넣고, 다 되면 큐브를 뒤집어요.",
  steps: [
    {
      kind: "find",
      body: "흰 십자를 만든 그대로 흰 면을 위에 두고 꼭짓점을 넣어요. 넣을 흰 꼭짓점은 아래층에서 찾아요. 흰-초록-빨강 꼭짓점을 눌러 보세요.",
      setup: { alg: setupFor(`D ${CORNER_TWIST}`) },
      mask: "first-layer",
      find: { piece: "corner", colors: ["U", "F", "R"] },
    },
    {
      kind: "find",
      body: "앞에서 본 것처럼 꼭짓점의 제자리는 세 색 가운데가 만나는 구석이에요. 흰-초록-빨강은 흰·초록·빨강 가운데 사이, 위층 구석에 들어가요. 조각이 아니라 그 칸을 눌러 보세요.",
      setup: { alg: setupFor(`D ${CORNER_TWIST}`) },
      mask: "first-layer",
      find: { at: ["U", "F", "R"] },
    },
    {
      kind: "find",
      body: "하나 더 해 봐요. 흰-파랑-주황 꼭짓점은 어느 칸에 들어갈까요? 파랑 가운데와 주황 가운데를 찾고, 그 사이 위 구석을 눌러요. 큐브를 끌어 뒤쪽도 보세요.",
      setup: { alg: setupFor(`D ${CORNER_TWIST}`) },
      mask: "first-layer",
      find: { at: ["U", "B", "L"] },
    },
    {
      kind: "turn",
      body: "넣을 칸을 찾았으면 아랫면을 돌려 꼭짓점을 그 칸 바로 밑(앞-오른쪽 아래)으로 옮겨요. 아랫면은 흰 십자에 닿지 않아 마음껏 돌려도 돼요. D를 쳐서 흰-초록-빨강을 칸 밑으로 옮겨 보세요.",
      setup: { alg: setupFor(`D ${CORNER_TWIST}`) },
      mask: "first-layer",
      alg: "D",
    },
    {
      kind: "quiz",
      body: "칸 밑에 왔으면 R' D' R D를 흰색이 위를 볼 때까지 되풀이해요. 이 공식은 앞-오른쪽 위 칸과 그 밑 칸의 꼭짓점을 바꾸며 돌려요. 횟수는 흰색이 보는 쪽으로 정해져요: 흰색이 오른쪽을 보면 한 번, 아래를 보면 세 번, 앞을 보면 다섯 번.",
      setup: { alg: setupFor(reps(CORNER_TWIST, 3)) },
      mask: "first-layer",
      quiz: {
        question:
          "앞-오른쪽 아래 꼭짓점은 흰색이 아래를 봐요. R' D' R D를 몇 번 할까요?",
        choices: ["한 번", "세 번", "다섯 번"],
        answer: 1,
        why: "흰색이 아래를 보면 세 번이에요. 다음 시연에서 확인해 보세요.",
      },
    },
    {
      kind: "demo",
      body: "흰색이 오른쪽을 봐요. R' D' R D 한 번.",
      setup: { alg: setupFor(CORNER_TWIST) },
      alg: CORNER_TWIST,
      mask: "first-layer",
    },
    {
      kind: "demo",
      body: "흰색이 아래를 봐요. R' D' R D를 세 번. 한 번 할 때마다 흰색이 보는 쪽이 바뀌어요.",
      setup: { alg: setupFor(reps(CORNER_TWIST, 3)) },
      alg: reps(CORNER_TWIST, 3),
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "흰색이 앞을 봐요. 다섯 번 돌려 넣어 보세요.",
      setup: { alg: setupFor(reps(CORNER_TWIST, 5)) },
      alg: reps(CORNER_TWIST, 5),
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "꼭짓점이 칸 밑에 있지 않아요. 먼저 아랫면을 돌려(D) 칸 밑으로 옮기고 R' D' R D.",
      setup: { alg: setupFor(`D ${CORNER_TWIST}`) },
      alg: `D ${CORNER_TWIST}`,
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "look",
      body: "넣을 칸이 앞-오른쪽이 아닐 때는 큐브를 옆으로 돌려 쥐어(y) 그 칸을 앞-오른쪽으로 가져와요. 지금 넣을 칸은 오른쪽-뒤에 있어요. 큐브 전체를 돌려 초록 면이 앞에 오게 해 보세요.",
      setup: { alg: setupFor(`y ${CORNER_TWIST}`) },
      mask: "first-layer",
      look: { color: "F", on: "F" },
    },
    {
      kind: "try",
      body: "흰-초록-빨강이 아래층에 있고, 넣을 칸은 오른쪽-뒤에 있어요. 아랫면을 돌려 칸 밑으로 옮기고, 큐브를 돌려(y) 칸을 앞-오른쪽으로 쥐고, R' D' R D를 흰색이 위로 올 때까지.",
      setup: { alg: setupFor(`D y ${reps(CORNER_TWIST, 3)}`) },
      alg: `D y ${reps(CORNER_TWIST, 3)}`,
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "quiz",
      body: "꼭짓점이 제 칸에 들어가 있지만 돌아가 있을 때도 있어요. 칸을 앞-오른쪽에 두고 같은 공식을 되풀이해요. 흰색이 오른쪽을 보면 두 번, 앞을 보면 네 번이에요.",
      setup: { alg: setupFor(reps(CORNER_TWIST, 2)) },
      mask: "first-layer",
      quiz: {
        question:
          "앞-오른쪽 위 꼭짓점은 제 칸에 있지만 흰색이 오른쪽을 봐요. R' D' R D를 몇 번 할까요?",
        choices: ["두 번", "네 번", "여섯 번"],
        answer: 0,
        why: "제 칸에서 흰색이 오른쪽을 보면 두 번, 앞을 보면 네 번이면 흰색이 위로 와요.",
      },
    },
    {
      kind: "try",
      body: "꼭짓점이 제 칸에 들어가 있지만 흰색이 앞을 봐요. 같은 공식을 네 번 해요.",
      setup: { alg: setupFor(reps(CORNER_TWIST, 4)) },
      alg: reps(CORNER_TWIST, 4),
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "demo",
      body: "앞-오른쪽 위 칸에 다른 흰 꼭짓점(흰-파랑-빨강)이 박혀 있어요. 칸을 앞-오른쪽에 둔 채 R' D' R D 한 번이면 박힌 꼭짓점이 아래로 빠져요. 빠진 것은 아랫면을 돌려(D) 제 칸 밑으로 옮기고, 큐브를 돌려(y) 쥐고 넣어요. 다시 돌려 쥐면(y') 처음 칸 밑에 흰-초록-빨강이 와 있어요.",
      setup: { alg: setupFor(STUCK_CORNER_UP) },
      alg: STUCK_CORNER_UP,
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "엉뚱한 칸에 박힌 흰 꼭짓점을 빼서 제 칸에 넣어 보세요.",
      setup: { alg: setupFor(STUCK_CORNER_UP) },
      alg: STUCK_CORNER_UP,
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "quiz",
      body: "흔한 실수: 공식을 하다 말고 멈추는 것. R' D'까지 하면 흰 십자 모서리 하나가 잠깐 내려가요. R D까지 끝내면 돌아와요.",
      setup: { alg: "R' D'" },
      mask: "first-layer",
      quiz: {
        question:
          "R' D' R D를 R' D'까지 했더니 흰 십자가 흐트러졌어요. 어떻게 할까요?",
        choices: ["흐트러진 모서리부터 고쳐요", "그대로 R D까지 끝내요"],
        answer: 1,
        why: "R D까지 하면 내려간 모서리가 제자리로 돌아와요.",
      },
    },
    {
      kind: "try",
      body: "흰 십자만 맞은 큐브에서 첫 층을 끝내요. 꼭짓점마다 칸 찾기 → 칸 밑으로(D) → 칸을 앞-오른쪽으로 쥐기(y) → 공식 되풀이. 아래층에 흰 꼭짓점이 없으면 위층에 박힌 것을 빼요.",
      setup: { rule: "white-cross-up" },
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "look",
      body: "첫 층이 끝났어요. 둘째 층과 마지막 층은 흰 면을 아래에 두고 해요. 큐브 전체를 뒤집어(z2) 흰 면을 아래로 보내 보세요.",
      mask: "first-layer",
      look: { color: "U", on: "D" },
    },
    {
      kind: "quiz",
      body: "큐브만 통째로 돌렸으니 가운데끼리의 자리는 그대로예요. 다만 앞면 축으로 반 바퀴 돌아서 오른쪽과 왼쪽이 바뀌었어요.",
      setup: { alg: "z2" },
      mask: "first-layer",
      quiz: {
        question: "뒤집은 뒤 오른쪽 가운데는 무슨 색일까요?",
        choices: ["빨강", "주황", "파랑"],
        answer: 1,
        why: "흰 면이 위일 때 왼쪽이던 주황이 오른쪽으로 와요. 앞으로 「오른쪽 주황, 왼쪽 빨강」으로 들고 해요.",
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
      body: "둘째 층(가운데 줄)의 모서리 넷을 넣어요. 노란색이 없는 모서리가 이 칸들의 조각이에요. 노란색이 없는 윗층 모서리를 눌러 보세요.",
      setup: flip(RIGHT),
      mask: "all",
      find: { piece: "edge", colors: ["F", "L"] },
    },
    {
      kind: "quiz",
      body: "그 모서리의 앞쪽 색이 앞 가운데와 같아지게 윗면을 돌려요. 그러면 앞면 가운데 세로줄(위 모서리 칸·가운데 칸·아래 칸)이 한 색으로 이어져, 아래 줄과 함께 ⊥(뒤집힌 T) 모양이 돼요. 그다음 모서리의 위쪽 색이 오른쪽 면 색이면 오른쪽으로, 왼쪽 면 색이면 왼쪽으로 넣어요.",
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
      body: "오른쪽으로 넣기: U R U' R' U' F' U F. 앞 위 모서리를 앞-오른쪽 칸으로 옮겨요. 공식 가운데에 첫 층 꼭짓점이 잠깐 빠졌다가 끝에 함께 돌아와요.",
      setup: flip(RIGHT),
      alg: RIGHT,
      mask: "f2l",
    },
    {
      kind: "demo",
      body: "왼쪽으로 넣기: U' L' U L U F U' F'. 오른쪽 넣기를 거울에 비춘 모양이에요. 앞 위 모서리를 앞-왼쪽 칸으로 옮겨요.",
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
      kind: "find",
      body: "흔한 실수: 노란색이 붙은 모서리를 넣으려는 것. 노란 모서리는 윗층 것이에요. 넣으면 안 되는 모서리(노란색이 붙은 것)를 하나 눌러 보세요.",
      setup: flip(RIGHT),
      mask: "all",
      find: { piece: "edge", has: ["D"] },
    },
    {
      kind: "try",
      body: "윗층에 넣을 모서리가 하나도 없으면 칸에 잘못 들어간 모서리가 있어요. 이 모서리는 앞-오른쪽 칸에 들어가 있지만 뒤집혔어요. 오른쪽 넣기 공식으로 일단 빼내고(위의 아무 모서리나 넣으면 빠져요), 다시 찾아 넣어요.",
      setup: flip(`${RIGHT} U2 ${RIGHT}`),
      alg: `${RIGHT} U2 ${RIGHT}`,
      goal: "second-layer",
      mask: "f2l",
    },
    {
      kind: "try",
      body: "이번엔 앞-오른쪽 칸에 다른 칸(앞-왼쪽)의 모서리가 들어가 있어요. 오른쪽 넣기로 빼내면 위에 있던 모서리가 대신 들어가요. 빠져나온 모서리는 위에서 찾아, 그 칸을 앞-오른쪽으로 오게 큐브를 돌려 들고(y') 넣어요.",
      setup: flip(STUCK_EDGE),
      alg: STUCK_EDGE,
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
  ],
};

// ── 마지막 층(2026-11-04 사용자 요청, 한국 초보자 해법) ──────────────────────
// 노란 십자(모서리 방향) → 옆면 맞추기(모서리 자리) → 꼭짓점 자리 → 꼭짓점 방향.
// 단계마다 같은 공식을 모양을 보며 여러 번 쓴다. 쥐는 법·횟수는 ll-beginner.test.ts가 엔진으로 확인한다.

const yellowCross: Lesson = {
  id: "333-ll-cross",
  size: 3,
  title: "노란 십자",
  summary:
    "윗면 모서리를 노랗게. 모양(점·ㄱ자·가로줄)을 보고 F R U R' U' F'을 최대 세 번.",
  steps: [
    {
      kind: "quiz",
      body: "윗면에서 노란 칸이 위를 보는 모서리만 봐요(꼭짓점은 아직 안 봐요). 노란 가운데 하나만 있는 「점」, 노란 모서리 둘이 가운데와 꺾여 이어진 「ㄱ자」, 둘이 가운데를 사이에 두고 마주 본 「가로줄」, 넷 다인 「십자」 중 하나예요. 노란 모서리가 1개나 3개면 앞 단계에서 조각이 빠졌거나 실물 큐브가 튄 거예요(늘 짝수예요).",
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
      body: "가로줄: 줄이 가로(왼쪽-오른쪽)가 되게 들고 F R U R' U' F'. 이 공식은 아래 두 층은 그대로 두고 윗층 모서리의 방향을 바꿔요.",
      setup: flip(EO),
      alg: EO,
      mask: "oll",
    },
    {
      kind: "quiz",
      body: "이 단계는 공식이 하나뿐이에요. 모양에 따라 쥐는 법만 달라요. 가로줄은 가로로, ㄱ자는 노란 두 칸이 뒤와 왼쪽(시계로 9시·12시)을 가리키게 들어요. 점은 아무렇게나 들어도 돼요.",
      setup: { alg: `${setupFor(`${EO} ${EO}`, "z2")} U'` },
      mask: "oll",
      quiz: {
        question: "지금 이 ㄱ자에서 어떻게 쥘까요?",
        choices: [
          "U를 돌려 노란 두 칸을 뒤와 왼쪽으로 옮겨요",
          "그대로 공식을 해요",
          "노란 두 칸이 앞과 오른쪽에 오게 해요",
        ],
        answer: 0,
        why: "지금 노란 두 칸은 왼쪽과 앞이에요. U로 한 칸 돌리면 뒤와 왼쪽이 돼요.",
      },
    },
    {
      kind: "turn",
      body: "U를 쳐서 ㄱ자를 뒤·왼쪽으로 옮긴 다음, 공식을 한 번 쳐 보세요. 모양이 어떻게 바뀌는지 봐요.",
      setup: { alg: `${setupFor(`${EO} ${EO}`, "z2")} U'` },
      alg: `U ${EO}`,
      mask: "oll",
    },
    {
      kind: "quiz",
      body: "같은 공식을 한 번 썼더니 ㄱ자가 이렇게 바뀌었어요. 한 번에 십자가 되지 않아도 괜찮아요. 모양을 다시 보고 또 써요.",
      setup: flip(EO),
      mask: "oll",
      quiz: {
        question: "지금 모양은 무엇이고, 공식을 몇 번 더 해야 할까요?",
        choices: ["가로줄, 그대로 한 번 더", "ㄱ자, 두 번 더", "점, 세 번 더"],
        answer: 0,
        why: "ㄱ자를 바르게 쥐고 한 번 하면 가로줄이 돼요. 가로줄은 가로로 쥐고 한 번 더 하면 십자예요.",
      },
    },
    {
      kind: "try",
      body: "ㄱ자예요. 뒤·왼쪽으로 쥐고 한 번 → 가로줄을 가로로 쥐고 한 번 더.",
      setup: flip(`${EO} ${EO}`),
      alg: `${EO} ${EO}`,
      goal: "yellow-cross",
      mask: "oll",
    },
    {
      kind: "turn",
      body: "점이에요. 아무 방향에서나 공식을 한 번 쳐 보세요. ㄱ자가 생겨요.",
      setup: flip(DOT_TO_CROSS),
      alg: EO,
      mask: "oll",
    },
    {
      kind: "quiz",
      body: "점은 한 번 하면 ㄱ자, ㄱ자는 한 번 하면 가로줄, 가로줄은 한 번 하면 십자예요. 그래서 이 단계는 같은 공식을 많아야 세 번 써요.",
      setup: flip(`U2 ${EO} ${EO}`),
      mask: "oll",
      quiz: {
        question: "점에서 시작했다면 공식을 모두 몇 번 쓸까요?",
        choices: ["한 번", "두 번", "세 번"],
        answer: 2,
        why: "점 → ㄱ자 → 가로줄 → 십자, 세 번이에요. 사이사이 U로 쥐는 법을 맞춰요.",
      },
    },
    {
      kind: "try",
      body: "점에서 십자까지 가 보세요. 한 번 하고 → ㄱ자를 뒤·왼쪽으로(U) → 한 번 → 가로줄 그대로 한 번.",
      setup: flip(DOT_TO_CROSS),
      alg: DOT_TO_CROSS,
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
  ],
};

const llEdges: Lesson = {
  id: "333-ll-edges",
  size: 3,
  title: "옆면 맞추기",
  summary:
    "노란 십자 모서리의 옆색을 옆 가운데와 맞춰요. R U R' U R U2 R' U를 한두 번.",
  steps: [
    {
      kind: "quiz",
      body: "노란 십자는 됐지만 모서리의 옆색이 옆 가운데와 다를 수 있어요. 윗면(U)을 돌려 가며 옆색이 맞는 모서리가 둘 이상인 자리를 찾아요. 늘 그런 자리가 있어요.",
      setup: flip(EDGE_SWAP),
      quiz: {
        question: "지금 옆색이 맞은 모서리 둘은 어디일까요?",
        choices: ["앞과 오른쪽", "오른쪽과 뒤", "뒤와 왼쪽", "왼쪽과 앞"],
        answer: 1,
        why: "오른쪽과 뒤가 맞아요. 이웃한 두 모서리(ㄱ자)가 맞았으니 이대로 공식을 하면 돼요.",
      },
    },
    {
      kind: "demo",
      body: "맞은 두 모서리를 뒤와 오른쪽에 두고 R U R' U R U2 R' U. 앞과 왼쪽 두 모서리가 서로 바뀌어요. 꼭짓점은 흐트러져도 괜찮아요(다음 단계에서 맞춰요).",
      setup: flip(EDGE_SWAP),
      alg: EDGE_SWAP,
    },
    {
      kind: "quiz",
      body: "맞은 둘이 다른 쪽에 있으면 큐브를 돌려 쥐어(y) 뒤·오른쪽으로 가져와요. 윗면(U)을 돌리면 옆색이 맞는 모서리가 바뀌니 쥐는 것은 큐브째 돌려요.",
      setup: { alg: `${setupFor(EDGE_SWAP, "z2")} y` },
      quiz: {
        question: "옆색이 맞은 두 모서리가 앞과 오른쪽이에요. 어떻게 쥘까요?",
        choices: [
          "큐브를 돌려(y') 그 둘을 오른쪽과 뒤로",
          "그대로 공식을 해요",
          "U를 돌려 옮겨요",
        ],
        answer: 0,
        why: "y'로 쥐면 앞이 오른쪽, 오른쪽이 뒤로 가요. 그러면 공식이 바꾸는 앞·왼쪽 두 모서리가 남은 둘이에요.",
      },
    },
    {
      kind: "try",
      body: "돌려 쥐고(y') 공식을 해 보세요.",
      setup: { alg: `${setupFor(EDGE_SWAP, "z2")} y` },
      alg: `y' ${EDGE_SWAP}`,
      goal: "yellow-edges",
    },
    {
      kind: "quiz",
      body: "윗면을 어떻게 돌려도 맞은 둘이 마주 볼 때(일자)가 있어요. 이때는 아무 쪽에서나 공식을 한 번 하면 이웃한 둘이 맞게 돼요. 그다음 다시 쥐고 한 번 더.",
      setup: flip(EDGE_OPPOSITE),
      quiz: {
        question: "맞은 두 모서리가 마주 보면 공식을 모두 몇 번 쓸까요?",
        choices: ["한 번", "두 번", "네 번"],
        answer: 1,
        why: "한 번 하면 ㄱ자처럼 이웃한 둘이 맞아요. 그 둘을 뒤·오른쪽에 쥐고 한 번 더 하면 끝이에요.",
      },
    },
    {
      kind: "turn",
      body: "U를 쳐서 앞과 뒤 모서리의 옆색을 맞춘 뒤(일자), 공식을 한 번 쳐 보세요.",
      setup: flip(EDGE_OPPOSITE),
      alg: `U ${EDGE_SWAP}`,
    },
    {
      kind: "try",
      body: "이어서 해 보세요. U를 돌려 이웃한 둘이 맞는 자리를 찾고, 그 둘을 뒤·오른쪽으로 쥐고(y') 한 번 더.",
      setup: { alg: `${setupFor(EDGE_OPPOSITE, "z2")} U ${EDGE_SWAP}` },
      alg: `U' y' ${EDGE_SWAP}`,
      goal: "yellow-edges",
    },
    {
      kind: "try",
      body: "노란 십자까지 맞은 큐브에서 옆면을 맞춰요. 끝나면 윗면을 돌려 모서리 넷의 옆색을 모두 맞춰 둬요.",
      setup: { rule: "ll-cross-solved" },
      goal: "yellow-edges",
    },
  ],
};

const llCornerPlace: Lesson = {
  id: "333-ll-corner-place",
  size: 3,
  title: "꼭짓점 자리",
  summary:
    "꼭짓점을 방향은 상관없이 제자리로. 제자리 하나를 앞-오른쪽 위에 두고 U R U' L' U R' U' L.",
  steps: [
    {
      kind: "quiz",
      body: "이제 위 꼭짓점의 자리만 맞춰요. 방향은 다음 단계에서 맞추니 상관없어요. 꼭짓점의 세 색이 그 구석 세 가운데의 색과 같으면 「제자리」예요. 노란색이 옆을 봐도 돼요.",
      setup: flip(CORNER_PLACED_TWISTED),
      quiz: {
        question:
          "앞-오른쪽 위 꼭짓점은 노랑·초록·주황이에요. 이 꼭짓점은 제자리일까요?(방향은 상관없이)",
        choices: ["네, 제자리예요", "아니요, 노란색이 위를 봐야 해요"],
        answer: 0,
        why: "앞은 초록, 오른쪽은 주황, 위는 노랑 가운데라 세 색이 같아요. 방향은 다음 단계에서 맞춰요.",
      },
    },
    {
      kind: "demo",
      body: "제자리 꼭짓점을 앞-오른쪽 위에 두고 U R U' L' U R' U' L. 앞-오른쪽 위는 그대로 두고, 나머지 세 꼭짓점의 자리를 돌려요. 위 모서리는 그대로예요.",
      setup: flip(CORNER_CYCLE),
      alg: CORNER_CYCLE,
    },
    {
      kind: "turn",
      body: "같은 공식을 한 번 쳐 보세요. 세 꼭짓점이 공식과 반대쪽으로 돌아야 하는 상황이에요.",
      setup: flip(`${CORNER_CYCLE} ${CORNER_CYCLE}`),
      alg: CORNER_CYCLE,
    },
    {
      kind: "quiz",
      body: "한 번 했더니 세 꼭짓점이 한 칸씩 돌았지만 아직 제자리가 아니에요.",
      setup: flip(CORNER_CYCLE),
      quiz: {
        question: "몇 번 더 해야 할까요?",
        choices: ["같은 쥐는 법으로 한 번 더", "큐브를 돌려 쥐고 세 번 더"],
        answer: 0,
        why: "세 꼭짓점은 한 번에 한 칸씩 돌아요. 반대쪽으로 돌아야 했으면 같은 쥐는 법으로 한 번 더 하면 맞아요.",
      },
    },
    {
      kind: "try",
      body: "제자리 꼭짓점이 앞-오른쪽 위에 있어요. 공식을 두 번 해 보세요.",
      setup: flip(`${CORNER_CYCLE} ${CORNER_CYCLE}`),
      alg: `${CORNER_CYCLE} ${CORNER_CYCLE}`,
      goal: "ll-corners-placed",
    },
    {
      kind: "try",
      body: "제자리 꼭짓점이 다른 구석에 있어요. 큐브를 돌려 쥐어 그것을 앞-오른쪽 위로 가져오고 공식.",
      setup: { alg: `${setupFor(CORNER_CYCLE, "z2")} y` },
      alg: `y' ${CORNER_CYCLE}`,
      goal: "ll-corners-placed",
    },
    {
      kind: "quiz",
      body: "제자리 꼭짓점이 하나도 없을 때가 있어요.",
      setup: flip(CORNERS_NONE),
      quiz: {
        question: "제자리 꼭짓점이 하나도 없어요. 어떻게 할까요?",
        choices: [
          "아무 쪽에서나 공식을 한 번 해요",
          "윗면을 돌려 맞춰요",
          "처음부터 다시 섞어요",
        ],
        answer: 0,
        why: "아무 데서나 한 번 하면 제자리 꼭짓점이 꼭 하나 생겨요. 그것을 앞-오른쪽 위에 두고 다시 해요. 윗면을 돌리면 위 모서리가 흐트러져요.",
      },
    },
    {
      kind: "try",
      body: "제자리 꼭짓점이 없어요. 한 번 하고, 생긴 제자리 꼭짓점을 앞-오른쪽 위로 쥐고(y') 다시.",
      setup: flip(CORNERS_NONE),
      alg: CORNERS_NONE,
      goal: "ll-corners-placed",
    },
    {
      kind: "try",
      body: "위 모서리까지 맞은 큐브에서 꼭짓점 자리를 맞춰요.",
      setup: { rule: "ll-edges-solved" },
      goal: "ll-corners-placed",
    },
  ],
};

const llCornerTwist: Lesson = {
  id: "333-ll-corner-twist",
  size: 3,
  title: "꼭짓점 방향",
  summary:
    "마지막 단계. 첫 층에서 쓴 R' D' R D를 꼭짓점마다 2번 또는 4번, 사이에는 윗면만 돌려요.",
  steps: [
    {
      kind: "quiz",
      body: "마지막은 첫 층에서 쓴 그 R' D' R D예요. 흰 면은 아래 그대로, 노란 면을 위에 두고 풀 꼭짓점을 앞-오른쪽 위에 둬요. 노란색이 위를 볼 때까지 되풀이해요: 노란색이 오른쪽을 보면 두 번, 앞을 보면 네 번.",
      setup: flip(TWIST_TWO),
      quiz: {
        question:
          "앞-오른쪽 위 꼭짓점의 노란색이 오른쪽을 봐요. R' D' R D를 몇 번 할까요?",
        choices: ["두 번", "네 번", "여섯 번"],
        answer: 0,
        why: "오른쪽이면 두 번, 앞이면 네 번이에요. 첫 층에서 제 칸에 돌아간 꼭짓점을 고칠 때와 같아요.",
      },
    },
    {
      kind: "turn",
      body: "R' D' R D를 두 번 쳐 보세요. 앞-오른쪽 위 꼭짓점의 노란색이 위로 와요. 그런데 아래 두 층을 보세요.",
      setup: flip(TWIST_TWO),
      alg: reps(CORNER_TWIST, 2),
    },
    {
      kind: "quiz",
      body: "흔한 실수: 아래 두 층이 흐트러져 놀라서 고치려는 것. 남은 꼭짓점까지 다 돌리면 아래 두 층은 돌아와요. 그 사이에 큐브를 통째로 돌려 쥐거나 아래층을 돌리면 안 돼요.",
      setup: { alg: `${setupFor(TWIST_TWO, "z2")} ${reps(CORNER_TWIST, 2)}` },
      quiz: {
        question:
          "아래 두 층이 흐트러졌어요. 다음 꼭짓점은 어떻게 앞-오른쪽 위로 가져올까요?",
        choices: [
          "윗면(U)만 돌려요",
          "큐브를 돌려 쥐어요(y)",
          "먼저 흐트러진 아래층을 고쳐요",
        ],
        answer: 0,
        why: "윗면만 돌리면 공식이 늘 같은 앞-오른쪽 칸 밑을 쓰게 돼요. 그래야 마지막에 아래 두 층이 돌아와요.",
      },
    },
    {
      kind: "turn",
      body: "U를 쳐서 다음 꼭짓점(노란색이 앞을 봄)을 앞-오른쪽 위로 가져온 뒤, R' D' R D를 네 번 쳐 보세요. 아래 두 층이 돌아와요.",
      setup: { alg: `${setupFor(TWIST_TWO, "z2")} ${reps(CORNER_TWIST, 2)}` },
      alg: `U ${reps(CORNER_TWIST, 4)}`,
    },
    {
      kind: "turn",
      body: "끝나면 윗면을 돌려 옆색을 맞춰요. U'를 쳐 보세요.",
      setup: {
        alg: `${setupFor(TWIST_TWO, "z2")} ${reps(CORNER_TWIST, 2)} U ${reps(CORNER_TWIST, 4)}`,
      },
      alg: "U'",
    },
    {
      kind: "try",
      body: "돌아간 꼭짓점이 셋이에요. 하나씩 앞-오른쪽 위로(U만) 가져와 노란색이 위를 볼 때까지. 중간에 아래가 흐트러져도 끝까지 가요.",
      setup: flip(TWIST_THREE),
      alg: TWIST_THREE,
      goal: "solved",
    },
    {
      kind: "quiz",
      body: "다른 순서도 있어요. 꼭짓점 방향을 먼저 맞추고 자리를 나중에 맞추는 방식이에요. 큐브를 뒤집어 「오른손 트위스트(R U R' U')」를 되풀이하는 가이드도 있어요. 여기서는 흰 면을 아래에 둔 채 이어 가니 R' D' R D를 써요.",
      setup: flip(A_PERM),
      quiz: {
        question:
          "방향을 먼저 맞춘다면, 그다음 꼭짓점 자리는 어떤 공식으로 맞출까요?",
        choices: [
          "방향을 지키며 자리만 바꾸는 공식(A퍼뮤 R' F R' B2 R F' R' B2 R2)",
          "U R U' L' U R' U' L(자리를 바꾸며 방향도 돌려요)",
        ],
        answer: 0,
        why: "U R U' L' U R' U' L은 꼭짓점을 돌리기도 해서 맞춘 방향이 풀려요. A퍼뮤는 노란색이 위를 본 채로 꼭짓점 셋의 자리만 바꿔요.",
      },
    },
    {
      kind: "try",
      body: "꼭짓점 자리까지 맞은 큐브를 끝내요. 축하해요, 큐브를 다 맞췄어요!",
      setup: { rule: "ll-corners-placed" },
      goal: "solved",
    },
  ],
};

export const BEGINNER_333: Course = {
  id: "333-beginner",
  size: 3,
  title: "3×3 처음 맞추기(층별)",
  summary:
    "조각과 표기부터 마지막 층까지 일곱 단계. 공식 여섯 개로 끝까지 맞춰요.",
  lessons: [
    pieces,
    notation,
    whiteCross,
    firstCorners,
    secondLayer,
    yellowCross,
    llEdges,
    llCornerPlace,
    llCornerTwist,
  ],
};
