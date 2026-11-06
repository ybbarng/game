import {
  type Action,
  type GameEvent,
  type JanggiScenarioOptions,
  type JanggiView,
  type Piece,
  pseudoTargets,
  STANDARD_RULES,
} from "@game/janggi-engine";

import type { Lesson, MissionStatus } from "@/tutorial/types";

import {
  FIRST_MOVES_LESSON,
  openingPieces,
  SETUPS_LESSON,
} from "./opening-lessons";
import {
  type Context,
  firstTo,
  move,
  myFirstMove,
  wonRound,
} from "./tutorial-checks";

/** 튜토리얼 장면: 놓인 기물에 더해 그림에만 쓰는 표시 */
export type JanggiScene = Omit<JanggiScenarioOptions, "rules"> & {
  /** 이 자리 기물이 갈 수 있는 곳을 점으로 보인다 */
  show?: string;
  /** 글이 짚는 기물·칸(얇은 주황 고리) */
  rings?: readonly string[];
  /** 약한 자리(빨간 점선 고리) */
  warn?: readonly string[];
  /**
   * 「다음 수」로 한 수씩 넘겨 보는 수순(출발-도착 "01-41"). 초부터 번갈아 둔다.
   * 넘길 때마다 공짜로 잡힐 내 기물에 빨간 점선 고리를 그린다
   */
  replay?: readonly string[];
  /** 판 위에 상차림 단추를 두어 내(초) 상차림을 바꿔 본다. 한은 마상마상 */
  pickSetup?: boolean;
};
export type JanggiLesson = Lesson<JanggiView, GameEvent, JanggiScene, Action>;

/** 튜토리얼은 기본 규칙 한 판으로 한다 */
export const JANGGI_TUTORIAL_RULES = STANDARD_RULES;

/** 내 첫 수 뒤 초 차 하나가 다섯 곳 넘게 갈 수 있으면 성공(차 길이 열렸다) */
function rookOpened(ctx: Context): MissionStatus {
  if (!myFirstMove(ctx)) return null;
  const { board } = ctx.view;
  const reach = board.map((cell, at) =>
    cell === "cR" ? pseudoTargets(board, at).length : 0,
  );
  return Math.max(...reach) >= 5 ? "success" : "fail";
}

/** 궁 둘. 같은 세로줄에 두면 빅장이 되니 줄을 엇갈린다 */
const KINGS: Record<string, Piece> = { "95": "cK", "24": "hK" };

/** 처음 놓인 판(두 편 모두 마상마상) */
const START: JanggiScene = { pieces: openingPieces("NENE", "NENE") };

/** 차 하나와 공짜로 잡을 수 있는 한 졸 */
const ROOK_SCENE: JanggiScene = {
  pieces: { ...KINGS, "71": "cR", "41": "hP", "17": "hP" },
  show: "71",
};

/** 포가 내 졸을 넘어 한 차를 잡는다 */
const CANNON_SCENE: JanggiScene = {
  pieces: { ...KINGS, "71": "cC", "51": "cP", "31": "hR", "18": "hP" },
  show: "71",
};

/** 마가 한 차를 잡는다. 앞 칸(63)이 비어 있어야 간다 */
const HORSE_SCENE: JanggiScene = {
  pieces: { ...KINGS, "73": "cN", "54": "hR", "19": "hP" },
  show: "73",
};

/** 멱: 마 앞 칸이 막혀 그쪽 두 곳을 못 간다 */
const BLOCKED_HORSE: JanggiScene = {
  pieces: { ...KINGS, "73": "cN", "63": "cP" },
  show: "73",
};

/** 상이 한 포를 잡는다. 지나는 두 칸(63·54)이 비어 있어야 간다 */
const ELEPHANT_SCENE: JanggiScene = {
  pieces: { ...KINGS, "73": "cE", "45": "hC", "19": "hP" },
  show: "73",
};

/** 사는 궁성 안에서 한 칸씩. 가운데 자리에서는 대각선으로도 */
const ADVISOR_SCENE: JanggiScene = {
  pieces: { "96": "cK", "24": "hK", "95": "cA", "19": "hP" },
  show: "95",
};

/** 차가 상대 궁성 모서리에 있으면 대각선 선을 따라서도 간다 */
const PALACE_SCENE: JanggiScene = {
  pieces: { "95": "cK", "24": "hK", "36": "cR", "19": "hP" },
  show: "36",
};

/** 초가 점수에서 크게 앞선다. 궁을 옆으로 옮겨 빅장을 부르면 점수로 끝난다 */
const BIKJANG_SCENE: JanggiScene = {
  pieces: { "95": "cK", "24": "hK", "71": "cR", "79": "cR", "19": "hP" },
};

/** 한 차가 장군을 불렀다. 같은 줄의 내 차로 잡는다 */
const CHECK_SCENE: JanggiScene = {
  pieces: { "95": "cK", "24": "hK", "75": "hR", "71": "cR", "18": "hP" },
};

/** 한 궁이 모서리에 몰렸다. 차를 맨 윗줄로 올리면 외통 */
const MATE_SCENE: JanggiScene = {
  // 가운데 졸(75)이 두 궁 사이를 막아 빅장으로 끝나지 않게 한다.
  pieces: { "95": "cK", "14": "hK", "59": "cR", "28": "cR", "75": "cP" },
};

export const JANGGI_LESSONS: readonly JanggiLesson[] = [
  {
    id: "goal",
    title: "장기는 어떤 게임?",
    summary: "초가 먼저 두고, 상대 궁을 외통으로 몰면 이긴다",
    steps: [
      {
        kind: "explain",
        title: "궁을 잡으면 이겨요",
        body: [
          "장기는 **초(초록)**와 **한(빨강)**이 기물 16개씩을 들고 두는 게임이에요. **초가 먼저** 둬요.",
          "한 번에 기물 하나를 움직여요. 상대 기물이 있는 자리로 가면 그 기물을 **잡아요**.",
          "상대 **궁**을 잡을 수밖에 없게 몰면(**외통**) 이겨요.",
          "초 기물의 흘려 쓴 한자가 낯설면 첫 화면 **옵션 → 기물 글자**에서 **한글(차·포·마)**로 바꿀 수 있어요.",
        ],
        scene: START,
      },
      {
        kind: "explain",
        title: "차: 가장 센 기물",
        body: [
          "**차(車)**는 가로·세로로 막힐 때까지 몇 칸이든 가요. 점이 차가 갈 수 있는 곳이에요.",
          "앞에 상대 기물이 있으면 그 기물을 잡을 수 있어요.",
        ],
        scene: ROOK_SCENE,
      },
      {
        kind: "quiz",
        question: "장기는 어떻게 이길까요?",
        options: [
          "상대 궁을 외통으로 몬다",
          "상대 기물을 모두 잡는다",
          "내 졸을 상대 끝줄까지 보낸다",
        ],
        answer: 0,
        explain:
          "궁이 어디로 가도 잡히는 상태가 **외통**이에요. 기물을 다 잡지 않아도 외통이면 끝나요.",
      },
      {
        kind: "mission",
        title: "졸 잡기",
        objective: "**차**로 공짜로 잡을 수 있는 한 **졸**을 잡으세요.",
        hint: "내 차와 같은 세로줄 위쪽(41)에 한 졸이 있어요.",
        scenario: ROOK_SCENE,
        check: firstTo("41"),
        success: "잡았어요! 상대 기물 자리로 가면 그 기물을 잡아요.",
        fail: "아직 졸을 잡지 않았어요. 차와 같은 줄에 있는 졸을 찾아보세요.",
        solution: [move("71", "41")],
        mistake: [move("71", "72")],
      },
    ],
  },
  {
    id: "cannon",
    title: "포",
    summary: "포는 기물 하나를 반드시 넘어서 간다",
    steps: [
      {
        kind: "explain",
        title: "포는 넘어서 가요",
        body: [
          "**포(包)**는 차처럼 직선으로 가지만, 가는 길에 있는 **기물 하나를 반드시 넘어야** 해요.",
          "넘은 뒤에는 빈칸으로 가거나, 처음 만나는 상대 기물을 잡아요.",
          "포는 **포를 넘을 수 없고, 포를 잡을 수도 없어요**.",
        ],
        scene: CANNON_SCENE,
      },
      {
        kind: "quiz",
        question: "포가 할 수 **없는** 것은?",
        options: [
          "내 기물을 넘어 상대 차를 잡는다",
          "상대 졸을 넘어 빈칸으로 간다",
          "상대 포를 넘어 간다",
        ],
        answer: 2,
        explain:
          "포는 포를 넘지도 잡지도 못해요. 다른 기물은 내 것이든 상대 것이든 넘을 수 있어요.",
      },
      {
        kind: "mission",
        title: "포로 차 잡기",
        objective: "**포**로 내 졸을 넘어 한 **차**를 잡으세요.",
        hint: "포 위쪽의 졸(51)을 넘으면 그 너머 한 차(31)가 있어요.",
        scenario: CANNON_SCENE,
        check: firstTo("31"),
        success: "멋져요! 포는 넘을 기물이 있어야 힘을 써요.",
        fail: "그 수로는 차를 잡지 못했어요. 포는 기물 하나를 넘어서 가요.",
        solution: [move("71", "31")],
        mistake: [move("71", "41")],
      },
    ],
  },
  {
    id: "horse",
    title: "마·상",
    summary:
      "마는 한 칸 + 대각선 한 칸, 상은 한 칸 + 대각선 두 칸. 막히면 못 간다",
    steps: [
      {
        kind: "explain",
        title: "마는 날 일(日) 자로",
        body: [
          "**마(馬)**는 앞뒤좌우로 한 칸 가고, 이어서 바깥쪽 대각선으로 한 칸 가요.",
          "**상(象)**은 한 칸 가고 대각선으로 두 칸 가요. 마보다 멀리 가지만 더 잘 막혀요.",
        ],
        scene: HORSE_SCENE,
      },
      {
        kind: "explain",
        title: "막히면 못 가요(멱)",
        body: [
          "마가 처음 가는 한 칸에 기물이 있으면 그쪽으로는 못 가요. 이것을 **멱**이라고 해요.",
          "그림에서 마 위 칸(63)을 내 졸이 막아 위쪽 두 곳에 점이 없어요.",
        ],
        scene: BLOCKED_HORSE,
      },
      {
        kind: "explain",
        title: "상은 더 멀리, 더 잘 막혀요",
        body: [
          "**상(象)**은 앞뒤좌우로 한 칸 간 뒤 같은 쪽 대각선으로 **두 칸** 가요.",
          "지나가는 두 칸 가운데 하나라도 막히면 그쪽으로는 못 가요. 점이 상이 갈 수 있는 곳이에요.",
        ],
        scene: ELEPHANT_SCENE,
      },
      {
        kind: "mission",
        title: "마로 차 잡기",
        objective: "**마**로 한 **차**를 잡으세요.",
        hint: "마 위쪽 한 칸은 비어 있어요. 그다음 오른쪽 대각선이에요.",
        scenario: HORSE_SCENE,
        check: firstTo("54"),
        success: "잡았어요! 마는 막히지 않으면 여덟 방향으로 갈 수 있어요.",
        fail: "그 자리에는 차가 없어요. 마가 갈 수 있는 곳 가운데 차가 있는 곳을 찾아보세요.",
        solution: [move("73", "54")],
        mistake: [move("73", "52")],
      },
      {
        kind: "mission",
        title: "상으로 포 잡기",
        objective: "**상**으로 한 **포**를 잡으세요.",
        hint: "상 위쪽 한 칸(63)으로 간 뒤 오른쪽 위 대각선으로 두 칸이에요.",
        scenario: ELEPHANT_SCENE,
        check: firstTo("45"),
        success: "잡았어요! 상은 멀리서 갑자기 기물을 노릴 수 있어요.",
        fail: "그 자리에는 포가 없어요. 상이 갈 수 있는 점 가운데 포가 있는 곳을 찾아보세요.",
        solution: [move("73", "45")],
        mistake: [move("73", "41")],
      },
    ],
  },
  {
    id: "check",
    title: "궁·사·졸과 장군",
    summary:
      "궁과 사는 궁성 안에서, 졸은 앞과 옆으로. 궁성 대각선. 장군을 받으면 반드시 푼다",
    steps: [
      {
        kind: "explain",
        title: "궁성과 졸",
        body: [
          "**궁**과 **사(士)**는 대각선이 그려진 **궁성** 안에서만 선을 따라 한 칸씩 움직여요.",
          "**졸(卒)·병(兵)**은 앞이나 옆으로 한 칸 가요. 뒤로는 못 가요.",
        ],
        scene: ADVISOR_SCENE,
      },
      {
        kind: "explain",
        title: "궁성의 대각선",
        body: [
          "궁성에 그려진 **대각선 위에서는** 궁·사뿐 아니라 **차·포**도 대각선을 따라 가요. 상대 궁성 안의 **졸**은 앞쪽 대각선으로도 가요.",
          "그림의 차는 한 궁성 모서리에 있어 가로·세로에 더해 궁성 가운데 쪽 대각선으로도 갈 수 있어요.",
        ],
        scene: PALACE_SCENE,
      },
      {
        kind: "quiz",
        question: "궁성 대각선 선을 따라 움직이지 **않는** 기물은?",
        options: ["차", "포", "마"],
        answer: 2,
        explain:
          "궁성 대각선을 따라가는 것은 궁·사·차·포와 상대 궁성 안의 졸이에요. 마·상은 어디서든 자기 모양대로만 움직여요.",
      },
      {
        kind: "explain",
        title: "장군!",
        body: [
          "상대 기물이 내 궁을 잡을 수 있게 되면 **장군**이에요. 장군을 받으면 다음 수로 꼭 풀어야 해요.",
          "궁을 비키거나, 사이를 막거나, 장군 부른 기물을 잡으면 풀려요. 궁이 잡히는 수는 둘 수 없어요.",
        ],
        scene: CHECK_SCENE,
      },
      {
        kind: "mission",
        title: "장군 풀기",
        objective:
          "한 차가 **장군**을 불렀어요. 내 **차**로 그 차를 잡아 장군을 푸세요.",
        hint: "내 차(71)와 한 차(75)는 같은 가로줄에 있어요.",
        scenario: CHECK_SCENE,
        check: firstTo("75"),
        success:
          "장군을 풀고 차까지 얻었어요! 장군 부른 기물을 잡는 것이 가장 좋은 풀기예요.",
        fail: "장군은 풀었지만 차를 잡을 기회를 놓쳤어요. 다시 해 봐요.",
        solution: [move("71", "75")],
        mistake: [move("95", "94")],
      },
    ],
  },
  {
    id: "mate",
    title: "외통",
    summary: "장군을 어떻게 해도 풀 수 없으면 외통, 그 판을 이긴다",
    steps: [
      {
        kind: "explain",
        title: "외통으로 끝내요",
        body: [
          "장군을 받았는데 궁을 비킬 곳도, 막을 기물도, 잡을 방법도 없으면 **외통**이에요. 그 판을 이겨요.",
          "그림에서 한 궁은 모서리에 몰렸고, 내 차 하나가 궁 옆 줄을 막고 있어요.",
        ],
        scene: MATE_SCENE,
      },
      {
        kind: "mission",
        title: "외통 두기",
        objective: "한 수로 **외통**을 만드세요.",
        hint: "오른쪽 차(59)를 맨 윗줄로 올리면 한 궁이 갈 곳이 없어요.",
        scenario: MATE_SCENE,
        check: (ctx) => (myFirstMove(ctx) ? (wonRound(ctx) ?? "fail") : null),
        success: "외통! 장군을 풀 수 없게 몰면 이겨요.",
        fail: "아직 외통이 아니에요. 한 궁이 피할 곳이 없게 장군을 불러 보세요.",
        solution: [move("59", "19")],
        mistake: [move("59", "58")],
      },
    ],
  },
  {
    id: "score",
    title: "쉬기·빅장·점수",
    summary: "외통 말고도 판이 끝나는 길. 남은 기물 점수로 가린다",
    steps: [
      {
        kind: "explain",
        title: "한 수 쉬기",
        body: [
          "장기는 둘 수가 마땅치 않으면 **한 수 쉴** 수 있어요(「한 수 쉬기」 단추). 다만 **장군을 받는 중에는** 쉴 수 없어요.",
          "두 사람이 **잇달아 쉬면** 더 둘 게 없다고 보고 점수로 판을 끝내요.",
        ],
      },
      {
        kind: "explain",
        title: "점수로 가리기",
        body: [
          "외통 없이 끝나면 **남은 기물 점수**를 더해 많은 쪽이 이겨요. 차 13 · 포 7 · 마 5 · 상 3 · 사 3 · 졸 2점이에요.",
          "뒤에 두는 **한은 1.5점을 더** 받아요(덤). 그래서 점수가 같을 수 없어요.",
          "**같은 판이 세 번** 되풀이되거나, 두 편 합쳐 **200수**가 지나도 점수로 끝나요. 자리 표의 점수가 지금 남은 점수예요.",
        ],
      },
      {
        kind: "explain",
        title: "빅장",
        body: [
          "두 궁이 같은 세로줄에서 사이에 기물 없이 **마주 보면 빅장**이에요. 기본 규칙에서는 빅장이 되는 순간 점수로 판이 끝나요.",
          "그래서 점수가 앞설 때는 빅장을 불러 이길 수 있고, 뒤질 때는 빅장을 피해야 해요. 옵션에서 **빅장 금지**로 바꾸면 빅장이 되는 수는 둘 수 없어요.",
        ],
        scene: BIKJANG_SCENE,
      },
      {
        kind: "quiz",
        question: "외통 없이 끝났고 남은 기물이 초 30점, 한 30점이면?",
        options: ["초가 이긴다", "한이 이긴다", "비긴다"],
        answer: 1,
        explain:
          "한은 뒤에 두는 대신 1.5점을 더 받아요. 30 대 31.5로 한이 이겨요.",
      },
      {
        kind: "mission",
        title: "빅장으로 끝내기",
        objective:
          "초가 점수로 크게 앞서요. **궁을 옮겨 빅장**을 만들어 점수로 이기세요.",
        hint: "한 궁(24)과 같은 세로줄이 되게 내 궁(95)을 왼쪽(94)으로 옮겨 보세요.",
        scenario: BIKJANG_SCENE,
        check: (ctx) => (myFirstMove(ctx) ? (wonRound(ctx) ?? "fail") : null),
        success: "빅장! 점수가 앞서 있어 이겼어요. 뒤질 때는 빅장을 조심해요.",
        fail: "아직 빅장이 아니에요. 두 궁이 같은 세로줄에서 마주 보게 해 보세요.",
        solution: [move("95", "94")],
        mistake: [move("71", "72")],
      },
    ],
  },
  {
    id: "opening",
    title: "차 길 열기",
    summary: "차 길을 열고, 마·상을 꺼내고, 궁 둘레는 지킨다",
    steps: [
      {
        kind: "explain",
        title: "차 길부터 열어요",
        body: [
          "처음에는 차 앞을 졸이 막고 있어 차가 두 칸밖에 못 가요. 점이 지금 차가 갈 수 있는 곳이에요.",
          "**변 졸을 옆으로 한 칸** 비키면 차가 세로줄을 따라 쭉 나갈 수 있어요. 가장 센 기물을 일찍 쓸 수 있게 해요.",
        ],
        scene: { ...START, show: "01" },
      },
      {
        kind: "explain",
        title: "마·상을 꺼내고 궁은 지켜요",
        body: [
          "마·상은 처음 줄에 있으면 하는 일이 없어요. 앞으로 꺼내 가운데를 노리게 해요.",
          "**궁과 사는 궁성 안에서 서로 붙어** 있게 두고, 궁을 일찍 움직이지 않아요.",
          "같은 기물을 여러 번 움직이기보다 여러 기물을 하나씩 꺼내요. 포는 넘을 기물(다리)이 있어야 힘을 써요.",
        ],
        scene: START,
      },
      {
        kind: "quiz",
        question: "초반에 먼저 하면 좋은 것은?",
        options: [
          "졸을 비켜 차가 나갈 길을 연다",
          "궁을 궁성 밖으로 내보낸다",
          "같은 마를 세 번 움직인다",
        ],
        answer: 0,
        explain:
          "차는 가장 센 기물이에요. 길을 열어 일찍 쓰고, 궁은 궁성 안에서 사와 함께 지켜요.",
      },
      {
        kind: "mission",
        title: "차 길 열기",
        objective: "한 수로 **차가 쭉 나갈 길**을 여세요.",
        hint: "왼쪽 끝 졸(71)을 옆(72)으로 비켜 보세요. 오른쪽 끝 졸(79)도 돼요.",
        scenario: START,
        check: rookOpened,
        success: "길이 열렸어요! 이제 차가 세로줄을 따라 멀리 나갈 수 있어요.",
        fail: "아직 차 앞이 막혀 있어요. 차 바로 앞 졸을 옆으로 비켜 보세요.",
        solution: [move("71", "72")],
        mistake: [move("02", "83")],
      },
    ],
  },
  SETUPS_LESSON,
  FIRST_MOVES_LESSON,
  {
    id: "real",
    title: "실전",
    summary: "상차림부터 입문 컴퓨터와 한 판",
    steps: [
      {
        kind: "explain",
        title: "상차림과 두는 요령",
        body: [
          "판을 시작할 때 **마·상 자리**를 넷 가운데 골라요(**상차림**). 한이 먼저 고르고 초가 골라요.",
          "한 수 두기 전에 ① 상대가 내 기물을 잡을 수 있나 ② 내가 공짜로 잡을 기물이 있나를 살펴요.",
          "차는 가장 센 기물이에요. 차를 일찍 내주지 않게 조심해요.",
        ],
      },
      {
        kind: "mission",
        title: "첫 승리",
        objective: "초로 **입문 컴퓨터**와 한 판 두어 이기세요.",
        hint: "기물 점수(차 13·포 7·마 5·상 3·사 3·졸 2)를 생각하며, 공짜로 내주지 말고 공짜는 잡아요.",
        scenario: null,
        check: wonRound,
        success: "첫 승리예요! 이제 중수·고수와 겨뤄 보세요.",
        fail: "아쉬워요. 내 기물이 잡히지 않는지 살피며 다시 해 봐요.",
      },
    ],
  },
];
