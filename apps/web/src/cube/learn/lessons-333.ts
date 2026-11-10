// 3×3 초보자 층별 맞추기(docs/47 8-2). 처음부터 끝까지 순서대로 따라 하면 다 맞춘다.
// 처음엔 기본 방향(위 흰, 앞 초록)으로 들고 흰 십자와 첫 층 코너를 맞춘 뒤, 큐브를 뒤집어(z2) 흰 면을 아래로 둔다.
// 「직접 해보기」의 상황은 모범 답의 거꾸로로 만든다(setupFor). 시험이 상황 → 모범 답 → 목표를 확인한다.
// 글만 읽고 넘기는 단계는 두지 않는다: 설명은 둘러보기·조각 찾기·고르기 문제·따라 하기에 얹는다(types.ts).
//
// 2026-11-10 사용자 「무한정 해야 하는데, 각 형태일 때 가장 효율적으로 잡는 방향」, 「최대한 간결하고 친절하게」,
// 「처음 보는 용어는 먼저 의미를 알려 주고 쓰기」: 흰 십자부터 코너 방향까지 판단이 필요한 곳은 모두
// 「이 모양이면 → 이렇게 쥐고 → 이 공식 n번」이다. 경우와 공식·횟수의 원본은 `beginner-path.ts`이고, 단계별
// 해 보기·시연의 모범 답은 그 규칙이 같은 상황에서 내는 수와 같다(beginner-lessons.test.ts). 같은 공식을
// 거꾸로 치면 짧은 경우는 거꾸로를 권한다(새로 외울 공식은 늘지 않는다). 용어는 처음 쓰기 전에 뜻을 알린다
// (glossary-333.ts와 시험). 퍼뮤·수네 같은 전문 이름은 쓰지 않는다.
import {
  CORNER_CYCLE,
  CORNER_CYCLE_BACK,
  EDGE_SWAP,
  FROM_RIGHT,
  RIGHT,
  reps,
  TWIST,
  TWIST_BACK,
  YELLOW_CROSS,
  YELLOW_CROSS_BACK,
} from "./beginner-path";
import { setupFor } from "./notation";
import type { Course, Lesson } from "./types";

export {
  CORNER_CYCLE,
  CORNER_CYCLE_BACK,
  EDGE_SWAP,
  FROM_RIGHT,
  RIGHT,
  reps,
  TWIST_BACK,
  YELLOW_CROSS_BACK,
};

export const SEXY = "R U R' U'";
export const EO = YELLOW_CROSS;
/** 초보자 코너 돌리기 공식. 첫 층(흰 면 위)과 마지막 층 코너 방향(노란 면 위)에 같은 것을 쓴다 */
export const CORNER_TWIST = TWIST;
/**
 * 첫 층 코너 지름길(흰 면 위, 칸 밑 코너의 흰색이 보는 쪽마다). 2×2 첫 층 단원이 쓴다(`@game/cube-ai`
 * `TAUGHT_CORNER_SHORTCUT`과 같다). 3×3 처음 맞추기는 2026-11-10부터 코너 돌리기와 그 거꾸로만 쓴다
 */
export const SHORT_RIGHT = "R' D' R";
export const SHORT_FRONT = "F D F'";
export const SHORT_DOWN = "R' D2 R D R' D' R";

// 마지막 층 상황(풀이의 거꾸로로 만든다). beginner-lessons.test.ts가 규칙이 같은 수를 내는지 확인한다
/** 점 → (한 번) ㄱ자가 앞·오른쪽 → U2로 뒤·왼쪽 → (거꾸로 한 번) 십자 */
export const DOT_TO_CROSS = `${EO} U2 ${YELLOW_CROSS_BACK}`;
/** 맞은 두 엣지가 마주 봄: U로 앞·뒤를 맞추고 한 번 → U'로 앞·오른쪽이 맞음 → y'로 쥐고 한 번 */
export const EDGE_OPPOSITE = `${EDGE_SWAP} U2 ${EDGE_SWAP}`;
/** 제자리 코너가 없음: 한 번 → 앞-왼쪽 위가 제자리 → y'로 쥐고 한 번 */
export const CORNERS_NONE = `${CORNER_CYCLE} y' ${CORNER_CYCLE}`;
/** 2×2(3×3을 아는 사람)가 쓰는 코너 방향 상황: 앞-오른쪽 위는 노랑이 오른쪽(두 번), U로 오는 다음 것은 노랑이 앞(네 번) */
export const TWIST_TWO = `${reps(CORNER_TWIST, 2)} U ${reps(CORNER_TWIST, 4)} U'`;
/** 3×3 코너 방향: 노랑이 오른쪽 → 두 번, U로 오는 다음 것은 노랑이 앞 → 거꾸로 두 번 */
export const TWIST_TWO_BACK = `${reps(TWIST, 2)} U ${reps(TWIST_BACK, 2)} U'`;
/** 돌아간 코너 셋, 모두 노랑이 오른쪽(두 번씩) */
export const TWIST_THREE = `${reps(CORNER_TWIST, 2)} U ${reps(CORNER_TWIST, 2)} U ${reps(CORNER_TWIST, 2)} U2`;
/** 코너 자리 문제: 앞-오른쪽 위가 제자리지만 돌아가 있음 */
export const CORNER_PLACED_TWISTED = `${CORNER_CYCLE} ${TWIST_TWO}`;

const flip = (solution: string) => ({ alg: setupFor(solution, "z2") });

// 흰 십자의 경우별 상황(흰 면 위, 기본 방향)과 모범 답. where는 처음 엣지 자리. 시험이 엔진으로 자리·방향을 확인한다.
// 흰 면(위)은 돌리지 않고, 엣지는 늘 앞면으로 내리고 올린다(2026-11-05 사용자 「항상 D면으로 내려서 옮겨서 올려」).
// 수는 F·D·y뿐이다. 모범 답은 `beginner-path.ts` 규칙이 같은 상황에서 내는 수다
/** 가운데 층, 짝 색이 앞 센터와 같음: 흰-초록이 앞-오른쪽, 흰색이 오른쪽 */
export const CROSS_MIDDLE = {
  setup: "F",
  alg: "F'",
  where: "앞-오른쪽, 흰색이 오른쪽을 봐요",
};
/** 가운데 층: 흰-빨강이 앞-오른쪽, 흰색이 앞. y로 빨강 면을 앞으로 쥐면 엣지가 왼쪽이라 F */
export const CROSS_MIDDLE_R = {
  setup: "R'",
  alg: "y F",
  where: "앞-오른쪽, 흰색이 앞을 봐요",
};
/** 가운데 층, 짝 색이 다른 센터 옆: 오른쪽이면 F D F'로 내리고 첫째 경우 */
export const CROSS_GUARD = {
  setup: "R2 F D' F'",
  alg: "F D F' y F2",
  where: "앞-오른쪽, 흰색이 오른쪽을 봐요",
};
export const CROSS_GUARD_TRY = {
  setup: "F2 R' D R",
  alg: "y F' D' F y' F2",
  where: "앞-오른쪽",
};
/** 아래층, 흰색이 옆: 같은 색 센터를 오른쪽에 쥐고 엣지를 아래-오른쪽에 두고 F D' F' y F */
export const CROSS_DOWN_SIDE = {
  setup: "B R B' D'",
  alg: "F D' F' y F",
  where: "아래-오른쪽",
};
export const CROSS_DOWN_SIDE_TRY = {
  setup: "R F R' D'",
  alg: "y' F D' F' y F",
  where: "아래-앞",
};
/** 위층, 흰색이 옆: 앞으로 쥐고 F로 가운데 층에 내리면 둘째 경우 */
export const CROSS_FLIPPED = {
  setup: "R F R' D' F2",
  alg: "F y F' D' F y' F2",
  where: "위-앞",
};
export const CROSS_FLIPPED_TRY = {
  setup: "B R B' D' R2",
  alg: "y F y F' D' F y' F2",
  where: "위-오른쪽",
};
/** 위층 흰색 위, 자리 틀림(두 엣지가 자리를 바꿈): 앞으로 쥐고 F2로 내리면 첫째 경우 */
export const CROSS_WRONG_TOP = {
  setup: "R2 D' F2 D R2",
  alg: "y F2 y' D' F2 y D F2",
  where: "위-오른쪽",
};
export const CROSS_WRONG_TOP_TRY = {
  setup: "R2 D2 L2 D2 R2",
  alg: "y' F2 y2 D2 F2 y2 D2 F2",
  where: "위-왼쪽",
};

/**
 * 첫 층(흰 면 위): 앞-오른쪽 위에 흰-파랑-빨강이 박힘(2×2 첫 층 단원이 쓴다). R' D' R D로 빼고, y로 제 칸(오른쪽-뒤)을
 * 앞-오른쪽에 쥐고, D로 그 밑에 옮겨 넣는다. y'로 돌아오면 처음 칸 밑에 흰-초록-빨강이 흰색 오른쪽으로 와 있다
 */
export const STUCK_CORNER_UP = `${CORNER_TWIST} y D ${CORNER_TWIST} y' ${CORNER_TWIST}`;
/**
 * 3×3 첫 층: 아래층에 흰 코너가 없는데 흰-초록-빨강이 앞-왼쪽 위에, 흰-주황-초록이 앞-오른쪽 위에 들어감.
 * y'로 쥐고 한 번 빼고(R' D' R D), 내려온 흰-초록-빨강을 넣으면 흰-주황-초록이 내려와 그것도 넣는다(규칙이 내는 세 걸음).
 * 모범 답의 거꾸로로 만들면 거울 꼴 상황이 되어 상황을 따로 적는다
 */
export const STUCK_CORNER_SETUP = `D' R' D R D' y' D' R' D R D y ${TWIST_BACK}`;
export const STUCK_CORNER = `y' ${TWIST} y D ${TWIST} y' D' ${TWIST}`;
/** 둘째 층: 앞-오른쪽 칸에 앞-왼쪽 칸의 엣지가 박힘 */
const STUCK_EDGE = `${RIGHT} U' y' ${RIGHT}`;

// 「조각의 움직임」에서 따라가는 수와 마무리 해 보기(시험이 엔진으로 자리·정답을 확인한다)
/** 흰-초록-빨강 코너 블럭을 R U2로 옮기면 위-앞-왼쪽 자리로 간다. 되돌리기 U2 R' */
export const TRACK_CORNER = "R U2";
/** 흰-초록 엣지 블럭을 F R로 옮기면 위-오른쪽 자리로 간다. 되돌리기 R' F' */
export const TRACK_EDGE = "F R";
/** 윗층 엣지 블럭 셋만 자리를 돌림. 흰 면은 다 흰색이고 코너·아래 두 층은 맞음 */
export const EDGE_CYCLE = "R U' R U R U R U' R' U' R2";
/** 흰-초록 엣지 블럭이 제자리에서 뒤집힘(다른 조각은 가린다) */
export const FLIPPED_EDGE = "R U' R' F'";
/** 흰-초록-빨강 코너 블럭이 제자리에서 돌아감 */
export const TWISTED_CORNER = "R' F'";

/** 평가 그림 (나): 흰 조각 여덟이 제자리·바른 방향(첫 층 다 맞음). 나머지 두 층만 흐트러뜨린다(x2로 뒤집어 아래 두 층 공식) */
export const LAYER_DONE =
  "x2 U R U' R' U' F' U F U2 R U R' U R U2 R' U' F R U R' U' F' x2";
/** 평가 그림 (가): (나)에서 윗층 조각의 자리만 모두 바꿈. 흰 면은 다 흰색이지만 옆면 첫 줄이 다 틀림 */
export const FACE_ONLY = `${LAYER_DONE} M2 U M2 U2 M2 U M2 U`;

/**
 * 준비 1 「큐브와 만나기」(2026-11-04 사용자가 정한 처음 흐름): 환영 → 스티커가 아니라 조각 → 센터 세기 →
 * 가상 분해·조립(축 → 센터 → 엣지 → 코너) → 모두 몇 개. 공식은 하나도 외우지 않는다.
 */
const start: Lesson = {
  id: "333-start",
  size: 3,
  title: "큐브와 만나기",
  summary: "큐브는 작은 조각 26개로 되어 있어요. 조각을 하나씩 알아봐요.",
  steps: [
    {
      kind: "welcome",
      body: "반가워요! 화면의 큐브는 마구 섞였다가 다시 맞춰지고 있어요. 이 과정을 차례로 따라 하면 여러분도 처음부터 끝까지 맞출 수 있어요.",
    },
    {
      kind: "parts",
      body: "큐브에는 면이 여섯 개 있고, 면마다 칸이 아홉 개 있어요. 칸마다 붙은 색 종이를 「스티커」라고 해요. 스티커는 따로 움직이지 않고, 몇 장씩 붙은 작은 덩어리인 「조각」이 함께 움직여요. 「스티커로 보기」와 「조각으로 보기」를 바꿔 보고, 칸 하나를 눌러 보세요. 그 칸이 붙은 조각 전체가 들려요.",
    },
    {
      kind: "find",
      body: "면 한가운데에는 스티커가 한 장뿐인 조각이 있어요. 이 조각을 「센터 블럭」이라고 해요. 색을 가린 까만 큐브에서 센터 블럭을 모두 눌러 세어 보세요. 누르면 색이 드러나요. 뒤쪽은 끌어서 둘러보거나 거울에서 눌러요.",
      mask: "none",
      find: { piece: "center" },
      count: 6,
    },
    {
      kind: "find",
      body: "센터 블럭 여섯은 색 자리가 정해져 있어요. 흰색 맞은편은 노란색, 초록색 맞은편은 파란색, 빨간색 맞은편은 주황색이에요. 이 까만 큐브는 흰색이 위예요. 흰색 맞은편의 노란 센터를 찾아 눌러 보세요. 아래쪽은 끌어서 둘러보거나 거울에서 눌러요.",
      mask: "none",
      find: { piece: "center", colors: ["D"] },
    },
    {
      kind: "quiz",
      body: "이 과정에서는 큐브를 흰색이 위, 초록색이 앞이 되게 들고 시작해요. 위를 보는 면은 「윗면」, 앞을 보는 면은 「앞면」이라고 불러요. 아래·오른쪽·왼쪽·뒤도 같은 식으로 「아랫면」, 「오른쪽 면」, 「왼쪽 면」, 「뒷면」이라고 불러요. 윗면과 아랫면을 뺀 넷은 「옆면」이에요.",
      mask: "centers:UF",
      quiz: {
        question: "흰색이 위, 초록색이 앞이면 오른쪽 센터는 무슨 색일까요?",
        choices: ["빨간색", "주황색", "파란색"],
        answer: 0,
        why: "빨간색이 오른쪽, 주황색이 왼쪽이에요. 파란색은 초록색 맞은편이라 뒤예요. 색 자리는 하나로 정해져 있어서, 빨간색과 주황색이 바뀐 큐브는 아무리 해도 맞출 수 없어요. 다음 단계에서 직접 끼워 보며 확인해요.",
      },
    },
    {
      kind: "build",
      body: "큐브 속을 들여다봐요. 맞춘 큐브를 분해했다가 차례로 다시 끼워요. 한가운데 축에 센터 블럭 여섯을 끼우고, 스티커가 둘인 조각과 셋인 조각을 끼워요. 스티커가 둘인 조각은 「엣지 블럭」, 셋인 조각은 「코너 블럭」이라고 해요. 엣지 블럭은 두 면 사이 모서리에, 코너 블럭은 세 면이 만나는 구석에 있어요.",
    },
    {
      kind: "quiz",
      body: "센터 블럭 6개, 엣지 블럭 12개, 코너 블럭 8개를 끼웠어요. 한가운데 축은 돌지 않아요.",
      mask: "all",
      quiz: {
        question: "큐브를 이루는 조각은 모두 몇 개일까요?",
        choices: ["54개", "27개", "26개"],
        answer: 2,
        why: "6 + 12 + 8 = 26개예요. 54는 스티커 수예요. 큐브를 맞춘다는 건 스티커 54장의 색을 맞추는 게 아니라, 조각 26개를 저마다 있어야 할 곳에 두는 거예요.",
      },
    },
  ],
};

/**
 * 준비 2 「조각의 움직임」(2026-11-05 다시 짬): 분해·조립과 같은 센터 → 엣지 → 코너 차례. 완성된 큐브에서 보고 싶은
 * 블럭만 색을 넣고 마음대로 돌려 본다(놀이판). 센터는 그대로, 엣지·코너는 제 종류 자리로만, 색은 함께 다닌다.
 * 따라가기 확인(엣지 → 코너) 뒤 「자리」와 「방향」: 제자리 찾기 → U 한 번 되돌리기(흰 면은 그대로인데 자리가 틀림)
 * → 제자리가 아닌 엣지 블럭 세기 → 「한 면을 맞춘 상태」 평가 → 뒤집힘·돌아감 → 자리 × 방향 정리 → 해 보기(엣지 → 코너).
 * 차례를 바꿔 id를 새로 두었다(옛 id `333-pieces`, progress.ts `LESSON_RENAMES`).
 */
const pieces: Lesson = {
  id: "333-piece-moves",
  size: 3,
  title: "조각의 움직임",
  summary:
    "면을 돌리면 조각이 어떻게 움직이는지 봐요. 색이 아니라 조각을 옮겨요.",
  steps: [
    {
      kind: "play",
      body: "앞 단원에서 큐브가 조각 26개로 되어 있다는 걸 봤어요. 이번에는 면을 돌릴 때 그 조각들이 어떻게 움직이는지 봐요. 면 하나를 돌리면 그 면에 붙은 조각 아홉 개가 한 겹으로 함께 돌아요. 이 한 겹을 「층」이라고 해요. 큐브는 세 층이고, 위에서부터 「위 층」, 「가운데 층」, 「아래 층」이라고 불러요. 화면의 큐브는 맞춘 큐브에서 센터 블럭에만 색을 넣은 상태예요. 아무 면이나 돌려 보세요. 센터 블럭은 그 자리에서 빙글 돌기만 해요.",
      play: { focus: { piece: "center" }, turns: 5, choose: true },
    },
    {
      kind: "play",
      body: "이번엔 흰색과 초록색이 붙은 엣지 블럭과 센터 블럭에만 색이 있어요. 조각은 붙은 색으로 불러요. 이 블럭은 「흰-초록 엣지 블럭」이에요. 색은 어느 조각인지 알아보는 이름표예요. 아무 면이나 돌리며 이 블럭을 따라가 보세요. 엣지 블럭은 늘 모서리로만 옮겨 가요. 「다른 조각 보기」로 다른 조각도 따라가 볼 수 있어요.",
      play: {
        focus: { colors: ["U", "F"] },
        centers: true,
        moved: 3,
        choose: true,
      },
    },
    {
      kind: "play",
      body: "흰-초록-빨강 코너 블럭이에요. 코너 블럭은 늘 구석으로만 옮겨 가요. 모서리로는 가지 않아요.",
      play: {
        focus: { colors: ["U", "F", "R"] },
        centers: true,
        moved: 3,
        choose: true,
      },
    },
    {
      kind: "play",
      body: "흰-빨강 엣지 블럭과 흰-빨강-파랑 코너 블럭이에요. 한 조각의 스티커는 늘 함께 다녀요. 아무리 돌려도 스티커 한 장만 떨어져 나가지 않아요.",
      play: {
        focus: [{ colors: ["U", "R"] }, { colors: ["U", "R", "B"] }],
        turns: 6,
      },
    },
    {
      kind: "find",
      body: "확인해 봐요. 맞춘 큐브에서 앞면과 오른쪽 면을 한 번씩 돌려 두었어요. 센터 블럭만 보여요. 흰-초록 엣지 블럭은 지금 어디 있을까요? 눌러 보세요. 막히면 화면의 「보통」 단추를 눌러 모든 색을 보세요.",
      setup: { alg: TRACK_EDGE },
      mask: "centers",
      find: { piece: "edge", colors: ["U", "F"] },
    },
    {
      kind: "find",
      body: "이번엔 오른쪽 면을 한 번, 윗면을 반 바퀴 돌려 두었어요. 흰-초록-빨강 코너 블럭은 지금 어디 있을까요?",
      setup: { alg: TRACK_CORNER },
      mask: "centers",
      find: { piece: "corner", colors: ["U", "F", "R"] },
    },
    {
      kind: "find",
      body: "조각마다 돌아가야 할 「제자리」가 있어요. 센터 블럭은 움직이지 않아서 제자리를 알려 주는 표지판이 돼요. 그래서 앞으로 색은 두 가지로만 봐요. 조각의 색은 어느 조각인지 알려 주고, 그 색과 같은 색 센터는 그 조각의 제자리가 어디인지 알려 줘요. 초록-주황 엣지 블럭의 제자리는 초록 센터와 주황 센터 사이예요. 그 자리를 눌러 보세요. 조각이 아니라 자리를 눌러요.",
      setup: { alg: "R U F" },
      mask: "centers",
      find: { at: ["F", "L"] },
    },
    {
      kind: "try",
      body: "맞춘 큐브에서 윗면을 한 번 돌렸어요. 흰 면은 그대로 다 흰색이에요. 그런데 위 층의 조각이 모두 한 칸씩 옮겨 가서 제자리가 아니에요. 옆면 윗줄 조각들이 저마다 제자리 센터 위가 아니라 한 칸 옆에 와 있어요. 윗면을 돌려 조각들을 제자리로 돌려 놓아 보세요. 면을 이리저리 돌려 보고, 막히면 힌트를 눌러요.",
      setup: { alg: "U" },
      alg: "U'",
      goal: "solved",
      mask: "all",
    },
    {
      kind: "find",
      body: "흰 면은 다 흰색인데, 위 층 엣지 블럭 몇 개가 서로 자리를 바꿨어요. 제자리가 아닌 엣지 블럭을 모두 눌러 보세요. 흰색이 아닌 쪽 색의 센터가 바로 아래에 있지 않으면 그 블럭은 제자리가 아니에요. 흰색이 위를 보고 있어도요.",
      setup: { alg: EDGE_CYCLE },
      mask: "all",
      find: { piece: "edge", misplaced: true },
      count: 3,
    },
    {
      kind: "quiz",
      body: "두 큐브 모두 윗면이 흰색이에요. 끌어서 옆면도 둘러보세요.",
      mask: "all",
      quiz: {
        question: "흰 면을 다 맞춘 것은 어느 쪽일까요?",
        choices: ["(가)", "(나)"],
        answer: 1,
        why: "(가)는 흰색이 위를 보기만 하고 조각이 제자리가 아니에요. 옆면 윗줄 조각이 저마다 제자리 센터가 아닌 다른 센터 위에 있어요. (나)는 흰색이 붙은 엣지 블럭 넷과 코너 블럭 넷이 모두 제자리에 바르게 있어요.",
        pictures: [{ alg: FACE_ONLY }, { alg: LAYER_DONE }],
      },
    },
    {
      kind: "quiz",
      body: "조각이 어느 쪽을 보고 놓였는지를 「방향」이라고 해요. 제자리에 있어도 방향이 틀려 뒤집혀 있을 수 있어요. 흰-초록 엣지 블럭만 보이게 가렸어요. 흰 센터와 초록 센터를 보고 판단해요.",
      setup: { alg: FLIPPED_EDGE },
      mask: "piece:UF",
      quiz: {
        question: "흰-초록 엣지 블럭은 지금 어떤 상태일까요?",
        choices: ["제자리, 바른 방향", "제자리지만 뒤집혔어요", "다른 자리"],
        answer: 1,
        why: "흰 센터와 초록 센터 사이에 있지만 흰 스티커가 초록 쪽을 봐요. 엣지 블럭은 한 자리에서 두 방향으로 놓일 수 있어요.",
      },
    },
    {
      kind: "quiz",
      body: "코너 블럭이 제자리에서 방향이 틀리면 「돌아가 있다」고 해요. 흰-초록-빨강 코너 블럭이 제자리에 있지만 흰색이 위를 보지 않아요.",
      setup: { alg: TWISTED_CORNER },
      mask: "piece:UFR",
      quiz: {
        question: "코너 블럭은 한 자리에서 몇 가지 방향으로 놓일 수 있을까요?",
        choices: ["두 가지", "세 가지", "네 가지"],
        answer: 1,
        why: "흰색이 위, 앞, 오른쪽을 보는 세 가지예요. 바른 방향은 하나뿐이에요.",
      },
    },
    {
      kind: "quiz",
      body: "정리해 봐요. 조각은 자리와 방향이 둘 다 맞아야 맞은 거예요. 제자리인데 방향이 틀리면 뒤집히거나 돌아간 것이고, 흰색이 위를 봐도 자리가 틀리면 아까 누른 엣지 블럭처럼 아직 맞은 게 아니에요.",
      mask: "all",
      quiz: {
        question: "조각 하나를 맞췄다고 하려면?",
        choices: [
          "제자리에 있으면 돼요",
          "흰색이 위를 보면 돼요",
          "제자리에, 바른 방향으로 있어야 해요",
        ],
        answer: 2,
        why: "자리와 방향이 둘 다 맞아야 해요. 하나만 맞으면 아직 맞춘 게 아니에요.",
      },
    },
    {
      kind: "try",
      body: "흰-초록 엣지 블럭만 보여요. 흰 센터와 초록 센터 사이로, 흰 스티커가 위를 보게 돌려 놓아 보세요. 어느 면을 돌려도 되고, 되돌리고 싶으면 반대쪽으로 한 번 더 돌려요.",
      setup: { alg: TRACK_EDGE },
      alg: "R' F'",
      goal: "piece:UF",
      mask: "piece:UF",
    },
    {
      kind: "try",
      body: "이번엔 흰-초록-빨강 코너 블럭이에요. 흰·초록·빨강 센터 사이로, 흰색이 위를 보게 돌려 놓아 보세요. 다른 조각은 신경 쓰지 않아도 돼요.",
      setup: { alg: TRACK_CORNER },
      alg: "U2 R'",
      goal: "piece:UFR",
      mask: "piece:UFR",
    },
    {
      kind: "quiz",
      body: "앞으로 할 일은 모두 스티커 색을 맞추는 게 아니라, 조각을 제자리에 바른 방향으로 옮기는 거예요. 첫 목표는 흰 센터 둘레에 흰 엣지 넷을 붙여 + 모양을 만드는 「흰 십자」예요.",
      mask: "all",
      quiz: {
        question: "흰 십자를 만들려면 무엇을 옮길까요?",
        choices: [
          "흰색이 붙은 엣지 블럭 넷을 제자리로",
          "흰 스티커 아무거나 위로",
          "흰색이 붙은 코너 블럭 넷을 제자리로",
        ],
        answer: 0,
        why: "흰 엣지 넷을 저마다 제자리인 흰 센터와 옆 센터 사이에, 흰 스티커가 위를 보게 옮겨요.",
      },
    },
  ],
};

const notation: Lesson = {
  id: "333-notation",
  size: 3,
  title: "표기 읽기",
  summary:
    "돌리는 법을 글자로 적는 방법이에요. 면 글자 여섯과 방향만 알면 돼요.",
  steps: [
    {
      kind: "find",
      body: "흰 십자를 만들기 전에, 어느 면을 어느 쪽으로 돌릴지 글자로 읽는 법부터 익혀요. 면마다 글자 이름이 있어요. U 윗면, D 아랫면, R 오른쪽 면, L 왼쪽 면, F 앞면, B 뒷면이에요. 영어 낱말 Up, Down, Right, Left, Front, Back의 첫 글자예요. 흰색이 위, 초록색이 앞이면 R 면은 빨강이에요. R 면의 센터 블럭을 눌러 보세요.",
      find: { piece: "center", colors: ["R"] },
    },
    {
      kind: "quiz",
      body: "글자만 있으면 그 면을 마주 보고 시계 방향으로 4분의 1바퀴 돌려요. 시계 방향은 시곗바늘이 도는 쪽이에요. 글자 뒤에 작은따옴표 '가 붙으면 반대쪽으로, 2가 붙으면 반 바퀴 돌려요.",
      quiz: {
        question: "R'은 어떻게 돌릴까요?",
        choices: [
          "오른쪽 면을 오른쪽에서 마주 보고 시계 방향으로 4분의 1바퀴",
          "오른쪽 면을 오른쪽에서 마주 보고 시계 반대 방향으로 4분의 1바퀴",
          "오른쪽 면을 반 바퀴",
        ],
        answer: 1,
        why: "작은따옴표는 반대쪽이에요. 반 바퀴는 R2예요.",
      },
    },
    {
      kind: "demo",
      body: "R: 오른쪽 면을 오른쪽에서 마주 보고 시계 방향. 오른쪽 층의 조각 아홉 개가 함께 돌아 앞면 스티커가 위로 올라가요.",
      alg: "R",
    },
    {
      kind: "demo",
      body: "R': 반대쪽. 위 스티커가 앞으로 내려와요.",
      alg: "R'",
    },
    {
      kind: "demo",
      body: "U와 U': 윗면을 위에서 보고 시계 방향, 그리고 반대쪽. U를 돌리면 앞면 윗줄이 왼쪽으로 가요.",
      alg: "U U'",
    },
    {
      kind: "demo",
      body: "F와 F2: 앞면을 마주 보고 시계 방향, 그리고 반 바퀴. 이렇게 한 번 돌리는 것을 「수」라고 하고, 화면에서는 키를 눌러 수를 쳐요. 수 여러 개를 차례로 적은 것을 「공식」이라고 해요.",
      alg: "F F2",
    },
    {
      kind: "look",
      body: "x, y, z는 면 하나가 아니라 큐브 전체를 돌려 쥐는 거예요. x는 R과 같은 쪽, y는 U와 같은 쪽, z는 F와 같은 쪽으로 큐브째 돌려요. 조각끼리의 자리는 그대로이고 보는 쪽만 바뀌어요. 큐브 전체를 돌려 초록 면이 위로 오게 해 보세요.",
      look: { color: "F", on: "U" },
    },
    {
      kind: "look",
      body: "큐브째 돌려 쥐기는 맞출 곳을 앞으로 가져올 때 써요. y는 오른쪽 면을 앞으로, y'는 왼쪽 면을 앞으로, y2는 뒷면을 앞으로 가져와요. 큐브 전체를 옆으로 돌려 빨강 면이 앞에 오게 해 보세요.",
      look: { color: "R", on: "F" },
    },
    {
      kind: "quiz",
      body: "U와 y는 같은 쪽으로 돌지만 하는 일이 달라요.",
      setup: { alg: "R U F'" },
      quiz: {
        question: "윗면 돌리기 U와 큐브 돌려 쥐기 y는 무엇이 다를까요?",
        choices: [
          "U는 위 층만 돌아 모양이 바뀌고, y는 큐브 전체가 돌아 섞인 모양은 그대로예요",
          "둘은 똑같아요",
          "y는 아래 층만 돌려요",
        ],
        answer: 0,
        why: "y는 손에 쥔 방향만 바꿔요. 조각끼리의 자리는 그대로라 섞인 모양이 바뀌지 않아요.",
      },
    },
    {
      kind: "demo",
      body: "z2: 앞면을 마주 본 채 큐브 전체를 시계 방향으로 반 바퀴 돌려 쥐어요. 흰 면이 아래로 가요. 흰 면 쪽을 다 맞춘 뒤 이렇게 뒤집어요.",
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
      body: "윗면이 반 바퀴 돌아가 있어요. 되돌려 보세요.",
      setup: { alg: "U2" },
      alg: "U2",
      goal: "solved",
    },
    {
      kind: "try",
      body: "R 다음 U를 돌렸어요. 되돌리려면 나중 것부터 반대쪽으로: U' 다음 R'.",
      setup: { alg: "R U" },
      alg: "U' R'",
      goal: "solved",
    },
    {
      kind: "try",
      body: "F R' U2를 돌린 큐브예요. 차례를 뒤집고 방향도 뒤집으면 되돌아가요. 이렇게 공식을 끝에서부터 방향을 뒤집어 치는 것을 「거꾸로 친다」고 해요. 뒤에서 공식을 거꾸로 칠 때가 있어요.",
      setup: { alg: "F R' U2" },
      alg: "U2 R F'",
      goal: "solved",
    },
    {
      kind: "turn",
      body: "자주 하는 실수: 마주 보기 어려운 면(B, L, D)을 앞에서 본 방향으로 돌리는 것. 그 면을 마주 본다고 생각하고 돌려요. 왼쪽 면을 마주 본다고 생각하며 L을 쳐 보세요. 앞면 왼쪽 줄이 아래로 내려가요.",
      alg: "L",
    },
  ],
};

/** 흰 십자만 맞고 나머지는 흐트러진 큐브(흰 면 위). 넣고 빼는 공식 둘이라 십자는 그대로다 */
export const SAFE_SETUP = `${CORNER_TWIST} F D2 F'`;

/**
 * 안전한 회전·위험한 회전(2026-11-05 사용자): 맞춘 면을 돌리면 맞춘 조각이 흐트러지고(위험), 그 반대 면은
 * 마음껏 돌려도 된다(안전). 흰 십자·첫 층 코너·둘째 층이 모두 「반대 면 쪽으로 빼기 → 반대 면을 돌려 자리 밑에
 * 두기 → 정해진 수로 넣기」라, 흰 십자 단계 첫머리에 직접 돌려 보게 한다. 글은 면 글자 대신 「맞춘 면」·「반대 면」
 */
const safeTurns: Lesson = {
  id: "333-safe-turns",
  size: 3,
  title: "안전한 회전",
  summary: "맞춘 면은 그대로 두고, 반대 면을 돌려요.",
  steps: [
    {
      kind: "turn",
      body: "이제부터 큐브를 맞춰요. 첫 단계는 흰 십자예요. 흰 십자를 만들기 전에 꼭 알아 둘 규칙 하나를 먼저 익혀요. 화면의 큐브는 흰 십자만 미리 맞춰 두고 나머지는 섞어 둔 상태예요. 흰 십자가 있는 흰 면을 「맞춘 면」이라고 할게요. 그 맞은편 아랫면은 「반대 면」이에요. 반대 면을 돌려 보세요. 십자는 그대로예요. 맞춘 것을 흐트러뜨리지 않는 이런 회전을 「안전한 회전」이라고 해요.",
      setup: { alg: SAFE_SETUP },
      mask: "cross",
      alg: "D",
    },
    {
      kind: "turn",
      body: "이번엔 맞춘 면을 돌려 보세요. 흰 엣지가 모두 제자리에서 벗어나요. 이것이 위험한 회전이에요.",
      setup: { alg: SAFE_SETUP },
      mask: "cross",
      alg: "U",
      passedText: "흰 엣지가 모두 제자리에서 벗어났어요.",
    },
    {
      kind: "try",
      body: "맞춘 면을 되돌려 십자를 다시 맞춰 보세요.",
      setup: { alg: `${SAFE_SETUP} U` },
      alg: "U'",
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "quiz",
      body: "앞면이나 오른쪽 면 같은 옆면은 단원에서 알려 주는 정해진 수로만 돌려요. 흰 십자에서는 F 한두 수가 그 정해진 수예요. 다음 세 단원은 모두 같은 흐름이에요. 맞출 조각을 반대 면 쪽으로 빼고, 반대 면을 돌려 제자리 가까이 옮기고, 정해진 공식으로 넣어요.",
      setup: { alg: SAFE_SETUP },
      mask: "cross",
      quiz: {
        question: "흰 십자를 지키며 마음껏 돌려도 되는 면은?",
        choices: ["맞춘 면(흰 면)", "반대 면(노란 면)", "옆면(앞·오른쪽 등)"],
        answer: 1,
        why: "반대 면은 흰 십자에 닿지 않아요. 맞춘 면을 돌리면 흰 엣지가 제자리에서 벗어나고, 옆면은 흰 엣지를 끌어내려요.",
      },
    },
  ],
};

/**
 * 흰 십자(2026-11-10 경우별 정해진 길): 엣지 하나를 보고 다섯 경우(아래층 흰색 아래, 가운데 층, 아래층 흰색 옆,
 * 위층 흰색 옆, 위층 자리 틀림) 가운데 하나로 올린다. 가운데 층은 짝 색이 붙은 면 센터가 같으면 바로(F·F'),
 * 다르면 내렸다가 첫째 경우. 해 보기 차례(진도 번호)는 그대로다
 */
const whiteCross: Lesson = {
  id: "333-white-cross",
  size: 3,
  title: "흰 십자",
  summary:
    "흰 센터 둘레에 흰 엣지 넷을 붙여요. 흰 엣지가 있는 곳마다 올리는 법이 정해져 있어요.",
  steps: [
    {
      kind: "find",
      body: "앞 단원에서 흰 십자를 흐트러뜨리지 않는 안전한 회전을 익혔어요. 이번에는 흰 십자를 직접 만들어요. 흰 엣지 넷을 하나씩 제자리로 올리면 돼요. 흰 면을 위, 초록 면을 앞으로 들어요. 화면의 큐브는 맞춘 큐브에서 흰-초록 엣지 블럭 하나만 아래 층으로 내려간 상태예요. 흰 엣지는 어느 것부터 해도 돼요. 먼저 흰-초록 엣지 블럭을 찾아 눌러 보세요.",
      setup: { alg: "F2" },
      mask: "cross",
      find: { piece: "edge", colors: ["U", "F"] },
    },
    {
      kind: "quiz",
      body: "흰 엣지에서 흰색이 아닌 쪽 색을 「짝 색」이라고 할게요. 짝 색은 그 블럭의 제자리를 알려 줘요. 흰 엣지의 제자리는 흰 센터와, 짝 색과 같은 색 센터 사이예요. 흰-초록 엣지 블럭은 흰 센터와 초록 센터 사이, 흰-빨강 엣지 블럭은 흰 센터와 빨강 센터 사이가 제자리예요. 흰색만 위를 본다고 제자리인 건 아니에요.",
      setup: { alg: "R2" },
      mask: "cross",
      quiz: {
        question: "아래로 내려간 흰-빨강 엣지 블럭은 어디로 올려야 할까요?",
        choices: [
          "흰 센터와 초록 센터 사이",
          "흰 센터와 빨강 센터 사이",
          "흰색만 위를 보면 어디든 괜찮아요",
        ],
        answer: 1,
        why: "짝 색이 빨강이니, 제자리는 흰 센터와 빨강 센터 사이예요.",
      },
    },
    {
      kind: "demo",
      body: "첫째 경우: 아래 층에서 흰색이 아래를 볼 때. 흰-초록 엣지 블럭이 제자리 바로 밑, 아래 층의 초록 센터 쪽에 있어요. 앞면을 반 바퀴 돌리는 F2를 치면 위로 올라가 제자리에 들어가요. 흰 엣지는 늘 앞면으로 올려요.",
      setup: { alg: "F2" },
      alg: "F2",
      mask: "cross",
    },
    {
      kind: "demo",
      body: "두 면 사이 자리는 두 면 이름을 이어 불러요. 아랫면과 앞면 사이는 「아래-앞」, 아랫면과 오른쪽 면 사이는 「아래-오른쪽」이에요. 흰 엣지가 아래-앞에 없으면 반대 면인 아랫면을 돌려 옮겨요. 아래-오른쪽이면 D', 아래-왼쪽이면 D, 아래-뒤면 D2예요. 지금은 아래-오른쪽이라 D'를 친 뒤 F2.",
      setup: { alg: "F2 D" },
      alg: "D' F2",
      mask: "cross",
    },
    {
      kind: "demo",
      body: "제자리가 앞이 아니면 큐브를 돌려 쥐어 제자리 쪽 센터, 곧 짝 색과 같은 색 센터를 앞으로 가져와요. 그 색 센터가 오른쪽이면 y, 왼쪽이면 y', 뒤면 y2예요. 흰-빨강 엣지 블럭은 빨강 센터 밑에 있어요. y로 빨강 면을 앞으로 가져오면 그 블럭이 아래-앞에 와요. F2.",
      setup: { alg: "R2" },
      alg: "y F2",
      mask: "cross",
    },
    {
      kind: "try",
      body: "흰-빨강 엣지 블럭이 아래 층에서 흰색이 아래를 봐요. y로 빨강 센터를 앞으로 쥐고, 아랫면을 돌려 그 블럭을 아래-앞으로 옮긴 뒤 F2.",
      setup: { alg: "R2 D2" },
      alg: "y D2 F2",
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "demo",
      body: `둘째 경우: 가운데 층에 있을 때. 앞면과 오른쪽 면 사이는 「앞-오른쪽」이라고 불러요. 짝 색 스티커가 붙은 면을 앞으로 쥐어요. 그 면이 제자리 쪽 면, 곧 짝 색 센터가 있는 면이면 앞면 한 번으로 올라가요. 흰 엣지가 앞-오른쪽이면 F', 앞-왼쪽이면 F. 지금 흰-초록 엣지 블럭은 앞-오른쪽에 있고 초록 스티커가 앞면을 봐요. 앞면 센터가 초록이니 제자리 쪽 면이에요. F'.`,
      setup: { alg: CROSS_MIDDLE.setup },
      alg: CROSS_MIDDLE.alg,
      mask: "cross",
    },
    {
      kind: "quiz",
      body: "흰-빨강 엣지 블럭이 앞-오른쪽에 있고, 빨강 스티커가 오른쪽 면에 붙어 있어요.",
      setup: { alg: CROSS_MIDDLE_R.setup },
      mask: "cross",
      quiz: {
        question: "이 엣지 블럭은 어떻게 올릴까요?",
        choices: [
          "앞면을 바로 돌려요",
          "y로 빨강 면을 앞으로 쥐고 F",
          "윗면을 돌려요",
        ],
        answer: 1,
        why: "빨강이 붙은 면을 앞으로 쥐면(y) 그 블럭이 앞-왼쪽에 와요. 앞-왼쪽이니 F예요. 윗면은 맞춘 면이라 돌리지 않아요.",
      },
    },
    {
      kind: "try",
      body: "y로 빨강 면을 앞으로 쥐고 F로 올려 보세요.",
      setup: { alg: CROSS_MIDDLE_R.setup },
      alg: CROSS_MIDDLE_R.alg,
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "demo",
      body: "짝 색 스티커가 붙은 면이 제자리 쪽 면이 아니면, 곧 그 면에 짝 색 센터가 없으면 바로 올리면 안 돼요. 올리면 엉뚱한 자리에 들어가요. 이 흰-빨강 엣지 블럭은 빨강 스티커가 초록 센터가 있는 앞면을 봐요. 제자리 쪽인 빨강 센터의 면이 아니에요. 아래 층으로 내렸다가 첫째 경우로 올려요. 흰 엣지가 앞-오른쪽이면 F D F', 앞-왼쪽이면 F' D' F. 여기서는 흰-초록 엣지 블럭이 이미 올라가 있어서 F를 치면 함께 내려가요. 가운데 D로 흰-빨강 엣지 블럭만 비켜 놓으면 F'로 흰-초록 엣지 블럭만 돌아와요. 이제 흰-빨강 엣지 블럭은 흰색이 아래예요. y로 빨강 면을 앞으로 쥐고 F2.",
      setup: { alg: CROSS_GUARD.setup },
      alg: CROSS_GUARD.alg,
      mask: "cross",
    },
    {
      kind: "try",
      body: "흰-초록 엣지 블럭이 가운데 층에 있는데, 초록 스티커가 빨강 센터가 있는 면을 봐요. 제자리 쪽 면이 아니에요. y로 빨강 면을 앞으로 쥐면 그 블럭이 앞-왼쪽에 와요. F' D' F로 내리고, 첫째 경우대로 올려 보세요.",
      setup: { alg: CROSS_GUARD_TRY.setup },
      alg: CROSS_GUARD_TRY.alg,
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "quiz",
      body: "셋째 경우: 아래 층에서 흰색이 옆을 볼 때.",
      setup: { alg: CROSS_DOWN_SIDE.setup },
      mask: "cross",
      quiz: {
        question:
          "아래-오른쪽의 흰-빨강 엣지 블럭은 흰색이 오른쪽을 봐요. 빨강 면을 반 바퀴 돌려 바로 올리면 어떻게 될까요?",
        choices: [
          "흰색이 옆을 본 채 올라가 뒤집혀요",
          "제자리에 바르게 들어가요",
        ],
        answer: 0,
        why: "반 바퀴로 올리면 흰색이 보던 쪽이 그대로라 뒤집혀요. 그래서 정해진 공식으로 올려요.",
      },
    },
    {
      kind: "demo",
      body: "제자리 쪽 센터, 곧 짝 색과 같은 색 센터가 오른쪽에 오게 쥐어요. 그 색 센터가 앞이면 y', 뒤면 y, 왼쪽이면 y2예요. 아랫면을 돌려 흰 엣지를 아래-오른쪽으로 옮겨요. 흰 엣지가 아래-앞이면 D, 아래-뒤면 D', 아래-왼쪽이면 D2예요. 그다음 F D' F' y F. 지금은 빨강 센터가 오른쪽이고 흰-빨강 엣지 블럭도 아래-오른쪽이에요. F D' F'로 그 블럭이 가운데 층에 올라오고, y F로 제자리에 올라가요.",
      setup: { alg: CROSS_DOWN_SIDE.setup },
      alg: CROSS_DOWN_SIDE.alg,
      mask: "cross",
    },
    {
      kind: "try",
      body: "흰-초록 엣지 블럭이 아래-앞에 있고 흰색이 앞을 봐요. y'로 초록 면을 오른쪽에 쥐면 그 블럭이 아래-오른쪽에 와요. F D' F' y F로 올려 보세요.",
      setup: { alg: CROSS_DOWN_SIDE_TRY.setup },
      alg: CROSS_DOWN_SIDE_TRY.alg,
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "demo",
      body: "넷째 경우: 위 층에서 흰색이 옆을 볼 때. 그 엣지 블럭을 앞으로 쥐고 F로 가운데 층에 내리면 둘째 경우가 돼요. 이 흰-초록 엣지 블럭은 먼저 F로 가운데 층에 내려요. 그러면 초록 스티커가 빨강 센터가 있는 면을 봐서 제자리 쪽 면이 아니에요. 그러니 y로 빨강 면을 앞으로 쥐고 F' D' F로 내린 뒤, y'로 초록 면을 앞으로 쥐고 F2.",
      setup: { alg: CROSS_FLIPPED.setup },
      alg: CROSS_FLIPPED.alg,
      mask: "cross",
    },
    {
      kind: "try",
      body: "흰-빨강 엣지 블럭이 위 층에서 흰색이 옆을 봐요. y로 그 블럭을 앞으로 쥐고 F로 내린 뒤, 둘째 경우대로 해 보세요.",
      setup: { alg: CROSS_FLIPPED_TRY.setup },
      alg: CROSS_FLIPPED_TRY.alg,
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "demo",
      body: "다섯째 경우: 위 층에서 흰색은 위를 보는데 제자리가 아닐 때. 짝 색 센터가 있는 쪽이 아닌 다른 센터 쪽에 들어가 있어요. 그 엣지 블럭을 앞으로 쥐고 F2로 아래 층에 내리면 첫째 경우예요. 지금은 흰-초록 엣지 블럭과 흰-빨강 엣지 블럭이 서로 자리를 바꿔 들어가 있어요. 흰-초록 엣지 블럭부터 y로 앞으로 쥐고 F2로 내려요. 첫째 경우대로 y'로 초록 면을 앞으로 쥐고 D'로 옮겨 F2. 이때 흰-빨강 엣지 블럭도 아래로 내려와 있어요. y로 빨강 면을 앞으로 쥐고 D로 옮겨 F2.",
      setup: { alg: CROSS_WRONG_TOP.setup },
      alg: CROSS_WRONG_TOP.alg,
      mask: "cross",
    },
    {
      kind: "try",
      body: "흰-빨강 엣지 블럭과 흰-주황 엣지 블럭이 서로 자리를 바꿔 들어가 있어요. 위-왼쪽의 흰-빨강 엣지 블럭부터 y'로 앞으로 쥐고 F2로 내린 뒤, 첫째 경우대로 올려 보세요. 함께 내려온 흰-주황 엣지 블럭도 첫째 경우대로 올려요.",
      setup: { alg: CROSS_WRONG_TOP_TRY.setup },
      alg: CROSS_WRONG_TOP_TRY.alg,
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "quiz",
      body: "정리해 봐요. 흰 엣지 하나를 고르면 먼저 다섯 경우 가운데 어디인지 봐요.",
      setup: { alg: CROSS_FLIPPED_TRY.setup },
      mask: "cross",
      quiz: {
        question: "흰-빨강 엣지 블럭은 지금 어느 경우일까요?",
        choices: [
          "아래 층, 흰색이 아래",
          "가운데 층",
          "아래 층, 흰색이 옆",
          "위 층, 흰색이 옆",
        ],
        answer: 3,
        why: "흰 센터와 빨강 센터 사이에 있지만 흰 스티커가 오른쪽을 봐요. 앞으로 쥐고 F로 내려요.",
      },
    },
    {
      kind: "quiz",
      body: "자주 하는 실수: 흰색만 위로 모으고 흰 엣지가 제자리인지 안 보는 것. 옆면을 보면 흰 엣지가 저마다 짝 색 센터 쪽이 아닌 다른 센터 쪽에 있어요.",
      setup: { alg: "U" },
      mask: "cross",
      quiz: {
        question: "이 큐브의 흰 십자는 다 됐을까요?",
        choices: [
          "네, 흰색이 모두 위를 봐요",
          "아니요, 흰 엣지가 제자리가 아니에요",
        ],
        answer: 1,
        why: "흰 엣지 넷이 모두 제자리에 바른 방향으로 있어야 십자예요. 이 큐브는 맞춘 면이 한 번 돌아가 있을 뿐이라 U'로 되돌리면 돼요. 흰 엣지 몇 개만 제자리가 아니면 다섯째 경우대로 내려서 다시 올려요.",
      },
    },
    {
      kind: "try",
      body: "흰 엣지 둘이 흐트러져 있어요. 하나는 가운데 층, 하나는 아래 층이에요. 하나씩 경우를 보고 올려요.",
      setup: { alg: "R' F" },
      alg: "F' y F",
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "try",
      body: "이제 처음부터 해 봐요. 화면의 큐브는 아무렇게나 섞인 상태예요. 흰 십자를 만들어요. 흰 엣지마다 다섯 경우 가운데 어디인지 보고 하나씩 올려요.",
      setup: { rule: "random-cross" },
      goal: "white-cross",
      mask: "cross",
    },
  ],
};

/**
 * 첫 층 코너(2026-11-04 사용자 요청, 2026-11-10 경우별 정해진 길): 흰 면을 위에 둔 채, 넣을 자리를 앞-오른쪽 위로
 * 쥐고(y) 아랫면으로 코너를 그 밑에 둔다(D). 흰색이 오른쪽이면 코너 돌리기 한 번, 아래면 세 번, 앞이면 거꾸로
 * 한 번. 제자리에서 돌아갔으면 오른쪽 두 번, 앞 거꾸로 두 번. 아래층에 흰 코너가 없으면 엉뚱한 자리에 든 것을
 * 한 번 빼서 아래층으로 내린다. 지름길 단계(R' D' R 등)는 2026-11-10에 뺐다(공식을 늘리지 않으려고, 2×2 첫 층은 그대로).
 * 해 보기 차례(진도 번호)는 그대로이고, 지름길의 해 보기 둘만 끝에서 빠졌다. 끝나면 큐브를 뒤집어 흰 면을 아래로 둔다.
 */
const firstCorners: Lesson = {
  id: "333-first-corners-up",
  size: 3,
  title: "첫 층 코너",
  summary:
    "흰 면을 위에 둔 채 흰 코너 넷을 넣어요. 코너 돌리기 공식 하나와 그 거꾸로만 써요. 다 되면 큐브를 뒤집어요.",
  steps: [
    {
      kind: "find",
      body: "앞 단원에서 흰 십자를 만들었어요. 이번에는 흰 십자 둘레의 흰 코너 넷을 제자리에 넣어요. 흰 십자와 흰 코너까지 맞으면 흰 면 쪽 한 층, 「첫 층」이 다 맞아요. 흰 면은 흰 십자를 만든 그대로 위에 둬요. 화면의 큐브는 흰 십자가 맞고, 흰-초록-빨강 코너 블럭이 아래 층에 내려가 있는 상태예요. 넣을 흰 코너는 아래 층에서 찾아요. 흰-초록-빨강 코너 블럭을 눌러 보세요.",
      setup: { alg: setupFor(`D ${TWIST}`) },
      mask: "first-layer",
      find: { piece: "corner", colors: ["U", "F", "R"] },
    },
    {
      kind: "find",
      body: "코너 블럭의 제자리는 그 블럭의 세 색과 같은 색 센터 셋이 만나는 위 구석이에요. 앞면, 오른쪽 면, 윗면이 만나는 구석은 「앞-오른쪽 위」라고 불러요. 다른 구석도 닿은 면 이름을 이어서 「오른쪽-뒤 아래」, 「뒤-왼쪽 위」처럼 불러요. 흰-초록-빨강 코너 블럭은 흰·초록·빨강 센터 사이, 앞-오른쪽 위가 제자리예요. 조각이 아니라 그 자리를 눌러 보세요.",
      setup: { alg: setupFor(`D ${TWIST}`) },
      mask: "first-layer",
      find: { at: ["U", "F", "R"] },
    },
    {
      kind: "find",
      body: "하나 더 해 봐요. 흰-파랑-주황 코너 블럭의 제자리는 어디일까요? 파랑 센터와 주황 센터를 찾고, 그 사이 위 구석을 눌러요. 큐브를 끌어 뒤쪽도 보세요.",
      setup: { alg: setupFor(`D ${TWIST}`) },
      mask: "first-layer",
      find: { at: ["U", "B", "L"] },
    },
    {
      kind: "turn",
      body: "넣을 자리를 앞-오른쪽 위에 두고, 반대 면인 아랫면을 돌려 흰 코너를 그 바로 밑, 앞-오른쪽 아래로 옮겨요. 흰 코너가 앞-왼쪽 아래면 D, 오른쪽-뒤 아래면 D', 뒤-왼쪽 아래면 D2예요. 흰-초록-빨강 코너 블럭은 앞-왼쪽 아래에 있어요. D를 쳐 보세요.",
      setup: { alg: setupFor(`D ${TWIST}`) },
      mask: "first-layer",
      alg: "D",
    },
    {
      kind: "quiz",
      body: "제자리 밑에 왔으면 그 코너 블럭의 흰색이 보는 쪽을 봐요. 「코너 돌리기」 공식 R' D' R D를 써요. 흰색이 오른쪽이면 한 번, 아래면 세 번이에요. 흰색이 앞이면 거꾸로 D' R' D R을 한 번 쳐요.",
      setup: { alg: setupFor(reps(TWIST, 3)) },
      mask: "first-layer",
      quiz: {
        question: "앞-오른쪽 아래 코너는 흰색이 아래를 봐요. 무엇을 칠까요?",
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
      body: "흰색이 오른쪽을 봐요. R' D' R D 한 번.",
      setup: { alg: setupFor(TWIST) },
      alg: TWIST,
      mask: "first-layer",
    },
    {
      kind: "demo",
      body: "흰색이 아래를 봐요. R' D' R D를 세 번. 한 번 칠 때마다 흰색이 보는 쪽이 바뀌어요.",
      setup: { alg: setupFor(reps(TWIST, 3)) },
      alg: reps(TWIST, 3),
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "흰색이 앞을 봐요. 거꾸로 D' R' D R을 한 번 쳐 보세요. R' D' R D를 여섯 번 치면 처음으로 돌아와서, 거꾸로 한 번은 다섯 번 친 것과 같아요.",
      setup: { alg: setupFor(TWIST_BACK) },
      alg: TWIST_BACK,
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "흰-초록-빨강 코너 블럭이 앞-왼쪽 아래에 있어요. D로 제자리 밑에 옮기고, 흰색이 보는 쪽을 보고 넣어 보세요.",
      setup: { alg: setupFor(`D ${TWIST}`) },
      alg: `D ${TWIST}`,
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "look",
      body: "넣을 자리가 앞-오른쪽 위가 아니면 큐브를 돌려 쥐어(y) 그 자리를 앞-오른쪽 위로 가져와요. 오른쪽-뒤 자리는 y, 앞-왼쪽 자리는 y', 뒤-왼쪽 자리는 y2예요. 화면의 큐브는 주황 면이 앞에 오게 돌려 쥔 상태라, 넣을 자리가 오른쪽-뒤예요. 큐브 전체를 돌려 초록 면이 앞에 오게 해 보세요.",
      setup: { alg: setupFor(`y ${TWIST}`) },
      mask: "first-layer",
      look: { color: "F", on: "F" },
    },
    {
      kind: "try",
      body: "화면의 큐브는 다시 주황 면이 앞에 오게 쥔 상태예요. 흰-초록-빨강 코너 블럭이 아래 층에 있고 넣을 자리는 오른쪽-뒤예요. y로 자리를 앞-오른쪽 위로 쥐고, 아랫면으로 그 블럭을 제자리 밑에 옮긴 뒤, 흰색이 보는 쪽대로 넣어 보세요.",
      setup: { alg: setupFor(`y D ${reps(TWIST, 3)}`) },
      alg: `y D ${reps(TWIST, 3)}`,
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "quiz",
      body: "흰 코너가 제자리에 있지만 돌아가 있을 때도 있어요. 그 자리를 앞-오른쪽 위로 쥐고, 흰색이 오른쪽이면 R' D' R D를 두 번, 앞이면 거꾸로 D' R' D R을 두 번 쳐요.",
      setup: { alg: setupFor(reps(TWIST, 2)) },
      mask: "first-layer",
      quiz: {
        question:
          "앞-오른쪽 위 코너는 제자리에 있지만 흰색이 오른쪽을 봐요. 무엇을 칠까요?",
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
      body: "앞-오른쪽 위 코너가 제자리에 있지만 흰색이 앞을 봐요. 거꾸로 D' R' D R을 두 번 쳐 보세요.",
      setup: { alg: setupFor(reps(TWIST_BACK, 2)) },
      alg: reps(TWIST_BACK, 2),
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "demo",
      body: "아래 층에 흰 코너가 없는데 첫 층이 덜 맞았으면, 흰 코너가 엉뚱한 자리에 들어가 있는 거예요. 그 자리를 앞-오른쪽 위로 쥐고 R' D' R D를 한 번 쳐서 아래 층으로 빼요. 지금은 흰-초록-빨강 코너 블럭이 앞-왼쪽 위에 들어가 있어요. y'로 그 자리를 앞-오른쪽 위로 쥐고 빼요. 빼고 나면 아래 층 코너를 넣는 법 그대로예요. 흰-초록-빨강 코너 블럭을 넣으면 그 자리에 있던 흰-주황-초록 코너 블럭이 내려오니, 그것도 같은 법으로 넣어요.",
      setup: { alg: STUCK_CORNER_SETUP },
      alg: STUCK_CORNER,
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "엉뚱한 자리에 든 흰 코너를 빼서 제자리에 넣어 보세요.",
      setup: { alg: STUCK_CORNER_SETUP },
      alg: STUCK_CORNER,
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "quiz",
      body: "자주 하는 실수: 공식을 하다 말고 멈추는 것. R' D'까지 하면 흰 십자 엣지 하나가 잠깐 내려가요. R D까지 끝내면 돌아와요.",
      setup: { alg: "R' D'" },
      mask: "first-layer",
      quiz: {
        question:
          "R' D' R D를 R' D'까지 했더니 흰 십자가 흐트러졌어요. 어떻게 할까요?",
        choices: ["흐트러진 엣지부터 고쳐요", "그대로 R D까지 끝내요"],
        answer: 1,
        why: "R D까지 하면 내려간 엣지가 제자리로 돌아와요.",
      },
    },
    {
      kind: "try",
      body: "이제 처음부터 해 봐요. 화면의 큐브는 흰 십자만 맞고 흰 코너는 흩어진 상태예요. 첫 층을 끝내요. 아래 층의 흰 코너부터 하나씩 넣어요. 자리를 앞-오른쪽 위로 쥐고(y), 흰 코너를 그 밑으로 옮기고(D), 흰색이 보는 쪽대로 공식을 쳐요. 아래 층에 흰 코너가 없으면 엉뚱한 자리에 든 흰 코너를 빼요. 여럿이면 어느 것부터 빼도 돼요.",
      setup: { rule: "white-cross-up" },
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "look",
      body: "첫 층이 끝났어요. 다음 단원부터는 흰 면을 아래에 두고 해요. 큐브 전체를 뒤집어(z2) 흰 면을 아래로 보내 보세요.",
      mask: "first-layer",
      look: { color: "U", on: "D" },
    },
    {
      kind: "quiz",
      body: "큐브만 통째로 돌렸으니 센터 블럭끼리의 자리는 그대로예요. 다만 앞면 쪽으로 반 바퀴 돌아서 오른쪽과 왼쪽이 바뀌었어요.",
      setup: { alg: "z2" },
      mask: "first-layer",
      quiz: {
        question: "뒤집은 뒤 오른쪽 센터는 무슨 색일까요?",
        choices: ["빨강", "주황", "파랑"],
        answer: 1,
        why: "흰 면이 위일 때 왼쪽이던 주황이 오른쪽으로 와요. 앞으로 「오른쪽 주황, 왼쪽 빨강」으로 들고 해요.",
      },
    },
  ],
};

/**
 * 둘째 층(2026-11-10 경우별 정해진 길): 위 층에서 노란색이 없는 엣지 하나를 골라 윗면으로 옆 색을 같은 색 센터
 * 위에 둔다. 그 면을 앞으로 쥐었을 때 위 색이 오른쪽 센터 색이면 앞에서 넣기, 왼쪽 센터 색이면 그 면을 오른쪽으로
 * 쥐고 오른쪽에서 넣기. 위에 넣을 엣지가 없으면 잘못 든 자리를 앞-오른쪽으로 쥐고 앞에서 넣기로 뺀다
 */
const secondLayer: Lesson = {
  id: "333-second-layer",
  size: 3,
  title: "둘째 층 엣지",
  summary:
    "흰 면을 아래로 두고, 가운데 층 엣지 넷을 넣어요. 넣는 공식은 둘이에요.",
  steps: [
    {
      kind: "find",
      body: "앞 단원에서 첫 층을 다 맞추고 큐브를 뒤집어 흰 면을 아래로 보냈어요. 이번에는 흰 면 쪽부터 세어 둘째 층, 곧 가운데 층의 엣지 넷을 제자리에 넣어요. 화면의 큐브는 첫 층까지 맞고 흰 면이 아래에 있는 상태예요. 이제 맞춘 면이 아래라서 윗면이 반대 면이에요. 넣을 엣지는 위 층에 있는, 노란색이 없는 엣지 블럭이에요. 지금 위 층에는 그런 엣지 블럭이 하나 있어요. 눌러 보세요.",
      setup: flip(RIGHT),
      mask: "all",
      find: { piece: "edge", colors: ["F", "L"] },
    },
    {
      kind: "quiz",
      body: "위 층 엣지 블럭에서 옆을 보는 스티커 색을 「옆 색」, 위를 보는 스티커 색을 「위 색」이라고 할게요. 가운데 층 엣지의 제자리는 그 블럭의 두 색과 같은 색 센터 둘 사이예요. 넣는 법은 세 걸음이에요. 먼저 윗면을 돌려 그 블럭을 옆 색과 같은 색 센터 위로 옮겨요. 같은 색 센터가 블럭이 있는 면의 왼쪽 면이면 U, 오른쪽 면이면 U', 맞은편이면 U2예요. 큐브째 돌려 그 면을 앞으로 쥐어요. 그 면이 오른쪽이면 y, 왼쪽이면 y', 뒤면 y2예요. 이제 위 색이 제자리의 나머지 한쪽을 알려 줘요. 위 색이 오른쪽 센터 색이면 제자리가 앞-오른쪽이니 「앞에서 넣기」를 쳐요. 왼쪽 센터 색이면 제자리가 앞-왼쪽이니 y'로 한 번 더 돌려 쥐고 「오른쪽에서 넣기」를 쳐요. y'를 치면 그 면이 오른쪽으로 가고 제자리가 앞-오른쪽에 와요.",
      setup: flip(RIGHT),
      mask: "all",
      quiz: {
        question:
          "위-앞 엣지 블럭은 옆 색 센터인 앞 센터 위에 와 있고, 위 색이 주황이에요. 오른쪽 센터도 주황이에요. 무엇을 칠까요?",
        choices: ["앞에서 넣기", "y'로 쥐고 오른쪽에서 넣기"],
        answer: 0,
        why: "위 색이 오른쪽 센터 색이니 제자리가 앞-오른쪽이에요. 앞에서 넣어요. 다음 시연이 바로 이 모양이에요.",
      },
    },
    {
      kind: "demo",
      body: "앞에서 넣기: U R U' R' U' F' U F. 위-앞 엣지를 앞-오른쪽 자리에 넣어요. 중간에 흰 코너가 잠깐 빠졌다가 끝에 돌아와요.",
      setup: flip(RIGHT),
      alg: RIGHT,
      mask: "f2l",
    },
    {
      kind: "demo",
      body: "오른쪽에서 넣기: U' F' U F U R U' R'. 엣지 블럭이 위-오른쪽에 있고, 옆 색은 오른쪽 센터와, 위 색은 앞 센터와 같을 때 써요. 이때도 제자리는 앞-오른쪽이에요. 앞에서 넣기를 거울에 비춘 모양이고, 이것도 앞-오른쪽 자리에 넣어요.",
      setup: flip(FROM_RIGHT),
      alg: FROM_RIGHT,
      mask: "f2l",
    },
    {
      kind: "try",
      body: "앞에서 넣어 보세요.",
      setup: flip(RIGHT),
      alg: RIGHT,
      goal: "second-layer",
      mask: "f2l",
    },
    {
      kind: "try",
      body: "오른쪽에서 넣어 보세요.",
      setup: flip(FROM_RIGHT),
      alg: FROM_RIGHT,
      goal: "second-layer",
      mask: "f2l",
    },
    {
      kind: "try",
      body: "위-앞 엣지 블럭은 옆 색 센터인 앞 센터 위에 와 있고, 위 색이 왼쪽 센터 색이에요. 제자리가 앞-왼쪽이에요. y'로 한 번 더 돌려 쥐고 오른쪽에서 넣어 보세요.",
      setup: { alg: `z2 y' ${setupFor(FROM_RIGHT)} y` },
      alg: `y' ${FROM_RIGHT}`,
      goal: "second-layer",
      mask: "f2l",
    },
    {
      kind: "find",
      body: "자주 하는 실수: 노란색이 붙은 엣지를 넣으려는 것. 노란 엣지는 위 층 조각이에요. 넣으면 안 되는 엣지 블럭, 곧 노란색이 붙은 것을 하나 눌러 보세요.",
      setup: flip(RIGHT),
      mask: "all",
      find: { piece: "edge", has: ["D"] },
    },
    {
      kind: "try",
      body: "위 층에 넣을 엣지가 하나도 없으면 가운데 층에 잘못 들어간 엣지가 있어요. 이 엣지 블럭은 앞-오른쪽 자리에 있지만 뒤집혔어요. 그 자리가 앞-오른쪽이 아니면 큐브째 돌려 앞-오른쪽에 두고, 앞에서 넣기를 한 번 쳐서 빼요. 빠진 엣지는 위 층에 올라와 있으니, 다시 세 걸음대로 넣어요.",
      setup: flip(`${RIGHT} U2 ${RIGHT}`),
      alg: `${RIGHT} U2 ${RIGHT}`,
      goal: "second-layer",
      mask: "f2l",
    },
    {
      kind: "try",
      body: "이번엔 앞-오른쪽 자리에 앞-왼쪽 자리의 엣지 블럭이 들어가 있어요. 위-앞에는 앞-오른쪽이 제자리인 엣지 블럭이 와 있어요. 앞에서 넣기로 그 블럭을 넣으면 잘못 든 엣지 블럭이 빠져요. 빠진 엣지는 위에서 찾아 세 걸음대로 넣어요.",
      setup: flip(`${STUCK_EDGE} y`),
      alg: STUCK_EDGE,
      goal: "second-layer",
      mask: "f2l",
    },
    {
      kind: "try",
      body: "이제 처음부터 해 봐요. 화면의 큐브는 첫 층만 맞고 가운데 층 엣지는 흩어진 상태예요. 둘째 층을 끝내요. 노란색이 없는 위 층 엣지를 하나씩 세 걸음대로 넣어요. 어느 것부터 해도 돼요.",
      setup: { rule: "first-layer-solved" },
      goal: "second-layer",
      mask: "f2l",
    },
  ],
};

// ── 마지막 층(2026-11-04 사용자 요청, 한국 초보자 해법) ──────────────────────
// 노란 십자(엣지 방향) → 옆면 맞추기(엣지 자리) → 코너 자리 → 코너 방향.
// 2026-11-10: 모양마다 쥐는 법과 공식·횟수를 정했다(beginner-path.ts). 같은 공식을 거꾸로 치면 짧은 경우는 거꾸로.

const yellowCross: Lesson = {
  id: "333-ll-cross",
  size: 3,
  title: "노란 십자",
  summary:
    "위 층 엣지의 노란 스티커가 모두 위를 보게 해요. 모양을 보고 공식을 한 번이나 두 번 쳐요.",
  steps: [
    {
      kind: "quiz",
      body: "앞 단원까지 아래 두 층을 다 맞췄어요. 이제 남은 위 층을 맞춰요. 이번에는 위 층 엣지 넷의 노란 스티커가 모두 위를 보게 해서, 노란 센터 둘레에 + 모양 「노란 십자」를 만들어요. 화면의 큐브는 둘째 층까지 맞고 흰 면이 아래에 있는 상태예요. 이 단계에서는 위 층 엣지의 노란 스티커만 보고, 위 층 코너 블럭은 아직 안 봐서 가려 두었어요. 노란 스티커가 위를 보는 엣지로 만든 모양은 넷 가운데 하나예요. 노란 센터 하나뿐인 「점」, 위를 보는 노란 칸 둘이 노란 센터와 꺾여 이어진 「ㄱ자」, 둘이 노란 센터를 사이에 두고 한 줄로 놓인 「일자」, 넷 다인 「십자」예요.",
      setup: flip(EO),
      mask: "ll-cross",
      quiz: {
        question: "이 큐브의 윗면은 넷 가운데 어느 모양일까요?",
        choices: ["점", "ㄱ자", "일자", "십자"],
        answer: 2,
        why: "위를 보는 노란 칸 둘이 노란 센터를 사이에 두고 한 줄이에요. 다음 시연이 이 모양을 십자로 만들어요.",
      },
    },
    {
      kind: "demo",
      body: "일자: 일자가 가로(왼쪽-오른쪽)로 놓이게 쥐고 「노란 십자」 공식 F R U R' U' F'을 한 번 치면 십자예요. 세로로 놓여 있으면 U를 한 번 쳐서 가로로 놓아요.",
      setup: flip(EO),
      alg: EO,
      mask: "ll-cross",
    },
    {
      kind: "quiz",
      body: "ㄱ자: 노란 두 칸이 뒤와 왼쪽에 오게 U로 돌리고, 노란 십자 공식을 거꾸로 F U R U' R' F' 한 번 쳐요. 바로 십자가 돼요.",
      setup: { alg: `${setupFor(YELLOW_CROSS_BACK, "z2")} U'` },
      mask: "ll-cross",
      quiz: {
        question: "지금 이 ㄱ자는 어떻게 쥘까요?",
        choices: [
          "U를 돌려 노란 두 칸을 뒤와 왼쪽으로 옮겨요",
          "그대로 공식을 쳐요",
          "노란 두 칸이 앞과 오른쪽에 오게 해요",
        ],
        answer: 0,
        why: "지금 노란 두 칸은 왼쪽과 앞이에요. U를 한 번 돌리면 뒤와 왼쪽이 돼요.",
      },
    },
    {
      kind: "turn",
      body: "U를 쳐서 ㄱ자를 뒤와 왼쪽에 두고, 거꾸로 공식 F U R U' R' F'을 한 번 쳐 보세요.",
      setup: { alg: `${setupFor(YELLOW_CROSS_BACK, "z2")} U'` },
      alg: `U ${YELLOW_CROSS_BACK}`,
      mask: "ll-cross",
    },
    {
      kind: "try",
      body: "ㄱ자예요. 노란 두 칸이 뒤와 왼쪽에 오게 U로 돌리고, 거꾸로 공식을 한 번 쳐 보세요.",
      setup: { alg: `${setupFor(YELLOW_CROSS_BACK, "z2")} U` },
      alg: `U' ${YELLOW_CROSS_BACK}`,
      goal: "yellow-cross",
      mask: "ll-cross",
    },
    {
      kind: "turn",
      body: "점이에요. 지금 쥔 그대로 노란 십자 공식 F R U R' U' F'을 한 번 쳐 보세요. 노란 두 칸이 앞과 오른쪽인 ㄱ자가 생겨요.",
      setup: flip(DOT_TO_CROSS),
      alg: EO,
      mask: "ll-cross",
    },
    {
      kind: "quiz",
      body: "점에서 공식을 한 번 치면 늘 앞과 오른쪽에 ㄱ자가 생겨요. U2로 뒤와 왼쪽에 두고 거꾸로 한 번이면 십자예요.",
      setup: flip(`U2 ${YELLOW_CROSS_BACK}`),
      mask: "ll-cross",
      quiz: {
        question: "점에서 시작하면 공식을 모두 몇 번 칠까요?",
        choices: ["한 번", "두 번", "세 번"],
        answer: 1,
        why: "점에서 공식 한 번, ㄱ자에서 거꾸로 한 번, 모두 두 번이에요.",
      },
    },
    {
      kind: "try",
      body: "점에서 십자까지 가 보세요. 공식 한 번 → U2 → 거꾸로 한 번.",
      setup: flip(DOT_TO_CROSS),
      alg: DOT_TO_CROSS,
      goal: "yellow-cross",
      mask: "ll-cross",
    },
    {
      kind: "try",
      body: "이제 처음부터 해 봐요. 화면의 큐브는 둘째 층까지 맞고 위 층은 섞인 상태예요. 노란 십자를 만들어요. 일자는 가로로 쥐고 공식 한 번, ㄱ자는 뒤와 왼쪽에 두고 거꾸로 한 번, 점은 공식 한 번 뒤 ㄱ자대로 해요.",
      setup: { rule: "second-layer-solved" },
      goal: "yellow-cross",
      mask: "ll-cross",
    },
  ],
};

const llEdges: Lesson = {
  id: "333-ll-edges",
  size: 3,
  title: "옆면 맞추기",
  summary:
    "위 층 엣지 넷을 제자리로 옮겨요. 공식 R U R' U R U2 R' U를 한 번이나 두 번 쳐요.",
  steps: [
    {
      kind: "quiz",
      body: "앞 단원에서 노란 십자를 만들었어요. 노란 스티커는 모두 위를 보지만, 위 층 엣지 블럭이 제자리에 있다는 뜻은 아니에요. 이번에는 위 층 엣지 넷을 제자리로 옮겨요. 이 단계는 흔히 「옆면 맞추기」라고 부르지만, 하는 일은 스티커 색이 아니라 위 층 엣지 블럭의 자리를 맞추는 거예요. 화면의 큐브는 노란 십자까지 맞은 상태이고, 위 층 코너 블럭은 이 단계에서 안 봐서 가려 두었어요. 위 층 엣지의 제자리는 노란 센터와, 그 블럭의 옆 색과 같은 색 센터 사이예요. 그래서 엣지 블럭이 옆 색 센터 바로 위에 있으면 제자리, 다른 센터 위에 있으면 아직 제자리가 아니에요. 지금 모양부터 시작해 U를 한 번씩 치며 제자리에 든 엣지 블럭을 세어 봐요. 둘 이상 제자리에 드는 때가 꼭 있어요. 처음으로 둘 이상 제자리에 들 때 멈춰요. 많아야 세 번 치면 찾아요. 넷 다 제자리면 공식 없이 끝이에요.",
      setup: flip(EDGE_SWAP),
      mask: "ll-edges",
      quiz: {
        question: "지금 제자리에 든 엣지 블럭 둘은 어디일까요?",
        choices: ["앞과 오른쪽", "오른쪽과 뒤", "뒤와 왼쪽", "왼쪽과 앞"],
        answer: 1,
        why: "오른쪽과 뒤가 제자리예요. 제자리인 둘이 이웃해 있으니 이대로 공식을 치면 돼요.",
      },
    },
    {
      kind: "demo",
      body: "제자리인 둘이 이웃해 있으면, 그 둘을 뒤와 오른쪽에 두고 「옆면 맞추기」 공식 R U R' U R U2 R' U를 한 번. 앞과 왼쪽의 엣지 블럭이 서로 자리를 바꿔 넷 다 제자리에 들어요. 위 층 코너 블럭은 흐트러져도 괜찮아요. 다음 단원에서 맞춰요.",
      setup: flip(EDGE_SWAP),
      alg: EDGE_SWAP,
      mask: "ll-edges",
    },
    {
      kind: "quiz",
      body: "제자리인 둘을 찾은 뒤에는 U를 더 돌리지 말고, 큐브째 돌려 쥐어 그 둘을 뒤와 오른쪽으로 가져와요. 제자리인 둘이 앞·오른쪽이면 y', 왼쪽·앞이면 y2, 뒤·왼쪽이면 y예요. U를 돌리면 제자리에 든 엣지 블럭이 다시 자리를 벗어나요.",
      setup: { alg: `${setupFor(EDGE_SWAP, "z2")} y` },
      mask: "ll-edges",
      quiz: {
        question:
          "제자리에 든 엣지 블럭 둘이 앞과 오른쪽이에요. 어떻게 쥘까요?",
        choices: [
          "y'로 쥐어 그 둘을 오른쪽과 뒤로",
          "그대로 공식을 쳐요",
          "U를 돌려 옮겨요",
        ],
        answer: 0,
        why: "y'로 쥐면 앞이 오른쪽, 오른쪽이 뒤로 가요. 그러면 아직 제자리가 아닌 둘이 공식이 서로 바꾸는 앞과 왼쪽에 와요.",
      },
    },
    {
      kind: "try",
      body: "y'로 돌려 쥐고 공식을 쳐 보세요.",
      setup: { alg: `${setupFor(EDGE_SWAP, "z2")} y` },
      alg: `y' ${EDGE_SWAP}`,
      goal: "yellow-edges",
      mask: "ll-edges",
    },
    {
      kind: "quiz",
      body: "제자리인 둘이 마주 볼 때도 있어요. 그 둘이 앞과 뒤에 오게 쥐고(왼쪽·오른쪽이면 y) 공식을 한 번 쳐요. 공식을 친 뒤에는 처음부터 다시 세요. 이 경우는 늘 U'를 한 번 치면 앞과 오른쪽이 제자리에 들어요. y'로 쥐어 그 둘을 뒤와 오른쪽에 두고 한 번 더 쳐요.",
      setup: flip(EDGE_OPPOSITE),
      mask: "ll-edges",
      quiz: {
        question: "제자리인 엣지 블럭 둘이 마주 보면 공식을 모두 몇 번 칠까요?",
        choices: ["한 번", "두 번", "네 번"],
        answer: 1,
        why: "앞·뒤에 두고 한 번, U' 뒤 y'로 쥐고 한 번, 모두 두 번이에요.",
      },
    },
    {
      kind: "turn",
      body: "U를 한 번 치면 앞과 뒤의 엣지 블럭이 제자리에 들어요. 제자리인 둘이 벌써 앞과 뒤라 돌려 쥐지 않고 공식을 한 번 쳐 보세요.",
      setup: flip(EDGE_OPPOSITE),
      alg: `U ${EDGE_SWAP}`,
      mask: "ll-edges",
    },
    {
      kind: "try",
      body: "이어서 해 보세요. U'를 치면 앞과 오른쪽이 제자리에 들어요. y'로 쥐어 그 둘을 뒤와 오른쪽에 두고 한 번 더.",
      setup: { alg: `${setupFor(EDGE_OPPOSITE, "z2")} U ${EDGE_SWAP}` },
      alg: `U' y' ${EDGE_SWAP}`,
      goal: "yellow-edges",
      mask: "ll-edges",
    },
    {
      kind: "try",
      body: "이제 처음부터 해 봐요. 화면의 큐브는 노란 십자까지 맞은 상태예요. 위 층 엣지 넷을 제자리로 옮겨요. 끝나면 U를 한 번씩 쳐서 위 층 엣지 넷이 모두 제자리에 드는 곳에서 멈춰요.",
      setup: { rule: "ll-cross-solved" },
      goal: "yellow-edges",
      mask: "ll-edges",
    },
  ],
};

const llCornerPlace: Lesson = {
  id: "333-ll-corner-place",
  size: 3,
  title: "코너 자리",
  summary:
    "위 층 코너를 방향은 상관없이 제자리로 옮겨요. 공식이나 그 거꾸로를 한 번이나 두 번 쳐요.",
  steps: [
    {
      kind: "quiz",
      body: "앞 단원에서 위 층 엣지 넷을 제자리로 옮겼어요. 이번에는 위 층 코너 블럭 넷을 제자리로 옮겨요. 방향은 다음 단원에서 맞추니, 제자리에 들기만 하면 노란색이 옆을 봐도 돼요. 화면의 큐브는 위 층 엣지까지 맞은 상태예요. 첫 층에서처럼 코너 블럭의 제자리는 그 블럭의 세 색과 같은 색 센터 셋이 만나는 구석이에요.",
      setup: flip(CORNER_PLACED_TWISTED),
      quiz: {
        question:
          "앞-오른쪽 위 코너는 노랑·초록·주황 코너 블럭이에요. 이 블럭은 제자리일까요? 방향은 상관없어요.",
        choices: ["네, 제자리예요", "아니요, 노란색이 위를 봐야 해요"],
        answer: 0,
        why: "앞-오른쪽 위는 초록·주황·노랑 센터가 만나는 구석이라, 노랑-초록-주황 코너 블럭의 제자리예요. 방향은 다음 단원에서 맞춰요.",
      },
    },
    {
      kind: "demo",
      body: "제자리에 든 코너 블럭을 큐브째 돌려 쥐어 앞-오른쪽 위에 둬요. 그 블럭이 오른쪽-뒤 위면 y, 앞-왼쪽 위면 y', 뒤-왼쪽 위면 y2예요. 그다음 「코너 자리」 공식 U R U' L' U R' U' L을 쳐요. 공식 밖에서 윗면만 따로 돌리면 위 층 엣지가 어긋나요. 앞-오른쪽 위는 그대로 두고 남은 코너 셋이 자리를 돌아요. 앞-왼쪽 위 코너는 뒤-오른쪽 위로, 뒤-오른쪽은 뒤-왼쪽으로, 뒤-왼쪽은 앞-왼쪽으로 가요. 위 층 엣지는 그대로예요.",
      setup: flip(CORNER_CYCLE),
      alg: CORNER_CYCLE,
    },
    {
      kind: "quiz",
      body: "그래서 무엇을 칠지는 앞-왼쪽 위 코너만 보면 정해져요. 그 코너 블럭의 제자리가 대각선 건너편인 뒤-오른쪽 위면 공식을 한 번, 바로 뒤인 뒤-왼쪽 위면 거꾸로 L' U R U' L U R' U'를 한 번 쳐요.",
      setup: flip(CORNER_CYCLE_BACK),
      quiz: {
        question:
          "앞-오른쪽 위가 제자리예요. 앞-왼쪽 위 코너의 제자리는 바로 뒤, 뒤-왼쪽 위예요. 무엇을 칠까요?",
        choices: ["공식 한 번", "거꾸로 한 번"],
        answer: 1,
        why: "바로 뒤로 가야 하니 거꾸로예요. 공식은 앞-왼쪽 코너를 대각선 건너편으로 보내요.",
      },
    },
    {
      kind: "turn",
      body: "거꾸로 공식 L' U R U' L U R' U'를 한 번 쳐 보세요. 위 층 코너 넷이 모두 제자리로 가요.",
      setup: flip(CORNER_CYCLE_BACK),
      alg: CORNER_CYCLE_BACK,
    },
    {
      kind: "try",
      body: "제자리 코너가 앞-오른쪽 위에 있어요. 앞-왼쪽 위 코너의 제자리를 보고, 공식이나 거꾸로를 한 번 쳐 보세요.",
      setup: flip(CORNER_CYCLE),
      alg: CORNER_CYCLE,
      goal: "ll-corners-placed",
    },
    {
      kind: "try",
      body: "제자리 코너가 다른 구석에 있어요. 큐브를 돌려 쥐어 그것을 앞-오른쪽 위로 가져오고, 앞-왼쪽 위 코너를 보고 쳐 보세요.",
      setup: { alg: `${setupFor(CORNER_CYCLE, "z2")} y` },
      alg: `y' ${CORNER_CYCLE}`,
      goal: "ll-corners-placed",
    },
    {
      kind: "quiz",
      body: "제자리 코너는 없거나, 하나거나, 넷이에요. 넷이면 이 단원은 끝이에요. 하나도 없을 때가 있어요.",
      setup: flip(CORNERS_NONE),
      quiz: {
        question: "제자리 코너가 하나도 없어요. 어떻게 할까요?",
        choices: [
          "지금 쥔 그대로 공식을 한 번 쳐요",
          "윗면을 돌려 맞춰요",
          "처음부터 다시 섞어요",
        ],
        answer: 0,
        why: "지금 쥔 그대로 한 번 치면 제자리 코너가 꼭 하나 생겨요. 그다음은 하나일 때처럼 해요. 윗면을 돌리면 위 층 엣지가 어긋나요.",
      },
    },
    {
      kind: "try",
      body: "제자리 코너가 없어요. 그대로 공식을 한 번 치고, 생긴 제자리 코너를 앞-오른쪽 위로 쥔 뒤 앞-왼쪽 위 코너를 보고 한 번 더.",
      setup: flip(CORNERS_NONE),
      alg: CORNERS_NONE,
      goal: "ll-corners-placed",
    },
    {
      kind: "try",
      body: "이제 처음부터 해 봐요. 화면의 큐브는 위 층 엣지까지 맞은 상태예요. 위 층 코너 블럭 넷을 제자리로 옮겨요.",
      setup: { rule: "ll-edges-solved" },
      goal: "ll-corners-placed",
    },
  ],
};

const llCornerTwist: Lesson = {
  id: "333-ll-corner-twist",
  size: 3,
  title: "코너 방향",
  summary:
    "마지막 단계예요. 돌아간 코너마다 코너 돌리기 공식을 두 번, 또는 거꾸로 두 번 쳐요. 코너 블럭 하나를 마치고 다음 것으로 갈 때는 윗면만 돌려요.",
  steps: [
    {
      kind: "quiz",
      body: "앞 단원에서 위 층 코너 블럭 넷을 제자리로 옮겼어요. 이번이 마지막 단계예요. 제자리에서 돌아간 코너 블럭을 바른 방향으로 돌려 노란색이 위를 보게 해요. 화면의 큐브는 코너 블럭이 모두 제자리에 있고, 그 가운데 둘이 돌아가 있는 상태예요. 첫 층에서 쓴 코너 돌리기 공식을 다시 써요. 흰 면은 아래 그대로 둬요. U를 한 번씩 쳐서 노란색이 위를 보지 않는 코너 블럭을 앞-오른쪽 위로 가져와요. 위 층이 잠깐 어긋나도 괜찮아요. 다 끝난 뒤 윗면을 돌려 맞춰요. 노란색이 오른쪽을 보면 R' D' R D를 두 번, 앞을 보면 거꾸로 D' R' D R을 두 번 쳐요.",
      setup: flip(TWIST_TWO_BACK),
      quiz: {
        question: "앞-오른쪽 위 코너의 노란색이 오른쪽을 봐요. 무엇을 칠까요?",
        choices: [
          "R' D' R D 두 번",
          "거꾸로 D' R' D R 두 번",
          "R' D' R D 한 번",
        ],
        answer: 0,
        why: "오른쪽이면 R' D' R D 두 번, 앞이면 거꾸로 두 번이에요.",
      },
    },
    {
      kind: "turn",
      body: "R' D' R D를 두 번 쳐 보세요. 앞-오른쪽 위 코너 블럭의 노란색이 위로 와요. 그런데 아래 두 층을 보세요.",
      setup: flip(TWIST_TWO_BACK),
      alg: reps(TWIST, 2),
    },
    {
      kind: "quiz",
      body: "코너 돌리기 공식은 맞춘 면인 아랫면도 돌리는 위험한 회전이라 아래 두 층이 잠깐 흐트러져요. 코너 블럭마다 공식을 정한 횟수만큼 끝까지 치고, 다음 코너 블럭은 윗면만 돌려 가져오면 마지막에 모두 돌아와요. 자주 하는 실수: 아래 두 층이 흐트러져 놀라서 고치려는 것. 남은 코너까지 다 돌리면 아래 두 층은 돌아와요. 그 사이에 큐브를 통째로 돌려 쥐거나 아랫면을 따로 돌리면 안 돼요.",
      setup: {
        alg: `${setupFor(TWIST_TWO_BACK, "z2")} ${reps(TWIST, 2)}`,
      },
      quiz: {
        question:
          "아래 두 층이 흐트러졌어요. 돌아간 다음 코너 블럭은 어떻게 앞-오른쪽 위로 가져올까요?",
        choices: [
          "윗면(U)만 돌려요",
          "큐브를 돌려 쥐어요(y)",
          "먼저 흐트러진 아래 층을 고쳐요",
        ],
        answer: 0,
        why: "윗면만 돌리면 공식이 늘 같은 앞-오른쪽 아래를 쓰게 돼요. 그래야 마지막에 아래 두 층이 돌아와요.",
      },
    },
    {
      kind: "turn",
      body: "U를 한 번 쳐서 돌아간 다음 코너 블럭을 앞-오른쪽 위로 가져와요. 노란색이 앞을 보니 거꾸로 D' R' D R을 두 번 쳐 보세요. 아래 두 층이 돌아와요.",
      setup: {
        alg: `${setupFor(TWIST_TWO_BACK, "z2")} ${reps(TWIST, 2)}`,
      },
      alg: `U ${reps(TWIST_BACK, 2)}`,
    },
    {
      kind: "turn",
      body: "코너 블럭을 다 돌렸으면 위 층 조각이 모두 한 칸 비켜나 있어요. 윗면을 돌려 제자리로 돌려 놓아요. U'를 쳐 보세요.",
      setup: {
        alg: `${setupFor(TWIST_TWO_BACK, "z2")} ${reps(TWIST, 2)} U ${reps(TWIST_BACK, 2)}`,
      },
      alg: "U'",
    },
    {
      kind: "try",
      body: "이번엔 돌아간 코너가 셋이에요. U를 한 번씩 쳐서 돌아간 코너 블럭이 앞-오른쪽 위에 오면 멈추고, 노란색이 보는 쪽대로 쳐요. 다 끝나면 U를 한 번씩 쳐서 위 층 조각이 모두 제자리에 드는 곳에서 멈춰요. 중간에 아래 두 층이 흐트러져도 끝까지 가요.",
      setup: flip(TWIST_THREE),
      alg: TWIST_THREE,
      goal: "solved",
    },
    {
      kind: "try",
      body: "이제 처음부터 해 봐요. 화면의 큐브는 위 층 코너 블럭이 모두 제자리에 있고 방향만 남은 상태예요. 끝까지 맞춰요. 돌아간 코너는 둘, 셋, 넷 가운데 하나예요. 이것까지 맞추면 큐브를 처음부터 끝까지 맞추는 법을 다 배운 거예요.",
      setup: { rule: "ll-corners-placed" },
      goal: "solved",
    },
  ],
};

export const BEGINNER_333: Course = {
  id: "333-beginner",
  size: 3,
  title: "3×3 처음 맞추기(층별)",
  summary: "큐브를 처음 만지는 사람도 순서대로 따라 하면 끝까지 맞춰요.",
  lessons: [
    start,
    pieces,
    notation,
    safeTurns,
    whiteCross,
    firstCorners,
    secondLayer,
    yellowCross,
    llEdges,
    llCornerPlace,
    llCornerTwist,
  ],
};
