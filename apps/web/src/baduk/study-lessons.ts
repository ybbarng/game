import {
  groupOf,
  ladderMoves,
  pointAt,
  pointName,
  step,
} from "@game/baduk-engine";

import { BADUK_PUZZLE_SETS, type BadukPuzzle } from "./puzzles";
import { defenseFor, PUZZLE_SIZE, puzzleState } from "./study";
import type { BadukLesson, BadukScene } from "./tutorial";

/*
 * 바둑 수 배우기의 단원(docs/23 바둑): 패로 버티기, 긴 축과 축머리, 포석.
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

export const BADUK_STUDY_LESSONS: readonly BadukLesson[] = [
  {
    id: "lesson-ko-fight",
    title: "패로 버티기",
    summary: "바로 되따낼 수 없는 패를 팻감으로 버틴다",
    steps: [
      {
        kind: "explain",
        title: "패를 따인 쪽",
        body: [
          "규칙 배우기에서 패를 따낸 바로 다음에는 상대가 되따낼 수 없다고 배웠어요. 다른 곳에 한 수 둔 뒤에야 되따낼 수 있었죠.",
          "이번에는 패를 두고 서로 버티는 법을 배워요. 먼저 패를 따인 쪽(흑)의 처지예요.",
          `그림은 백이 방금 ${KO.setup[0]}에 두어 흑 한 점을 따낸 모양이에요. 흑이 ×에 바로 두면 백 ${KO.setup[0]}을 되따낼 것 같지만, 판 모양이 한 수 전으로 돌아가서 둘 수 없어요.`,
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
          "서로 따내고 되따내는 그 한 점을 **패에 걸린 돌**이라고 해요.",
          "상대가 팻감을 쓰면 둘 중 하나를 골라요.",
          "① **받기**: 팻감이 노리는 내 돌을 살려요. 그러면 상대가 패를 되따내요.",
          "② **패 잇기**: 상대가 되따낼 자리에 내 돌을 두어 막아요. 패는 끝나고, 팻감이 노린 내 돌은 잃어요.",
          "고르는 법: 팻감이 노리는 내 돌 수와 패에 걸린 돌 수를 세요. 노리는 돌이 패에 걸린 돌보다 많으면 받고, 그렇지 않으면 패를 이어요. 이 단원의 패에 걸린 돌은 모두 한 점이에요.",
        ],
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
          "흑이 패를 따냈더니 백이 팻감을 두어 흑 두 점이 단수가 됐어요. 패에 걸린 돌은 한 점이에요. 흑은?",
        options: [
          "두 점을 살려 받는다",
          "패를 이어 끝낸다",
          "받지 않고 다른 곳에 둔다",
        ],
        answer: 0,
        explain:
          "노리는 돌(두 점)이 패에 걸린 돌(한 점)보다 많으니 받아요. 백이 패를 되따내면 이번엔 흑이 팻감을 쓸 차례예요.",
      },
    ],
  },
  {
    id: "lesson-ladder",
    title: "긴 축과 축머리",
    summary: "단수를 이어 쳐 판 끝까지 모는 축, 그리고 축을 깨는 돌",
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
    summary: "빈 판에서 첫 몇 수를 어디에 두는지",
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
];
