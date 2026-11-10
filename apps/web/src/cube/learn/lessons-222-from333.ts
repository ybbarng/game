// 3×3을 아는 사람의 2×2(2026-11-04 사용자 요청, 2026-11-10 경우별 정해진 길 docs/47 16-11): 2×2는 3×3의 코너만 남긴 큐브라
// 3×3 초보자 과정의 코너 단계(첫 층 코너·코너 자리·코너 방향)를 같은 이름·같은 공식으로 그대로 쓴다.
// 다른 점은 둘: 센터가 없어 제자리를 코너끼리의 관계로 보고, 엣지 단계(흰 십자·둘째 층·노란 십자·옆면 맞추기)가 없다.
// 엣지가 없으니 「코너 자리」에서 윗면(U)을 돌려도 된다. 그래서 제자리 코너가 꼭 하나인 U 자리를 찾는다.
// 판단은 모두 경우별로 닫고(beginner-path-222.ts), 해 보기 모범 답은 그 규칙이 낸 수와 같다(beginner-path-222.test.ts).
// 공식 상수는 3×3 레슨에서 가져오고, 판정은 2×2 목표(2x2-first-layer·2x2-corners-placed·solved)를 쓴다.
import { firstLayerUpSteps, T_PERM, Y_PERM } from "./lessons-222";
import {
  CORNER_CYCLE,
  CORNER_CYCLE_BACK,
  CORNER_TWIST,
  TWIST_TWO_BACK,
} from "./lessons-333";
import { setupFor } from "./notation";
import type { Course, Lesson } from "./types";

const flip = (solution: string) => ({ alg: setupFor(solution, "z2") });

/** 2×2 대각 바꿈(Y퍼뮤 상황, 어느 U에서도 제자리가 꼭 하나가 아님) */
export const DIAGONAL_222 = Y_PERM;
/** 그 풀이: U로 제자리 0인 자리 → 한 번 → 앞-왼쪽 위가 제자리 → y'로 쥐고 한 번(from333.test.ts가 확인) */
export const DIAGONAL_222_SOLVE = `U ${CORNER_CYCLE} y' ${CORNER_CYCLE}`;
/** 이웃 둘 바뀜(T퍼뮤 상황): U 한 번이면 앞-오른쪽 위가 제자리 하나 → 한 번 */
export const NEIGHBORS_222_SOLVE = `U ${CORNER_CYCLE}`;

const corners: Lesson = {
  id: "222-from333-corners",
  size: 2,
  title: "2×2는 3×3의 코너 블럭이에요",
  summary:
    "3×3에서 엣지 블럭과 센터 블럭을 지우면 2×2. 3×3 공식을 그대로 써요.",
  steps: [
    {
      kind: "quiz",
      body: "3×3 처음 맞추기를 마쳤다면 2×2는 새로 배울 것이 거의 없어요. 이 과정은 3×3에서 익힌 코너 단계만 골라 2×2에 써요. 위 그림은 3×3에서 엣지 블럭과 센터 블럭을 까맣게 지운 모습이고, 아래는 2×2예요. 3×3에서 엣지 블럭과 센터 블럭을 지우면 2×2가 돼요. 그래서 3×3을 맞출 줄 알면 2×2도 맞출 수 있어요.",
      beside: {
        size: 3,
        caption: "3×3에서 코너 블럭만 보이게 한 모습",
        mask: "corners",
      },
      mask: "all",
      quiz: {
        question: "3×3 공식 중 2×2에서도 그대로 쓸 수 있는 것은?",
        choices: [
          `코너 블럭만 옮기는 공식, 또는 엣지 블럭이 흐트러져도 되는 공식(${CORNER_TWIST}, ${CORNER_CYCLE})`,
          "엣지 블럭만 옮기는 공식(옆면 맞추기)",
          "가운데 줄을 돌리는 공식",
        ],
        answer: 0,
        why: "2×2에는 엣지 블럭과 센터 블럭이 없어요. 코너 블럭이 3×3에서와 똑같이 움직이는 공식이면 그대로 돼요.",
      },
    },
    {
      kind: "quiz",
      body: `둘 다 ${CORNER_TWIST}를 한 큐브예요. 3×3에서는 엣지 블럭도 흐트러지지만, 코너 블럭만 보면 2×2와 똑같아요.`,
      beside: {
        size: 3,
        caption: `3×3에 ${CORNER_TWIST}(코너 블럭만 보임)`,
        setup: { alg: CORNER_TWIST },
        mask: "corners",
      },
      setup: { alg: CORNER_TWIST },
      mask: "all",
      quiz: {
        question: `${CORNER_TWIST}는 3×3에서 엣지 블럭도 움직여요. 2×2에서 써도 될까요?`,
        choices: [
          "네, 2×2에는 엣지 블럭이 없으니 코너 블럭의 움직임만 보면 돼요",
          "아니요, 엣지 블럭이 흐트러지니 못 써요",
        ],
        answer: 0,
        why: "코너 블럭이 3×3과 똑같이 움직여요. 그래서 첫 층 코너 공식을 그대로 써요.",
      },
    },
    {
      kind: "find",
      body: "다른 점 하나: 2×2에는 센터가 없어서 제자리를 알려 주는 센터 색이 없어요. 먼저 코너 블럭 하나를 「기준 코너」로 정하고, 다른 코너를 그 기준에 맞춰 넣어요. 흰-초록-빨강 코너 블럭을 기준으로 삼을게요. 찾아 눌러 보세요.",
      setup: { alg: "R U F" },
      mask: "all",
      find: { piece: "corner", colors: ["U", "F", "R"] },
    },
    {
      kind: "quiz",
      body: "3×3에서는 조각의 제자리를 센터 색으로 판단했어요.",
      setup: { alg: "R U F" },
      mask: "all",
      quiz: {
        question: "2×2에서는 코너의 제자리를 무엇으로 판단할까요?",
        choices: [
          "기준 코너와 바르게 이웃하는지로",
          "면 가운데 칸의 색으로",
          "흰 칸이 몇 개 위를 보는지로",
        ],
        answer: 0,
        why: "기준 코너와 두 색을 함께 나눠 가지는 코너 블럭은 기준 바로 옆이 제자리예요. 예를 들어 흰-초록-빨강 기준이 앞-오른쪽 위면 앞-왼쪽 위에는 흰-초록-주황 코너 블럭이 와요.",
      },
    },
    {
      kind: "quiz",
      body: "다른 점 둘: 2×2에는 엣지가 없어요.",
      mask: "all",
      quiz: {
        question: "3×3 초보자 과정에서 2×2에는 없는 단계는?",
        choices: [
          "흰 십자, 둘째 층 엣지, 노란 십자, 옆면 맞추기",
          "첫 층 코너와 코너 자리",
          "코너 방향",
        ],
        answer: 0,
        why: "모두 엣지 블럭을 맞추는 단계예요. 2×2는 첫 층 → 코너 자리 → 코너 방향, 세 단계면 끝나요.",
      },
    },
  ],
};

const firstLayer: Lesson = {
  id: "222-from333-first-layer-up",
  size: 2,
  title: "첫 층",
  summary: "3×3의 「첫 층 코너」와 같아요. 흰 면 위에서 R' D' R D 하나로.",
  steps: [
    ...firstLayerUpSteps(
      "3×3에서 했던 「첫 층 코너」 단계와 같아요. 흰 면을 위에 두고, 넣을 자리를 앞-오른쪽 위로 쥔 뒤 아래 층의 흰 코너를 그 밑으로 옮겨 흰색이 보는 쪽대로 코너 돌리기를 쳐요. 다른 점은 센터가 없어 기준 코너를 먼저 정하는 것이에요. 흰색이 위를 보는 위 층 코너가 있으면 그 하나를 기준으로 삼아요. 여럿이면 아무거나 하나예요. 화면의 2×2는 흰 코너 하나가 아래 층에 내려가 있고, 나머지 셋은 위 층에서 흰색이 위를 봐요. 앞 단원의 흰-초록-빨강은 이번에 아래 층에 있어서, 위를 보는 셋 가운데 앞-왼쪽 위의 흰-초록-주황 코너 블럭을 기준으로 삼을게요. 눌러 보세요.",
    ),
    {
      kind: "quiz",
      body: "2×2만의 함정: 3×3에서는 센터 블럭이 있어 첫 층 코너가 제자리인지 센터 블럭과 견줘 바로 알 수 있었어요. 2×2에는 센터 블럭이 없어서, 흰 코너 넷이 서로 바르게 이웃했는지로 봐요. 바르게 이웃한 두 코너 블럭은 함께 보는 옆면의 두 칸이 같은 색이에요. 위 층 코너는 아직 맞추지 않았으니 아래 층과 옆면 색이 달라도 괜찮아요.",
      setup: { alg: "z2 U" },
      mask: "all",
      quiz: {
        question:
          "흰 면을 아래로 뒤집었어요. 아래 층 흰 코너 넷은 서로 바르게 이웃해 있는데, 위 층과는 옆면 색이 어긋나요. 첫 층이 틀렸을까요?",
        choices: [
          "아니요, 첫 층은 맞아요. 위 층은 다음 단원에서 맞춰요",
          "네, 처음부터 다시 해야 해요",
        ],
        answer: 0,
        why: "센터 블럭이 없으니 아래 층 흰 코너끼리 바르게 이웃하면 첫 층은 맞아요.",
      },
    },
  ],
};

const cornerPlace: Lesson = {
  id: "222-from333-corner-place",
  size: 2,
  title: "코너 자리",
  summary:
    "3×3의 「코너 자리」와 같아요. U R U' L' U R' U' L과 그 거꾸로, 다만 윗면을 돌려 제자리를 찾아요.",
  steps: [
    {
      kind: "quiz",
      body: "앞 단원에서 첫 층을 맞추고 흰 면을 아래로 뒤집었어요. 이번 단원은 3×3에서 했던 「코너 자리」 단계와 같아요. 위 층 코너 넷을 방향은 상관없이 제자리로 옮겨요. 센터 블럭이 없으니 면의 색은 아래 층 코너가 정해요. 위 층 코너 블럭의 세 색이 노랑과, 바로 밑 아래 층 코너가 두 옆면에 보이는 두 색이면 제자리예요. 3×3과 다른 점: 위 층 엣지가 없으니 윗면(U)을 돌려도 돼요. 그래서 먼저 U를 한 칸씩, 많아야 세 번 돌려 보며 제자리 코너가 꼭 하나가 되는 곳을 찾아요. 돌리다 넷 다 제자리가 되면 이 단원은 끝이에요. 한 바퀴 돌려도 하나인 곳이 없으면 뒤의 「대각선」 경우예요. 하나인 곳을 찾으면 3×3처럼 그 코너 블럭을 앞-오른쪽 위로 쥐고(y), 앞-왼쪽 위 코너의 제자리가 뒤-오른쪽 위면 공식 U R U' L' U R' U' L을, 뒤-왼쪽 위면 거꾸로 L' U R U' L U R' U'를 한 번 쳐요.",
      setup: flip(`U ${CORNER_CYCLE}`),
      mask: "all",
      quiz: {
        question:
          "지금은 제자리 코너가 둘이에요. 공식을 하기 전에 무엇을 할까요?",
        choices: [
          "U를 돌려 제자리가 꼭 하나인 자리를 찾아요",
          "그대로 공식을 해요",
          "처음부터 다시 해요",
        ],
        answer: 0,
        why: "제자리가 둘인 곳에서는 공식이 맞지 않아요. 3×3과 달리 위 층 엣지가 없어서 U를 돌리면 제자리 코너 수가 바뀌어요. 이 큐브는 U를 한 칸 돌리면 제자리가 하나가 돼요.",
      },
    },
    {
      kind: "try",
      body: "U로 제자리가 하나인 곳을 찾아요. 그 코너 블럭이 앞-오른쪽 위에 오고, 앞-왼쪽 위 코너의 제자리는 뒤-오른쪽 위예요. 공식을 한 번 쳐 보세요.",
      setup: flip(`U ${CORNER_CYCLE}`),
      alg: `U ${CORNER_CYCLE}`,
      goal: "2x2-corners-placed",
      mask: "all",
    },
    {
      kind: "try",
      body: "제자리 코너 하나가 앞-오른쪽 위에 있고, 앞-왼쪽 위 코너의 제자리는 뒤-왼쪽 위예요. 거꾸로 L' U R U' L U R' U'를 한 번 쳐 보세요.",
      setup: flip(CORNER_CYCLE_BACK),
      alg: CORNER_CYCLE_BACK,
      goal: "2x2-corners-placed",
      mask: "all",
    },
    {
      kind: "quiz",
      body: "2×2만의 함정: 대각선 두 코너 블럭이 바뀌어 있으면 U를 어떻게 돌려도 제자리가 둘이거나 없어요.",
      setup: flip(DIAGONAL_222),
      mask: "all",
      quiz: {
        question: "U를 돌려도 제자리가 꼭 하나인 자리가 없어요. 어떻게 할까요?",
        choices: [
          "U를 돌려 제자리가 없는 곳에서 공식을 한 번 치고, 다시 하나인 곳을 찾아요",
          "제자리가 둘인 곳에서 공식을 쳐요",
        ],
        answer: 0,
        why: "한 번 치면 U로 제자리가 하나인 곳이 생겨요. 그다음은 앞의 방법대로 해요.",
      },
    },
    {
      kind: "try",
      body: "대각선 두 코너 블럭이 바뀌었어요. U를 돌려 제자리가 없는 곳에서 공식을 한 번 쳐요. 그러면 앞-왼쪽 위 코너가 제자리에 들어요. y'로 그 코너 블럭을 앞-오른쪽 위로 쥐면 앞-왼쪽 위 코너의 제자리가 뒤-오른쪽 위라 공식을 한 번 더 쳐요.",
      setup: flip(DIAGONAL_222),
      alg: DIAGONAL_222_SOLVE,
      goal: "2x2-corners-placed",
      mask: "all",
    },
    {
      kind: "try",
      body: "이웃한 두 코너 블럭이 바뀐 상황이에요. U를 돌려 제자리가 하나인 곳을 찾으면 그 코너 블럭이 앞-오른쪽 위에 오고, 앞-왼쪽 위 코너의 제자리는 뒤-오른쪽 위예요. 공식을 한 번 쳐 보세요.",
      setup: { alg: setupFor(T_PERM, "z2") },
      alg: NEIGHBORS_222_SOLVE,
      goal: "2x2-corners-placed",
      mask: "all",
    },
    {
      kind: "try",
      body: "이제 처음부터 해 봐요. 화면의 2×2는 첫 층만 맞은 상태예요. U를 돌려 제자리가 하나인 곳을 찾아 쥐고 공식이나 거꾸로를 한 번, 없으면 제자리가 없는 곳에서 한 번 친 뒤 하나일 때대로 해요.",
      setup: { rule: "2x2-first-layer-solved" },
      goal: "2x2-corners-placed",
      mask: "all",
    },
  ],
};

const cornerTwist: Lesson = {
  id: "222-from333-corner-twist",
  size: 2,
  title: "코너 방향",
  summary:
    "3×3의 「코너 방향」과 같아요. 돌아간 코너마다 R' D' R D 두 번이나 거꾸로 두 번.",
  steps: [
    {
      kind: "quiz",
      body: "앞 단원에서 위 층 코너 넷을 제자리로 옮겼어요. 이번이 마지막 단원이고, 3×3에서 했던 「코너 방향」 단계와 같아요. U를 한 칸씩 돌려 노란색이 위를 보지 않는 코너를 앞-오른쪽 위로 가져와요. 노란색이 오른쪽을 보면 R' D' R D를 두 번, 앞을 보면 거꾸로 D' R' D R을 두 번 쳐요. 다음 코너는 윗면(U)만 돌려 가져와요. 중간에 아래 층이 흐트러지는데, 그 사이에 큐브째 돌려 쥐면(y) 흐트러진 아래 층이 함께 돌아 끝에 돌아오지 않아요. 다 끝나면 아래 층은 돌아와요. 마지막에 위 층 코너가 한 칸씩 비켜나 있으면 U를 한 칸씩 돌려 제자리에 드는 곳에서 멈춰요(많아야 세 번).",
      setup: flip(TWIST_TWO_BACK),
      mask: "all",
      quiz: {
        question:
          "앞-오른쪽 위 코너의 노란색이 오른쪽을 봐요. R' D' R D를 몇 번 할까요?",
        choices: [
          "R' D' R D 두 번",
          "거꾸로 D' R' D R 두 번",
          "R' D' R D 한 번",
        ],
        answer: 0,
        why: "3×3과 같아요. 오른쪽이면 R' D' R D 두 번, 앞이면 거꾸로 두 번이에요.",
      },
    },
    {
      kind: "try",
      body: "오른쪽이면 두 번 → U로 다음 코너 → 앞이면 거꾸로 두 번 → 마지막에 윗면을 돌려 맞춰요.",
      setup: flip(TWIST_TWO_BACK),
      alg: TWIST_TWO_BACK,
      goal: "solved",
      mask: "all",
    },
    {
      kind: "try",
      body: "노란색이 모두 위를 보는데 위 층과 아래 층의 옆면 색이 어긋나 보여요. 위 층 코너가 한 칸씩 비켜나 있는 거예요. 윗면을 돌려 맞춰요.",
      setup: { alg: "z2 D" },
      alg: "U'",
      goal: "solved",
    },
    {
      kind: "try",
      body: "이제 처음부터 해 봐요. 화면의 2×2는 위 층 코너가 모두 제자리에 있고 방향만 남은 상태예요. 돌아간 코너마다 노란색이 보는 쪽대로 치고, 마지막에 윗면을 돌려 끝내요.",
      setup: { rule: "2x2-corners-placed" },
      goal: "solved",
      mask: "all",
    },
  ],
};

export const FROM_333_222: Course = {
  id: "222-from333",
  size: 2,
  title: "3×3을 아는 사람의 2×2",
  summary:
    "3×3 초보자 과정을 마쳤다면: 코너 단계만 떠올려 같은 공식 둘과 그 거꾸로로 맞춰요.",
  lessons: [corners, firstLayer, cornerPlace, cornerTwist],
  recommendAfter: "333-beginner",
};
