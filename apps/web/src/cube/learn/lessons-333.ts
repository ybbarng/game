// 3×3 초보자 층별 맞추기(docs/47 8-2). 처음부터 끝까지 순서대로 따라 하면 다 맞춘다.
// 처음엔 기본 방향(위 흰, 앞 초록)으로 들고 흰 십자를 만든 뒤, 큐브를 뒤집어(z2) 흰 면을 아래로 둔다.
// 「직접 해보기」의 상황은 모범 답의 거꾸로로 만든다(setupFor). 시험이 상황 → 모범 답 → 목표를 확인한다.
// 글만 읽고 넘기는 단계는 두지 않는다: 설명은 둘러보기·조각 찾기·고르기 문제·따라 하기에 얹는다(types.ts).
import { setupFor } from "./notation";
import type { Course, Lesson } from "./types";

export const SEXY = "R U R' U'";
const RIGHT = "U R U' R' U' F' U F";
const LEFT = "U' L' U L U F U' F'";
const EO = "F R U R' U' F'";
const EO_L = "F U R U' R' F'";
export const SUNE = "R U R' U R U2 R'";
export const A_PERM = "R' F R' B2 R F' R' B2 R2";
const U_PERM = "R U' R U R U R U' R' U' R2";
const U_PERM_B = "R2 U R U R' U' R' U' R' U R'";

const flip = (solution: string) => ({ alg: setupFor(solution, "z2") });

const SIDES = ["앞", "오른쪽", "뒤", "왼쪽"];

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

/** 첫 층: 앞-왼쪽 아래 칸에 엉뚱한 흰 꼭짓점이 박힘. 돌려 들고 꺼낸 뒤 제 칸에 넣는다 */
export const STUCK_CORNER = `y' ${SEXY} y U' ${SEXY}`;
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

/** 평가 그림 (나): 흰 조각 여덟이 제자리·바른 방향(첫 층 다 맞음). 나머지 두 층만 흐트러뜨린다(x2로 뒤집어 아래 두 층 공식) */
export const LAYER_DONE =
  "x2 U R U' R' U' F' U F U2 R U R' U R U2 R' U' F R U R' U' F' x2";
/** 평가 그림 (가): (나)에서 윗층 조각의 자리만 모두 바꿈(H퍼뮤 + U). 흰 면은 다 흰색이지만 옆면 첫 줄이 다 틀림 */
export const FACE_ONLY = `${LAYER_DONE} M2 U M2 U2 M2 U M2 U`;

/**
 * 준비 1 「큐브와 만나기」(2026-11-04 사용자가 정한 처음 흐름): 환영 → 스티커가 아니라 조각 → 가운데 세기 →
 * 가상 분해·조립(축 → 가운데 → 모서리 → 꼭짓점) → 모두 몇 개. 공식은 하나도 외우지 않는다.
 */
const start: Lesson = {
  id: "333-start",
  size: 3,
  title: "큐브와 만나기",
  summary:
    "큐브는 스티커 54장이 아니라 조각 26개예요. 분해하고 다시 끼워 봐요.",
  steps: [
    {
      kind: "welcome",
      body: "반가워요! 이 큐브는 마구 섞였다가 해법대로 다시 맞춰지고 있어요. 이 과정을 차례로 따라오면 여러분도 처음부터 끝까지 직접 맞출 수 있어요.",
    },
    {
      kind: "parts",
      body: "큐브는 스티커 54장처럼 보여요. 하지만 실은 조각 26개예요. 「스티커로 보기」와 「조각으로 보기」를 바꿔 보고, 칸 하나를 눌러 보세요. 칸만이 아니라 붙은 조각 전체가 함께 들려요.",
    },
    {
      kind: "find",
      body: "면 한가운데에는 색이 하나뿐인 「가운데 조각」이 있어요. 까만 큐브에서 가운데 조각을 모두 눌러 세어 보세요. 누르면 색이 드러나요. 뒤쪽은 끌어서 둘러보거나 펼친 그림에서 눌러요.",
      mask: "none",
      find: { piece: "center" },
      count: 6,
    },
    {
      kind: "build",
      body: "큐브 속은 어떻게 생겼을까요? 맞춘 큐브를 가상으로 분해한 뒤 축 → 가운데 → 모서리 → 꼭짓점 차례로 다시 끼워 봐요. 붙은 색이 하나, 둘, 셋으로 늘어요.",
    },
    {
      kind: "quiz",
      body: "가운데 6, 모서리 12, 꼭짓점 8을 끼웠어요. 큐브 속 한가운데는 축이라 돌아가지 않아요.",
      mask: "all",
      quiz: {
        question: "큐브를 이루는 조각은 모두 몇 개일까요?",
        choices: ["54개", "27개", "26개"],
        answer: 2,
        why: "6 + 12 + 8 = 26개예요. 54는 스티커 수예요. 큐브를 맞춘다는 건 스티커 54장이 아니라 조각 26개를 제자리에 두는 거예요.",
      },
    },
  ],
};

/**
 * 준비 2 「조각의 움직임」: 완성된 큐브에서 보고 싶은 조각만 색을 넣고 마음대로 돌려 본다(놀이판). 가운데는 그대로,
 * 꼭짓점·모서리는 제 종류 자리로만, 색은 함께 다닌다. 그다음 「한 면을 맞춘 상태」 평가, 제자리·방향, 해 보기.
 */
const pieces: Lesson = {
  id: "333-pieces",
  size: 3,
  title: "조각의 움직임",
  summary: "보고 싶은 조각만 색을 넣고 돌려 봐요. 색이 아니라 조각을 옮겨요.",
  steps: [
    {
      kind: "play",
      body: "가운데 조각만 색을 넣었어요. 아무 면이나 마음대로 돌려 보세요. 면을 돌려도 가운데는 제자리에서 돌기만 해요. 가운데 층(M·E·S)을 돌리면 가운데가 함께 옮겨 가지만, 서로의 차례는 그대로예요.",
      play: { focus: { piece: "center" }, turns: 5, choose: true },
    },
    {
      kind: "play",
      body: "흰-초록-빨강 꼭짓점과 가운데만 색이 있어요. 아무 면이나 돌려 보며 이 꼭짓점을 따라가 보세요. 꼭짓점은 꼭짓점 자리로만 다녀요. 「다른 조각 보기」로 모서리나 가운데도 따라가 볼 수 있어요.",
      play: {
        focus: { colors: ["U", "F", "R"] },
        centers: true,
        moved: 3,
        choose: true,
      },
    },
    {
      kind: "play",
      body: "이번엔 흰-초록 모서리예요. 모서리는 모서리 자리로만 다녀요. 꼭짓점 자리로는 절대 가지 않아요.",
      play: {
        focus: { colors: ["U", "F"] },
        centers: true,
        moved: 3,
        choose: true,
      },
    },
    {
      kind: "play",
      body: "흰-빨강 모서리와 흰-빨강-파랑 꼭짓점이에요. 조각의 색은 함께 다녀요. 아무리 돌려도 스티커 한 장만 따로 떨어지는 일은 없어요.",
      play: {
        focus: [{ colors: ["U", "R"] }, { colors: ["U", "R", "B"] }],
        turns: 6,
      },
    },
    {
      kind: "find",
      body: `확인해 봐요. ${TRACK_CORNER}을 돌렸고, 가운데만 보여요. 흰-초록-빨강 꼭짓점은 지금 어디 있나요? 눌러 보세요. 막히면 「보통」으로 색을 볼 수 있어요.`,
      setup: { alg: TRACK_CORNER },
      mask: "centers",
      find: { piece: "corner", colors: ["U", "F", "R"] },
    },
    {
      kind: "quiz",
      body: "두 큐브 모두 윗면이 흰색이에요. 끌어서 옆면도 둘러보세요.",
      mask: "all",
      quiz: {
        question: "다음 중 한 면을 맞춘 상태는?",
        choices: ["(가)", "(나)"],
        answer: 1,
        why: "(가)는 흰 칸이 위를 보기만 하고 조각이 제자리가 아니라 옆면 첫 줄이 가운데 색과 달라요. (나)는 흰 조각 여덟이 제자리에 바른 방향으로 있어요. 면이 아니라 조각이 제자리에 와야 해요. 방향은 맞는데 자리가 틀린 조각이 있으면 아직 맞춘 게 아니에요.",
        pictures: [{ alg: FACE_ONLY }, { alg: LAYER_DONE }],
      },
    },
    {
      kind: "find",
      body: "조각마다 돌아갈 「제자리」가 있어요. 가운데는 움직이지 않으니, 제자리는 조각의 색과 같은 가운데들이 정해요. 초록-주황 모서리의 제자리(초록·주황 가운데 사이)를 눌러 보세요. 조각이 아니라 자리를 찾아요.",
      setup: { alg: "R U F" },
      mask: "centers",
      find: { at: ["F", "L"] },
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
      body: "z2: 큐브 전체를 앞면 축으로 반 바퀴. 흰 면이 아래로 가요. 흰 십자를 만든 뒤 이렇게 뒤집어요.",
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

const firstCorners: Lesson = {
  id: "333-first-corners",
  size: 3,
  title: "첫 층 꼭짓점",
  summary:
    "큐브를 뒤집어 흰 면을 아래로 두고, 흰 꼭짓점 넷을 R U R' U' 하나로 넣어요.",
  steps: [
    {
      kind: "look",
      body: "이제 큐브를 뒤집어(z2) 흰 십자를 아래로, 노란 가운데를 위로 둬요. 까닭: 맞춘 층을 아래에 두면 앞으로 쓸 공식이 윗층만 흐트러뜨리고, 넣을 조각은 위에서 찾기 쉬워요. 앞은 그대로 초록이에요. 큐브 전체를 돌려 흰 면을 아래로 보내 보세요.",
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
    {
      kind: "find",
      body: "흰색이 붙은 꼭짓점을 윗층에서 찾아요. 앞에서 본 것처럼 꼭짓점의 제자리는 세 색 가운데가 만나는 구석이에요. 윗층의 흰-초록-주황 꼭짓점을 눌러 보세요.",
      setup: flip(SEXY),
      mask: "first-layer",
      find: { piece: "corner", colors: ["U", "F", "L"] },
    },
    {
      kind: "find",
      body: "이 꼭짓점이 들어갈 칸은 흰색이 아닌 두 색(초록·주황)으로 정해요. 초록 가운데(앞)와 주황 가운데(오른쪽) 사이, 아래층 구석이에요. 조각이 아니라 그 칸을 눌러 보세요.",
      setup: flip(SEXY),
      mask: "first-layer",
      find: { at: ["D", "F", "R"] },
    },
    {
      kind: "find",
      body: "하나 더 해 봐요. 흰-파랑-빨강 꼭짓점은 어느 칸에 들어갈까요? 파랑 가운데와 빨강 가운데를 찾고, 그 사이 아래 구석을 눌러요. 큐브를 끌어 뒤쪽도 보세요.",
      setup: flip(SEXY),
      mask: "first-layer",
      find: { at: ["D", "B", "L"] },
    },
    {
      kind: "turn",
      body: "넣을 칸을 찾았으면 윗면을 돌려 꼭짓점을 그 칸 바로 위(앞-오른쪽 위)로 옮겨요. 윗면만 돌리니 아래 흰 십자는 그대로예요. U'를 쳐서 흰-초록-주황 꼭짓점을 칸 위로 옮겨 보세요.",
      setup: flip(`U' ${SEXY}`),
      mask: "first-layer",
      alg: "U'",
    },
    {
      kind: "quiz",
      body: "칸 위에 왔으면 R U R' U'을 맞을 때까지 되풀이해요. 이 공식은 앞-오른쪽 위 꼭짓점과 아래 칸 꼭짓점을 바꾸며 돌려요. 횟수는 흰색이 보는 쪽으로 정해져요: 흰색이 오른쪽을 보면 한 번, 위를 보면 세 번, 앞을 보면 다섯 번.",
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
      body: "꼭짓점이 넣을 칸 위에 있지 않아요. 먼저 윗면을 돌려(U') 칸 위로 옮기고 R U R' U'.",
      setup: flip(`U' ${SEXY}`),
      alg: `U' ${SEXY}`,
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "quiz",
      body: "꼭짓점이 제 칸에 들어가 있지만 돌아가 있을 때도 있어요. 칸을 앞-오른쪽에 두고 같은 공식을 되풀이해요. 흰색이 오른쪽을 보면 두 번, 앞을 보면 네 번이에요.",
      setup: flip(`${SEXY} ${SEXY}`),
      mask: "first-layer",
      quiz: {
        question:
          "앞-오른쪽 아래 꼭짓점은 제 칸에 있지만 흰색이 오른쪽을 봐요. R U R' U'을 몇 번 할까요?",
        choices: ["한 번", "두 번", "네 번"],
        answer: 1,
        why: "제 칸에서 흰색이 오른쪽을 보면 두 번, 앞을 보면 네 번이면 흰색이 아래로 와요.",
      },
    },
    {
      kind: "try",
      body: "꼭짓점이 제 칸에 들어가 있지만 흰색이 앞을 봐요. 같은 공식을 네 번 해요.",
      setup: flip(`${SEXY} ${SEXY} ${SEXY} ${SEXY}`),
      alg: `${SEXY} ${SEXY} ${SEXY} ${SEXY}`,
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "demo",
      body: "윗층에 넣을 흰 꼭짓점이 없는데 첫 층이 안 맞을 때: 흰 꼭짓점이 다른 칸에 박혀 있어요. 여기선 앞-왼쪽 아래 칸의 꼭짓점 색이 초록·빨강 가운데와 달라요. 큐브를 돌려(y') 그 칸을 앞-오른쪽으로 들고 R U R' U' 한 번으로 꺼내요. 다시 돌려 들고(y) 꺼낸 꼭짓점을 제 칸 위로 옮겨(U') 넣어요.",
      setup: flip(STUCK_CORNER),
      alg: STUCK_CORNER,
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "엉뚱한 칸에 박힌 흰 꼭짓점을 꺼내 제 칸에 넣어 보세요. 꺼낼 때 위에 있던 꼭짓점이 대신 들어가기도 해요.",
      setup: flip(STUCK_CORNER),
      alg: STUCK_CORNER,
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
    {
      kind: "try",
      body: "흰 십자만 맞은 큐브에서 첫 층을 끝내요. 꼭짓점마다 칸 고르기 → 칸 위로 옮기기 → 공식 되풀이. 윗층에 흰 꼭짓점이 없으면 박힌 것을 꺼내요.",
      setup: { rule: "cross-solved" },
      goal: "first-layer",
      mask: "first-layer",
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

const yellowCross: Lesson = {
  id: "333-yellow-cross",
  size: 3,
  title: "노란 십자",
  summary:
    "윗면 모서리를 노랗게. 모양(점·ㄱ자·가로줄)을 보고 F R U R' U' F'을 써요.",
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
      body: "가로줄: 줄이 가로(왼쪽-오른쪽)가 되게 들고 F R U R' U' F'. 이 공식은 아래 두 층은 그대로 두고 윗층 모서리 둘을 뒤집어 노란색을 위로 올려요.",
      setup: flip(EO),
      alg: EO,
      mask: "oll",
    },
    {
      kind: "quiz",
      body: "ㄱ자는 쥐는 방향이 정해져 있어요.",
      setup: flip(EO_L),
      mask: "oll",
      quiz: {
        question: "이 ㄱ자의 노란 모서리 둘은 어디에 있나요?",
        choices: ["왼쪽과 뒤", "오른쪽과 앞", "앞과 뒤"],
        answer: 0,
        why: "왼쪽과 뒤예요. ㄱ자는 이렇게 노란 두 칸이 왼쪽·뒤에 오게 들고 공식을 해요.",
      },
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
      kind: "turn",
      body: "흔한 실수: ㄱ자를 다른 방향으로 들고 공식을 하는 것. 그러면 다시 ㄱ자나 점이 돼요. 이 ㄱ자는 한 칸 비껴 있어요. U를 쳐서 노란 두 칸을 왼쪽과 뒤로 옮겨 보세요.",
      setup: { alg: `${setupFor(EO_L, "z2")} U'` },
      alg: "U",
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
      body: "그렇게 들고 수네(R U R' U R U2 R')를 해요. 수네는 노란 십자와 아래 두 층은 그대로 두고, 윗층 꼭짓점 셋을 돌려 노란색 방향을 바꿔요(자리도 조금 바뀌지만 다음 단계에서 맞춰요). 한 번에 안 끝나면 다시 세어서 되풀이해요. 왼쪽 앞에 둘 꼭짓점(노란색이 위를 보는 것)을 눌러 보세요.",
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
      kind: "turn",
      body: "위를 보는 노란 꼭짓점이 없어요. 이때는 왼쪽 앞 꼭짓점의 노란색이 왼쪽 면을 보게 들어요. 지금 왼쪽 앞 꼭짓점은 노란색이 앞을 봐요. U를 쳐서 노란색이 왼쪽을 보는 꼭짓점을 왼쪽 앞으로 옮겨 보세요.",
      setup: { alg: setupFor("R U2 R' U' R U R' U' R U' R'", "z2") },
      alg: "U",
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
      kind: "turn",
      body: "위를 보는 노란 꼭짓점이 둘이에요. 이때는 왼쪽 앞 꼭짓점의 노란색이 앞면을 보게 들어요. U'를 쳐서 노란색이 앞을 보는 꼭짓점을 왼쪽 앞으로 옮겨 보세요.",
      setup: { alg: setupFor("F' r U R' U' r' F R", "z2") },
      alg: "U'",
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
    {
      kind: "try",
      body: "노란 십자까지 맞은 큐브에서 윗면을 끝내요.",
      setup: { rule: "yellow-cross-solved" },
      goal: "oll",
      mask: "oll",
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
      body: "이제 윗면은 노랗고, 꼭짓점의 자리만 맞추면 돼요. 옆면에서 위층 꼭짓점 두 칸이 같은 색이면 자동차 앞등 같다고 「헤드라이트」라고 불러요. 그 두 꼭짓점은 서로 맞는 자리에 있다는 뜻이에요. 큐브를 끌어 옆면을 둘러보세요.",
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
      kind: "demo",
      body: "헤드라이트를 뒤에 두고 R' F R' B2 R F' R' B2 R2. 이렇게 조각의 자리만 바꾸는 공식을 「퍼뮤」(영어 permutation, 자리 바꾸기)라고 불러요. 이 공식은 A퍼뮤예요.",
      setup: flip(A_PERM),
      alg: A_PERM,
      mask: "pll",
    },
    {
      kind: "quiz",
      body: "A퍼뮤는 꼭짓점 넷 중 하나는 그대로 두고 나머지 셋을 돌려 바꿔요. 시연을 다시 보며 자리가 그대로인 꼭짓점을 찾아보세요.",
      setup: flip(A_PERM),
      mask: "pll",
      quiz: {
        question: "A퍼뮤가 움직이지 않는 꼭짓점은 어디일까요?",
        choices: ["앞-왼쪽", "앞-오른쪽", "뒤-왼쪽", "뒤-오른쪽"],
        answer: 0,
        why: "앞-왼쪽은 그대로이고, 나머지 셋(앞-오른쪽·뒤-오른쪽·뒤-왼쪽)이 돌며 바뀌어요. 헤드라이트를 뒤에 두면 이 셋이 돌아 제자리로 들어가요.",
      },
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
      kind: "try",
      body: "헤드라이트가 없어요. 한 번 하고, 생긴 헤드라이트를 뒤로 옮겨 한 번 더.",
      setup: flip(`${A_PERM} U ${A_PERM}`),
      alg: `${A_PERM} U ${A_PERM}`,
      goal: "yellow-corners",
      mask: "pll",
    },
    {
      kind: "turn",
      body: "흔한 실수: B2를 B로 한 번만 돌리는 것. 뒷면은 반 바퀴예요. 뒤를 돌리기 어려우면 x를 넣은 같은 공식(x R' U R' D2 R U' R' D2 R2 x')을 써도 돼요. B2를 직접 쳐 보세요.",
      alg: "B2",
    },
    {
      kind: "try",
      body: "윗면이 노란 큐브에서 꼭짓점 자리를 맞춰요.",
      setup: { rule: "yellow-face-solved" },
      goal: "yellow-corners",
      mask: "pll",
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
      body: "마지막은 윗층 모서리의 자리예요. 옆면 하나가 통째로 맞았으면 그 면을 뒤로 두고 R U' R U R U R U' R' U' R2를 해요. 모서리 셋의 자리를 바꾸는 퍼뮤라 U퍼뮤라고 불러요. 큐브를 끌어 옆면을 둘러보세요.",
      setup: flip(U_PERM),
      quiz: {
        question: "통째로 맞은 옆면은 어디일까요?",
        choices: SIDES,
        answer: 2,
        why: "뒤가 통째로 맞아 있어요. 그대로 공식을 하면 돼요.",
      },
    },
    {
      kind: "demo",
      body: "맞은 면이 뒤에 있어요.",
      setup: flip(U_PERM),
      alg: U_PERM,
    },
    {
      kind: "quiz",
      body: "U퍼뮤는 꼭짓점은 하나도 건드리지 않고, 모서리 넷 중 셋만 돌려 바꿔요.",
      setup: flip(U_PERM),
      quiz: {
        question: "U퍼뮤가 움직이지 않는 모서리는 어디일까요?",
        choices: SIDES,
        answer: 2,
        why: "뒤 모서리는 그대로예요. 그래서 통째로 맞은 면을 뒤에 둬요.",
      },
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
      body: "반대 방향이에요. 같은 공식을 두 번 해도 되고, 반대로 도는 공식(R2 U R U R' U' R' U' R' U R')을 한 번 해도 돼요.",
      setup: flip(U_PERM_B),
      alg: U_PERM_B,
      goal: "solved",
    },
    {
      kind: "try",
      body: "통째로 맞은 면이 없어요(맞은편끼리 바뀜). 아무 쪽에서나 한 번 하면 맞은 면이 생겨요. 그 면을 뒤로 옮겨 다시.",
      setup: flip(`${U_PERM} U ${U_PERM} U'`),
      alg: `${U_PERM} U ${U_PERM} U'`,
      goal: "solved",
    },
    {
      kind: "turn",
      body: "모서리가 다 제자리인데 윗층만 한 칸 돌아가 있을 때가 있어요. 마지막에 윗면을 돌려 맞춰요. U'를 쳐서 맞춰 보세요.",
      setup: { alg: "z2 U" },
      alg: "U'",
    },
    {
      kind: "quiz",
      body: "흔한 실수: 공식 끝의 R2를 R로 돌리는 것. 마지막은 반 바퀴예요.",
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
    {
      kind: "try",
      body: "꼭짓점까지 맞은 큐브를 끝내요. 축하해요, 큐브를 다 맞췄어요!",
      setup: { rule: "corners-placed" },
      goal: "solved",
    },
  ],
};

export const BEGINNER_333: Course = {
  id: "333-beginner",
  size: 3,
  title: "3×3 처음 맞추기(층별)",
  summary: "조각과 표기부터 마지막 층까지. 공식 여덟 개로 끝까지 맞춰요.",
  lessons: [
    start,
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
