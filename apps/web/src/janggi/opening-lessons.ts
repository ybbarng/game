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

import { OPENING_LINE_MOVES, OPENING_LINE_NOTES } from "./opening-line";
import type { JanggiLesson, JanggiScene } from "./tutorial";
import { choseSetup, firstTo, move, standsWithin } from "./tutorial-checks";

/**
 * 자리 부르기·포진·첫 수·상대 차림 맞추기·초반 21수 단원(2026-11-06). 자료와 근거는 docs/23 「포진과 첫 수 자료」.
 * 판에 관한 말(어느 마가 어디를 지키나, 어느 수가 잡히나, 주고받은 점수)은 opening-lessons.test.ts가 엔진으로 확인한다
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

/** 단원에 쓰는 정지 장면. 시험이 모든 수가 규칙에 맞는지 본다 */
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
  /** 찻길을 연 뒤 진마·귀마를 꺼냈다. 두 포 모두 마를 넘어 면(85)에 갈 수 있다 */
  twoCannons: {
    cho: "NENE",
    han: "NENE",
    moves: ["79-78", "02-83", "07-86"],
    choOnly: true,
  },
  /** 오른쪽 찻길을 연 뒤, 한도 병을 쓸었다. 차로 49 병을 잡으면? */
  greedyRook: { cho: "NENE", han: "NENE", moves: ["79-78", "41-42"] },
  /** 초반 21수의 16수째 뒤: 한 차(26)가 내 상(76)을 노린다 */
  rookEyesElephant: {
    cho: "NENE",
    han: "NENE",
    moves: OPENING_LINE_MOVES.slice(0, 16),
  },
} satisfies Record<string, OpeningPosition>;

/** 넘겨 보는 수순. 모두 처음 판에서 시작한다(차림은 `REPLAY_SETUPS`) */
export const LINES = {
  /** 귀마 장점: 초 혼자 세 수(진마·귀마·면포) */
  gwimaFast: ["02-83", "07-86", "82-85"],
  /** 귀마 약점: 진마·면포 뒤 빈 2번 세로줄로 차를 옮기면 한 포가 병을 넘어 잡는다 */
  emptyFile: [
    "79-78",
    "41-42",
    "02-83",
    "18-37",
    "82-85",
    "38-35",
    "01-02",
    "32-02",
  ],
  /** 원앙마 장점: 한 면포가 가운데 졸을 잡으면 상이 되잡는다(지키는 기물이 여럿) */
  wonangGuard: ["02-83", "18-37", "08-87", "38-35", "79-78", "35-75", "03-75"],
  /** 원앙마 약점: 초 혼자 다섯 수(두 마·면포·가운데 졸 비키기·가운데 상) */
  wonangSlow: ["02-83", "08-87", "82-85", "75-74", "03-75"],
  /** 양귀마 장점: 초 혼자 두 수로 두 마가 궁성 양쪽 귀에 */
  yangFast: ["03-84", "07-86"],
  /** 양귀마 약점: 한 면포가 지키는 마가 없는 가운데 졸을 공짜로 잡는다 */
  yangCenter: ["03-84", "18-37", "07-86", "38-35", "79-78", "35-75"],
  /** 맞상: 귀마와 귀윗상을 올리면 두 편 상이 같은 세로줄(6번)에서 마주 선다 */
  matsang: ["07-86", "17-36", "08-76", "18-46"],
  /** 첫 수: 귀마 쪽 졸을 비키면 오른쪽 차가 나간다 */
  firstMove: ["79-78"],
  /** 천궁: 궁이 면을 차지하면 한 포가 가운데 졸 하나만 넘어 장군을 부른다 */
  cheongung: ["95-85", "18-37", "79-78", "38-35", "02-83", "45-44"],
  /** 같은 한의 수에 궁은 95, 면포를 놓았으면 장군이 아니다(시험이 견준다) */
  cheongungContrast: ["02-83", "18-37", "79-78", "38-35", "82-85", "45-44"],
  /** 변병 욕심: 연 찻길로 차가 49 병을 잡으면 한 차가 그 차를 잡는다 */
  greedyRook: ["79-78", "41-42", "09-49", "19-49"],
  /** 미끼를 보고 마를 깊이: 병(43)을 노리러 간 진마를 한 포가 병(42)을 넘어 잡는다 */
  hastyHorse: ["02-83", "41-42", "73-74", "18-37", "83-62", "32-62"],
} as const;

/** 넘겨 보기 수순마다 두 편 차림 */
export const REPLAY_SETUPS: Record<
  keyof typeof LINES,
  { cho: Setup; han: Setup }
> = {
  gwimaFast: { cho: "NENE", han: "NENE" },
  emptyFile: { cho: "NENE", han: "NENE" },
  wonangGuard: { cho: "NEEN", han: "NENE" },
  wonangSlow: { cho: "NEEN", han: "NENE" },
  yangFast: { cho: "ENNE", han: "NENE" },
  yangCenter: { cho: "ENNE", han: "NENE" },
  matsang: { cho: "NENE", han: "ENEN" },
  firstMove: { cho: "NENE", han: "NENE" },
  cheongung: { cho: "NENE", han: "NENE" },
  cheongungContrast: { cho: "NENE", han: "NENE" },
  greedyRook: { cho: "NENE", han: "NENE" },
  hastyHorse: { cho: "NENE", han: "NENE" },
};

const START: JanggiScene = { pieces: openingPieces("NENE", "NENE") };

const scene = (
  position: OpeningPosition,
  extra: Omit<JanggiScene, "pieces"> = {},
): JanggiScene => ({ pieces: positionPieces(position), ...extra });

/** 처음 판에서 넘겨 보는 그림 */
const replayScene = (
  line: keyof typeof LINES,
  notes: readonly string[],
  extra: Omit<JanggiScene, "pieces" | "replay" | "notes"> = {},
): JanggiScene => {
  const { cho, han } = REPLAY_SETUPS[line];
  return {
    pieces: openingPieces(cho, han),
    replay: LINES[line],
    notes,
    ...extra,
  };
};

const setupAction = (setup: Setup): Action => ({ type: "setup", setup });

export const COORDS_LESSON: JanggiLesson = {
  id: "coords",
  title: "자리 부르기",
  summary:
    "자리는 가로줄 숫자와 세로줄 숫자 둘로 부른다. 79는 7번 가로줄·9번 세로줄",
  steps: [
    {
      kind: "explain",
      title: "자리는 숫자 둘로 불러요",
      body: [
        "판 왼쪽 숫자는 **가로줄**이에요. 위에서부터 1~9, 맨 아래 줄은 0이에요. 판 위쪽 숫자는 **세로줄**이에요. 왼쪽부터 1~9예요.",
        "자리는 **가로줄 숫자를 먼저, 세로줄 숫자를 뒤에** 붙여 불러요. 고리 친 **79**는 7번 가로줄과 9번 세로줄이 만나는 자리, 내 오른쪽 끝 졸이에요. **01**은 맨 아래 줄 왼쪽 끝, 내 차예요.",
        "수도 이렇게 적어요. **79-78**은 79에 있는 기물을 78로 옮긴 수예요. 앞으로 나오는 설명과 기보는 모두 이 이름을 써요.",
      ],
      scene: { ...START, rings: ["79", "01"] },
    },
    {
      kind: "quiz",
      question: "고리 친 내 궁의 자리 이름은?",
      scene: { ...START, rings: ["95"] },
      options: ["95", "59", "05"],
      answer: 0,
      explain:
        "궁은 9번 가로줄(아래에서 둘째 줄)과 5번 세로줄(가운데)이 만나는 자리라 95예요.",
    },
    {
      kind: "quiz",
      question: "고리 친 한 차의 자리 이름은?",
      scene: { ...START, rings: ["19"] },
      options: ["91", "19", "10"],
      answer: 1,
      explain:
        "맨 위가 1번 가로줄, 오른쪽 끝이 9번 세로줄이라 19예요. 가로줄 숫자를 먼저 불러요.",
    },
  ],
};

export const SETUPS_LESSON: JanggiLesson = {
  id: "setups",
  title: "포진 고르기",
  summary:
    "상차림 넷의 특징과 약점을 판 위 수순으로 본다. 처음에는 귀마(마상마상)가 쉽다",
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
      title: "먼저 알아 둘 말",
      body: [
        "**귀**는 궁성 윗줄의 양 모서리(84·86), **면**은 그 가운데(85)예요. 그림의 고리가 그 자리예요.",
        "**귀마**는 궁성 귀로 들어가는 마, **진마**는 포 바로 옆(83)으로 나오는 마예요.",
        "**면포**·**면상**은 포·상을 면(85)에 놓는 것이에요. **천궁**은 궁이 궁성 맨 윗줄(84~86)로 올라가는 것이에요.",
        "**변졸**(한은 **변병**)은 가장 바깥 졸이에요(71·79). **찻길**은 차가 다니는 세로줄이에요.",
        "**맞상**은 두 편 상이 같은 세로줄에 서는 것, **엇상**은 엇갈려 서는 것이에요. 뒤에서 판으로 보여 드려요.",
      ],
      scene: { ...START, rings: ["84", "85", "86", "71", "79"] },
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
      kind: "explain",
      title: "귀마: 마상마상·상마상마",
      body: [
        "**마상마상(오른상차림)**과 **상마상마(왼상차림)**는 마 하나가 곧장 **궁성 귀**로 가요. 그래서 **귀마** 차림이라고 해요. 포 옆에 서는 다른 마는 **진마**예요.",
        "가장 많이 두는 차림이에요. 뒤에 두는 한으로 둬도 무리 없이 짤 수 있어요.",
        "장점은 **빨리 갖춰지는 것**이에요. 「다음 수」를 누르면 세 수 만에 마 둘이 나오고 면포까지 서요.",
      ],
      scene: replayScene(
        "gwimaFast",
        [
          "진마가 포(82) 옆으로 나와 포가 넘을 다리가 생겨요.",
          "귀마가 궁성 귀(86)로 들어가 궁 곁을 지켜요.",
          "포가 진마를 넘어 면포가 서요. 세 수 만에 갖췄어요.",
        ],
        { replayBy: "cho" },
      ),
    },
    {
      kind: "explain",
      title: "귀마의 약점: 비는 세로줄",
      body: [
        "귀마의 두 마(83·86)는 멀리 떨어져 서로 지켜 주지 못해요. 그리고 진마와 면포가 나가면 **2번 세로줄이 텅 비어요**.",
        "처음 하는 사람은 그 빈 줄로 들어오는 한 기물에 진마나 면포, 차를 잃기 쉬워요. 「다음 수」로 차를 빈 줄로 옮긴 판을 보세요.",
      ],
      scene: replayScene("emptyFile", [
        "귀마 쪽 찻길을 열어요.",
        "한도 찻길을 열어요. 42 병이 2번 세로줄에 서요.",
        "진마가 나가 02가 비어요.",
        "한도 진마를 올려요.",
        "면포가 나가 82도 비어요. 2번 세로줄에 내 기물이 하나도 없어요.",
        "한도 면포를 놓아요.",
        "왼쪽 차를 빈 02로 옮겼어요. 그런데 한 포(32)와 이 차 사이에 병(42) 하나만 있어요.",
        "한 포가 병을 넘어 차를 잡아요. 빈 줄을 쓸 때는 상대 포가 넘을 다리가 있는지 봐요.",
      ]),
    },
    {
      kind: "explain",
      title: "원앙마: 마상상마",
      body: [
        "**마상상마(안상차림)**는 상 둘이 안쪽(사 옆)에 있어요. 두 마를 가운데 쪽으로 꺼내 상과 서로 받쳐 주게 짜는 포진이 **원앙마**예요. 원앙은 늘 붙어 다니는 새예요.",
        "장점은 **단단한 것**이에요. 두 마(83·87)와 두 상(03·07)이 모두 가운데 졸(75)을 지켜요. 「다음 수」로 한 면포가 그 졸을 잡으러 온 판을 보세요.",
      ],
      scene: replayScene("wonangGuard", [
        "진마를 올려요.",
        "한도 진마를 올려요.",
        "다른 마도 가운데 쪽(87)으로 올려요. 두 마가 모두 75 졸을 지켜요.",
        "한이 면포를 놓아 75 졸을 노려요.",
        "찻길을 열어요.",
        "한 포가 병(45)을 넘어 75 졸을 잡았어요.",
        "상이 되잡아요. 졸(2점)을 주고 포(7점)를 얻었어요.",
      ]),
    },
    {
      kind: "explain",
      title: "원앙마의 약점: 갖추는 데 수가 많이 들어요",
      body: [
        "원앙마는 흔히 두 마와 면포에 더해, 가운데 졸을 비키고 가운데 상까지 올려 갖춰요. 「다음 수」로 세어 보면 다섯 수예요. 귀마는 세 수였어요.",
        "그동안 마가 공격하러 나가면 짝이 깨져요. 그래서 처음에는 **지키기를 먼저** 하고 나중에 공격해요.",
      ],
      scene: replayScene(
        "wonangSlow",
        [
          "진마를 올려요.",
          "다른 마도 가운데 쪽으로 올려요.",
          "면포를 놓아요.",
          "가운데 졸을 옆으로 비켜 상이 올라올 길을 열어요.",
          "상이 가운데(75)로 올라와요. 다섯 수 만에 갖췄어요.",
        ],
        { replayBy: "cho" },
      ),
    },
    {
      kind: "explain",
      title: "양귀마: 상마마상",
      body: [
        "**상마마상(바깥상차림)**은 상 둘이 바깥(차 옆)에 있어요. 두 마가 모두 궁성 귀로 가서 **양귀마**예요.",
        "장점은 「다음 수」로 보듯 두 수 만에 **두 마가 궁 양쪽 귀를 지키는 것**이에요. 그 사이 바깥의 상과 차가 공격에 나서, 흔히 공격이 가장 세다고 해요.",
      ],
      scene: replayScene(
        "yangFast",
        [
          "마가 왼쪽 귀(84)로 들어가요.",
          "다른 마도 오른쪽 귀(86)로 들어가요. 궁 양옆을 마가 지켜요.",
        ],
        { replayBy: "cho" },
      ),
    },
    {
      kind: "explain",
      title: "양귀마의 약점: 가운데 졸",
      body: [
        "두 마가 모두 귀로 가면 **가운데 졸(75)을 지키는 마가 없어요**. 「다음 수」로 한 면포가 그 졸을 노리는 판을 보세요.",
        "이것을 막는 법을 알아야 해서 처음 하는 사람에게는 어려워요.",
      ],
      scene: replayScene("yangCenter", [
        "마가 왼쪽 귀로 들어가요.",
        "한이 진마를 올려요.",
        "다른 마도 오른쪽 귀로 들어가요. 75 졸을 지키는 마가 없어요.",
        "한이 면포를 놓아요. 병(45)을 넘어 75 졸을 노려요.",
        "찻길을 열었지만 75 졸은 그대로예요.",
        "한 포가 75 졸을 공짜로 잡아요. 되잡을 기물이 없어요.",
      ]),
    },
    {
      kind: "explain",
      title: "맞상은 왜 피할까요",
      body: [
        "초 **마상마상**과 한 **상마상마**처럼 이름이 다르면, 판 위에서는 두 편이 같은 모양이 돼 상이 같은 세로줄(3·8번)에 서요. 이것을 **맞상**이라고 해요.",
        "「다음 수」로 귀마와 귀윗상(귀 위로 올린 상)까지 올리면 두 상(76·46)이 같은 줄에서 마주 서요.",
        "맞상이 되면 두 편이 같은 쪽 찻길을 열고 상끼리 마주 서서 판이 느려지고, 먼저 두는 초의 이득이 줄어든다고 해요. 그래서 초는 흔히 한과 **같은 이름**을 골라 상을 엇갈리게 둬요(**엇상**).",
      ],
      scene: replayScene(
        "matsang",
        [
          "귀마가 궁성 귀(86)로 들어가요.",
          "한도 귀마를 내 쪽에서 같은 쪽 귀(36)로 들여요.",
          "상을 귀 위(76)로 올려요.",
          "한 상도 귀 위(46)로 와서 두 상이 6번 세로줄에서 마주 서요.",
        ],
        { rings: ["03", "13", "76", "46"] },
      ),
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
    "막힌 쪽 찻길을 먼저 열고, 진마와 면포로 궁을 지킨다. 천궁과 욕심 수는 손해다",
  steps: [
    {
      kind: "explain",
      title: "첫 수: 귀마 쪽 졸을 옆으로",
      body: [
        "첫 수로 가장 흔한 수는 **차 앞 졸을 옆으로 한 칸 쓸어** 찻길을 여는 수예요. 프로 해설에서도 이 수를 첫 수의 정석으로 꼽아요.",
        "어느 쪽일까요? 마상마상이면 **오른쪽(귀마 쪽)**이에요. 오른쪽 차(09)는 앞을 졸(79)이, 옆을 상(08)이 막아 갈 곳이 두 칸뿐이에요. 귀마(07)는 궁성 귀로 들어가니 이 차를 꺼낼 다른 길이 생기지 않아요.",
        "왼쪽 차(01)는 진마(02)가 나가면 그 자리로 옆걸음할 수 있어요. 그래서 막힌 오른쪽을 먼저 열어요.",
        "「다음 수」로 79 졸을 78로 옮겨 보세요. 점이 오른쪽 차가 갈 수 있는 곳이에요.",
      ],
      scene: {
        ...START,
        show: "09",
        rings: ["79", "08"],
        replay: LINES.firstMove,
        notes: [
          "찻길이 열려 차가 세로줄을 따라 49 병까지 닿아요. 78 졸은 77 졸과 나란히 서로 지켜요(졸은 옆으로도 잡아요).",
        ],
      },
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
        "진마(02→83)를 올리면 포(82)가 그 마를 넘을 수 있어요. 점이 지금 포가 갈 수 있는 곳이에요.",
        "포가 면(85)에 서면 **면포**예요. 면포는 궁 앞을 막아 지키고, 가운데 줄을 따라 상대 진을 노려요.",
        "처음 판에서는 포가 넘을 기물이 없어 포를 움직일 수 없어요. 마를 꺼내야 포가 힘을 써요.",
      ],
      scene: scene(POSITIONS.beforeCenterCannon, { show: "82", rings: ["83"] }),
    },
    {
      kind: "explain",
      title: "귀마 쪽 포도 면포가 되지 않나요?",
      body: [
        "돼요. 귀마(86)를 다리 삼아 오른쪽 포(88)도 면(85)에 갈 수 있어요. 점을 보세요.",
        "차이는 **남는 포**예요. 진마 쪽 포(82)를 면포로 쓰면 오른쪽 포(88)가 제자리에 남아, 78 졸을 넘어 8번 세로줄로 한 진에 나갈 수 있어요. 귀마끼리 둘 때 흔히 이렇게 짜요.",
        "귀마 쪽 포를 면포로 쓰면 두 포가 진마와 귀마 사이에 나란히 서서(**마포포마**) 궁 앞을 빨리 지키지만, 공격하는 힘이 약해져요. 그래서 먼저 두는 초는 흔히 진마 쪽 포를 면포로 써요.",
      ],
      scene: scene(POSITIONS.twoCannons, { show: "88", rings: ["82", "85"] }),
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
      title: "천궁은 왜 위험할까요",
      body: [
        "궁이 궁성 맨 윗줄(84~86)로 올라가는 것을 **천궁**이라고 해요. 「다음 수」로 첫 수에 궁을 면(85)으로 올린 판을 보세요.",
        "궁이 면을 차지하면 그 자리에 면포를 놓을 수 없어요. 궁 앞 가운데 줄에 내 졸(75) 하나만 남아, 한 포가 그 졸을 넘어 바로 장군을 불러요. 궁을 95에 두고 면포를 놓았다면 졸과 면포 둘이 사이에 있어 장군이 아니에요.",
        "사(04·06)는 아랫줄에 남아 위로 올라간 궁 곁을 지키지 못해요. 그래서 천궁은 수비하기 어려운 모양으로 꼽혀요.",
      ],
      scene: replayScene("cheongung", [
        "궁을 면(85)으로 올렸어요(천궁).",
        "한이 진마를 올려요.",
        "찻길을 열어요.",
        "한이 면포를 놓아요. 포와 내 궁 사이에 병(45)과 졸(75) 둘이 있어요.",
        "진마를 올려요.",
        "한이 병을 옆으로 비켜요. 이제 포와 궁 사이에 졸 하나만 남아 장군이에요.",
      ]),
    },
    {
      kind: "explain",
      title: "피할 수: 차로 변병 욕심",
      body: [
        "앞에서 연 오른쪽 찻길로 차가 곧장 한 끝 병(49, 변병)을 잡으러 가면 어떻게 될까요? 「다음 수」를 눌러 한 수씩 보세요.",
        "49 병 뒤 같은 줄에 **한 차(19)**가 있어요. 병(2점)을 얻고 차(13점)를 잃어 **11점 손해**예요. 판 아래에 주고받은 점수가 보여요.",
      ],
      scene: replayScene("greedyRook", [
        "귀마 쪽 찻길을 열어요.",
        "한도 찻길을 열어요.",
        "차가 49 병을 잡았어요(2점). 그런데 그 줄 위에 한 차가 있어요.",
        "한 차가 내 차를 잡아요(13점).",
      ]),
    },
    {
      kind: "explain",
      title: "피할 수: 미끼를 보고 마를 깊이",
      body: [
        "졸을 비켜 진마 앞길을 연 뒤, 진마가 병(43)을 노리러 깊이(62) 들어가면 어떻게 될까요? 「다음 수」로 보세요.",
        "62는 한 포(32)가 병(42)을 넘어 닿는 자리예요. 마(5점)를 잃고 얻은 것은 없어요. 마는 갈 자리를 누가 노리는지 보고, 다른 기물이 받쳐 줄 때 앞으로 보내요.",
      ],
      scene: replayScene("hastyHorse", [
        "진마를 올려요.",
        "한이 찻길을 열어요. 42 병이 2번 세로줄에 서요.",
        "졸을 옆으로 비켜 진마 앞길(73)을 열어요.",
        "한이 진마를 올려요.",
        "진마가 43 병을 노리러 62로 들어가요. 그런데 62는 한 포가 42 병을 넘어 닿는 자리예요.",
        "한 포가 마를 잡아요. 내 쪽에 이 포를 되잡을 기물이 없어요.",
      ]),
    },
    {
      kind: "quiz",
      question: "이 판에서 차로 49 병을 잡으면?",
      scene: scene(POSITIONS.greedyRook, { show: "09", rings: ["49", "19"] }),
      options: [
        "한 차(19)가 내 차를 잡아 11점 손해다",
        "병을 공짜로 얻는다",
        "한 궁이 장군을 받는다",
      ],
      answer: 0,
      explain:
        "49 병과 한 차(19) 사이가 비어 있어, 잡으면 한 차가 바로 내 차를 잡아요. 병 2점을 얻고 차 13점을 잃어요.",
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
        "차 앞 졸을 옆으로 쓸어 찻길을 여는 수가 첫 수의 정석이에요. 궁을 앞으로 띄우면(천궁) 면포 자리가 막히고 장군을 받기 쉬워요.",
    },
  ],
};

export const MATCHUPS_LESSON: JanggiLesson = {
  id: "matchups",
  title: "상대 차림 보고 고르기",
  summary: "한 차림 넷과 내 차림 넷, 16가지 짝에서 무엇을 고를지와 까닭",
  steps: [
    {
      kind: "explain",
      title: "초는 보고 고를 수 있어요",
      body: [
        "한이 먼저 차림을 고르고, 초는 그것을 본 뒤 골라요. 그래서 초는 상대 차림에 맞춰 고를 수 있어요.",
        "아래 표는 처음 배우는 사람 기준으로 16가지 짝을 매긴 거예요. **◎ 권해요 · ○ 둘 만해요 · △ 피해요.** 칸을 누르면 그 짝의 판과 까닭이 보여요.",
        "한 차림 이름은 한이 제 자리에서 읽은 이름이에요.",
      ],
      scene: { ...START, matchups: true },
    },
    {
      kind: "explain",
      title: "세 가지만 기억해요",
      body: [
        "① 한이 **귀마**면 나도 **같은 이름**의 귀마를 골라요. 상이 엇갈려 서요(엇상). 이름이 다르면 맞상이 돼요.",
        "② 한이 **원앙마**나 **양귀마**면 귀마 둘 어느 쪽이든 좋아요. 두 차림은 좌우가 같아서예요.",
        "③ **양귀마**는 내 가운데 졸이 약해 처음에는 피해요. 원앙마는 둘 만하지만 갖추는 데 수가 더 들어요.",
      ],
    },
    {
      kind: "explain",
      title: "반복 문제: 무엇을 고를까요",
      body: [
        "한이 고른 차림을 보고 내(초) 차림을 골라 보세요. 판 위쪽이 한이 고른 차림이에요. 모두 10문제예요.",
      ],
      scene: { ...START, drill: 10 },
    },
    {
      kind: "quiz",
      question: "한이 **상마상마**를 골랐어요. 맞상을 피하려면 초는?",
      options: ["상마상마", "마상마상", "상마마상"],
      answer: 0,
      explain:
        "같은 이름을 고르면 상이 엇갈려 서요(엇상). 마상마상을 고르면 맞상이 되고, 상마마상은 가운데 졸이 약해요.",
    },
  ],
};

export const OPENING_LINE_LESSON: JanggiLesson = {
  id: "opening-line",
  title: "초반 21수 따라 두기",
  summary:
    "귀마 대 귀마 초반 21수를 수마다 까닭과 점수 셈으로 보고, 초 수를 직접 따라 둔다",
  steps: [
    {
      kind: "explain",
      title: "귀마 대 귀마, 처음 21수",
      body: [
        "두 편 모두 마상마상(엇상)으로 둔 판의 처음 21수예요. 실제 대국을 옮긴 기보가 아니라, 앞에서 배운 원칙대로 짜고 수마다 엔진으로 손해가 없는지 확인한 예시예요.",
        "「다음 수」를 누르면 수마다 까닭이 판 아래에 나와요. 잡은 기물은 점수로 셈해 보여요.",
      ],
      scene: {
        ...START,
        replay: OPENING_LINE_MOVES,
        notes: OPENING_LINE_NOTES,
      },
    },
    {
      kind: "explain",
      title: "직접 따라 두기",
      body: [
        "이번에는 초 수를 직접 둬요. 한 수는 저절로 둬요. 막히면 「힌트」로 둘 기물을, 「수 보기」로 갈 자리를 볼 수 있어요.",
      ],
      scene: {
        ...START,
        replay: OPENING_LINE_MOVES,
        notes: OPENING_LINE_NOTES,
        follow: true,
      },
    },
    {
      kind: "quiz",
      question:
        "16수째, 한 차(26)가 내 상(76)을 노려요. 아직 걱정하지 않아도 되는 까닭은?",
      scene: scene(POSITIONS.rookEyesElephant, { rings: ["26", "76"] }),
      options: [
        "76은 졸 둘이 지켜, 잡으면 한이 10점 손해다",
        "차는 상을 잡을 수 없다",
        "상이 차보다 점수가 높다",
      ],
      answer: 0,
      explain:
        "차(13점)로 상(3점)을 잡으면 75·77 졸이 차를 되잡아요. 3점을 얻고 13점을 잃어 한이 10점 손해예요.",
    },
    {
      kind: "quiz",
      question: "21수 동안 주고받은 기물을 점수로 셈하면?",
      options: [
        "손해 없음(차와 상을 하나씩 바꿈)",
        "초가 13점 이득",
        "한이 3점 이득",
      ],
      answer: 0,
      explain:
        "두 편이 차(13점) 하나와 상(3점) 하나씩 잡았어요. 16점 대 16점이라 손해가 없어요.",
    },
  ],
};
