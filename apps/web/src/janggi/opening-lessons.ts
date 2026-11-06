import {
  type Action,
  applyMove,
  baseBoard,
  type Cell,
  type Piece,
  placeSetup,
  pointAt,
  pointName,
  type Setup,
} from "@game/janggi-engine";

import type { JanggiLesson, JanggiScene } from "./tutorial";
import { choseSetup, firstTo, move, standsWithin } from "./tutorial-checks";

/**
 * 포진·첫 수 단원(2026-11-06). 자료와 근거는 docs/23 「포진과 첫 수 자료」.
 * 판에 관한 말(어느 마가 어디를 지키나, 어느 수가 잡히나)은 opening-lessons.test.ts가 엔진으로 확인한다
 */

/** 상차림마다 다른 이름과, 그 차림에서 짜는 포진 */
export const SETUP_NAMES: Record<Setup, { name: string; formation: string }> = {
  NENE: { name: "오른상차림", formation: "귀마" },
  ENEN: { name: "왼상차림", formation: "귀마" },
  NEEN: { name: "안상차림", formation: "원앙마" },
  ENNE: { name: "바깥상차림", formation: "양귀마" },
};

/** 처음 판에서 수를 둔 장면. 수는 기보 글자("02-83") */
export interface OpeningPosition {
  cho: Setup;
  han: Setup;
  moves: readonly string[];
  /** 초 수만 잇달아 둔 그림(마를 꺼낸 모양 보기). 없으면 초부터 번갈아 둔 수순 */
  choOnly?: boolean;
}

function boardOf({ cho, han, moves }: OpeningPosition): Cell[] {
  const board = baseBoard();
  placeSetup(board, "c", cho);
  placeSetup(board, "h", han);
  let now: Cell[] = board;
  for (const text of moves) {
    const [from = "", to = ""] = text.split("-");
    now = applyMove(now, { from: pointAt(from), to: pointAt(to) });
  }
  return now;
}

/** 장면의 기물을 자리 이름("95")으로 */
export function positionPieces(
  position: OpeningPosition,
): Record<string, Piece> {
  const pieces: Record<string, Piece> = {};
  boardOf(position).forEach((cell, at) => {
    if (cell !== "") pieces[pointName(at)] = cell;
  });
  return pieces;
}

/** 두 편 상차림으로 놓은 처음 판에 초부터 번갈아 수를 둔 판의 기물 */
export function openingPieces(
  cho: Setup,
  han: Setup,
  moves: readonly string[] = [],
): Record<string, Piece> {
  return positionPieces({ cho, han, moves });
}

/** 단원에 쓰는 장면. 시험이 모든 수가 규칙에 맞는지 본다 */
export const POSITIONS = {
  /** 마상마상: 진마(02→83)와 귀마(07→86)를 꺼낸 모양 */
  gwima: { cho: "NENE", han: "NENE", moves: ["02-83", "07-86"], choOnly: true },
  /** 마상상마: 두 마(02→83, 08→87)를 꺼낸 모양 */
  wonang: {
    cho: "NEEN",
    han: "NENE",
    moves: ["02-83", "08-87"],
    choOnly: true,
  },
  /** 상마마상: 두 마가 모두 궁성 귀(03→84, 07→86)로 간 모양 */
  yanggwima: {
    cho: "ENNE",
    han: "NENE",
    moves: ["03-84", "07-86"],
    choOnly: true,
  },
  /** 면포 앞: 진마(02→83)를 올려 포(82)가 넘을 다리가 생겼다 */
  beforeCenterCannon: {
    cho: "NENE",
    han: "NENE",
    moves: ["02-83"],
    choOnly: true,
  },
  /** 찻길을 연 뒤, 한도 병을 쓸었다. 차로 41 병을 잡으면? */
  greedyRook: { cho: "NENE", han: "NENE", moves: ["71-72", "49-48"] },
} satisfies Record<string, OpeningPosition>;

/** 변 병 욕심: 찻길을 열자마자 차로 병을 잡으면 한 차가 그 차를 잡는다 */
export const GREEDY_ROOK_LINE = ["71-72", "49-48", "01-41", "11-41"] as const;
/** 마 서두르기: 귀마를 바로 깊이 보내면 병이 잡는다 */
export const HASTY_HORSE_LINE = ["07-86", "45-55", "86-65", "55-65"] as const;

const START: JanggiScene = { pieces: openingPieces("NENE", "NENE") };

const scene = (
  position: OpeningPosition,
  extra: Omit<JanggiScene, "pieces"> = {},
): JanggiScene => ({ pieces: positionPieces(position), ...extra });

const setupAction = (setup: Setup): Action => ({ type: "setup", setup });

export const SETUPS_LESSON: JanggiLesson = {
  id: "setups",
  title: "포진 고르기",
  summary: "상차림 넷의 특징과 약점. 처음에는 귀마(마상마상)가 쉽다",
  steps: [
    {
      kind: "explain",
      title: "상차림은 넷이에요",
      body: [
        "판을 시작할 때 **마**와 **상** 자리만 바꿀 수 있어요. 양쪽에 마 하나·상 하나씩 두니 차림은 **넷**이에요.",
        "**한이 먼저** 고르고, **초는 그것을 보고** 골라요.",
        "이름은 **내 자리에서 왼쪽부터** 읽어요. 판 위 단추를 눌러 내 차림을 바꿔 보세요.",
      ],
      scene: { ...START, pickSetup: true },
    },
    {
      kind: "explain",
      title: "귀마: 마상마상·상마상마",
      body: [
        "**마상마상(오른상차림)**과 **상마상마(왼상차림)**는 마 하나가 곧장 **궁성 귀**(궁성 모서리, 그림의 86)로 가요. 그래서 **귀마**라고 해요. 포 옆에 서는 다른 마(83)는 **진마**예요.",
        "가장 많이 두는 차림이에요. 원앙마보다 **빨리 갖춰지고**, 뒤에 두는 한으로 둬도 무리 없이 짤 수 있어요.",
        "약점: 두 마가 떨어져 있어 서로 지켜 주지 못해요. 처음 하는 사람은 상대 차가 줄을 따라 들어와 **진마나 면포를 잃는** 일이 많아요.",
      ],
      scene: scene(POSITIONS.gwima, { rings: ["83", "86"] }),
    },
    {
      kind: "explain",
      title: "원앙마: 마상상마",
      body: [
        "**마상상마(안상차림)**는 상 둘이 안쪽(사 옆)에 있어요. 두 마를 가운데로 꺼내 서로 받쳐 주는 **원앙마**를 짜요. 원앙은 늘 붙어 다니는 새예요.",
        "단단하고, 두 포를 빨리 나눠 쓸 수 있어요. 그림처럼 두 마(83·87)가 모두 **가운데 졸(75)**을 지켜요.",
        "약점: 갖추는 데 수가 많이 들어요. 마가 공격하러 나가면 짝이 깨지니, 처음에는 **지키기를 먼저** 하고 나중에 공격해요.",
      ],
      scene: scene(POSITIONS.wonang, { rings: ["83", "87", "75"] }),
    },
    {
      kind: "explain",
      title: "양귀마: 상마마상",
      body: [
        "**상마마상(바깥상차림)**은 상 둘이 바깥(차 옆)에 있어요. 두 마가 모두 궁성 귀로 가서 **양귀마**예요.",
        "공격이 가장 세요. 두 상이 귀 위로 나가 상대 찻길을 막고, 차·포·상이 함께 쳐요.",
        "약점: 그림처럼 두 마 모두 **가운데 졸(75)을 지키지 못해** 상대 포에 잡히기 쉬워요. 이것을 막는 법을 알아야 해서 처음 하는 사람에게는 어려워요.",
      ],
      scene: scene(POSITIONS.yanggwima, { rings: ["84", "86"], warn: ["75"] }),
    },
    {
      kind: "explain",
      title: "상대 차림에 맞추기",
      body: [
        "먼저 두고 차림도 나중에 고르는 초가 유리해서, 한은 점수를 1.5점 더 받아요(덤).",
        "**상대가 귀마**면 나도 귀마로 맞서는 판이 가장 흔해요. 원앙마로 맞선다면 첫 수는 진마 쪽 졸을 쓸어요.",
        "**상대가 원앙마**면 판이 느리게 흘러요. 원앙마는 지키기부터 하는 차림이라 원앙마끼리 만나면 더 그래요.",
        "**상대가 양귀마**면 상대 가운데 병이 약해요. 가운데 줄을 노려 볼 만해요.",
        "원앙마·양귀마는 **뒤에 두는 한**으로 두면 더 어려워요. 귀마는 어느 편이든 무난해요.",
      ],
    },
    {
      kind: "explain",
      title: "한의 차림은 거꾸로 보여요",
      body: [
        "한도 **자기 자리에서 왼쪽부터** 읽어요. 한은 판 위쪽에서 나를 보고 앉으니, 한의 왼쪽은 내 쪽에서 보면 오른쪽이에요.",
        "그림의 한은 **마상마상**이에요. 내 쪽에서 왼쪽부터 읽으면 상(12)·마(13)… 하고 **상마상마**로 보여요.",
      ],
      scene: { ...START, rings: ["12", "13"] },
    },
    {
      kind: "quiz",
      question: "처음 배울 때 고르기 쉬운 상차림은?",
      options: ["마상마상(귀마)", "상마마상(양귀마)", "마상상마(원앙마)"],
      answer: 0,
      explain:
        "귀마는 가장 많이 두고 빨리 갖춰져요. 이 배우기의 판도 모두 마상마상이에요. 양귀마는 가운데 졸이 약하고, 원앙마는 갖추는 데 오래 걸려요.",
    },
    {
      kind: "quiz",
      question: "그림 아래쪽 초의 상차림은?",
      scene: { pieces: openingPieces("ENNE", "NENE") },
      options: ["마상마상", "상마마상", "마상상마"],
      answer: 1,
      explain:
        "왼쪽부터 상·마·마·상이에요. 상이 바깥(차 옆)에 있는 바깥상차림, 양귀마를 짜는 차림이에요.",
    },
    {
      kind: "mission",
      title: "상차림 고르기",
      objective:
        "실제 판에서 처음 배우기 좋은 **마상마상**을 고르세요. 한(컴퓨터)이 먼저 고르면 내 차례예요.",
      hint: "판 아래 상차림 단추 넷 가운데 「마상마상」이에요.",
      scenario: null,
      check: choseSetup("NENE"),
      success:
        "골랐어요! 마 하나가 바로 궁성 귀로 갈 수 있는 귀마 차림이에요. 이어서 두어 봐도 돼요.",
      fail: "그 차림도 둘 수 있지만, 처음에는 마상마상이 쉬워요. 다시 골라 봐요.",
      solution: [setupAction("NENE")],
      mistake: [setupAction("ENNE")],
    },
  ],
};

export const FIRST_MOVES_LESSON: JanggiLesson = {
  id: "first-moves",
  title: "첫 수와 초반 원칙",
  summary:
    "차 앞 졸을 쓸어 찻길을 열고, 진마와 면포로 궁을 지킨다. 욕심 수는 잡힌다",
  steps: [
    {
      kind: "explain",
      title: "첫 수: 차 앞 졸을 옆으로",
      body: [
        "자리는 판 가장자리 숫자 둘로 불러요. **앞 숫자는 가로줄**(왼쪽 숫자, 위에서부터 1~9, 맨 아래 줄은 0), **뒤 숫자는 세로줄**(위쪽 숫자, 왼쪽부터 1~9)이에요. 79는 7번 가로줄과 9번 세로줄이 만나는 자리예요.",
        "첫 수로 가장 흔한 수는 **차 앞 졸을 옆으로 한 칸 쓸어** 찻길(차가 다닐 길)을 여는 수예요. 프로 해설에서도 이 수를 첫 수의 정석으로 꼽아요.",
        "어느 쪽 졸일까요? 귀마끼리 맞설 때 초는 **차 바로 옆에 상이 있는 쪽** 졸을 써요. 마상마상이면 오른쪽 차(09) 옆에 상(08)이 있으니 **79 졸을 78로** 옮겨요.",
        "옮긴 졸은 옆 졸(77)과 나란히 서서 서로 지켜 줘요. 졸은 옆으로도 잡을 수 있어서예요.",
      ],
      scene: { ...START, show: "79", rings: ["09", "08", "77"] },
    },
    {
      kind: "mission",
      title: "상 쪽 졸 쓸기",
      objective:
        "**차 바로 옆에 상이 있는 쪽** 졸을 옆으로 쓸어 찻길을 여세요.",
      hint: "오른쪽 끝 차(09) 옆에 상(08)이 있어요. 오른쪽 끝 졸(79)을 왼쪽(78)으로 옮겨요.",
      scenario: START,
      check: firstTo("78"),
      success:
        "찻길이 열렸어요! 이제 오른쪽 차가 세로줄을 따라 멀리 나갈 수 있어요.",
      fail: "그 수도 둘 수 있지만, 이번에는 상이 차 옆에 있는 오른쪽 졸(79)을 쓸어 봐요.",
      solution: [move("79", "78")],
      mistake: [move("71", "72")],
    },
    {
      kind: "explain",
      title: "다음 수: 진마와 면포",
      body: [
        "포 옆으로 오는 마를 **진마**라고 해요. 진마(02→83)를 올리면 포(82)가 그 마를 넘을 수 있어요. 점이 지금 포가 갈 수 있는 곳이에요.",
        "포가 궁 바로 앞 가운데(85)에 서면 **면포**예요. 면은 궁성 앞 가운데 자리예요. 면포는 궁 앞을 막아 지키고, 가운데 줄을 따라 상대 진을 노려요.",
        "처음 판에서는 포가 넘을 기물이 없어 포를 움직일 수 없어요. 마를 꺼내야 포가 힘을 써요.",
      ],
      scene: scene(POSITIONS.beforeCenterCannon, { show: "82", rings: ["83"] }),
    },
    {
      kind: "mission",
      title: "면포 놓기",
      objective:
        "내 수 두 번 안에 **면포**를 놓으세요. 진마를 먼저 올리고, 포가 그 마를 넘어 가운데(85)로 가요.",
      hint: "왼쪽 마(02)를 83으로 올린 뒤, 포(82)를 85로 옮겨요.",
      scenario: START,
      check: standsWithin("cC", "85", 2),
      success: "면포를 놓았어요! 궁 앞 가운데를 포가 지켜요.",
      fail: "포가 가운데(85)에 서지 않았어요. 진마를 올리고 포가 그 마를 넘게 해 봐요.",
      solution: [move("02", "83"), move("82", "85")],
      mistake: [move("02", "83"), move("82", "84")],
    },
    {
      kind: "explain",
      title: "초반 원칙 넷",
      body: [
        "① **찻길부터 열어요.** 차 앞 졸을 옆으로 쓸면 가장 센 차를 일찍 쓸 수 있어요.",
        "② **마를 꺼내 포가 넘을 다리를 만들어요.** 넘을 기물이 없는 포는 움직이지 못하고 쉽게 잡혀요.",
        "③ **궁은 궁성 가운데에서 사와 함께 지켜요.** 궁을 앞으로 띄우면(천궁) 대개 손해예요.",
        "④ **잡기 전에 되잡히는지 봐요.** 공짜처럼 보이는 졸·병 뒤에 상대 차가 기다리기도 해요.",
      ],
      scene: START,
    },
    {
      kind: "explain",
      title: "피할 수: 차로 변 병 욕심",
      body: [
        "찻길을 열자마자 차로 상대 끝 병(41)을 잡으러 가면 어떻게 될까요? **「다음 수」**를 눌러 한 수씩 보세요.",
        "41 병 뒤 같은 줄에 **한 차(11)**가 있어요. 병(2점)을 얻고 차(13점)를 잃어요. 빨간 점선 고리는 공짜로 잡힐 내 기물이에요.",
      ],
      scene: { ...START, replay: GREEDY_ROOK_LINE, rings: ["41", "11"] },
    },
    {
      kind: "explain",
      title: "피할 수: 마를 서둘러 깊이",
      body: [
        "귀마(86)를 바로 앞으로 깊이(65) 보내면, 한 가운데 병이 한 칸 내려와 마를 잡아요. **「다음 수」**로 보세요.",
        "졸(75)로 다시 잡아도 마(5점)와 병(2점)을 바꿔 3점 손해예요. 마는 졸과 다른 기물이 받쳐 줄 때 앞으로 보내요.",
      ],
      scene: { ...START, replay: HASTY_HORSE_LINE, rings: ["86", "65"] },
    },
    {
      kind: "quiz",
      question: "이 판에서 차로 41 병을 잡으면?",
      scene: scene(POSITIONS.greedyRook, { show: "01", rings: ["41", "11"] }),
      options: [
        "한 차(11)가 내 차를 잡아 손해다",
        "병을 공짜로 얻는다",
        "한 궁이 장군을 받는다",
      ],
      answer: 0,
      explain:
        "41 병과 한 차(11) 사이가 비어 있어, 잡으면 한 차가 바로 내 차를 잡아요. 잡기 전에 그 자리를 누가 지키는지 봐요.",
    },
    {
      kind: "quiz",
      question: "처음 판에서 첫 수로 움직일 수 **없는** 기물은?",
      scene: START,
      options: ["포", "졸", "마"],
      answer: 0,
      explain:
        "포는 기물 하나를 넘어야 움직여요. 처음 판에는 포가 넘을 기물이 없어요. 마를 꺼내거나 졸을 쓸면 다리가 생겨요.",
    },
    {
      kind: "quiz",
      question: "이 판(두 편 모두 마상마상)에서 좋은 첫 수는?",
      scene: { ...START, rings: ["79", "95"] },
      options: ["오른쪽 끝 졸을 옆으로(79→78)", "궁을 앞으로 띄운다(95→85)"],
      answer: 0,
      explain:
        "차 앞 졸을 옆으로 쓸어 찻길을 여는 수가 첫 수의 정석이에요. 궁을 앞으로 띄우면(천궁) 궁 둘레가 비어 위험해져요.",
    },
  ],
};
