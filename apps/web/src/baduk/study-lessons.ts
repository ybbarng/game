import {
  groupOf,
  ladderMoves,
  pointAt,
  pointName,
  step,
  tryPlace,
} from "@game/baduk-engine";

import { BADUK_PUZZLE_SETS, type BadukPuzzle } from "./puzzles";
import {
  defenseFor,
  endgameGain,
  koLossStones,
  PUZZLE_SIZE,
  puzzleState,
  spotMoveOf,
  spotSizesOf,
  spotsOf,
} from "./study";
import type { BadukLesson, BadukScene } from "./tutorial";

/*
 * 바둑 수 배우기의 단원(docs/23 바둑): 패로 버티기, 긴 축과 축머리, 포석, 끝내기 기초, 정석(돌 모양 이름).
 * 규칙 배우기(tutorial.ts)를 마친 사람이 읽는다. 그래서 거기서 뜻을 알린 말(활로·단수·따내기·패·팻감·귀·변·집 등)은 그냥 쓰고,
 * 새 말은 여기서 처음 쓸 때 뜻을 먼저 알린다(study-lessons-terms.test.ts가 두 글을 이어 읽어 본다).
 * 패·축 그림은 문제 자료에서 판을 만들고 글의 자리 이름도 자료에서 읽는다. 그래서 그림·글·문제가 어긋나지 않는다.
 * 판에 관한 말(단수가 되는 자리, 빠져나가는 쪽, 둘러싼 돌 수)은 study-lessons.test.ts가 엔진으로 확인한다.
 */

const puzzle = <K extends BadukPuzzle["kind"]>(id: string, kind: K) => {
  const found = BADUK_PUZZLE_SETS.flatMap((s) => s.puzzles).find(
    (p) => p.id === id,
  );
  if (!found || found.kind !== kind)
    throw new Error(`단원 그림에 쓸 문제가 없다: ${id}`);
  return found as Extract<BadukPuzzle, { kind: K }>;
};

/** 문제의 처음 판(수를 먼저 두는 문제는 둔 뒤)을 그림으로 */
function sceneOf(
  p: BadukPuzzle,
  marks: Readonly<Record<string, string>> = {},
): BadukScene {
  const { board } = puzzleState(p);
  const black: string[] = [];
  const white: string[] = [];
  board.forEach((cell, at) => {
    if (cell === 1) black.push(pointName(at, PUZZLE_SIZE));
    if (cell === 2) white.push(pointName(at, PUZZLE_SIZE));
  });
  return { black, white, marks };
}

/** 패 그림: 백이 방금 패를 따냈다(팻감 쓰기 첫 문제) */
export const KO_LESSON_PUZZLE = puzzle("ko-threat-1", "kofight");
/** 패 잇기 그림(패 잇기 첫 문제) */
export const KO_CONNECT_LESSON_PUZZLE = puzzle("ko-connect-1", "kofight");
/** 끝내기 크기 그림(큰 끝내기부터 첫 문제) */
export const ENDGAME_SIZE_PUZZLE = puzzle("endgame-bigger-1", "endgame");
/** 선수 그림(선수 끝내기부터 첫 문제) */
export const ENDGAME_SENTE_PUZZLE = puzzle("endgame-sente-1", "endgame");
/** 긴 축 그림(긴 축 첫 문제) */
export const LADDER_LESSON_PUZZLE = puzzle("long-ladder-1", "capture");
/** 축머리 그림(축머리 첫 문제) */
export const BREAKER_LESSON_PUZZLE = puzzle("breaker-1", "capture");

/** 축 문제에서 정답이 아닌 다른 쪽 활로 */
export function otherSide(p: Extract<BadukPuzzle, { kind: "capture" }>) {
  const scene = sceneOf(p);
  const right = p.solution;
  const col = "ABCDEFGHJ";
  const [x, y] = [
    col.indexOf(p.target[0] as string),
    Number(p.target.slice(1)),
  ];
  const around = [
    `${col[x - 1] ?? ""}${y}`,
    `${col[x + 1] ?? ""}${y}`,
    `${col[x]}${y - 1}`,
    `${col[x]}${y + 1}`,
  ].filter(
    (n) =>
      /^[A-HJ][1-9]$/.test(n) &&
      !scene.black.includes(n) &&
      !scene.white.includes(n) &&
      n !== right,
  );
  return around[0] ?? "";
}

/**
 * 축에서 백이 뻗어 가는 자리들(그림의 ·). 백은 문제 화면과 같은 수(`defenseFor`)로 받는다.
 * `ignore`를 주면 그 돌(축머리)이 없다고 보고 축이 되는 쪽으로 몬다. 그래서 축머리에 닿아 빠져나가는 길이 나온다
 */
export function ladderPath(
  p: Extract<BadukPuzzle, { kind: "capture" }>,
  first: string,
  ignore?: string,
): string[] {
  const target = pointAt(p.target, PUZZLE_SIZE);
  let state = puzzleState(p);
  let move = pointAt(first, PUZZLE_SIZE);
  const path: string[] = [];
  for (let i = 0; i < 30; i++) {
    const mine = step(state, 0, { type: "place", at: move });
    if (!mine.ok) break;
    state = mine.state;
    if (state.board[target] !== 2) break;
    const reply = defenseFor(p, state, i);
    const theirs = step(state, 1, reply);
    if (!theirs.ok) break;
    state = theirs.state;
    if (reply.type === "place") path.push(pointName(reply.at, PUZZLE_SIZE));
    const libs = groupOf(state.board, target).liberties;
    if (libs.length !== 2) break;
    const board = [...state.board];
    if (ignore) board[pointAt(ignore, PUZZLE_SIZE)] = 0;
    const next = libs.find(
      (l) =>
        ladderMoves(
          board,
          1,
          target,
          l,
          ignore ? undefined : new Set(state.positions),
        ) !== null,
    );
    if (next === undefined) break;
    move = next;
  }
  return path;
}

const dots = (path: readonly string[]) =>
  Object.fromEntries(path.map((n) => [n, "·"]));

const KO = KO_LESSON_PUZZLE;
const LADDER = LADDER_LESSON_PUZZLE;
const LADDER_WRONG = otherSide(LADDER);
const BREAKER = BREAKER_LESSON_PUZZLE;
const BREAKER_WRONG = otherSide(BREAKER);
/** 긴 축 그림: A에서 몰 때 백이 뻗어 가는 길 */
export const LADDER_LESSON_PATH = ladderPath(LADDER, LADDER.solution);
/** 축머리 그림: B에서 몰 때 백이 뻗어 가다 축머리에 닿는 길 */
export const BREAKER_WRONG_PATH = ladderPath(
  BREAKER,
  BREAKER_WRONG,
  BREAKER.breaker,
);
/** 축머리 그림: A에서 몰 때 백이 뻗어 가는 길(축머리를 만나지 않는다) */
export const BREAKER_RIGHT_PATH = ladderPath(BREAKER, BREAKER.solution);

const KO_CONNECT = KO_CONNECT_LESSON_PUZZLE;
const KO_CONNECT_THREAT = KO_CONNECT.setup[KO_CONNECT.setup.length - 1] ?? "";
/** 패 잇기 그림: 패를 지면 잃는 흑 돌 자리 */
export const KO_CONNECT_LOST = koLossStones(KO_CONNECT).map((p) =>
  pointName(p, PUZZLE_SIZE),
);
/** 패 잇기 그림: 팻감이 노리는 흑 돌 수 */
export const KO_CONNECT_THREATENED = groupOf(
  puzzleState(KO_CONNECT).board,
  pointAt(KO_CONNECT.target, PUZZLE_SIZE),
).stones.length;

const COUNT = ["", "한", "두", "세", "네", "다섯"];

/** 끝내기 한 곳을 흑·백이 먼저 둘 때의 점수 변화와 점수 차 변화 */
export function spotStory(
  p: Extract<BadukPuzzle, { kind: "endgame" }>,
  index: 0 | 1,
) {
  const { board } = puzzleState(p);
  const spot = spotsOf(p)[index];
  const move = pointName(spotMoveOf(board, spot), PUZZLE_SIZE);
  const black = endgameGain(board, spot, 1);
  const white = endgameGain(board, spot, 2);
  return {
    move,
    black,
    white,
    /** 흑이 먼저 두면 점수 차(흑 − 백)가 늘어나는 만큼 */
    up: black.black - black.white,
    /** 백이 먼저 두면 점수 차가 줄어드는 만큼 */
    down: white.white - white.black,
    size: spotSizesOf(p)[index],
  };
}

/** 「흑 점수는 2점 늘고, 백 점수는 1점 줄어요」처럼 점수 변화를 글로 */
export function gainText(g: { black: number; white: number }): string {
  const verb = (n: number, last: boolean) =>
    n > 0 ? (last ? "늘어요" : "늘고") : last ? "줄어요" : "줄고";
  const parts = [
    ["흑", g.black],
    ["백", g.white],
  ].filter(([, n]) => n !== 0) as [string, number][];
  if (parts.length === 0) return "두 편 점수가 그대로예요";
  const particle = parts.length === 1 ? "가" : "는";
  return parts
    .map(
      ([who, n], k) =>
        `${who} 점수${particle} ${Math.abs(n)}점 ${verb(n, k === parts.length - 1)}`,
    )
    .join(", ");
}

export const SIZE_STORY = {
  A: spotStory(ENDGAME_SIZE_PUZZLE, 0),
  B: spotStory(ENDGAME_SIZE_PUZZLE, 1),
};
const SENTE = ENDGAME_SENTE_PUZZLE;
const SENTE_INDEX = spotsOf(SENTE)[0].includes(
  pointAt(SENTE.solution, PUZZLE_SIZE),
)
  ? 0
  : 1;
const SENTE_LABEL = SENTE_INDEX === 0 ? "A" : "B";
const GOTE_LABEL = SENTE_INDEX === 0 ? "B" : "A";
/** 선수 그림의 두 곳 크기 [선수, 후수] */
export const SENTE_SIZES: readonly [number, number] = [
  spotSizesOf(SENTE)[SENTE_INDEX],
  spotSizesOf(SENTE)[SENTE_INDEX === 0 ? 1 : 0],
];
/** 선수 그림의 A·B 자리 */
const endgameMarks = (p: Extract<BadukPuzzle, { kind: "endgame" }>) => {
  const { board } = puzzleState(p);
  const [a, b] = spotsOf(p);
  return {
    [pointName(spotMoveOf(board, a), PUZZLE_SIZE)]: "A",
    [pointName(spotMoveOf(board, b), PUZZLE_SIZE)]: "B",
  };
};
/**
 * 크기 그림에서 두는 차례에 따른 점수 차 변화: 큰 A부터 두고 백이 B에 둘 때, 작은 B부터 두고 백이 A에 둘 때.
 * 곳마다 따로 센 값(흑이 먼저 둘 때 느는 만큼 − 백이 먼저 둘 때 주는 만큼)이다
 */
export const ORDER_GAIN = {
  bigFirst: SIZE_STORY.A.up - SIZE_STORY.B.down,
  smallFirst: SIZE_STORY.B.up - SIZE_STORY.A.down,
};

/** 선수 그림: 흑이 선수를 둔 뒤 백이 받는 자리(문제 화면과 같은 수) */
export const SENTE_REPLY = (() => {
  const after = step(puzzleState(SENTE), 0, {
    type: "place",
    at: pointAt(SENTE.solution, PUZZLE_SIZE),
  });
  if (!after.ok) throw new Error("선수 그림: 둘 수 없다");
  const reply = defenseFor(SENTE, after.state, 0);
  if (reply.type !== "place") throw new Error("선수 그림: 백이 받지 않는다");
  return pointName(reply.at, PUZZLE_SIZE);
})();

/** 선수 그림: 흑이 후수 곳에 두면 따내는 백 돌 수(0이면 따내지 않는다) */
export const GOTE_CAPTURE = (() => {
  const { board } = puzzleState(SENTE);
  const solution = pointAt(SENTE.solution, PUZZLE_SIZE);
  const gote = spotsOf(SENTE)
    .map((spot) => spotMoveOf(board, spot))
    .find((m) => m !== solution);
  if (gote === undefined) throw new Error("선수 그림: 후수 곳이 없다");
  const placed = tryPlace(board, gote, 1);
  return placed.ok ? placed.captured.length : 0;
})();

/** 선수 그림: 흑이 선수를 두면 새로 단수가 되는 백 돌 수 */
export const SENTE_THREATENED = (() => {
  const { board } = puzzleState(SENTE);
  const placed = tryPlace(board, pointAt(SENTE.solution, PUZZLE_SIZE), 1);
  if (!placed.ok) throw new Error("선수 그림: 둘 수 없다");
  let n = 0;
  for (let q = 0; q < placed.board.length; q++)
    if (
      placed.board[q] === 2 &&
      groupOf(placed.board, q).liberties.length === 1 &&
      groupOf(board, q).liberties.length > 1
    )
      n++;
  return n;
})();

/**
 * 귀·변·가운데에서 빈 자리 아홉 곳(3×3)을 둘러싼 흑 돌(19줄 판).
 * 귀는 판 끝 두 쪽이 벽이라 6개, 변은 한 쪽이 벽이라 9개, 가운데는 12개가 든다
 */
export const AREA_WALLS = {
  corner: ["D1", "D2", "D3", "A4", "B4", "C4"],
  side: ["H1", "H2", "H3", "M1", "M2", "M3", "J4", "K4", "L4"],
  center: [
    "H9",
    "H10",
    "H11",
    "M9",
    "M10",
    "M11",
    "J8",
    "K8",
    "L8",
    "J12",
    "K12",
    "L12",
  ],
} as const;

/** 귀에 첫 수를 두는 세 자리(왼쪽 위 귀): 화점, 소목, 삼삼 */
export const CORNER_POINTS = { star: "D16", komoku: "C16", sansan: "C17" };

/** 굳힘·벌림 그림(오른쪽 위 귀): 소목 흑 돌, 굳힘 자리, 벌림 자리(소목에서 변을 따라 세 칸 건너) */
export const SHIMARI_POINTS = { stone: "R16", shimari: "P17", extend: "R12" };

/**
 * 정석 낱말 그림(왼쪽 위 귀). 수는 정석 자료(joseki.ts)의 수순에서 왔다.
 * 낮은 걸침: 화점 D16에 백 F17(가로 두 칸·세로 한 칸, 셋째 줄). 높은 걸침: 소목 C16에 백 E16(한 칸 건너 넷째 줄).
 * 붙임·젖힘: 흑 E17이 백 E16에 붙고 백 F17이 젖힘, D15는 흑 C16의 마늘모 자리. 끊는 자리: 흑 D17로 물러선 뒤 백 F16.
 * study-lessons.test.ts가 자리 관계를 엔진 좌표로 확인한다.
 */
export const JOSEKI_POINTS = {
  star: "D16",
  lowApproach: "F17",
  komoku: "C16",
  highApproach: "E16",
  attach: "E17",
  hane: "F17",
  diagonal: "D15",
  drawBack: "D17",
  cut: "F16",
} as const;

/** 삼삼 침입 기본 정석이 끝난 모양 */
export const JOSEKI_WALL = {
  black: ["D17", "D16", "C15", "C14", "C13"],
  white: ["C17", "C16", "B15", "B14"],
} as const;

/** 수 배우기 목록의 「단원 읽기」 소개 */
export const BADUK_STUDY_LESSON_SUMMARY =
  "패로 버티기, 긴 축과 축머리, 포석, 끝내기 기초, 정석의 돌 모양 이름을 그림으로 읽고 퀴즈를 풀어요. 읽은 뒤 아래 문제와 따라 두기로 익혀요.";

export const BADUK_STUDY_LESSONS: readonly BadukLesson[] = [
  {
    id: "lesson-ko-fight",
    title: "패로 버티기",
    summary: "바로 되따낼 수 없는 패를 팻감으로 버텨요.",
    steps: [
      {
        kind: "explain",
        title: "패를 따인 쪽",
        body: [
          "규칙 배우기에서 패를 따낸 바로 다음에는 상대가 되따낼 수 없다고 배웠어요. 다른 곳에 한 수 둔 뒤에야 되따낼 수 있었죠.",
          "이번에는 패를 두고 서로 버티는 법을 배워요. 먼저 패를 따인 쪽(흑)의 처지예요.",
          `그림은 백이 방금 ${KO.setup[0]}에 두어 ${KO.ko}의 흑 한 점을 따낸 모양이에요. 흑이 ×에 바로 두면 백 ${KO.setup[0]}을 되따낼 것 같지만, 판 모양이 한 수 전으로 돌아가서 둘 수 없어요.`,
        ],
        scene: sceneOf(KO, { [KO.ko]: "×" }),
      },
      {
        kind: "explain",
        title: "팻감을 쓴다",
        body: [
          "그래서 흑은 먼저 다른 곳에 **팻감**을 둬요. 상대가 꼭 막아야 하는 수였죠.",
          `그림에서 흑이 A(${KO.solution})에 두면 백 두 점이 단수가 돼요. 백이 막지 않으면 흑이 다음 수에 두 점을 따내요.`,
          `상대의 수를 막아 지키는 것을 **받는다**고 해요. 백이 B(${KO.reply ?? ""})에 두면 두 점이 옆 백 돌과 이어져 활로가 늘어요. 이게 받은 거예요.`,
          `백이 받는 사이 판 모양이 달라졌어요. 이제 흑은 ×(${KO.ko})에 되따낼 수 있어요. 이번엔 백이 되따내려면 백이 팻감을 써야 해요.`,
        ],
        scene: sceneOf(KO, {
          [KO.ko]: "×",
          [KO.solution]: "A",
          [KO.reply ?? ""]: "B",
        }),
      },
      {
        kind: "explain",
        title: "받을까, 패를 이을까",
        body: [
          "이번엔 반대로, 내가 패를 따냈고 상대가 팻감을 쓴 때예요.",
          "패에서 따이고 되따이는 돌 하나를 **패에 걸린 돌**이라고 해요.",
          "상대가 패를 되따낸 뒤 내가 다시 되따내지 못한 채 패가 끝나는 것을 **패를 진다**고 해요. 패를 지면 패에 걸린 돌을 잃어요. 그때 둘레의 내 돌이 함께 단수가 되어 살릴 수 없으면 그 돌도 잃어요. 이 둘을 더한 수를 **패를 지면 잃는 돌**이라고 할게요.",
          "상대가 팻감을 쓰면 둘 중 하나를 골라요.",
          "① **받기**: 팻감이 노리는 내 돌을 살려요. 그러면 상대가 패를 되따내고 패가 이어져요. 이번엔 내가 팻감을 써야 하고, 쓸 팻감이 없으면 패를 져요.",
          "② **패 잇기**: 상대가 되따낼 자리에 내 돌을 두어 막아요. 패는 끝나고, 팻감이 노린 내 돌은 잃어요.",
          "고르는 법: 팻감이 노리는 내 돌 수와 패를 지면 잃는 돌 수를 세요. 노리는 돌이 더 많으면 받고, 같거나 적으면 패를 이어요. 같을 때도 잇는 까닭은, 이어 두면 패가 끝나 더 잃을 일이 없어서예요.",
        ],
      },
      {
        kind: "explain",
        title: "패를 잇는 때",
        body: [
          `그림은 흑 ${KO_CONNECT.setup[0]}이 ×(${KO_CONNECT.ko})의 백 한 점을 따내 패가 됐고, 백이 ${KO_CONNECT_THREAT}에 팻감을 둔 모양이에요. △ 흑 ${COUNT[KO_CONNECT_THREATENED]} 점이 단수예요.`,
          `흑이 받으면 백이 ×에 되따내 패가 이어져요. 흑이 끝내 패를 지면 □ 흑 돌 ${COUNT[KO_CONNECT_LOST.length]} 점을 잃어요. 패에 걸린 한 점과, 백이 되따낼 때 함께 단수가 되어 달아날 곳이 없는 돌이에요.`,
          `노리는 돌(${COUNT[KO_CONNECT_THREATENED]} 점)이 패를 지면 잃는 돌(${COUNT[KO_CONNECT_LOST.length]} 점)보다 적어요. 그래서 흑은 ×에 이어 패를 끝내고, △ 돌은 내줘요.`,
        ],
        scene: sceneOf(KO_CONNECT, {
          [KO_CONNECT.target]: "△",
          [KO_CONNECT.ko]: "×",
          ...Object.fromEntries(KO_CONNECT_LOST.map((n) => [n, "□"])),
        }),
      },
      {
        kind: "quiz",
        question: "백이 방금 패를 따냈어요. 흑은 바로 되따낼 수 있나요?",
        scene: sceneOf(KO, { [KO.ko]: "×" }),
        options: [
          "없다. 먼저 다른 곳에 팻감을 둬야 한다",
          "있다. 따인 자리에 바로 두면 된다",
        ],
        answer: 0,
        explain:
          "바로 되따내면 판 모양이 한 수 전과 같아져서 둘 수 없어요. 팻감을 두고 상대가 받으면 판 모양이 달라져 되따낼 수 있어요.",
      },
      {
        kind: "quiz",
        question:
          "흑이 패를 따냈더니 백이 팻감을 두어 흑 두 점이 단수가 됐어요. 패를 지면 잃는 돌은 한 점이에요. 흑은?",
        options: [
          "두 점을 살려 받는다",
          "패를 이어 끝낸다",
          "받지 않고 다른 곳에 둔다",
        ],
        answer: 0,
        explain:
          "노리는 돌(두 점)이 패를 지면 잃는 돌(한 점)보다 많으니 받아요. 백이 패를 되따내면 이번엔 흑이 팻감을 쓸 차례예요.",
      },
      {
        kind: "quiz",
        question:
          "백이 팻감을 두어 흑 한 점이 단수가 됐어요. 패를 지면 흑 두 점을 잃어요. 흑은?",
        options: ["패를 이어 끝낸다", "한 점을 살려 받는다"],
        answer: 0,
        explain:
          "노리는 돌(한 점)이 패를 지면 잃는 돌(두 점)보다 적어요. 패를 이어 끝내고 한 점은 내줘요.",
      },
    ],
  },
  {
    id: "lesson-ladder",
    title: "긴 축과 축머리",
    summary: "단수를 이어 쳐 판 끝까지 모는 축과, 축을 깨는 돌을 배워요.",
    steps: [
      {
        kind: "explain",
        title: "축이란",
        body: [
          "지금까지 단수(활로가 하나 남은 상태)와 따내기를 배웠어요. 이번에는 단수를 쉬지 않고 이어 만들어 돌을 잡는 법을 배워요.",
          "상대 돌을 단수로 만드는 수를 두는 것을 **단수를 친다**고 해요.",
          "단수를 치면 상대는 남은 활로에 돌을 놓아 달아나요. 이것을 **뻗는다**고 했죠. 뻗은 뒤에도 활로가 둘뿐이면 또 단수를 칠 수 있어요.",
          "단수와 뻗기가 되풀이되면 돌이 계단처럼 비스듬히 끌려가다 판 끝이나 내 돌에 막혀 잡혀요. 이렇게 잡는 것을 **축**이라고 하고, 돌을 끌고 가는 것을 **몬다**고 해요.",
          "판 끝까지 길게 가는 축을 긴 축이라고 불러요. 그림의 점(·)이 △ 백 돌이 뻗어 가는 길이에요.",
        ],
        scene: sceneOf(LADDER, {
          ...dots(LADDER_LESSON_PATH),
          [LADDER.target]: "△",
        }),
      },
      {
        kind: "explain",
        title: "어느 쪽에서 단수를 칠까",
        body: [
          `△ 백 돌은 활로가 A(${LADDER.solution})와 B(${LADDER_WRONG}) 둘이에요. 단수는 둘 중 한 곳에 두어 쳐요.`,
          "단수를 치면 백은 남은 쪽으로 뻗어요. 그래서 백이 뻗을 자리를 먼저 봐요.",
          "뻗을 자리의 위·아래·왼쪽·오른쪽(△ 쪽은 빼고)에 흑 돌이 있으면, 뻗어도 활로가 둘뿐이라 축이 이어져요. 흑 돌이 없으면 뻗은 백은 활로가 셋이 되어 빠져나가요.",
          "그림에서는 A에 단수를 쳐야 해요. 백이 B로 뻗으면 B 바로 옆에 흑 돌이 있어요. B에 단수를 치면 백이 A로 뻗어 활로가 셋이 돼요.",
        ],
        scene: sceneOf(LADDER, {
          [LADDER.target]: "△",
          [LADDER.solution]: "A",
          [LADDER_WRONG]: "B",
        }),
      },
      {
        kind: "explain",
        title: "축머리",
        body: [
          "축이 가는 길 위나 바로 옆에 미리 놓인 상대 돌을 **축머리**라고 해요.",
          "백이 계단을 따라 뻗다가 축머리에 닿으면 그 돌과 이어져요. 이은 무리는 활로가 셋 이상이 되어 빠져나가요.",
          "빠져나가면 흑이 단수를 치며 놓은 돌들이 서로 떨어진 채 남아 오히려 크게 손해를 봐요.",
          `그림의 □(${BREAKER.breaker ?? ""})가 축머리예요. B(${BREAKER_WRONG})에서 단수를 치면 백은 점(·)을 따라 뻗다가 □와 이어져요.`,
        ],
        scene: sceneOf(BREAKER, {
          ...dots(BREAKER_WRONG_PATH),
          [BREAKER.target]: "△",
          [BREAKER.breaker ?? ""]: "□",
          [BREAKER_WRONG]: "B",
        }),
      },
      {
        kind: "explain",
        title: "축머리가 있으면",
        body: [
          "축을 치기 전에, 단수와 뻗기를 번갈아 둔다고 생각하며 백이 뻗어 갈 길을 판 끝까지 따라가 봐요. 두 쪽 단수를 하나씩 따라가요.",
          "① 길 위나 바로 옆에 백 돌이 있으면 그쪽으로는 몰지 않아요.",
          "② 다른 쪽 단수로 따라간 길에 백 돌이 없으면 그쪽에서 몰아요.",
          "③ 두 쪽 모두 백 돌이 있으면 축으로는 못 잡아요. **장문**(바로 단수 치지 않고 한 칸 떨어져 길을 막는 수)처럼 다른 수를 찾아요.",
          `그림에서는 A(${BREAKER.solution})에서 단수를 치면 백이 점(·)을 따라 뻗고, 길에 □가 없어 잡혀요.`,
        ],
        scene: sceneOf(BREAKER, {
          ...dots(BREAKER_RIGHT_PATH),
          [BREAKER.target]: "△",
          [BREAKER.breaker ?? ""]: "□",
          [BREAKER.solution]: "A",
        }),
      },
      {
        kind: "quiz",
        question:
          "축이 가는 길 바로 옆에 백 돌이 있어요. 그대로 몰면 어떻게 될까요?",
        options: [
          "백이 그 돌과 이어져 빠져나간다",
          "그래도 흑이 끝까지 잡는다",
        ],
        answer: 0,
        explain:
          "그 백 돌이 축머리예요. 뻗은 백이 축머리와 이어지면 활로가 늘어 단수를 칠 수 없어요.",
      },
    ],
  },
  {
    id: "lesson-fuseki",
    title: "포석: 귀, 변, 가운데",
    summary: "빈 판에서 첫 몇 수를 어디에 두는지 배워요.",
    steps: [
      {
        kind: "explain",
        title: "포석이란",
        body: [
          "지금까지는 돌을 잡고 살리는 싸움을 배웠어요. 이번에는 판이 비어 있을 때 첫 몇 수를 어디에 두는지 배워요.",
          "판 첫머리에 여기저기 돌을 벌여 놓아 자리를 잡는 것을 **포석**이라고 해요.",
          "포석은 가로세로 19줄인 큰 판으로 봐요. 9줄 판보다 넓어서 어디부터 두느냐가 더 크게 갈려요.",
        ],
        scene: { black: [], white: [], size: 19 },
      },
      {
        kind: "explain",
        title: "왜 귀부터일까",
        body: [
          "집은 돌로 벽을 쳐서 둘러싸야 생겨요. 판 끝도 벽 노릇을 해요.",
          `그림의 세 곳은 모두 빈 자리 아홉 곳을 둘러쌌어요. 귀는 판 끝이 두 쪽을 막아 주어 돌 ${AREA_WALLS.corner.length}개, 변은 한 쪽만 막아 주어 ${AREA_WALLS.side.length}개, 가운데는 ${AREA_WALLS.center.length}개가 들었어요.`,
          "모서리에 대각선으로 빈 곳이 있어도 막힌 거예요. 돌과 빈 자리는 위·아래·왼쪽·오른쪽으로만 이어져요.",
          "같은 집을 적은 돌로 지을 수 있는 곳부터 둬요. 그래서 **귀 → 변 → 가운데** 순서예요.",
        ],
        scene: {
          black: [
            ...AREA_WALLS.corner,
            ...AREA_WALLS.side,
            ...AREA_WALLS.center,
          ],
          white: [],
          size: 19,
        },
      },
      {
        kind: "explain",
        title: "귀의 세 자리",
        body: [
          "판에 점이 찍힌 아홉 곳을 **화점**이라고 해요. 줄은 판 맨 끝 줄을 첫째 줄로 세요.",
          "귀의 화점은 두 끝에서 모두 넷째 줄이고, 변의 화점은 변 한가운데의 넷째 줄이에요.",
          "귀에 첫 수를 두는 자리는 주로 셋이에요. 아래 글의 「바깥」은 판 가운데 쪽을 뜻해요.",
          "A는 귀의 화점이에요. 바깥으로 빨리 나가지만 귀 안쪽이 조금 비어요.",
          "B는 한쪽 끝에서 셋째, 다른 쪽 끝에서 넷째 줄인 **소목**이에요. 귀 집과 바깥을 고루 봐요.",
          "C는 두 끝에서 모두 셋째 줄인 **삼삼**이에요. 귀 집은 확실하지만 바깥으로는 느려요.",
        ],
        scene: {
          black: [],
          white: [],
          size: 19,
          marks: {
            [CORNER_POINTS.star]: "A",
            [CORNER_POINTS.komoku]: "B",
            [CORNER_POINTS.sansan]: "C",
          },
        },
      },
      {
        kind: "explain",
        title: "굳힘과 벌림",
        body: [
          "귀에 한 수 둔 뒤에는 두 가지를 해요.",
          "귀에 한 수 더 두어 상대가 들어오지 못하게 하는 것을 **굳힘**이라고 해요. 그림의 A예요.",
          "변을 따라 두세 칸 건너 두어 집 자리를 넓히는 것을 **벌림**이라고 해요. 그림의 B는 세 칸 건넜어요.",
          "빈 귀가 남아 있으면 굳힘이나 벌림보다 빈 귀에 먼저 둬요. 빈 귀가 없으면 굳힘이나 벌림을 해요.",
        ],
        scene: {
          black: [SHIMARI_POINTS.stone],
          white: [],
          size: 19,
          marks: {
            [SHIMARI_POINTS.shimari]: "A",
            [SHIMARI_POINTS.extend]: "B",
          },
        },
      },
      {
        kind: "explain",
        title: "따라 둘 포석",
        body: [
          "「포석 따라 두기」에서 대표 포석을 처음부터 둬 봐요. 내가 두는 편이 아닌 수는 저절로 둬요.",
          "흑으로 두는 넷: 같은 쪽 두 귀의 화점에 두는 **이연성**, 그 사이 변의 화점까지 세 곳에 두는 **삼연성**, 대각선으로 마주 보는 두 귀의 화점에 두는 포석, 소목에 두고 굳히는 포석이에요.",
          "백으로 두는 하나: 흑이 귀를 차지해도 백이 남은 빈 귀부터 차지하는 포석이에요.",
        ],
      },
      {
        kind: "quiz",
        question: "빈 귀가 남아 있어요. 다음 수는 어디가 좋을까요?",
        options: ["빈 귀", "가운데", "내 돌 바로 옆"],
        answer: 0,
        explain:
          "귀는 판 끝이 두 쪽을 막아 주어 적은 돌로 집을 지어요. 빈 귀가 있으면 먼저 차지해요.",
      },
    ],
  },
  {
    id: "lesson-endgame",
    title: "끝내기 기초",
    summary: "집의 경계가 거의 다 정해졌을 때 남은 곳을 어디부터 둘지 배워요.",
    steps: [
      {
        kind: "explain",
        title: "끝내기란",
        body: [
          "규칙 배우기에서 판이 끝나면 내 돌 수와 내 집 수를 세어 이긴 쪽을 정한다고 배웠어요. 이번에는 판이 끝나 갈 즈음 남은 자리를 어디부터 둘지 배워요.",
          "판이 끝나 갈 즈음에는 흑 돌과 백 돌이 맞닿아 집의 경계가 거의 다 정해지고, 몇 곳만 비어 있어요. 이 남은 곳을 마무리하는 수를 **끝내기**라고 해요.",
          "그림은 왼쪽이 흑 집, 오른쪽이 백 집이에요. 끝내기가 A와 B 두 곳 남았어요. 지금은 흑 차례예요.",
        ],
        scene: sceneOf(ENDGAME_SIZE_PUZZLE, endgameMarks(ENDGAME_SIZE_PUZZLE)),
      },
      {
        kind: "explain",
        title: "점수를 다시 세기",
        body: [
          "판 위 내 돌 수와 내 집 수를 더해 세니, 내 돌 하나도 내 집 한 칸도 모두 1점이에요.",
          "흑 점수에서 백 점수를 뺀 값을 **점수 차**라고 할게요. 흑은 점수 차를 크게, 백은 작게 만들려고 해요.",
          "끝내기 한 곳을 누가 먼저 두느냐에 따라 점수 차가 달라져요. 그 달라지는 만큼을 세어 그곳이 **몇 점짜리**인지 말해요.",
        ],
      },
      {
        kind: "explain",
        title: "몇 점짜리일까",
        body: [
          "세는 법이에요. 그곳에 아무도 두지 않고 판이 끝났다고 치고, 그때와 견줘요. ① 흑이 먼저 두면 점수 차가 몇 점 느는지 세요. ② 백이 먼저 두면 점수 차가 몇 점 줄어드는지 세요. ③ 두 수를 더하면 몇 점짜리인지 나와요.",
          `B(${SIZE_STORY.B.move})는 흑 돌과도 백 돌과도 닿아 있어 누구 집도 아니에요. 흑이 먼저 두면 그 흑 돌만큼 ${gainText(SIZE_STORY.B.black)}. 점수 차가 ${SIZE_STORY.B.up}점 늘어요.`,
          `백이 먼저 두면 그 백 돌만큼 ${gainText(SIZE_STORY.B.white)}. 점수 차가 ${SIZE_STORY.B.down}점 줄어요.`,
          `${SIZE_STORY.B.up} + ${SIZE_STORY.B.down} = ${SIZE_STORY.B.size}, 그래서 B는 ${SIZE_STORY.B.size}점짜리예요.`,
        ],
        scene: sceneOf(ENDGAME_SIZE_PUZZLE, { [SIZE_STORY.B.move]: "B" }),
      },
      {
        kind: "explain",
        title: "큰 곳부터",
        body: [
          `A(${SIZE_STORY.A.move}) 옆의 백 한 점은 단수예요. 흑이 먼저 A에 두면 그 한 점을 따내요. A의 흑 돌 1점과 따낸 자리의 흑 집 1점이 생기고 백은 따인 돌 1점을 잃어서, ${gainText(SIZE_STORY.A.black)}. 점수 차가 ${SIZE_STORY.A.up}점 늘어요.`,
          `백이 먼저 A에 두면 그 한 점을 이어 살려요. A의 백 돌만큼 ${gainText(SIZE_STORY.A.white)}. 점수 차가 ${SIZE_STORY.A.down}점 줄어요.`,
          `${SIZE_STORY.A.up} + ${SIZE_STORY.A.down} = ${SIZE_STORY.A.size}, 그래서 A는 ${SIZE_STORY.A.size}점짜리예요.`,
          `흑이 A부터 두면 백이 B에 두어 점수 차는 ${SIZE_STORY.A.up} − ${SIZE_STORY.B.down} = ${ORDER_GAIN.bigFirst}점 늘어요. B부터 두면 백이 A에 두어 ${SIZE_STORY.B.up} − ${SIZE_STORY.A.down} = ${ORDER_GAIN.smallFirst}점이에요. 큰 A부터 두는 편이 ${ORDER_GAIN.bigFirst - ORDER_GAIN.smallFirst}점 나아요.`,
        ],
        scene: sceneOf(ENDGAME_SIZE_PUZZLE, endgameMarks(ENDGAME_SIZE_PUZZLE)),
      },
      {
        kind: "explain",
        title: "선수와 후수",
        body: [
          "끝내기를 두면 보통 차례가 상대에게 넘어가요. 그런데 상대가 꼭 받아야 하는 수라면, 상대가 받은 뒤 다시 내 차례가 와요.",
          "이렇게 두고 나서도 다시 내 차례가 오는 끝내기를 **선수**라고 해요. 상대가 받지 않아도 되어 차례가 넘어가는 끝내기는 **후수**라고 해요.",
          "이 단원의 선수는 모두 상대 돌을 단수로 모는 수예요. 받지 않으면 따이니 상대가 받아요. 이 단원에서는 흑이 둘 때의 선수만 다뤄요.",
          `그림에서 ${SENTE_LABEL}에 두면 백 ${COUNT[SENTE_THREATENED]} 점이 단수가 되고, 백은 ${SENTE_REPLY}에 이어 받아요. 그래서 선수예요. ${GOTE_LABEL}${GOTE_CAPTURE > 0 ? `에 두면 단수인 백 ${COUNT[GOTE_CAPTURE]} 점을 따내지만, 그 뒤로 백이 꼭 받아야 할 수가 없어 후수예요.` : "에 두면 새로 단수가 되는 백 돌이 없어 후수예요."}`,
        ],
        scene: sceneOf(SENTE, endgameMarks(SENTE)),
      },
      {
        kind: "explain",
        title: "어디부터 둘까",
        body: [
          "끝내기가 여러 곳 남으면 이 순서로 골라요.",
          "① 선수가 있으면 선수부터 둬요. 선수가 여럿이면 그 가운데 큰 곳부터예요.",
          "② 선수가 없으면 후수 가운데 큰 곳부터 둬요.",
          "③ 크기가 같으면 어느 곳부터 둬도 괜찮아요.",
          `이 판에서 세면 ${SENTE_LABEL}는 ${SENTE_SIZES[0]}점짜리, ${GOTE_LABEL}는 ${SENTE_SIZES[1]}점짜리예요. ${SENTE_LABEL}가 크지 않아도 선수라 먼저 둬요. 백이 받으면 다시 흑 차례라 ${GOTE_LABEL}도 흑이 둬요.`,
        ],
        scene: sceneOf(SENTE, endgameMarks(SENTE)),
      },
      {
        kind: "quiz",
        question: `한 곳에 흑이 먼저 두면 점수 차가 ${SIZE_STORY.B.up}점 늘고, 백이 먼저 두면 ${SIZE_STORY.B.down}점 줄어요. 몇 점짜리일까요?`,
        options: [
          `${SIZE_STORY.B.size}점짜리`,
          `${SIZE_STORY.B.up}점짜리`,
          "0점짜리",
        ],
        answer: 0,
        explain: `흑이 먼저 둘 때 느는 ${SIZE_STORY.B.up}점과 백이 먼저 둘 때 줄어드는 ${SIZE_STORY.B.down}점을 더해 ${SIZE_STORY.B.size}점짜리예요.`,
      },
      {
        kind: "quiz",
        question: `선수 ${SENTE_SIZES[0]}점짜리와 후수 ${SENTE_SIZES[1]}점짜리가 남았어요. 어디부터 둘까요?`,
        options: [
          `선수 ${SENTE_SIZES[0]}점짜리`,
          `후수 ${SENTE_SIZES[1]}점짜리`,
        ],
        answer: 0,
        explain:
          "선수를 두면 상대가 받아야 해서 다시 내 차례예요. 그다음 후수도 내가 둬요.",
      },
    ],
  },
  {
    id: "lesson-joseki",
    title: "정석: 귀에서 주고받기",
    summary:
      "상대가 내 귀에 다가올 때 서로 두는 정해진 수순과, 그 설명에 나오는 돌 모양 이름을 배워요.",
    steps: [
      {
        kind: "explain",
        title: "정석이란",
        body: [
          "포석에서 빈 귀부터 차지한다고 배웠어요. 이번에는 내가 차지한 귀에 상대가 다가올 때, 두 사람이 어떻게 주고받는지 배워요.",
          "귀에서 흑과 백이 서로 알맞게 두어, 어느 쪽도 크게 손해 보지 않게 나누는 정해진 수순을 **정석**이라고 해요.",
          "정석 설명에는 돌 모양을 부르는 이름이 자주 나와요. 이 단원에서 그 이름을 먼저 익혀요. 그림은 모두 19줄 판의 왼쪽 위 귀예요.",
        ],
        scene: { black: [JOSEKI_POINTS.star], white: [], size: 19 },
      },
      {
        kind: "explain",
        title: "걸침과 날일자",
        body: [
          "상대 돌이 있는 귀에 다가가, 상대가 귀를 혼자 차지하지 못하게 두는 수를 **걸침**이라고 해요. 그림의 백이 흑 화점에 걸쳤어요.",
          `백 ${JOSEKI_POINTS.lowApproach}은 흑 ${JOSEKI_POINTS.star}에서 가로로 두 칸, 세로로 한 칸 떨어졌어요. 이렇게 떨어진 자리를 **날일자**라고 해요.`,
          `셋째 줄에 두는 걸침을 **낮은 걸침**, 넷째 줄에 두는 걸침을 **높은 걸침**이라고 해요. 백 ${JOSEKI_POINTS.lowApproach}은 셋째 줄이라 낮은 걸침이에요.`,
        ],
        scene: {
          black: [JOSEKI_POINTS.star],
          white: [JOSEKI_POINTS.lowApproach],
          size: 19,
        },
      },
      {
        kind: "explain",
        title: "한 칸 뛰기",
        body: [
          "같은 줄에서 한 칸을 비우고 곧게 두는 것을 **한 칸 뛴다**고 해요.",
          `그림은 흑 소목 ${JOSEKI_POINTS.komoku}에 백이 ${JOSEKI_POINTS.highApproach}에 걸친 모양이에요. 흑 돌에서 한 칸 뛴 넷째 줄이라 한 칸 높은 걸침이라고 불러요.`,
        ],
        scene: {
          black: [JOSEKI_POINTS.komoku],
          white: [JOSEKI_POINTS.highApproach],
          size: 19,
        },
      },
      {
        kind: "explain",
        title: "붙임, 젖힘, 마늘모",
        body: [
          `상대 돌의 위·아래·왼쪽·오른쪽 바로 옆에 맞닿게 두는 것을 **붙인다**고 해요. 흑 ${JOSEKI_POINTS.attach}이 백 ${JOSEKI_POINTS.highApproach}에 붙였어요.`,
          `맞붙은 상대 돌이 나아갈 앞을 내 돌의 대각선 자리에서 막는 것을 **젖힌다**고 해요. 백 ${JOSEKI_POINTS.hane}이 흑 ${JOSEKI_POINTS.attach}의 오른쪽을 막아 젖혔어요. 젖힘을 한 번 더 이어 두는 것은 **양 젖힘**이라고 해요.`,
          `내 돌에서 대각선으로 바로 옆 자리에 두는 것을 **마늘모**라고 해요. 그림의 A가 흑 ${JOSEKI_POINTS.komoku}의 마늘모 자리 가운데 하나예요.`,
        ],
        scene: {
          black: [JOSEKI_POINTS.komoku, JOSEKI_POINTS.attach],
          white: [JOSEKI_POINTS.highApproach, JOSEKI_POINTS.hane],
          size: 19,
          marks: { [JOSEKI_POINTS.diagonal]: "A" },
        },
      },
      {
        kind: "explain",
        title: "끊는 자리, 서기, 기기",
        body: [
          "대각선으로 놓인 상대 돌 둘 사이의 빈 자리에 두어 둘을 갈라놓는 것을 **끊는다**고 해요. 그 빈 자리를 **끊는 자리**라고 해요.",
          `그림의 백 ${JOSEKI_POINTS.highApproach}과 ${JOSEKI_POINTS.hane}은 대각선으로 놓여, ×(${JOSEKI_POINTS.cut})가 백의 끊는 자리예요. 백이 여기에 두어 이으면 끊기지 않아요.`,
          "내 돌 바로 옆에 판 가운데 쪽으로 곧게 이어 두는 것을 **선다**고 해요.",
          "판 끝에서 둘째 줄을 **2선**이라고 해요. 2선을 따라 한 칸씩 이어 두는 것을 **긴다**고 해요. 2선을 기면 살기는 쉽지만 집이 작아요.",
        ],
        scene: {
          black: [
            JOSEKI_POINTS.komoku,
            JOSEKI_POINTS.attach,
            JOSEKI_POINTS.drawBack,
          ],
          white: [JOSEKI_POINTS.highApproach, JOSEKI_POINTS.hane],
          size: 19,
          marks: { [JOSEKI_POINTS.cut]: "×" },
        },
      },
      {
        kind: "explain",
        title: "벽과 두터움",
        body: [
          "그림은 흑 화점에 백이 삼삼으로 들어온 정석이 끝난 모양이에요. 백은 2선을 기어 귀에 살았고, 흑은 바깥에 이어진 돌을 늘어세웠어요.",
          "돌이 튼튼하게 이어져 상대가 잡거나 깨기 어려운 것을 **두텁다**고 해요. 흑은 귀를 내주었지만, 가운데와 변을 바라보는 두터운 벽을 얻었어요.",
          "정석이 끝나면 한쪽은 귀 집, 다른 쪽은 바깥 두터움처럼 서로 다른 것을 나눠 가져요.",
        ],
        scene: {
          black: [...JOSEKI_WALL.black],
          white: [...JOSEKI_WALL.white],
          size: 19,
        },
      },
      {
        kind: "explain",
        title: "따라 둘 정석",
        body: [
          "「정석 따라 두기」에서 정석을 처음부터 둬 봐요. 내가 두는 편이 아닌 수는 저절로 둬요.",
          "화점 정석은 삼삼에 들어오는 수와 날일자 걸침을 받는 수순이에요. 소목 정석은 날일자 걸침과 한 칸 높은 걸침을 받는 수순이에요.",
          "수마다 왜 두는지 설명이 나와요. 이 단원에서 배운 이름이 나오면 그림을 떠올려 보세요.",
        ],
      },
      {
        kind: "quiz",
        question: "상대 돌이 있는 귀에 다가가 두는 수를 뭐라고 할까요?",
        options: ["걸침", "굳힘", "벌림"],
        answer: 0,
        explain:
          "걸침은 상대가 귀를 혼자 차지하지 못하게 다가가는 수예요. 굳힘과 벌림은 내 귀를 지키거나 넓히는 수예요.",
      },
      {
        kind: "quiz",
        question:
          "대각선으로 놓인 상대 돌 둘 사이의 빈 자리에 두어 둘을 갈라놓는 것을 뭐라고 할까요?",
        options: ["끊는다", "붙인다", "젖힌다"],
        answer: 0,
        explain:
          "끊으면 상대 돌 둘이 따로 떨어져요. 그래서 끊는 자리가 있으면 이어 둘지 먼저 살펴요.",
      },
    ],
  },
];
