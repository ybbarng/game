// 2×2 초보자(docs/47 8-2, 16-11): 첫 층(흰 면 위, 코너 돌리기 R' D' R D) → 윗면(윗면 공식) → 위 층 자리(위 층 코너 바꾸기).
// 그다음 빠른 해법 오르테가를 소개한다. 2×2는 코너 여덟 개뿐이고 기준이 될 센터가 없다.
// 판단이 필요한 곳은 모두 경우별로 닫는다(beginner-path-222.ts). 단원의 시연·해 보기 모범 답은 그 규칙이 낸 수와 같고
// beginner-path-222.test.ts가 확인한다.
import { TOP_FACE, TOP_FACE_BACK, TOP_SWAP } from "./beginner-path-222";
import {
  CORNER_TWIST,
  reps,
  STUCK_CORNER,
  STUCK_CORNER_SETUP,
  TWIST_BACK,
} from "./lessons-333";
import { setupFor } from "./notation";
import type { Course, Lesson, LessonStep } from "./types";

export const T_PERM = "R U R' U' R' F R2 U' R' U' R U R' F'";
export const Y_PERM = "F R U' R' U' R U R' F' R U R' U' R' F R F'";

const flip = (solution: string) => ({ alg: setupFor(solution, "z2") });

// 윗면 모양(2×2 윗면 일곱 가운데 단원이 보이는 것). 모범 답은 규칙(beginner-path-222.ts)이 낸 수
/** 위를 보는 노란색 없음, 노란색이 앞뒤 두 옆면에 둘씩 */
export const TOP_NONE_SIDES_SOLVE = `U ${TOP_FACE} ${TOP_FACE}`;
/** 위를 보는 노란색 없음, 노란색 둘인 옆면이 하나(왼쪽) */
export const TOP_NONE_SOLVE = `${TOP_FACE} U' ${TOP_FACE}`;
/** 노란색이 위를 보는 코너 둘 */
export const TOP_TWO_SOLVE = `${TOP_FACE} U' ${TOP_FACE_BACK}`;
/** 위 층 자리: 바른 짝이 다른 쪽에 하나(이웃 둘 바꿈) / 없음(대각 둘 바꿈) */
export const TOP_ONE_SOLVE = `U ${TOP_SWAP} U2`;
export const TOP_NONE_PAIR_SOLVE = `${TOP_SWAP} U ${TOP_SWAP} U2`;

// 조각(2026-11-04): 2×2는 코너뿐이라 면 색을 정해 줄 센터가 없다
const pieces: Lesson = {
  id: "222-pieces",
  size: 2,
  title: "2×2의 조각",
  summary:
    "코너 블럭 여덟 개뿐이에요. 센터 블럭이 없어서 조각끼리 제자리를 정해요.",
  steps: [
    {
      kind: "find",
      body: "2×2를 칸 하나하나가 아니라 조각으로 봐요. 큐브 조각은 놓인 자리로 불러요. 세 면이 만나는 구석의 조각은 「코너 블럭」, 두 면 사이의 조각은 「엣지 블럭」, 면 한가운데 조각은 「센터 블럭」이에요. 2×2는 칸 셋이 한 조각이에요. 까만 2×2에서 조각을 모두 눌러 세어 보세요. 누르면 색이 드러나요. 뒤쪽은 끌어서 둘러보거나 거울에서 눌러요.",
      mask: "none",
      find: { piece: "corner" },
      count: 8,
    },
    {
      kind: "quiz",
      body: "몇 개를 셌나요? 조각마다 색이 몇 개 붙어 있었는지도 떠올려 보세요.",
      mask: "all",
      quiz: {
        question: "2×2를 이루는 조각은?",
        choices: [
          "코너 블럭 8개뿐",
          "센터 블럭 6개 + 코너 블럭 8개",
          "엣지 블럭 12개 + 코너 블럭 8개",
        ],
        answer: 0,
        why: "2×2는 구석마다 코너 블럭 하나, 모두 여덟 개예요. 센터 블럭도 엣지 블럭도 없어요.",
      },
    },
    {
      kind: "find",
      body: "흰색이 붙은 코너 블럭을 넷 모두 눌러 보세요.",
      setup: { alg: "R U" },
      mask: "all",
      find: { piece: "corner", has: ["U"] },
      count: 4,
    },
    {
      kind: "play",
      body: "흰-초록-빨강 코너 블럭만 색이 있어요. 아무 면이나 돌려 보세요. 어디로 가든 세 색은 늘 함께 다녀요. 큐브의 칸을 눌러 다른 코너 블럭도 따라가 보세요.",
      play: { focus: { colors: ["U", "F", "R"] }, moved: 3, choose: true },
    },
    {
      kind: "quiz",
      body: "조각의 「제자리」는 다 맞춘 큐브에서 그 조각이 있는 자리예요. 더 큰 3×3 큐브에는 면 한가운데에 움직이지 않는 센터 블럭이 있어서, 그 색이 조각의 제자리를 알려 줘요. 2×2에는 센터 블럭이 없어요.",
      setup: { alg: "R U" },
      mask: "all",
      quiz: {
        question: "그럼 2×2에서 조각의 제자리는 무엇으로 정할까요?",
        choices: [
          "코너 블럭 하나를 기준으로 삼아서",
          "면 가운데 칸의 색으로",
          "흰 스티커가 많은 쪽으로",
        ],
        answer: 0,
        why: "기준 코너 하나를 정하면 나머지 코너 블럭의 제자리는 그 기준이 정해 줘요. 기준 코너와 두 색을 함께 나눠 가지는 코너 블럭은 그 기준 바로 옆이 제자리예요. 큐브를 어느 쪽으로 들어도 돼요.",
      },
    },
    {
      kind: "find",
      body: "흰-초록-빨강 코너 블럭을 기준으로 삼아요. 흰색과 초록을 함께 나눠 가질 이웃, 흰-초록-주황 코너 블럭을 찾아 눌러 보세요.",
      setup: { alg: "R U" },
      mask: "all",
      find: { piece: "corner", colors: ["U", "F", "L"] },
    },
  ],
};

const intro: Lesson = {
  id: "222-intro",
  size: 2,
  title: "2×2 한눈에",
  summary:
    "센터 블럭이 없는 작은 큐브. 색의 짝과 차례로 제자리를 정하고, 공식 셋으로 맞춰요.",
  steps: [
    {
      kind: "quiz",
      body: "앞 단원에서 2×2가 코너 블럭 여덟 개로 되어 있고, 기준 코너 하나가 다른 코너의 제자리를 정한다는 걸 봤어요. 이번에는 맞추기 전에 알아 둘 것을 봐요. 센터 블럭이 없어도 색의 짝은 3×3과 같아요: 흰↔노랑, 초록↔파랑, 빨강↔주황이 언제나 맞은편이에요. 그래서 한 코너 블럭에 맞은편 두 색은 함께 붙지 않아요.",
      mask: "all",
      quiz: {
        question: "빨강의 맞은편 색은 무엇일까요?",
        choices: ["주황", "노랑", "초록"],
        answer: 0,
        why: "빨강↔주황이 맞은편이에요. 큐브를 둘러보며 확인해 보세요.",
      },
    },
    {
      kind: "quiz",
      body: "둘레 색의 차례도 정해져 있어요. 흰 면을 위로, 초록을 앞으로 들면 오른쪽은 빨강, 뒤는 파랑, 왼쪽은 주황이에요. 2×2는 위와 아래, 두 층으로 되어 있어요. 면 하나를 돌리면 함께 도는 한 겹을 「층」이라고 하고, 위의 것을 「위 층」, 아래 것을 「아래 층」이라고 불러요. 코너 블럭이 있는 구석은 닿은 세 면 이름을 이어 불러요. 앞면·오른쪽 면·윗면이 만나는 구석은 「앞-오른쪽 위」예요.",
      mask: "all",
      quiz: {
        question:
          "흰-초록-빨강 코너 블럭이 앞-오른쪽 위에 있어요. 앞-왼쪽 위에 올 코너 블럭은?",
        choices: ["흰-초록-주황", "흰-파랑-빨강", "흰-초록-노랑"],
        answer: 0,
        why: "흰과 초록을 함께 나누고, 오른쪽 빨강의 맞은편인 주황이 왼쪽에 와요. 흰-초록-노랑 코너 블럭은 맞은편 색이 함께 붙어서 없는 코너 블럭이에요.",
      },
    },
    {
      kind: "find",
      body: "공식을 적는 표기는 3×3과 같아요. 면마다 글자가 있어요. R은 오른쪽, L은 왼쪽, U는 윗면, D는 아랫면, F는 앞면, B는 뒷면이에요. 글자만 있으면 그 면을 마주 보고 시계 방향으로 한 번, 뒤에 '가 붙으면 반대 방향으로 한 번, 2가 붙으면 반 바퀴 돌려요. 큐브를 통째로 돌려 쥘 때는 x·y·z를 써요. x는 오른쪽 면을 마주 볼 때, y는 윗면을 마주 볼 때 시계 방향으로, z는 앞면을 마주 볼 때 시계 방향으로 큐브 전체를 돌려요. z2는 큐브를 반 바퀴 돌려 위아래를 뒤집어요. R이나 U' 같은 글자 하나하나가 한 번 돌리기, 곧 「수」예요. 정해 둔 수의 차례를 「공식」이라고 하고, 키보드 키를 눌러 수를 돌리는 것을 「친다」고 해요. 2×2에서 R을 돌리면 오른쪽 층의 코너 넷이 통째로 돌아요. 지금은 맞춘 큐브라 빨강이 붙은 코너가 그 넷이에요. 넷 모두 눌러 보세요.",
      mask: "all",
      find: { piece: "corner", has: ["R"] },
      count: 4,
    },
    {
      kind: "demo",
      body: "공식은 차례를 뒤집고 방향도 뒤집으면 되돌아가요. 이렇게 공식을 끝에서부터 방향을 뒤집어 치는 것을 「거꾸로 친다」고 해요. R' D' R D를 친 뒤 거꾸로 D' R' D R을 쳐서 처음으로 돌아오는 걸 보세요. 맞추기는 흰 면 쪽 한 층, 「첫 층」부터 해요. 이 R' D' R D를 「코너 돌리기」 공식이라고 부르고, 첫 층을 이 공식과 그 거꾸로로 맞춰요. 3×3을 맞출 줄 몰라도 이 과정만으로 2×2를 맞출 수 있어요.",
      alg: `${CORNER_TWIST} ${TWIST_BACK}`,
    },
  ],
};

/**
 * 2×2 첫 층(2026-11-10 경우별 정해진 길, docs/47 16-11): 흰색이 위를 보는 위 층 코너 하나를 기준으로 삼고,
 * 3×3 첫 층 코너와 같이 제자리를 앞-오른쪽 위로 쥐고(y) 아래 층의 코너를 그 밑으로 옮겨(D) 흰색이 보는 쪽대로
 * 코너 돌리기 한 번·세 번·거꾸로 한 번. 제자리에서 돌아갔으면 두 번·거꾸로 두 번, 엉뚱한 자리면 한 번 빼서 아래로.
 * 지름길(R' D' R·F D F')은 3×3처럼 뺐다(공식을 늘리지 않으려고). 다 되면 뒤집어 흰 면을 아래로 둔다.
 * 「3×3을 아는 사람의 2×2」도 이 단계를 쓴다(첫 설명만 다르다).
 */
export function firstLayerUpSteps(first: string): LessonStep[] {
  return [
    {
      kind: "find",
      body: first,
      setup: { alg: setupFor(`D ${CORNER_TWIST}`) },
      mask: "all",
      find: { piece: "corner", colors: ["U", "F", "L"] },
    },
    {
      kind: "find",
      body: "기준이 정해지면 다른 흰 코너의 제자리도 정해져요. 기준 코너와 두 색을 함께 나눠 가지는 코너 블럭은 기준 바로 옆이 제자리예요. 흰-초록-주황 기준은 앞-왼쪽 위에 있어요. 흰색과 초록을 함께 나눠 가지고 주황 대신 그 맞은편 빨강이 붙은 흰-초록-빨강 코너 블럭은 기준의 오른쪽 옆, 앞-오른쪽 위가 제자리예요. 같은 법으로 뒤-왼쪽 위에는 기준과 흰색·주황을 나눠 가지는 흰-주황-파랑, 남은 뒤-오른쪽 위에는 흰-파랑-빨강 코너 블럭이 와요. 흰-초록-빨강 코너 블럭을 아래 층에서 찾아 눌러 보세요.",
      setup: { alg: setupFor(`D ${CORNER_TWIST}`) },
      mask: "all",
      find: { piece: "corner", colors: ["U", "F", "R"] },
    },
    {
      kind: "turn",
      body: "넣을 자리를 앞-오른쪽 위에 두고, 아랫면을 돌려 그 코너 블럭을 바로 밑, 앞-오른쪽 아래로 옮겨요. 그 블럭이 앞-왼쪽 아래면 D, 뒤-오른쪽 아래면 D', 뒤-왼쪽 아래면 D2예요. 흰-초록-빨강 코너 블럭은 앞-왼쪽 아래에 있어요. D를 쳐 보세요.",
      setup: { alg: setupFor(`D ${CORNER_TWIST}`) },
      mask: "first-layer",
      alg: "D",
    },
    {
      kind: "quiz",
      body: "제자리 밑에 왔으면 그 코너 블럭의 흰색이 보는 쪽을 봐요. 「코너 돌리기」 공식 R' D' R D를 써요. 흰색이 오른쪽이면 한 번, 아래면 세 번이에요. 흰색이 앞이면 거꾸로 D' R' D R을 한 번 쳐요.",
      setup: { alg: setupFor(reps(CORNER_TWIST, 3)) },
      mask: "first-layer",
      quiz: {
        question:
          "앞-오른쪽 아래 코너 블럭은 흰색이 아래를 봐요. 무엇을 칠까요?",
        choices: [
          "R' D' R D 한 번",
          "R' D' R D 세 번",
          "거꾸로 D' R' D R 한 번",
        ],
        answer: 1,
        why: "흰색이 아래면 세 번이에요. 뒤의 시연에서 확인해 보세요.",
      },
    },
    {
      kind: "demo",
      body: "흰색이 아래를 봐요. R' D' R D를 세 번. 한 번 칠 때마다 흰색이 보는 쪽이 바뀌어요.",
      setup: { alg: setupFor(reps(CORNER_TWIST, 3)) },
      alg: reps(CORNER_TWIST, 3),
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "흰-초록-빨강 코너 블럭이 앞-왼쪽 아래에 있고 흰색이 앞을 봐요. D로 제자리 밑에 옮기면 흰색이 오른쪽을 봐요. 옮기고 한 번 쳐 보세요.",
      setup: { alg: setupFor(`D ${CORNER_TWIST}`) },
      alg: `D ${CORNER_TWIST}`,
      goal: "2x2-first-layer",
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "제자리 밑(앞-오른쪽 아래)에 온 코너 블럭의 흰색이 앞을 봐요. 거꾸로 D' R' D R을 한 번 쳐 보세요.",
      setup: { alg: setupFor(TWIST_BACK) },
      alg: TWIST_BACK,
      goal: "2x2-first-layer",
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "넣을 자리가 앞-오른쪽 위가 아니면 큐브를 돌려 쥐어(y) 그 자리를 앞-오른쪽 위로 가져와요. 뒤-오른쪽 위 자리는 y, 앞-왼쪽 위 자리는 y', 뒤-왼쪽 위 자리는 y2예요. 화면의 2×2는 넣을 자리가 뒤-오른쪽 위예요. y로 쥐고, D로 코너 블럭을 그 밑에 옮긴 뒤, 흰색이 보는 쪽대로 넣어 보세요.",
      setup: { alg: setupFor(`y D ${reps(CORNER_TWIST, 3)}`) },
      alg: `y D ${reps(CORNER_TWIST, 3)}`,
      goal: "2x2-first-layer",
      mask: "first-layer",
    },
    {
      kind: "quiz",
      body: "흰 코너가 제자리에 있지만 돌아가 있을 때도 있어요. 그 자리를 앞-오른쪽 위로 쥐고, 흰색이 오른쪽이면 R' D' R D를 두 번, 앞이면 거꾸로 D' R' D R을 두 번 쳐요.",
      setup: { alg: setupFor(reps(CORNER_TWIST, 2)) },
      mask: "first-layer",
      quiz: {
        question:
          "앞-오른쪽 위 코너 블럭은 제자리에 있지만 흰색이 오른쪽을 봐요. 무엇을 칠까요?",
        choices: [
          "R' D' R D 두 번",
          "거꾸로 D' R' D R 두 번",
          "R' D' R D 한 번",
        ],
        answer: 0,
        why: "제자리에서 흰색이 오른쪽이면 R' D' R D 두 번, 앞이면 거꾸로 두 번이에요.",
      },
    },
    {
      kind: "try",
      body: "앞-오른쪽 위 코너 블럭이 제자리에 있지만 흰색이 앞을 봐요. 거꾸로 D' R' D R을 두 번 쳐 보세요.",
      setup: { alg: setupFor(reps(TWIST_BACK, 2)) },
      alg: reps(TWIST_BACK, 2),
      goal: "2x2-first-layer",
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "아래 층에 흰 코너가 없는데 첫 층이 덜 맞았으면, 흰 코너가 기준에 맞지 않는 엉뚱한 위 층 자리에 들어가 있는 거예요. 그 자리를 앞-오른쪽 위로 쥐고 R' D' R D를 한 번 쳐서 아래 층으로 빼요. 빼고 나면 아래 층 코너를 넣는 법 그대로예요. 지금은 앞-왼쪽 위에 엉뚱한 흰 코너 블럭이 들어가 있어요. 차례는 셋이에요. ① y'로 그 자리를 앞-오른쪽 위로 쥐고 한 번 쳐서 빼요. ② 내려온 코너 블럭은 처음 쥔 방향의 앞-오른쪽 위가 제자리라, y로 되돌려 쥐고 D로 그 밑에 옮겨 한 번 쳐요. ③ 그러면 그 자리에 있던 흰 코너 블럭이 아래 층으로 내려와요. 이것은 ①에서 비운 자리가 제자리라 y'로 쥐고 D'로 그 밑에 옮겨 한 번 쳐요. 두 번 모두 흰색이 오른쪽을 봐서 한 번씩이에요.",
      setup: { alg: STUCK_CORNER_SETUP },
      alg: STUCK_CORNER,
      goal: "2x2-first-layer",
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "이제 처음부터 해 봐요. 화면의 2×2는 아무렇게나 섞인 상태예요. 첫 층을 만들어요. 흰색이 위를 보는 위 층 코너가 있으면 그 하나를 기준으로 삼아요. 없으면 아래 층 흰 코너 하나를 아랫면으로 앞-오른쪽 아래에 옮겨, 흰색이 보는 쪽대로 공식을 쳐서 올려요. 올라온 코너 블럭이 기준이에요. 흰 코너가 모두 위 층에 있고 흰색이 위를 보는 것이 없으면, 그 하나를 앞-오른쪽 위로 쥐고 흰색이 오른쪽이면 R' D' R D 두 번, 앞이면 거꾸로 두 번 쳐서 흰색이 위를 보게 한 뒤 기준으로 삼아요. 기준을 정하면 끝까지 그 코너 블럭을 기준으로, 아래 층의 흰 코너부터 하나씩 넣어요. 넣을 자리에 다른 흰 코너 블럭이 엉뚱하게 들어가 있어도 그대로 공식을 치면 그 코너 블럭이 아래 층으로 내려오니, 그것도 아래 층 코너로 넣어요. 아래 층에 흰 코너가 없으면 위 층에서 제자리에 돌아가 있는 것(두 번이나 거꾸로 두 번)이나 엉뚱한 자리에 든 것(한 번 빼기)을 고쳐요. 흰 코너 넷이 모두 흰색이 위를 보고 기준에 맞는 제자리에 들면 끝이에요.",
      setup: { rule: "2x2-random" },
      goal: "2x2-first-layer",
      mask: "first-layer",
    },
    {
      kind: "quiz",
      body: "자주 하는 실수: 흰색만 위로 모으고 흰 코너가 제자리인지 안 보는 것. 흰색이 모두 위를 봐도 코너 블럭끼리 자리가 바뀌어 있을 수 있어요. 이웃한 흰 코너 둘이 둘 다 제자리면, 그 옆면 위 두 칸이 같은 색이라는 표시로 알 수 있어요.",
      mask: "first-layer",
      quiz: {
        question: "첫 층이 다 됐는지 어떻게 알까요?",
        choices: [
          "윗면 네 칸이 모두 흰색이면 돼요",
          "윗면이 흰색이고, 흰 코너 넷이 모두 기준에 맞는 제자리에 있어야 해요",
        ],
        answer: 1,
        why: "흰 코너 넷이 제자리에 있어야 다음 단계에서 깨지지 않아요. 옆에서 볼 때 위 두 칸이 같은 색이면 제자리라는 표시예요.",
      },
    },
    {
      kind: "look",
      body: "첫 층이 끝났어요. 다음 단원부터는 흰 면을 아래에 두고 해요. 큐브 전체를 뒤집어(z2) 흰 면을 아래로 보내 보세요.",
      mask: "first-layer",
      look: { color: "U", on: "D" },
    },
  ];
}

const firstLayer: Lesson = {
  id: "222-first-layer-up",
  size: 2,
  title: "첫 층",
  summary:
    "흰 면을 위에 둔 채 흰 코너 넷을 넣어요. 코너 돌리기 공식 하나와 그 거꾸로만 써요. 다 되면 큐브를 뒤집어요.",
  steps: firstLayerUpSteps(
    "앞 단원에서 표기와 코너 돌리기 공식을 봤어요. 이제 맞추기를 시작해요. 이번에는 흰 면 쪽 한 층, 「첫 층」을 맞춰요. 흰 코너 넷을 흰색이 위를 보게 저마다 제자리에 넣으면 돼요. 2×2에는 센터 블럭이 없으니 먼저 흰 코너 하나를 「기준 코너」로 삼아요. 흰색이 위를 보는 위 층 코너가 있으면 그 하나를 골라요. 여럿이면 아무거나 하나예요. 화면의 2×2는 흰 코너 하나가 아래 층에 내려가 있고, 나머지 셋은 위 층에서 흰색이 위를 봐요. 그 셋 가운데 앞-왼쪽 위의 흰-초록-주황 코너 블럭을 기준으로 삼을게요. 눌러 보세요.",
  ),
};

const topFace: Lesson = {
  id: "222-top-face",
  size: 2,
  title: "윗면",
  summary:
    "위 층 코너 넷의 노란색이 모두 위를 보게 해요. 모양을 보고 윗면 공식을 한 번이나 두 번 쳐요.",
  steps: [
    {
      kind: "quiz",
      body: "앞 단원에서 첫 층을 맞추고 큐브를 뒤집어 흰 면을 아래로 보냈어요. 이번에는 위 층 코너 넷의 노란색이 모두 위를 보게 해서 윗면을 노랗게 만들어요. 흰 면을 아래로 뒤집었으니 위 층 코너 넷은 흰색의 맞은편 노랑이 붙은 코너 블럭이에요. 코너 블럭이 돌아 있는 꼴, 곧 노란색이 어느 면을 보는지를 「방향」이라고 해요. 코너 자리는 다음 단원에서 맞추니 지금은 방향만 봐요. 화면의 2×2는 첫 층이 맞고 흰 면이 아래에 있는 상태예요. 쓰는 공식은 「윗면 공식」 R U R' U R U2 R' 하나예요. 위 층 코너 셋의 방향을 바꾸고 첫 층은 그대로 둬요. 먼저 노란색이 위를 보는 위 층 코너를 세어요.",
      setup: flip(TOP_FACE),
      mask: "oll",
      quiz: {
        question: "노란색이 위를 보는 코너는 몇 개일까요?",
        choices: ["0개", "1개", "2개"],
        answer: 1,
        why: "앞-왼쪽 위 코너 블럭 하나예요. 다음 단계에서 이때 무엇을 칠지 봐요.",
      },
    },
    {
      kind: "demo",
      body: "위를 보는 코너가 하나면 윗면을 돌려 그 코너 블럭을 앞-왼쪽 위에 둬요. 그때 앞-오른쪽 위 코너 블럭의 노란색이 앞을 보면 윗면 공식을 한 번 쳐요. 지금이 그 모양이에요.",
      setup: flip(TOP_FACE),
      alg: TOP_FACE,
      mask: "oll",
    },
    {
      kind: "try",
      body: "같은 모양이에요. 윗면 공식을 한 번 쳐 보세요.",
      setup: flip(TOP_FACE),
      alg: TOP_FACE,
      goal: "2x2-top-face",
      mask: "oll",
    },
    {
      kind: "try",
      body: "위를 보는 코너가 하나인데, 앞-왼쪽 위에 두었을 때 앞-오른쪽 위 코너 블럭의 노란색이 오른쪽을 보면 다른 모양이에요. 이때는 윗면을 돌려 위를 보는 코너 블럭을 뒤-오른쪽 위에 두고 윗면 공식을 거꾸로 R U2 R' U' R U' R' 한 번 쳐요. 지금은 위를 보는 코너 블럭이 이미 뒤-오른쪽 위에 있어요.",
      setup: flip(TOP_FACE_BACK),
      alg: TOP_FACE_BACK,
      goal: "2x2-top-face",
      mask: "oll",
    },
    {
      kind: "try",
      body: "위를 보는 노란색이 없고, 노란색이 마주 보는 두 옆면에 둘씩 있어요. 윗면을 돌려 그 둘씩을 왼쪽과 오른쪽 면에 두고 윗면 공식을 두 번 쳐요. 지금은 앞과 뒤에 있으니 U로 돌려요.",
      setup: flip(TOP_NONE_SIDES_SOLVE),
      alg: TOP_NONE_SIDES_SOLVE,
      goal: "2x2-top-face",
      mask: "oll",
    },
    {
      kind: "try",
      body: "위를 보는 노란색이 없고, 노란색 둘이 함께 있는 옆면이 하나예요. 윗면을 돌려 그 면을 왼쪽에 두고 윗면 공식을 한 번 치면 위를 보는 코너가 하나가 돼요. 그다음은 하나일 때대로 해요. 지금은 노란색 둘인 면이 이미 왼쪽에 있어요.",
      setup: flip(TOP_NONE_SOLVE),
      alg: TOP_NONE_SOLVE,
      goal: "2x2-top-face",
      mask: "oll",
    },
    {
      kind: "try",
      body: "위를 보는 코너가 둘이에요. 윗면을 돌려 앞-왼쪽 위 코너 블럭의 노란색이 앞을 보게 두고(그런 곳은 하나뿐이에요) 윗면 공식을 한 번 치면 위를 보는 코너가 하나가 돼요. 그다음은 하나일 때대로 해요.",
      setup: flip(TOP_TWO_SOLVE),
      alg: TOP_TWO_SOLVE,
      goal: "2x2-top-face",
      mask: "oll",
    },
    {
      kind: "try",
      body: "이제 처음부터 해 봐요. 화면의 2×2는 첫 층만 맞고 위 층은 섞인 상태예요. 위를 보는 노란색을 세고, 하나·없음·둘 가운데 맞는 경우대로 윗면을 노랗게 만들어요. 넷이면 이미 끝이고, 셋인 모양은 생기지 않아요.",
      setup: { rule: "2x2-first-layer-solved" },
      goal: "2x2-top-face",
      mask: "oll",
    },
  ],
};

const topLayer: Lesson = {
  id: "222-top-layer",
  size: 2,
  title: "위 층 자리",
  summary:
    "위 층 코너 넷을 제자리로 옮겨 끝내요. 바른 짝을 뒤에 두고 위 층 코너 바꾸기 공식, 마지막에 윗면을 돌려 맞춰요.",
  steps: [
    {
      kind: "quiz",
      body: "앞 단원에서 윗면을 노랗게 만들었어요. 노란색은 모두 위를 보지만, 위 층 코너가 제자리에 있다는 뜻은 아니에요. 이번에는 위 층 코너 넷을 제자리로 옮겨 2×2를 다 맞춰요. 화면의 2×2는 윗면까지 노란 상태예요. 위 층에서 이웃한 코너 둘이 서로 바르게 이웃해 있으면, 그 표시로 둘이 함께 보는 옆면의 윗줄 두 칸이 같은 색이에요. 이렇게 바르게 이웃한 두 코너 블럭을 「바른 짝」이라고 할게요. 큐브를 끌어 옆면을 둘러보세요.",
      setup: flip(TOP_SWAP),
      mask: "pll",
      quiz: {
        question: "바른 짝은 어느 면에 있을까요?",
        choices: ["앞", "오른쪽", "뒤", "왼쪽"],
        answer: 2,
        why: "뒤에 있어요. 다음 단계에서 이때 무엇을 칠지 봐요.",
      },
    },
    {
      kind: "demo",
      body: "바른 짝이 한 면이면 윗면을 돌려 그 면을 뒤에 두고 「위 층 코너 바꾸기」 공식 R' F R' B2 R F' R' B2 R2를 한 번 쳐요. 그러면 네 면 모두 바른 짝이 돼요. 끝으로 U를 한 칸씩 돌려 위 층 코너가 아래 층 코너와 바르게 이웃하는 곳(옆면마다 두 층의 색이 이어지는 곳)에서 멈춰요. 많아야 세 번이에요. 지금은 바른 짝이 뒤에 있고, 공식 뒤에 윗면을 돌릴 필요가 없는 모양이에요.",
      setup: flip(TOP_SWAP),
      alg: TOP_SWAP,
      mask: "pll",
    },
    {
      kind: "try",
      body: "바른 짝이 다른 면에 있어요. U로 그 면을 뒤에 두고 공식을 한 번, 마지막에 윗면을 돌려 맞춰요.",
      setup: flip(TOP_ONE_SOLVE),
      alg: TOP_ONE_SOLVE,
      goal: "solved",
      mask: "pll",
    },
    {
      kind: "try",
      body: "바른 짝이 하나도 없어요. 지금 쥔 그대로 공식을 한 번 치면 바른 짝이 한 면 생겨요. 그 면을 뒤에 두고 한 번 더, 마지막에 윗면을 돌려 맞춰요.",
      setup: flip(TOP_NONE_PAIR_SOLVE),
      alg: TOP_NONE_PAIR_SOLVE,
      goal: "solved",
      mask: "pll",
    },
    {
      kind: "try",
      body: "이제 처음부터 해 봐요. 화면의 2×2는 윗면까지 노랗고 위 층 코너의 자리가 섞인 상태예요. 바른 짝을 세요. 바른 짝은 한 면, 없음, 네 면 가운데 하나예요(둘이나 셋은 없어요). 한 면이면 뒤에 두고 한 번, 없으면 한 번 친 뒤 한 면일 때대로, 네 면이면 윗면만 돌려 끝내요.",
      setup: { rule: "2x2-top-face-solved" },
      goal: "solved",
    },
  ],
};

const ortega: Lesson = {
  id: "222-ortega",
  size: 2,
  title: "오르테가 소개",
  summary: "빠른 해법. 흰 면 → 윗면 → 위아래 층 한꺼번에(공식 12개 안팎).",
  steps: [
    {
      kind: "quiz",
      body: "여기까지 공식 셋으로 2×2를 처음부터 끝까지 맞췄어요. 이번에는 더 빠르게 맞추는 사람들이 쓰는 해법 「오르테가」를 맛보기로 봐요. 오르테가는 세 단계예요. ① 흰 칸 넷을 한 면에 모아요. 코너 블럭이 제자리인지는 아직 안 봐요. ② 그 면을 아래로 두고 윗면을 노랗게 해요. 공식은 모양마다 하나씩 7가지이고, 영어 Orientation of the Last Layer(마지막 층 방향 맞추기)를 줄여 OLL이라고 불러요. ③ 위 층과 아래 층의 자리를 한 번에 맞춰요. 공식은 5가지이고, 영어 Permutation of Both Layers(두 층 자리 바꾸기)를 줄여 PBL이라고 불러요.",
      setup: { alg: setupFor("R2 F2 R2", "z2") },
      quiz: {
        question: "오르테가 첫 단계에서 할 일은 무엇일까요?",
        choices: [
          "흰 칸 넷을 한 면에 모으기, 제자리는 안 봐요",
          "흰 코너 넷을 제자리에 넣기",
          "노란 면부터 만들기",
        ],
        answer: 0,
        why: "제자리를 안 보니 첫 단계가 아주 짧아요.",
      },
    },
    {
      kind: "quiz",
      body: "오르테가는 마지막에 아래 층 자리까지 함께 고쳐요. 위 층에서 본 「바른 짝」은 아래 층에도 똑같이 있어요. 각 층은 맞음·이웃 둘 바꿈(바른 짝 한 면)·대각 둘 바꿈(대각선으로 마주 놓인 두 코너 블럭이 바뀜, 바른 짝 없음) 셋 중 하나예요. 큐브를 끌어 위 층 옆면을 둘러보세요.",
      setup: { alg: setupFor("R2 F2 R2", "z2") },
      quiz: {
        question: "이 큐브의 위 층은 셋 중 무엇일까요?",
        choices: [
          "맞음",
          "이웃 둘 바꿈(바른 짝 한 면)",
          "대각 둘 바꿈(바른 짝 없음)",
        ],
        answer: 2,
        why: "바른 짝이 하나도 없어요. 아래 층도 같아서 R2 F2 R2 세 수로 끝나요.",
      },
    },
    {
      kind: "demo",
      body: "위·아래 모두 대각 바꿈: R2 F2 R2 세 수로 끝.",
      setup: { alg: setupFor("R2 F2 R2", "z2") },
      alg: "R2 F2 R2",
    },
    {
      kind: "try",
      body: "흰 칸 넷을 한 면에 모아요. 첫 층에서 배운 법으로 흰 코너를 넣되, 기준은 정하지 않고 비어 있는 위 층 자리 아무 데나 흰색이 위를 보게만 넣어요. 흰 코너 넷의 흰색이 모두 한쪽을 보면 끝이에요.",
      setup: { rule: "2x2-random" },
      goal: "2x2-first-face",
    },
    {
      kind: "try",
      body: "둘째 단계: 큐브를 뒤집어(z2) 흰 면을 아래로 두고 윗면을 노랗게 해요. 노란색이 위를 보는 코너 블럭 하나가 앞-왼쪽 위에 있고 앞-오른쪽 위 코너 블럭의 노란색이 앞을 보는 모양은 이 과정에서 배운 윗면 공식(R U R' U R U2 R') 한 번이에요. 오르테가에서는 이런 OLL 공식 일곱 개를 모양마다 하나씩 써요.",
      setup: flip(TOP_FACE),
      alg: TOP_FACE,
      goal: "2x2-both-faces",
    },
    {
      kind: "try",
      body: "위아래 면을 다 만들었다고 치고, 위 층만 이웃 둘이 바뀐 상황을 풀어요. 이 공식은 위 층 자리 단원의 공식과 바꾸는 코너가 달라서, 바른 짝을 왼쪽에 두고 앞-오른쪽 위와 뒤-오른쪽 위 코너를 맞바꾸는 공식 R U R' U' R' F R2 U' R' U' R U R' F'을 쳐요. PBL 다섯 가운데 하나예요.",
      setup: { alg: setupFor(T_PERM, "z2") },
      alg: T_PERM,
      goal: "solved",
    },
  ],
};

export const BEGINNER_222: Course = {
  id: "222-beginner",
  size: 2,
  title: "2×2 처음 맞추기",
  summary:
    "첫 층 → 윗면 → 위 층 자리. 공식 셋(코너 돌리기, 윗면 공식, 위 층 코너 바꾸기)이면 돼요. 끝에 오르테가 소개.",
  lessons: [pieces, intro, firstLayer, topFace, topLayer, ortega],
};
