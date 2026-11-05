// 3×3 초보자 층별 맞추기(docs/47 8-2). 처음부터 끝까지 순서대로 따라 하면 다 맞춘다.
// 처음엔 기본 방향(위 흰, 앞 초록)으로 들고 흰 십자와 첫 층 코너를 맞춘 뒤, 큐브를 뒤집어(z2) 흰 면을 아래로 둔다.
// 「직접 해보기」의 상황은 모범 답의 거꾸로로 만든다(setupFor). 시험이 상황 → 모범 답 → 목표를 확인한다.
// 글만 읽고 넘기는 단계는 두지 않는다: 설명은 둘러보기·조각 찾기·고르기 문제·따라 하기에 얹는다(types.ts).
import { invertAlg, setupFor } from "./notation";
import type { Course, Lesson } from "./types";

export const SEXY = "R U R' U'";
const RIGHT = "U R U' R' U' F' U F";
/** 둘째 층 오른쪽에서 넣기: 오른쪽 위 엣지를 앞-오른쪽 칸으로(앞에서 넣기를 거울에 비춘 꼴) */
const FROM_RIGHT = "U' F' U F U R U' R'";
const EO = "F R U R' U' F'";
export const SUNE = "R U R' U R U2 R'";
/** 코너 방향을 먼저 맞추는 방식에서 쓰는 공식(소개만, 방향을 지키며 코너 셋의 자리를 바꾼다) */
export const A_PERM = "R' F R' B2 R F' R' B2 R2";
/** 옆면 맞추기: 뒤·오른쪽 엣지를 두고 앞·왼쪽 엣지를 바꾼다(수네 + U) */
export const EDGE_SWAP = `${SUNE} U`;
/** 코너 자리: 앞-오른쪽 위를 두고 나머지 셋의 자리를 돌린다 */
export const CORNER_CYCLE = "U R U' L' U R' U' L";
/** 초보자 코너 방향 공식. 첫 층(흰 면 위)과 마지막 층 코너 방향(노란 면 위)에 같은 것을 쓴다 */
export const CORNER_TWIST = "R' D' R D";

/** 같은 공식 k번 */
export const reps = (alg: string, k: number) =>
  Array.from({ length: k }, () => alg).join(" ");

// 마지막 층 상황(풀이의 거꾸로로 만든다). ll-beginner.test.ts가 모양·쥐는 법·횟수를 엔진으로 확인한다
/** 점 → (한 번) ㄱ자 → U2로 뒤·왼쪽 → (한 번) 가로줄 → (한 번) 십자 */
export const DOT_TO_CROSS = `${EO} U2 ${EO} ${EO}`;
/** 맞은 두 엣지가 마주 봄(일자): U로 앞·뒤를 맞추고 한 번 → U'로 앞·오른쪽이 맞음 → y'로 쥐고 한 번 */
export const EDGE_OPPOSITE = `${EDGE_SWAP} U2 ${EDGE_SWAP}`;
/** 제자리 코너가 없음: 한 번 → 앞-왼쪽 위가 제자리 → y'로 쥐고 한 번 */
export const CORNERS_NONE = `${CORNER_CYCLE} y' ${CORNER_CYCLE}`;
/** 앞-오른쪽 위는 노랑이 오른쪽(두 번), U로 오는 다음 것은 노랑이 앞(네 번) */
export const TWIST_TWO = `${reps(CORNER_TWIST, 2)} U ${reps(CORNER_TWIST, 4)} U'`;
/** 돌아간 코너 셋, 모두 두 번씩 */
export const TWIST_THREE = `${reps(CORNER_TWIST, 2)} U ${reps(CORNER_TWIST, 2)} U ${reps(CORNER_TWIST, 2)} U2`;
/** 코너 자리 문제: 앞-오른쪽 위가 제자리지만 돌아가 있음 */
export const CORNER_PLACED_TWISTED = `${CORNER_CYCLE} ${TWIST_TWO}`;

const flip = (solution: string) => ({ alg: setupFor(solution, "z2") });

// 흰 십자의 경우별 상황(흰 면 위, 기본 방향)과 모범 답. where는 처음 엣지 자리. 시험이 엔진으로 자리·방향을 확인한다.
// 흰 면(위)은 돌리지 않고, 엣지는 늘 앞면으로 내리고 올린다(2026-11-05 사용자 「항상 D면으로 내려서 옮겨서 올려」):
// 넣을 자리를 큐브 돌리기(y)로 앞에 가져오고, 아랫면으로 자리 밑에 둔 뒤 앞면으로 올린다. 수는 F·D·y뿐이다.
// 모범 답은 배우는 방식 해법(`@game/cube-ai` nextCrossEdge)이 같은 상황에서 내는 수와 같다(이어진 같은 면 수는 합친 꼴)
/** 가운데 줄, 옆색이 앞 센터와 같음: 흰-초록이 앞-오른쪽, 흰색이 오른쪽. 내렸다 올리는 F F2를 합치면 F' */
export const CROSS_MIDDLE = {
  setup: "F",
  alg: "F'",
  where: "앞-오른쪽, 흰색이 오른쪽을 봐요",
};
/** 가운데 줄: 흰-빨강이 앞-오른쪽, 흰색이 앞. y로 빨강 면을 앞으로 가져와 앞면으로 올린다 */
export const CROSS_MIDDLE_R = {
  setup: "R'",
  alg: "y F",
  where: "앞-오른쪽, 흰색이 앞을 봐요",
};
/** 가운데 줄, 옆색이 다른 면: 앞면으로 내리고, 아랫면으로 비켜 놓고, 되돌린 뒤 y로 돌려 반 바퀴 */
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
/** 아래층, 흰색이 옆: 앞면을 비켜 놓고 아랫면으로 앞 밑에 옮겨 가운데 줄로 올린 뒤, y로 돌려 앞면으로 올린다 */
export const CROSS_DOWN_SIDE = {
  setup: "B R B' D'",
  alg: "F D' F' y F",
  where: "아래-오른쪽",
};
export const CROSS_DOWN_SIDE_TRY = {
  setup: "R F R' D'",
  alg: "y F' D F y' F'",
  where: "아래-앞",
};
/** 윗층 제자리에서 뒤집힘: 앞면으로 가운데 줄에 내리면 비켜 놓기 경우 */
export const CROSS_FLIPPED = {
  setup: "R F R' D' F2",
  alg: "F y F' D' F y' F2",
  where: "위-앞",
};
export const CROSS_FLIPPED_TRY = {
  setup: "B R B' D' R2",
  alg: "F' y F' y' F D y F2",
  where: "위-오른쪽",
};
/** 윗층 흰색 위, 엉뚱한 자리(두 엣지가 자리를 바꿈): 반 바퀴로 내려 첫째 경우 */
export const CROSS_WRONG_TOP = {
  setup: "R2 D' F2 D R2",
  alg: "F2 D y F2 D' y' F2",
  where: "위-앞",
};
export const CROSS_WRONG_TOP_TRY = {
  setup: "R2 D2 L2 D2 R2",
  alg: "y F2 D2 y2 F2 D2 y2 F2",
  where: "위-오른쪽",
};

/**
 * 첫 층(흰 면 위): 앞-오른쪽 위 칸에 흰-파랑-빨강이 박힘. R' D' R D로 빼고, D로 제 칸(오른쪽-뒤) 밑에 옮기고,
 * y로 쥐어 넣는다. y'로 돌아오면 처음 칸 밑에 흰-초록-빨강이 흰색 오른쪽으로 와 있어 한 번이면 들어간다
 */
export const STUCK_CORNER_UP = `${CORNER_TWIST} D y ${CORNER_TWIST} y' ${CORNER_TWIST}`;
/** 둘째 층: 앞-오른쪽 칸에 앞-왼쪽 칸의 엣지가 박힘 */
const STUCK_EDGE = `${RIGHT} U' y' ${RIGHT} y`;

// 「큐브의 조각」에서 따라가는 수와 마무리 해 보기(시험이 엔진으로 자리·정답을 확인한다)
/** 흰-초록-빨강 코너 블럭을 R U2로 옮기면 위-앞-왼쪽 자리로 간다. 되돌리기 U2 R' */
export const TRACK_CORNER = "R U2";
/** 흰-초록 엣지 블럭을 F R로 옮기면 위-오른쪽 자리로 간다. 되돌리기 R' F' */
export const TRACK_EDGE = "F R";
/** 윗층 엣지 블럭 셋만 자리를 돌림(Ua 퍼뮤). 흰 면은 다 흰색이고 코너·아래 두 층은 맞음 */
export const EDGE_CYCLE = "R U' R U R U R U' R' U' R2";
/** 흰-초록 엣지 블럭이 제자리에서 뒤집힘(다른 조각은 가린다) */
export const FLIPPED_EDGE = "R U' R' F'";
/** 흰-초록-빨강 코너 블럭이 제자리에서 돌아감 */
export const TWISTED_CORNER = "R' F'";

/** 평가 그림 (나): 흰 조각 여덟이 제자리·바른 방향(첫 층 다 맞음). 나머지 두 층만 흐트러뜨린다(x2로 뒤집어 아래 두 층 공식) */
export const LAYER_DONE =
  "x2 U R U' R' U' F' U F U2 R U R' U R U2 R' U' F R U R' U' F' x2";
/** 평가 그림 (가): (나)에서 윗층 조각의 자리만 모두 바꿈(H퍼뮤 + U). 흰 면은 다 흰색이지만 옆면 첫 줄이 다 틀림 */
export const FACE_ONLY = `${LAYER_DONE} M2 U M2 U2 M2 U M2 U`;

/**
 * 준비 1 「큐브와 만나기」(2026-11-04 사용자가 정한 처음 흐름): 환영 → 스티커가 아니라 조각 → 센터 세기 →
 * 가상 분해·조립(축 → 센터 → 엣지 → 코너) → 모두 몇 개. 공식은 하나도 외우지 않는다.
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
      body: "면 한가운데에는 색이 하나뿐인 「센터 블럭」이 있어요. 까만 큐브에서 센터 블럭을 모두 눌러 세어 보세요. 누르면 색이 드러나요. 뒤쪽은 끌어서 둘러보거나 펼친 그림에서 눌러요.",
      mask: "none",
      find: { piece: "center" },
      count: 6,
    },
    {
      kind: "find",
      body: "센터 블럭 여섯의 색 배치는 정해져 있어요(표준 색 배치). 흰색 맞은편에는 노란색, 초록색 맞은편에는 파란색, 빨간색 맞은편에는 주황색이 위치해요. 이 까만 큐브는 흰색이 위예요. 흰색 맞은편 노란색 센터 블럭을 찾아 눌러 보세요. 아래쪽은 끌어서 둘러보거나 펼친 그림에서 눌러요.",
      mask: "none",
      find: { piece: "center", colors: ["D"] },
    },
    {
      kind: "quiz",
      body: "이번엔 앞도 정해요. 흰색이 위, 초록색이 앞이에요(두 센터 블럭만 색을 보였어요). 맞은편 짝만 지키면 오른쪽에는 빨간색도 주황색도 올 수 있을 것 같지만, 표준 색 배치는 하나로 정해져 있어요.",
      mask: "centers:UF",
      quiz: {
        question: "흰색이 위, 초록색이 앞이면 오른쪽 센터 블럭은?",
        choices: ["빨간색", "주황색", "파란색"],
        answer: 0,
        why: "흰색 위·초록색 앞이면 빨간색이 오른쪽, 주황색이 왼쪽에 위치해요. 파란색은 초록색 맞은편이라 뒤예요. 빨간색과 주황색을 바꾸면 거울에 비친 큐브가 돼요. 그러면 코너 블럭의 세 색 차례가 거꾸로라 블럭을 어떻게 끼워도 맞출 수 없어요. 다음 단계에서 직접 끼우며 확인해 봐요.",
      },
    },
    {
      kind: "build",
      body: "큐브 속은 어떻게 생겼을까요? 맞춘 큐브를 가상으로 분해한 뒤 축 → 센터 블럭 → 엣지 블럭 → 코너 블럭 차례로 다시 끼워 봐요. 붙은 색이 하나, 둘, 셋으로 늘어요.",
    },
    {
      kind: "quiz",
      body: "센터 블럭 6, 엣지 블럭 12, 코너 블럭 8을 끼웠어요. 큐브 속 한가운데는 축이라 돌아가지 않아요.",
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
  summary: "보고 싶은 블럭만 색을 넣고 돌려 봐요. 색이 아니라 블럭을 옮겨요.",
  steps: [
    {
      kind: "play",
      body: "센터 블럭만 색을 넣었어요. 아무 면이나 마음대로 돌려 보세요. 면을 돌려도 센터 블럭은 제자리에서 돌기만 해요. 가운데 층(M·E·S)을 돌리면 센터 블럭이 함께 옮겨 가지만, 서로의 차례는 그대로예요.",
      play: { focus: { piece: "center" }, turns: 5, choose: true },
    },
    {
      kind: "play",
      body: "이번엔 흰-초록 엣지 블럭과 센터 블럭만 색이 있어요. 아무 면이나 돌려 보며 이 엣지 블럭을 따라가 보세요. 엣지 블럭은 엣지 자리로만 다녀요. 「다른 조각 보기」로 다른 블럭도 따라가 볼 수 있어요.",
      play: {
        focus: { colors: ["U", "F"] },
        centers: true,
        moved: 3,
        choose: true,
      },
    },
    {
      kind: "play",
      body: "흰-초록-빨강 코너 블럭이에요. 코너 블럭은 코너 자리로만 다녀요. 엣지 자리로는 절대 가지 않아요.",
      play: {
        focus: { colors: ["U", "F", "R"] },
        centers: true,
        moved: 3,
        choose: true,
      },
    },
    {
      kind: "play",
      body: "흰-빨강 엣지 블럭과 흰-빨강-파랑 코너 블럭이에요. 블럭의 색은 함께 다녀요. 아무리 돌려도 스티커 한 장만 따로 떨어지는 일은 없어요.",
      play: {
        focus: [{ colors: ["U", "R"] }, { colors: ["U", "R", "B"] }],
        turns: 6,
      },
    },
    {
      kind: "find",
      body: `확인해 봐요. ${TRACK_EDGE}을 돌렸고, 센터 블럭만 보여요. 흰-초록 엣지 블럭은 지금 어디 있나요? 눌러 보세요. 막히면 「보통」으로 색을 볼 수 있어요.`,
      setup: { alg: TRACK_EDGE },
      mask: "centers",
      find: { piece: "edge", colors: ["U", "F"] },
    },
    {
      kind: "find",
      body: `이번엔 ${TRACK_CORNER}을 돌렸어요. 흰-초록-빨강 코너 블럭은 지금 어디 있나요?`,
      setup: { alg: TRACK_CORNER },
      mask: "centers",
      find: { piece: "corner", colors: ["U", "F", "R"] },
    },
    {
      kind: "find",
      body: "블럭마다 돌아갈 「제자리」가 있어요. 센터 블럭은 움직이지 않으니, 제자리는 블럭의 색과 같은 센터 블럭들이 정해요. 초록-주황 엣지 블럭의 제자리(초록·주황 센터 블럭 사이)를 눌러 보세요. 블럭이 아니라 자리를 찾아요.",
      setup: { alg: "R U F" },
      mask: "centers",
      find: { at: ["F", "L"] },
    },
    {
      kind: "try",
      body: "맞춘 큐브에서 윗면(U)을 한 번 돌렸어요. 흰 면은 그대로 다 흰색이죠? 그런데 윗층 엣지·코너 블럭이 모두 한 칸씩 옮겨 가서 제자리가 아니에요. 옆면 윗줄 색이 그 아래 센터 블럭 색과 달라요. 윗면을 돌려 블럭들을 제자리로 돌려 놓아 보세요. 표기는 아직 몰라도 괜찮아요: 놀이판처럼 면을 이리저리 돌려 보고, 막히면 힌트의 키를 눌러요.",
      setup: { alg: "U" },
      alg: "U'",
      goal: "solved",
      mask: "all",
    },
    {
      kind: "find",
      body: "흰 면은 다 흰색인데, 윗층 엣지 블럭 몇 개가 서로 자리를 바꿨어요. 옆 색이 바로 아래 센터 블럭 색과 다른 엣지 블럭을 모두 눌러 보세요. 흰색이 위를 봐도(방향은 맞아도) 자리가 틀린 블럭이에요.",
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
        question: "다음 중 한 면을 맞춘 상태는?",
        choices: ["(가)", "(나)"],
        answer: 1,
        why: "(가)는 앞에서 센 블럭처럼 흰색이 위를 보기만 하고 자리가 틀려, 옆면 윗줄이 센터 블럭 색과 달라요. (나)는 흰 블럭 여덟이 제자리에 바른 방향으로 있어요.",
        pictures: [{ alg: FACE_ONLY }, { alg: LAYER_DONE }],
      },
    },
    {
      kind: "quiz",
      body: "거꾸로, 제자리에 있어도 뒤집혀 있을 수 있어요. 흰-초록 엣지 블럭만 보이게 가렸어요. 흰 센터 블럭과 초록 센터 블럭을 보며 판단해요.",
      setup: { alg: FLIPPED_EDGE },
      mask: "piece:UF",
      quiz: {
        question: "흰-초록 엣지 블럭은 지금 어떤 상태인가요?",
        choices: ["제자리, 바른 방향", "제자리지만 뒤집혔어요", "다른 자리"],
        answer: 1,
        why: "흰 센터 블럭과 초록 센터 블럭 사이에 있지만 흰 칸이 초록 면을 봐요. 엣지 블럭은 한 자리에서 두 가지 방향이 있어요.",
      },
    },
    {
      kind: "quiz",
      body: "코너 블럭도 제자리에서 돌아가 있을 수 있어요. 흰-초록-빨강 코너 블럭이 제자리에 있지만 흰색이 위를 보지 않아요.",
      setup: { alg: TWISTED_CORNER },
      mask: "piece:UFR",
      quiz: {
        question: "코너 블럭은 한 자리에서 몇 가지 방향으로 놓일 수 있을까요?",
        choices: ["두 가지", "세 가지", "네 가지"],
        answer: 1,
        why: "흰색이 위, 앞, 오른쪽을 보는 세 가지예요. 바른 방향은 그중 하나뿐이에요.",
      },
    },
    {
      kind: "quiz",
      body: "정리해 봐요. 블럭에는 「자리」와 「방향」 두 가지가 있어요. 자리 ✓·방향 ✓ = 맞음. 자리 ✓·방향 ✗ = 뒤집힘·돌아감(방금 본 둘). 자리 ✗·방향 ✓ = 색만 위를 봄(U 한 번, 앞에서 센 엣지 블럭). 자리 ✗·방향 ✗ = 둘 다 틀림.",
      mask: "all",
      quiz: {
        question: "블럭 하나를 맞췄다고 하려면?",
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
      body: "흰-초록 엣지 블럭만 보여요. 흰 센터 블럭과 초록 센터 블럭 사이로, 흰 칸이 위를 보게 돌려 놓아 보세요. 자리와 방향 둘 다요. 어느 면을 돌려도 되고, 되돌리고 싶으면 반대쪽으로 한 번 더 돌려요.",
      setup: { alg: TRACK_EDGE },
      alg: "R' F'",
      goal: "piece:UF",
      mask: "piece:UF",
    },
    {
      kind: "try",
      body: "이번엔 흰-초록-빨강 코너 블럭이에요. 제자리(흰·초록·빨강 센터 블럭 사이)로, 흰색이 위를 보게 돌려 놓아 보세요. 다른 블럭은 신경 쓰지 않아도 돼요.",
      setup: { alg: TRACK_CORNER },
      alg: "U2 R'",
      goal: "piece:UFR",
      mask: "piece:UFR",
    },
    {
      kind: "quiz",
      body: "앞으로 배울 공식은 모두 「어떤 블럭을 어디로 옮기는가」예요. 스티커 색이 아니라 블럭을 보고 제자리·바른 방향으로 옮겨요.",
      mask: "all",
      quiz: {
        question:
          "다음 단원들에서 배울 「흰 십자」는 무엇을 옮기는 단계일까요?",
        choices: [
          "흰색이 붙은 엣지 블럭 넷을 제자리로",
          "흰 스티커 아무거나 위로",
          "흰색이 붙은 코너 블럭 넷을 제자리로",
        ],
        answer: 0,
        why: "흰 십자는 흰 엣지 블럭 넷을 흰 센터 블럭과 옆 센터 블럭 사이(제자리)로, 흰 칸이 위를 보게 옮기는 단계예요.",
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
      body: "R: 오른쪽 면을 오른쪽에서 봤을 때 시계 방향. 오른쪽 층의 조각 아홉 개(센터 1·엣지 4·코너 4)가 통째로 돌아, 앞면 칸이 위로 올라가요.",
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
      body: "큐브 돌리기는 두 가지에 써요. 맞출 곳을 앞으로 가져올 때(「그 칸을 앞-오른쪽으로 오게 들고」)와 둘러볼 때예요. 둘러본 뒤에는 처음 방향으로 되돌리고 맞춰요. 큐브 전체를 옆으로 돌려 빨강 면이 앞에 오게 해 보세요.",
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
  summary: "맞춘 면은 돌리지 않고, 반대 면을 돌려요.",
  steps: [
    {
      kind: "turn",
      body: "흰 십자를 맞췄어요. 흰 면이 맞춘 면이에요. 그 반대 면(아랫면)을 돌려 보세요. 십자는 그대로예요. 이것이 안전한 회전이에요.",
      setup: { alg: SAFE_SETUP },
      mask: "cross",
      alg: "D",
    },
    {
      kind: "turn",
      body: "이번엔 맞춘 면을 돌려 보세요. 흰 엣지가 옆 센터와 어긋나요. 이것이 위험한 회전이에요.",
      setup: { alg: SAFE_SETUP },
      mask: "cross",
      alg: "U",
      passedText: "흰 엣지가 옆 센터와 어긋났어요.",
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
      body: "앞·오른쪽 같은 옆면은 어느 쪽도 아니에요. 정해진 수 안에서만 써요. 흰 십자·첫 층 코너·둘째 층은 모두 같은 흐름이에요: 맞출 조각을 반대 면 쪽으로 빼고, 반대 면을 돌려 자리 밑에 두고, 정해진 수로 넣어요.",
      setup: { alg: SAFE_SETUP },
      mask: "cross",
      quiz: {
        question: "흰 십자를 지키며 마음껏 돌려도 되는 면은?",
        choices: ["맞춘 면(흰 면)", "반대 면(노란 면)", "옆면(앞·오른쪽 등)"],
        answer: 1,
        why: "반대 면은 흰 십자에 닿지 않아요. 맞춘 면을 돌리면 십자가 어긋나고, 옆면은 흰 엣지를 끌어내려요.",
      },
    },
  ],
};

const whiteCross: Lesson = {
  id: "333-white-cross",
  size: 3,
  title: "흰 십자",
  summary: "흰 센터 둘레에 흰 엣지 넷을 붙여요. 옆면 색까지 맞춰야 해요.",
  steps: [
    {
      kind: "find",
      body: "앞에서 본 것처럼 센터는 움직이지 않고, 엣지 블럭의 제자리는 두 센터 사이예요. 흰 면을 위로 들고, 흰색이 붙은 엣지 블럭 넷을 흰 센터 둘레의 제자리로 옮겨요. 먼저 흰-초록 엣지 블럭을 찾아 눌러 보세요.",
      setup: { alg: "F2" },
      mask: "cross",
      find: { piece: "edge", colors: ["U", "F"] },
    },
    {
      kind: "quiz",
      body: "흰색만 위를 보면 안 돼요. 엣지의 다른 색이 옆면 센터 색과 같아야 해요. 초록-흰 엣지 블럭은 앞(초록) 위로, 빨강-흰 엣지 블럭은 오른쪽(빨강) 위로 가요.",
      setup: { alg: "R2" },
      mask: "cross",
      quiz: {
        question: "아래로 내려간 흰-빨강 엣지 블럭은 어디로 가야 할까요?",
        choices: [
          "앞(초록) 면 위",
          "오른쪽(빨강) 면 위",
          "흰색만 위를 보면 어디든 괜찮아요",
        ],
        answer: 1,
        why: "옆색 빨강이 빨강 센터와 만나야 해요. 큐브를 돌려(y) 빨강 면을 앞으로 가져와 앞면을 반 바퀴(F2) 돌리면 돼요.",
      },
    },
    {
      kind: "demo",
      body: "첫째 경우: 흰 엣지가 아래층에 있고 흰색이 아래를 봐요. 옆색(초록)이 이미 앞 센터 밑이에요. 앞면을 반 바퀴 돌리면 엣지 블럭이 통째로 위로 올라가요. 흰 엣지는 늘 앞면으로 올려요.",
      setup: { alg: "F2" },
      alg: "F2",
      mask: "cross",
    },
    {
      kind: "demo",
      body: "옆색이 앞 센터 밑에 없으면 반대 면(아랫면)을 돌려 앞 센터 밑에 두고 넣어요. 아랫면을 돌린 뒤(D') 앞면을 반 바퀴.",
      setup: { alg: "F2 D" },
      alg: "D' F2",
      mask: "cross",
    },
    {
      kind: "demo",
      body: "넣을 자리가 앞이 아니면 큐브를 돌려(y) 그 자리를 앞으로 가져와요. 흰-빨강은 빨강 센터 밑에 있어요. 빨강 면을 앞으로 가져와(y) 앞면을 반 바퀴.",
      setup: { alg: "R2" },
      alg: "y F2",
      mask: "cross",
    },
    {
      kind: "try",
      body: "흰 엣지 하나가 아래에 있어요(흰색이 아래). 아랫면으로 빨강 센터 밑에 옮기고, 큐브를 돌려(y) 빨강 면을 앞으로 가져와 반 바퀴로 올려 보세요.",
      setup: { alg: "R2 D2" },
      alg: "D2 y F2",
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "demo",
      body: `둘째 경우: 흰 엣지가 가운데 줄에 있어요(${CROSS_MIDDLE.where}). 옆색 초록이 앞면에 붙어 있어요. 앞면으로 아래층에 내렸다가(F) 반 바퀴로 올리면(F2) 제자리예요. 둘을 합치면 반시계로 한 번(F')이에요.`,
      setup: { alg: CROSS_MIDDLE.setup },
      alg: CROSS_MIDDLE.alg,
      mask: "cross",
    },
    {
      kind: "quiz",
      body: "가운데 줄 엣지는 옆색이 붙은 면을 앞으로 가져와 앞면으로 올려요.",
      setup: { alg: CROSS_MIDDLE_R.setup },
      mask: "cross",
      quiz: {
        question: `이 엣지(${CROSS_MIDDLE_R.where})는 어떻게 올릴까요?`,
        choices: [
          "앞면을 바로 돌려요",
          "큐브를 돌려(y) 빨강 면을 앞으로 가져와 앞면을 돌려요",
          "윗면을 돌려요",
        ],
        answer: 1,
        why: "옆색 빨강이 오른쪽 면에 붙어 있어요. 빨강 면을 앞에 두면(y) 앞면으로 올라가요(F). 윗면은 맞춘 면이라 돌리지 않아요.",
      },
    },
    {
      kind: "try",
      body: "흰색이 앞을 보는 가운데 줄 엣지예요. 큐브를 돌려(y) 빨강 면을 앞으로 가져와 앞면으로 올려 보세요.",
      setup: { alg: CROSS_MIDDLE_R.setup },
      alg: CROSS_MIDDLE_R.alg,
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "demo",
      body: `옆색이 그 면 센터와 다르면 바로 올리면 안 돼요. 이 엣지(${CROSS_GUARD.where})는 흰-빨강인데 옆색 빨강이 앞면에 붙어 있어요. 앞면으로 아래층에 내리고(F), 함께 내려간 흰-초록을 지키려 아랫면으로 비켜 놓고(D), 앞면을 되돌려요(F'). 이제 흰-빨강이 빨강 센터 밑이니 빨강 면을 앞으로 가져와(y) 반 바퀴(F2).`,
      setup: { alg: CROSS_GUARD.setup },
      alg: CROSS_GUARD.alg,
      mask: "cross",
    },
    {
      kind: "try",
      body: "흰-초록 엣지 블럭이 가운데 줄에 있는데 옆색 초록이 오른쪽 면에 붙어 있어요. 큐브를 돌려(y) 그 엣지를 앞에 두고, 앞면으로 내리고, 아랫면으로 비켜 놓고, 되돌린 뒤, 다시 돌려(y') 초록 면에서 반 바퀴로 올려 보세요.",
      setup: { alg: CROSS_GUARD_TRY.setup },
      alg: CROSS_GUARD_TRY.alg,
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "quiz",
      body: "셋째 경우: 흰 엣지가 아래층에 있는데 흰색이 옆을 봐요. 이럴 땐 먼저 가운데 줄로 올려요.",
      setup: { alg: CROSS_DOWN_SIDE.setup },
      mask: "cross",
      quiz: {
        question:
          "아래-오른쪽의 흰-빨강 엣지 블럭은 흰색이 오른쪽을 봐요. 먼저 무엇을 할까요?",
        choices: [
          "가운데 줄로 올려요(흰-초록은 비켜 놓았다 되돌려요)",
          "오른쪽 면을 반 바퀴 돌려 바로 올려요",
          "윗면을 돌려요",
        ],
        answer: 0,
        why: "반 바퀴로 올리면 흰색이 옆을 보는 채로 올라가 뒤집혀요. 윗면은 맞춘 면이라 돌리지 않아요. 가운데 줄로 올리면 둘째 경우처럼 앞면으로 올릴 수 있어요.",
      },
    },
    {
      kind: "demo",
      body: "앞면을 돌려 흰-초록을 비켜 놓고(F), 아랫면으로 엣지를 앞 밑에 옮기고(D'), 앞면을 되돌리면(F') 엣지가 가운데 줄(앞-오른쪽)에 올라와요. 둘째 경우처럼 빨강 면을 앞으로 가져와(y) 앞면으로 올려요(F).",
      setup: { alg: CROSS_DOWN_SIDE.setup },
      alg: CROSS_DOWN_SIDE.alg,
      mask: "cross",
    },
    {
      kind: "try",
      body: "흰-초록 엣지 블럭이 아래-앞에 있고 흰색이 앞을 봐요. 같은 요령으로 가운데 줄에 올린 뒤 초록 면에서 올려 보세요.",
      setup: { alg: CROSS_DOWN_SIDE_TRY.setup },
      alg: CROSS_DOWN_SIDE_TRY.alg,
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "demo",
      body: "넷째 경우: 흰 엣지가 윗층 제자리에 있지만 뒤집혔어요(흰색이 앞을 봐요). 앞면을 돌려(F) 가운데 줄로 내리면, 옆색이 다른 면에 붙은 가운데 줄 엣지가 돼요. 그다음은 비켜 놓기 요령이에요: 큐브를 돌려(y) 앞에 두고, 내리고(F'), 비켜 놓고(D'), 되돌린 뒤(F), 다시 돌려(y') 반 바퀴(F2).",
      setup: { alg: CROSS_FLIPPED.setup },
      alg: CROSS_FLIPPED.alg,
      mask: "cross",
    },
    {
      kind: "try",
      body: "흰-빨강 엣지 블럭이 제자리에서 뒤집혔어요. 앞면으로 아래층까지 내린 뒤(흐트러진 흰 엣지는 되돌리고), 빨강 면을 앞으로 가져와 올려 보세요.",
      setup: { alg: CROSS_FLIPPED_TRY.setup },
      alg: CROSS_FLIPPED_TRY.alg,
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "demo",
      body: "다섯째 경우: 흰색은 위를 보지만 옆색이 센터와 달라요(엉뚱한 자리). 흰-빨강과 흰-초록이 자리를 바꿔 들어가 있어요. 앞면을 반 바퀴(F2) 돌려 흰-빨강을 내리면 첫째 경우가 돼요. 아랫면으로 빨강 센터 밑에 옮기고(D), 빨강 면을 앞으로 가져와(y) 반 바퀴(F2). 이때 흰-초록이 함께 내려와요. 아랫면으로 옮기고(D') 초록 면을 앞으로 가져와(y') 반 바퀴(F2).",
      setup: { alg: CROSS_WRONG_TOP.setup },
      alg: CROSS_WRONG_TOP.alg,
      mask: "cross",
    },
    {
      kind: "try",
      body: "흰-빨강과 흰-주황이 서로 자리를 바꿔 들어가 있어요. 반 바퀴로 내리고, 아랫면으로 옮겨, 그 색 면을 앞으로 가져와 올려 보세요.",
      setup: { alg: CROSS_WRONG_TOP_TRY.setup },
      alg: CROSS_WRONG_TOP_TRY.alg,
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "quiz",
      body: "정리: 어느 경우든 아래층으로 내리면 첫째나 셋째 경우로 풀 수 있어요. 이 엣지는 다섯 경우 중 어디일까요?",
      setup: { alg: CROSS_FLIPPED_TRY.setup },
      mask: "cross",
      quiz: {
        question: "흰-빨강 엣지 블럭은 지금 어떤 경우일까요?",
        choices: [
          "아래층, 흰색이 아래",
          "가운데 줄",
          "아래층, 흰색이 옆",
          "윗층 제자리지만 뒤집힘",
        ],
        answer: 3,
        why: "흰 센터와 빨강 센터 사이에 있지만 흰 칸이 오른쪽을 봐요. 앞면으로 아래층에 내려요.",
      },
    },
    {
      kind: "quiz",
      body: "흔한 실수: 흰색만 위로 모으고(흰 꽃) 옆색을 안 보는 것. 옆면을 돌려 보면 십자 둘레 색이 센터와 달라요. 엣지를 올리기 전에 옆색부터 맞춰요.",
      setup: { alg: "U" },
      mask: "cross",
      quiz: {
        question: "이 큐브의 흰 십자는 다 됐을까요?",
        choices: [
          "네, 흰색이 모두 위를 봐요",
          "아니요, 옆색이 옆면 센터와 달라요",
        ],
        answer: 1,
        why: "옆색까지 맞아야 십자예요. 엉뚱한 자리의 엣지는 반 바퀴로 아래층에 내려 다시 넣어요.",
      },
    },
    {
      kind: "try",
      body: "흰 엣지 둘이 흐트러져 있어요(하나는 가운데 줄, 하나는 아래층). 하나씩 경우를 보고 올려요. 이미 넣은 것이 내려가면 비켜 놓기 요령을 써요.",
      setup: { alg: "R' F" },
      alg: "F' y F",
      goal: "white-cross",
      mask: "cross",
    },
    {
      kind: "try",
      body: "아무렇게나 섞인 큐브에서 흰 십자를 만들어요. 엣지마다 다섯 경우 중 어디인지 보고 하나씩 넣어요.",
      setup: { rule: "random-cross" },
      goal: "white-cross",
      mask: "cross",
    },
  ],
};

/**
 * 첫 층 코너(2026-11-04 사용자 요청): 흰 십자처럼 흰 면을 위에 둔 채, 흰 코너를 넣을 칸 바로 밑(앞-오른쪽 아래)으로
 * 가져와 R' D' R D를 흰색이 위로 올 때까지 되풀이한다. 마지막 층 「코너 방향」에서 같은 공식을 다시 쓴다.
 * 첫 층이 끝나면 큐브를 뒤집어 흰 면을 아래로 둔다(둘째 층부터는 흰 면 아래).
 */
const firstCorners: Lesson = {
  id: "333-first-corners-up",
  size: 3,
  title: "첫 층 코너",
  summary:
    "흰 면을 위에 둔 채 흰 코너 넷을 R' D' R D 되풀이로 넣고, 다 되면 큐브를 뒤집어요.",
  steps: [
    {
      kind: "find",
      body: "흰 십자를 만든 그대로 흰 면을 위에 두고 코너를 넣어요. 넣을 흰 코너는 아래층에서 찾아요. 흰-초록-빨강 코너 블럭을 눌러 보세요.",
      setup: { alg: setupFor(`D ${CORNER_TWIST}`) },
      mask: "first-layer",
      find: { piece: "corner", colors: ["U", "F", "R"] },
    },
    {
      kind: "find",
      body: "앞에서 본 것처럼 코너의 제자리는 세 색 센터가 만나는 구석이에요. 흰-초록-빨강은 흰·초록·빨강 센터 사이, 위층 구석에 들어가요. 조각이 아니라 그 칸을 눌러 보세요.",
      setup: { alg: setupFor(`D ${CORNER_TWIST}`) },
      mask: "first-layer",
      find: { at: ["U", "F", "R"] },
    },
    {
      kind: "find",
      body: "하나 더 해 봐요. 흰-파랑-주황 코너 블럭은 어느 칸에 들어갈까요? 파랑 센터와 주황 센터를 찾고, 그 사이 위 구석을 눌러요. 큐브를 끌어 뒤쪽도 보세요.",
      setup: { alg: setupFor(`D ${CORNER_TWIST}`) },
      mask: "first-layer",
      find: { at: ["U", "B", "L"] },
    },
    {
      kind: "turn",
      body: "넣을 칸을 찾았으면 반대 면(아랫면)을 돌려 코너를 그 칸 바로 밑(앞-오른쪽 아래)에 두고 넣어요. D를 쳐서 흰-초록-빨강을 칸 밑으로 옮겨 보세요.",
      setup: { alg: setupFor(`D ${CORNER_TWIST}`) },
      mask: "first-layer",
      alg: "D",
    },
    {
      kind: "quiz",
      body: "칸 밑에 왔으면 R' D' R D를 흰색이 위를 볼 때까지 되풀이해요. 이 공식은 앞-오른쪽 위 칸과 그 밑 칸의 코너를 바꾸며 돌려요. 횟수는 흰색이 보는 쪽으로 정해져요: 흰색이 오른쪽을 보면 한 번, 아래를 보면 세 번, 앞을 보면 다섯 번.",
      setup: { alg: setupFor(reps(CORNER_TWIST, 3)) },
      mask: "first-layer",
      quiz: {
        question:
          "앞-오른쪽 아래 코너는 흰색이 아래를 봐요. R' D' R D를 몇 번 할까요?",
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
      body: "코너가 칸 밑에 있지 않아요. 먼저 아랫면을 돌려(D) 칸 밑으로 옮기고 R' D' R D.",
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
      body: "코너가 제 칸에 들어가 있지만 돌아가 있을 때도 있어요. 칸을 앞-오른쪽에 두고 같은 공식을 되풀이해요. 흰색이 오른쪽을 보면 두 번, 앞을 보면 네 번이에요.",
      setup: { alg: setupFor(reps(CORNER_TWIST, 2)) },
      mask: "first-layer",
      quiz: {
        question:
          "앞-오른쪽 위 코너는 제 칸에 있지만 흰색이 오른쪽을 봐요. R' D' R D를 몇 번 할까요?",
        choices: ["두 번", "네 번", "여섯 번"],
        answer: 0,
        why: "제 칸에서 흰색이 오른쪽을 보면 두 번, 앞을 보면 네 번이면 흰색이 위로 와요.",
      },
    },
    {
      kind: "try",
      body: "코너가 제 칸에 들어가 있지만 흰색이 앞을 봐요. 같은 공식을 네 번 해요.",
      setup: { alg: setupFor(reps(CORNER_TWIST, 4)) },
      alg: reps(CORNER_TWIST, 4),
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "demo",
      body: "앞-오른쪽 위 칸에 다른 흰 코너(흰-파랑-빨강)가 박혀 있어요. 칸을 앞-오른쪽에 둔 채 R' D' R D 한 번이면 박힌 코너가 아래로 빠져요. 빠진 것은 아랫면을 돌려(D) 제 칸 밑으로 옮기고, 큐브를 돌려(y) 쥐고 넣어요. 다시 돌려 쥐면(y') 처음 칸 밑에 흰-초록-빨강이 와 있어요.",
      setup: { alg: setupFor(STUCK_CORNER_UP) },
      alg: STUCK_CORNER_UP,
      mask: "first-layer",
    },
    {
      kind: "try",
      body: "엉뚱한 칸에 박힌 흰 코너를 빼서 제 칸에 넣어 보세요.",
      setup: { alg: setupFor(STUCK_CORNER_UP) },
      alg: STUCK_CORNER_UP,
      goal: "first-layer",
      mask: "first-layer",
    },
    {
      kind: "quiz",
      body: "흔한 실수: 공식을 하다 말고 멈추는 것. R' D'까지 하면 흰 십자 엣지 하나가 잠깐 내려가요. R D까지 끝내면 돌아와요.",
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
      body: "흰 십자만 맞은 큐브에서 첫 층을 끝내요. 코너마다 칸 찾기 → 칸 밑으로(D) → 칸을 앞-오른쪽으로 쥐기(y) → 공식 되풀이. 아래층에 흰 코너가 없으면 위층에 박힌 것을 빼요.",
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
      body: "큐브만 통째로 돌렸으니 센터끼리의 자리는 그대로예요. 다만 앞면 축으로 반 바퀴 돌아서 오른쪽과 왼쪽이 바뀌었어요.",
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

const secondLayer: Lesson = {
  id: "333-second-layer",
  size: 3,
  title: "둘째 층 엣지",
  summary:
    "윗층의 노란색 없는 엣지를 가운데 줄로 내려요. 앞-오른쪽 칸에 넣는 공식 두 개.",
  steps: [
    {
      kind: "find",
      body: "둘째 층(가운데 줄)의 엣지 넷을 넣어요. 이제 맞춘 면이 아래라서 윗면이 반대 면이에요. 노란색이 없는 엣지가 이 칸들의 조각이에요. 노란색이 없는 윗층 엣지를 눌러 보세요.",
      setup: flip(RIGHT),
      mask: "all",
      find: { piece: "edge", colors: ["F", "L"] },
    },
    {
      kind: "quiz",
      body: "그 엣지의 앞쪽 색이 앞 센터와 같아지게 반대 면(윗면)을 돌려요. 그러면 앞면 가운데 세로줄(위 엣지 칸·가운데 칸·아래 칸)이 한 색으로 이어져, 아래 줄과 함께 ⊥(뒤집힌 T) 모양이 돼요. 엣지의 위쪽 색이 오른쪽 면 색이면 넣을 칸은 앞-오른쪽이에요. 넣기는 늘 앞-오른쪽 칸에서 해요. 넣을 칸이 다른 곳이면 큐브를 돌려(y) 그 칸을 앞-오른쪽으로 가져와요.",
      setup: flip(RIGHT),
      mask: "all",
      quiz: {
        question:
          "앞 위 엣지는 위쪽 색이 주황이에요. 오른쪽 면도 주황이에요. 어떻게 넣을까요?",
        choices: [
          "앞-오른쪽 칸에 바로 넣어요",
          "큐브를 돌려(y') 앞-왼쪽 칸을 앞-오른쪽으로 가져와요",
        ],
        answer: 0,
        why: "위쪽 색과 같은 색 면 쪽 칸이 넣을 칸이에요. 지금 앞-오른쪽이라 바로 넣어요. 다음 시연이 바로 이 모양이에요.",
      },
    },
    {
      kind: "demo",
      body: "앞에서 넣기: U R U' R' U' F' U F. 앞 위 엣지를 앞-오른쪽 칸으로 옮겨요. 공식 가운데에 첫 층 코너가 잠깐 빠졌다가 끝에 함께 돌아와요.",
      setup: flip(RIGHT),
      alg: RIGHT,
      mask: "f2l",
    },
    {
      kind: "demo",
      body: "오른쪽에서 넣기: U' F' U F U R U' R'. 엣지가 오른쪽 위에 있고 옆쪽 색이 오른쪽 센터와 같을 때 써요. 앞에서 넣기를 거울에 비춘 모양이고, 같은 앞-오른쪽 칸에 넣어요.",
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
      body: "이번엔 넣을 칸이 앞-왼쪽이에요. 큐브를 돌려(y') 그 칸을 앞-오른쪽으로 가져오면 엣지가 오른쪽 위에 와요. 오른쪽에서 넣어 보세요.",
      setup: { alg: `z2 y' ${invertAlg(FROM_RIGHT)} y` },
      alg: `y' ${FROM_RIGHT}`,
      goal: "second-layer",
      mask: "f2l",
    },
    {
      kind: "find",
      body: "흔한 실수: 노란색이 붙은 엣지를 넣으려는 것. 노란 엣지는 윗층 것이에요. 넣으면 안 되는 엣지(노란색이 붙은 것)를 하나 눌러 보세요.",
      setup: flip(RIGHT),
      mask: "all",
      find: { piece: "edge", has: ["D"] },
    },
    {
      kind: "try",
      body: "윗층에 넣을 엣지가 하나도 없으면 칸에 잘못 들어간 엣지가 있어요. 이 엣지는 앞-오른쪽 칸에 들어가 있지만 뒤집혔어요. 앞에서 넣기 공식으로 일단 빼내고(위의 아무 엣지나 넣으면 빠져요), 다시 찾아 넣어요.",
      setup: flip(`${RIGHT} U2 ${RIGHT}`),
      alg: `${RIGHT} U2 ${RIGHT}`,
      goal: "second-layer",
      mask: "f2l",
    },
    {
      kind: "try",
      body: "이번엔 앞-오른쪽 칸에 다른 칸(앞-왼쪽)의 엣지가 들어가 있어요. 앞에서 넣기로 빼내면 위에 있던 엣지가 대신 들어가요. 빠져나온 엣지는 위에서 찾아, 그 칸을 앞-오른쪽으로 오게 큐브를 돌려 들고(y') 넣어요.",
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
// 노란 십자(엣지 방향) → 옆면 맞추기(엣지 자리) → 코너 자리 → 코너 방향.
// 단계마다 같은 공식을 모양을 보며 여러 번 쓴다. 쥐는 법·횟수는 ll-beginner.test.ts가 엔진으로 확인한다.

const yellowCross: Lesson = {
  id: "333-ll-cross",
  size: 3,
  title: "노란 십자",
  summary:
    "윗면 엣지를 노랗게. 모양(점·ㄱ자·가로줄)을 보고 F R U R' U' F'을 최대 세 번.",
  steps: [
    {
      kind: "quiz",
      body: "윗면에서 노란 칸이 위를 보는 엣지만 봐요(코너는 아직 안 봐요). 노란 센터 하나만 있는 「점」, 노란 엣지 둘이 센터와 꺾여 이어진 「ㄱ자」, 둘이 센터를 사이에 두고 마주 본 「가로줄」, 넷 다인 「십자」 중 하나예요. 노란 엣지가 1개나 3개면 앞 단계에서 조각이 빠졌거나 실물 큐브가 튄 거예요(늘 짝수예요).",
      setup: flip(EO),
      mask: "oll",
      quiz: {
        question: "이 큐브의 윗면 엣지는 넷 중 어느 모양일까요?",
        choices: ["점", "ㄱ자", "가로줄", "십자"],
        answer: 2,
        why: "노란 엣지 둘이 마주 보고 있어요. 다음 시연이 이 모양을 십자로 만들어요.",
      },
    },
    {
      kind: "demo",
      body: "가로줄: 줄이 가로(왼쪽-오른쪽)가 되게 들고 F R U R' U' F'. 이 공식은 아래 두 층은 그대로 두고 윗층 엣지의 방향을 바꿔요.",
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
    "노란 십자 엣지의 옆색을 옆 센터와 맞춰요. R U R' U R U2 R' U를 한두 번.",
  steps: [
    {
      kind: "quiz",
      body: "노란 십자는 됐지만 엣지의 옆색이 옆 센터와 다를 수 있어요. 윗면(U)을 돌려 가며 옆색이 맞는 엣지가 둘 이상인 자리를 찾아요. 늘 그런 자리가 있어요.",
      setup: flip(EDGE_SWAP),
      quiz: {
        question: "지금 옆색이 맞은 엣지 둘은 어디일까요?",
        choices: ["앞과 오른쪽", "오른쪽과 뒤", "뒤와 왼쪽", "왼쪽과 앞"],
        answer: 1,
        why: "오른쪽과 뒤가 맞아요. 이웃한 두 엣지(ㄱ자)가 맞았으니 이대로 공식을 하면 돼요.",
      },
    },
    {
      kind: "demo",
      body: "맞은 두 엣지를 뒤와 오른쪽에 두고 R U R' U R U2 R' U. 앞과 왼쪽 두 엣지가 서로 바뀌어요. 코너는 흐트러져도 괜찮아요(다음 단계에서 맞춰요).",
      setup: flip(EDGE_SWAP),
      alg: EDGE_SWAP,
    },
    {
      kind: "quiz",
      body: "맞은 둘이 다른 쪽에 있으면 큐브를 돌려 쥐어(y) 뒤·오른쪽으로 가져와요. 윗면(U)을 돌리면 옆색이 맞는 엣지가 바뀌니 쥐는 것은 큐브째 돌려요.",
      setup: { alg: `${setupFor(EDGE_SWAP, "z2")} y` },
      quiz: {
        question: "옆색이 맞은 두 엣지가 앞과 오른쪽이에요. 어떻게 쥘까요?",
        choices: [
          "큐브를 돌려(y') 그 둘을 오른쪽과 뒤로",
          "그대로 공식을 해요",
          "U를 돌려 옮겨요",
        ],
        answer: 0,
        why: "y'로 쥐면 앞이 오른쪽, 오른쪽이 뒤로 가요. 그러면 공식이 바꾸는 앞·왼쪽 두 엣지가 남은 둘이에요.",
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
        question: "맞은 두 엣지가 마주 보면 공식을 모두 몇 번 쓸까요?",
        choices: ["한 번", "두 번", "네 번"],
        answer: 1,
        why: "한 번 하면 ㄱ자처럼 이웃한 둘이 맞아요. 그 둘을 뒤·오른쪽에 쥐고 한 번 더 하면 끝이에요.",
      },
    },
    {
      kind: "turn",
      body: "U를 쳐서 앞과 뒤 엣지의 옆색을 맞춘 뒤(일자), 공식을 한 번 쳐 보세요.",
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
      body: "노란 십자까지 맞은 큐브에서 옆면을 맞춰요. 끝나면 윗면을 돌려 엣지 넷의 옆색을 모두 맞춰 둬요.",
      setup: { rule: "ll-cross-solved" },
      goal: "yellow-edges",
    },
  ],
};

const llCornerPlace: Lesson = {
  id: "333-ll-corner-place",
  size: 3,
  title: "코너 자리",
  summary:
    "코너를 방향은 상관없이 제자리로. 제자리 하나를 앞-오른쪽 위에 두고 U R U' L' U R' U' L.",
  steps: [
    {
      kind: "quiz",
      body: "이제 위 코너의 자리만 맞춰요. 방향은 다음 단계에서 맞추니 상관없어요. 코너의 세 색이 그 구석 세 센터의 색과 같으면 「제자리」예요. 노란색이 옆을 봐도 돼요.",
      setup: flip(CORNER_PLACED_TWISTED),
      quiz: {
        question:
          "앞-오른쪽 위 코너는 노랑·초록·주황이에요. 이 코너는 제자리일까요?(방향은 상관없이)",
        choices: ["네, 제자리예요", "아니요, 노란색이 위를 봐야 해요"],
        answer: 0,
        why: "앞은 초록, 오른쪽은 주황, 위는 노랑 센터라 세 색이 같아요. 방향은 다음 단계에서 맞춰요.",
      },
    },
    {
      kind: "demo",
      body: "제자리 코너를 앞-오른쪽 위에 두고 U R U' L' U R' U' L. 앞-오른쪽 위는 그대로 두고, 나머지 세 코너의 자리를 돌려요. 위 엣지는 그대로예요.",
      setup: flip(CORNER_CYCLE),
      alg: CORNER_CYCLE,
    },
    {
      kind: "turn",
      body: "같은 공식을 한 번 쳐 보세요. 세 코너가 공식과 반대쪽으로 돌아야 하는 상황이에요.",
      setup: flip(`${CORNER_CYCLE} ${CORNER_CYCLE}`),
      alg: CORNER_CYCLE,
    },
    {
      kind: "quiz",
      body: "한 번 했더니 세 코너가 한 칸씩 돌았지만 아직 제자리가 아니에요.",
      setup: flip(CORNER_CYCLE),
      quiz: {
        question: "몇 번 더 해야 할까요?",
        choices: ["같은 쥐는 법으로 한 번 더", "큐브를 돌려 쥐고 세 번 더"],
        answer: 0,
        why: "세 코너는 한 번에 한 칸씩 돌아요. 반대쪽으로 돌아야 했으면 같은 쥐는 법으로 한 번 더 하면 맞아요.",
      },
    },
    {
      kind: "try",
      body: "제자리 코너가 앞-오른쪽 위에 있어요. 공식을 두 번 해 보세요.",
      setup: flip(`${CORNER_CYCLE} ${CORNER_CYCLE}`),
      alg: `${CORNER_CYCLE} ${CORNER_CYCLE}`,
      goal: "ll-corners-placed",
    },
    {
      kind: "try",
      body: "제자리 코너가 다른 구석에 있어요. 큐브를 돌려 쥐어 그것을 앞-오른쪽 위로 가져오고 공식.",
      setup: { alg: `${setupFor(CORNER_CYCLE, "z2")} y` },
      alg: `y' ${CORNER_CYCLE}`,
      goal: "ll-corners-placed",
    },
    {
      kind: "quiz",
      body: "제자리 코너가 하나도 없을 때가 있어요.",
      setup: flip(CORNERS_NONE),
      quiz: {
        question: "제자리 코너가 하나도 없어요. 어떻게 할까요?",
        choices: [
          "아무 쪽에서나 공식을 한 번 해요",
          "윗면을 돌려 맞춰요",
          "처음부터 다시 섞어요",
        ],
        answer: 0,
        why: "아무 데서나 한 번 하면 제자리 코너가 꼭 하나 생겨요. 그것을 앞-오른쪽 위에 두고 다시 해요. 윗면을 돌리면 위 엣지가 흐트러져요.",
      },
    },
    {
      kind: "try",
      body: "제자리 코너가 없어요. 한 번 하고, 생긴 제자리 코너를 앞-오른쪽 위로 쥐고(y') 다시.",
      setup: flip(CORNERS_NONE),
      alg: CORNERS_NONE,
      goal: "ll-corners-placed",
    },
    {
      kind: "try",
      body: "위 엣지까지 맞은 큐브에서 코너 자리를 맞춰요.",
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
    "마지막 단계. 첫 층에서 쓴 R' D' R D를 코너마다 2번 또는 4번, 사이에는 윗면만 돌려요.",
  steps: [
    {
      kind: "quiz",
      body: "마지막은 첫 층에서 쓴 그 R' D' R D예요. 흰 면은 아래 그대로, 노란 면을 위에 두고 풀 코너를 앞-오른쪽 위에 둬요. 노란색이 위를 볼 때까지 되풀이해요: 노란색이 오른쪽을 보면 두 번, 앞을 보면 네 번.",
      setup: flip(TWIST_TWO),
      quiz: {
        question:
          "앞-오른쪽 위 코너의 노란색이 오른쪽을 봐요. R' D' R D를 몇 번 할까요?",
        choices: ["두 번", "네 번", "여섯 번"],
        answer: 0,
        why: "오른쪽이면 두 번, 앞이면 네 번이에요. 첫 층에서 제 칸에 돌아간 코너를 고칠 때와 같아요.",
      },
    },
    {
      kind: "turn",
      body: "R' D' R D를 두 번 쳐 보세요. 앞-오른쪽 위 코너의 노란색이 위로 와요. 그런데 아래 두 층을 보세요.",
      setup: flip(TWIST_TWO),
      alg: reps(CORNER_TWIST, 2),
    },
    {
      kind: "quiz",
      body: "흔한 실수: 아래 두 층이 흐트러져 놀라서 고치려는 것. 남은 코너까지 다 돌리면 아래 두 층은 돌아와요. 그 사이에 큐브를 통째로 돌려 쥐거나 아래층을 돌리면 안 돼요.",
      setup: { alg: `${setupFor(TWIST_TWO, "z2")} ${reps(CORNER_TWIST, 2)}` },
      quiz: {
        question:
          "아래 두 층이 흐트러졌어요. 다음 코너는 어떻게 앞-오른쪽 위로 가져올까요?",
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
      body: "U를 쳐서 다음 코너(노란색이 앞을 봄)를 앞-오른쪽 위로 가져온 뒤, R' D' R D를 네 번 쳐 보세요. 아래 두 층이 돌아와요.",
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
      body: "돌아간 코너가 셋이에요. 하나씩 앞-오른쪽 위로(U만) 가져와 노란색이 위를 볼 때까지. 중간에 아래가 흐트러져도 끝까지 가요.",
      setup: flip(TWIST_THREE),
      alg: TWIST_THREE,
      goal: "solved",
    },
    {
      kind: "quiz",
      body: "다른 순서도 있어요. 코너 방향을 먼저 맞추고 자리를 나중에 맞추는 방식이에요. 큐브를 뒤집어 「오른손 트위스트(R U R' U')」를 되풀이하는 가이드도 있어요. 여기서는 흰 면을 아래에 둔 채 이어 가니 R' D' R D를 써요.",
      setup: flip(A_PERM),
      quiz: {
        question:
          "방향을 먼저 맞춘다면, 그다음 코너 자리는 어떤 공식으로 맞출까요?",
        choices: [
          "방향을 지키며 자리만 바꾸는 공식(A퍼뮤 R' F R' B2 R F' R' B2 R2)",
          "U R U' L' U R' U' L(자리를 바꾸며 방향도 돌려요)",
        ],
        answer: 0,
        why: "U R U' L' U R' U' L은 코너를 돌리기도 해서 맞춘 방향이 풀려요. A퍼뮤는 노란색이 위를 본 채로 코너 셋의 자리만 바꿔요.",
      },
    },
    {
      kind: "try",
      body: "코너 자리까지 맞은 큐브를 끝까지 맞춰요. 이것까지 맞추면 큐브 하나를 처음부터 끝까지 맞추는 길을 다 배운 거예요.",
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
