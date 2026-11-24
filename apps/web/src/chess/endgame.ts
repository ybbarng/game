/*
 * 체스 수 배우기 「기본 엔드게임」(docs/23): 킹+퀸 대 킹, 킹+룩 대 킹, 킹+룩 둘 대 킹을 메이트하는 단원과 연습.
 * 단원 글의 방법은 `endgame-guide.ts`의 `guideMove`와 한 단계씩 같다. 퀸과 룩이 같은 방법을 쓴다.
 * 룩 둘(사다리 메이트)은 `ladder-guide.ts`의 `ladderMove`, 글은 `ladder-lesson.ts`. 흑은 메이트 거리 표 대신
 * 짧은 깊이 탐색으로 버틴다(`@game/chess-ai` `krrk.ts`).
 * - 단원: 읽는 쪽 차례대로 늘어놓은 쪽(page). 쪽마다 판 그림(FEN)과, 그 판에서 방법이 고르는 수를 초록 고리로
 * - 연습: 시작 판(FEN)에서 흑 킹(컴퓨터)이 메이트 거리 표로 가장 오래 버틴다. 정해진 수 안에 메이트하면 성공,
 *   스테일메이트·퀸(룩)을 내줌·수를 넘김은 실패
 * 시험: `endgame-guide.test.ts`(방법이 정해진 수 안에 메이트, 그림의 수가 그 단계의 수), `endgame-terms.test.ts`(용어 순서)
 * 킹과 폰(P)은 메이트 대신 폰을 무사히 퀸으로 바꾸면 성공이다. 방법은 `pawn-guide.ts`, 글은 `pawn-lesson.ts`,
 * 흑 킹은 킹+폰 대 킹 승급 거리 표로 가장 오래 버틴다(`@game/chess-ai` `kpk.ts`의 `kpkDefense`).
 */

import {
  type KrrkBoard,
  type KxkPiece,
  kpkBlackMoves,
  kpkDefense,
  kpkWhiteDistance,
  kpkWins,
  krrkBlackMoves,
  krrkBlackPlayed,
  krrkDefense,
  krrkMated,
  krrkStalemate,
  krrkWhiteMoves,
  krrkWhitePlayed,
  kxkDefense,
  kxkMated,
  kxkStalemate,
  kxkWhiteDistance,
  kxkWhiteMoves,
} from "@game/chess-ai";
import { type Cell, parseFen } from "@game/chess-engine";

import { obj, ro, subj, topic, wa } from "@/lib/josa";

import {
  type Frame,
  type GuideRule,
  guideMove,
  type KxkBoard,
  type Tie,
  whitePlayed,
} from "./endgame-guide";
import { type LadderRule, ladderMove } from "./ladder-guide";
import { ladderPages, ladderSteps } from "./ladder-lesson";
import {
  type PawnRule,
  pawnGuide,
  pawnPlayed,
  pawnStalemate,
  pawnWhiteMoves,
  safeQueen,
} from "./pawn-guide";
import { pawnPages, pawnSteps } from "./pawn-lesson";

/** 연습 기물: 퀸 하나(Q), 룩 하나(R), 룩 둘(RR), 폰 하나(P, 퀸으로 만들기) */
export type EndgamePiece = KxkPiece | "RR" | "P";

/** 방법의 단계 이름(퀸·룩 하나, 룩 둘, 폰) */
export type MethodRule = GuideRule | LadderRule | PawnRule;

/**
 * 기물마다 연습에서 메이트해야 하는 수(백의 수). 방법대로 두면 모든 판에서 퀸 22수·룩 27수 안에 끝난다.
 * 룩 둘은 흑이 어떻게 받아도 표본 8만여 판에서 18수 안에 끝났다(ladder-guide.test.ts).
 * 폰은 퀸이 될 때까지의 수다. 방법이 쓰는 범위의 판 모두에서 흑이 어떻게 받아도 8수 안에 퀸이 됐다(pawn-guide.test.ts)
 */
export const ENDGAME_LIMIT: Record<EndgamePiece, number> = {
  Q: 25,
  R: 35,
  RR: 20,
  P: 10,
};

/** 기물 이름. 뒤 조사는 조사 도우미로 고른다(룩 둘의 「잡을 수 있는 룩」도 「룩」) */
export const PIECE_WORD: Record<EndgamePiece, string> = {
  Q: "퀸",
  R: "룩",
  RR: "룩",
  P: "폰",
};

/** 연습 판: 백 킹·흑 킹·퀸이나 룩 자리. 룩 둘이면 둘째 룩(`q`)과, 방법이 지금 미는 쪽(`frame`)도 둔다 */
export interface DrillBoard extends KxkBoard {
  q?: number;
  frame?: Frame | null;
}

/** 단원 한 쪽 */
export interface EndgamePage {
  title: string;
  /** 문단. `**굵게**`만 쓴다 */
  body: string[];
  /** 판 그림(백 차례). 없으면 글만 */
  fen?: string;
  /** 판 그림에서 초록 고리로 보일 수(칸 이름 둘)와, 그 수가 방법의 어느 단계인지(시험이 맞춰 본다) */
  shows?: { from: string; to: string; rule: MethodRule };
}

/** 방법의 단계 하나(단원 글과 연습 화면의 「수 보기」 설명이 함께 쓴다) */
export interface MethodStep {
  rule: MethodRule;
  name: string;
  text: string;
}

/** 방법의 단계들. 위에서부터 차례로 보고, 처음 맞는 단계의 수를 둔다 */
export function methodSteps(piece: EndgamePiece): MethodStep[] {
  if (piece === "RR") return ladderSteps(ENDGAME_LIMIT.RR);
  if (piece === "P") return pawnSteps();
  const P = PIECE_WORD[piece];
  const far = `막는 줄을 따라 흑 킹에서 가장 먼 칸`;
  const steps: MethodStep[] = [
    {
      rule: "mate",
      name: "메이트",
      text: `두면 체크메이트가 되는 수가 있으면 둬요. 메이트는 흑 킹이 가장자리 줄에 있을 때만 생기니, 그때만 찾으면 돼요. 흑 킹이 가장자리 줄에서 내 킹과 마주 볼 때, ${ro(P)} 그 가장자리 줄을 체크하면 메이트예요.`,
    },
    {
      rule: "rescue",
      name: "살리기",
      text: `${subj(P)} 흑 킹 바로 옆에 있는데 내 킹이 지키지 않으면, ${obj(P)} ${ro(far)} 옮겨요. 막는 줄이 없으면 다음 단계(자르기)로 가요.`,
    },
    {
      rule: "cut",
      name: "자르기",
      text: `막는 줄이 없으면 ${obj(P)} 두 킹 사이의 가로줄이나 세로줄로 옮겨요. 그 줄 위라면 어느 칸이든 괜찮아요. 그런 줄이 여럿이면 흑 킹 쪽에 남는 줄이 가장 적어지는 줄로 가요. 옮길 수 없으면 내 킹을 흑 킹을 향해 한 걸음 옮겨요.`,
    },
    {
      rule: "push",
      name: "밀기",
      text: `흑 킹이 바로 너머 줄에 있고 내 킹이 마주 볼 칸에 있으면, ${obj(P)} 흑 킹 쪽으로 똑바로 한 칸(흑 킹이 있는 줄로) 옮겨 체크해요. 흑 킹은 한 줄 물러나야 해요. 옮길 칸이 흑 킹 바로 옆이면 그 대신 ${obj(P)} ${ro(far)} 옮겨요.`,
    },
    {
      rule: "shrink",
      name: "좁히기",
      text: `흑 킹과 막는 줄 사이에 빈 줄이 하나라도 있으면, ${obj(P)} 흑 킹 쪽으로 똑바로 한 칸 옮겨 막는 줄을 한 줄 당겨요.${piece === "Q" ? " 그 칸이 막혔거나 늘 지킬 것 셋에 걸리면 비스듬히 한 칸 앞으로 옮겨요(두 칸 가운데 흑 킹에서 먼 칸)." : ""} 둘 수 없으면 다음 단계로 가요.`,
    },
    {
      rule: "tempo",
      name: "쉬기",
      text: `흑 킹이 바로 너머 줄에 있고 내 킹이 바로 이쪽 줄에서 마주 볼 칸보다 한 칸 옆에 있으면, ${obj(P)} ${ro(far)} 옮겨요. 내 킹이 마주 볼 칸으로 가면 흑 킹이 옆으로 비켜서니, 한 수 쉬어 흑 킹이 먼저 움직이게 해요.`,
    },
    {
      rule: "walk",
      name: "데려오기",
      text: `그 밖에는 내 킹을 마주 볼 칸 쪽으로 한 걸음 옮겨요. 그 칸에서 마주 볼 칸까지 킹이 가야 하는 걸음 수가 가장 적은 칸으로 가고, 같으면 마주 볼 칸까지 가로 칸 수와 세로 칸 수를 더한 값이 적은 칸으로 가요. ${wa(P)} 같은 가로줄·세로줄의 칸으로는 가지 않아요(${P}의 길을 가려요). 갈 칸이 없으면 ${obj(P)} ${ro(far)} 옮겨요. 그것도 안 되면 ${subj(P)} 갈 수 있는 칸 가운데 흑 킹에서 킹 걸음 수로 가장 먼 칸으로 옮겨요.`,
    },
  ];
  // 퀸은 바로 옆 여덟 칸을 모두 노려, 흑 킹이 스스로 다가와 퀸을 노리는 일이 없다(살리기 단계가 없다)
  return piece === "Q" ? steps.filter((s) => s.rule !== "rescue") : steps;
}

/** 단원: 맥락 → 낱말 → 늘 지킬 것 → 방법 → 그림으로 보기 → 연습 */
export function endgamePages(piece: EndgamePiece): EndgamePage[] {
  if (piece === "RR") return ladderPages(ENDGAME_LIMIT.RR);
  if (piece === "P") return pawnPages(ENDGAME_LIMIT.P);
  const P = PIECE_WORD[piece];
  const K = piece;
  const limit = ENDGAME_LIMIT[piece];
  const steps = methodSteps(piece);
  const numbered = steps.map((s, i) => `${i + 1}. **${s.name}**: ${s.text}`);
  return [
    {
      title: `${P} 하나로 끝내기`,
      body: [
        `규칙 배우기에서 체크메이트와 스테일메이트를 익혔어요. 기물을 다 잡아 흑에게 킹만 남아도, 체크메이트를 해야 이겨요. 이번에는 내 킹과 ${P} 하나로 흑 킹을 메이트하는 방법을 익혀요.`,
        `판에는 내 킹, 내 ${P}, 흑 킹 셋만 있어요. 아래 방법을 차례대로 따라 두면 흑이 가장 오래 버티는 수를 골라도 **${limit}수 안에** 메이트돼요(모든 시작 판을 컴퓨터로 확인했어요). 50수 규칙(폰을 움직이지도 기물을 잡지도 않고 양쪽이 50수씩 두면 비김)보다 훨씬 빨라요.`,
        `하는 일은 둘이에요. ${ro(P)} 흑 킹이 넘어오지 못하는 줄을 긋고 그 줄을 한 줄씩 당겨 흑 킹이 다닐 곳을 줄여요. 더 당길 수 없으면 내 킹을 데려와 ${wa(P)} 함께 한 줄씩 밀어요. 그렇게 흑 킹을 판 끝 줄까지 몰아 메이트해요.${piece === "Q" ? "" : " 룩은 흑 킹이 다가와 잡으려 할 수 있어서, 룩을 살리는 단계가 하나 더 있어요."}`,
      ],
    },
    {
      title: "막는 줄",
      body: [
        `${topic(P)} 가로줄과 세로줄을 끝까지 노려요.${piece === "Q" ? " 퀸은 대각선도 노리지만, 막는 줄은 가로줄·세로줄로만 만들어요." : ""} 그 줄 하나를 사이에 두고 내 킹과 흑 킹이 서로 반대쪽에 있으면, 흑 킹은 그 줄을 넘어오지 못해요. 이 줄을 **막는 줄**이라고 불러요. 그림에서는 ${subj(P)} 있는 6번째 가로줄이 막는 줄이에요.`,
        `막는 줄 너머 흑 킹이 있는 쪽을 **흑 킹 쪽**이라고 불러요. 막는 줄과 붙은 흑 킹 쪽 줄을 **바로 너머 줄**, 막는 줄과 붙은 내 킹 쪽 줄을 **바로 이쪽 줄**이라고 불러요. 그림에서는 7번째 가로줄이 바로 너머 줄, 5번째 가로줄이 바로 이쪽 줄이에요. 판 끝 줄(1·8번째 가로줄과 a·h 세로줄)은 **가장자리 줄**이라고 불러요.`,
        `${P}의 가로줄과 세로줄이 둘 다 막는 줄이면, 흑 킹 쪽에 남는 줄이 더 적은 쪽을 막는 줄로 봐요. 둘이 같으면 어느 쪽이든 괜찮아요.`,
        `「막는 줄을 따라 흑 킹에서 가장 먼 칸」은 ${subj(P)} 막는 줄 위에서 갈 수 있는 칸 가운데, 흑 킹과 옆으로 가장 많이 떨어진 칸이에요. 그림이라면 a6이나 h6 가운데 흑 킹(e7)과 더 떨어진 a6이에요.`,
      ],
      fen: `8/4k3/1${K}6/8/8/4K3/8/8 w - - 0 1`,
    },
    {
      title: "마주 보기",
      body: [
        "두 킹이 같은 줄에서 한 칸을 띄우고 서는 것을 **마주 보기**라고 해요. 킹끼리는 바로 옆에 설 수 없으니, 마주 보면 사이 줄의 세 칸에는 흑 킹이 갈 수 없어요.",
        "흑 킹이 바로 너머 줄에 있을 때, 바로 이쪽 줄에서 흑 킹과 마주 보게 되는 칸을 **마주 볼 칸**이라고 불러요. 그림에서는 e5예요.",
        `그림에서 내 킹(e5)과 흑 킹(e7)이 마주 보고, ${topic(P)} 막는 줄(6번째 가로줄)에 있어요. 이제 ${obj(P)} 흑 킹이 있는 7번째 줄로 옮겨 체크하면, 6번째 줄의 d6·e6·f6은 내 킹이 지키고 있어 흑 킹은 8번째 줄로 물러나야 해요. 이렇게 한 줄씩 밀어요.`,
      ],
      fen: `8/4k3/1${K}6/4K3/8/8/8/8 w - - 0 1`,
      shows: { from: "b6", to: "b7", rule: "push" },
    },
    {
      title: "늘 지킬 것 셋",
      body: [
        `① ${obj(P)} 흑 킹 바로 옆에 두지 않아요. 내 킹이 ${P} 바로 옆에서 지키고 있을 때만 괜찮아요. 잡히면 킹 둘만 남아 비겨요.`,
        "② 체크는 「메이트」와 「밀기」 단계에서만 해요. 다른 단계의 수가 체크가 되면 그 수는 빼요. 아무 때나 체크하면 흑 킹이 막는 줄을 벗어날 수 있어요.",
        "③ 스테일메이트가 되는 수는 두지 않아요. 체크가 아닌 수를 둘 때는, 두고 나서 흑 킹이 갈 수 있는 칸이 하나라도 남는지 세어 봐요.",
        "아래 단계의 수가 이 셋을 어기면 그 수는 빼고 같은 단계의 다른 칸을 봐요. 다른 칸이 없으면 다음 단계로 가요.",
      ],
    },
    {
      title: "방법: 위에서부터 차례로",
      body: [
        "내 차례마다 1번부터 차례로 보고, **처음 맞는 단계의 수를 둬요**. 「가장 먼 칸」처럼 고를 칸이 둘 이상 같으면 어느 칸이든 괜찮아요.",
        ...numbered,
      ],
    },
    {
      title: "그림으로 보기: 데려오기",
      body: [
        `흑 킹(e7)은 바로 너머 줄에 있지만, 내 킹(e3)은 아직 마주 볼 칸(e5)에 오지 않았어요. 앞 단계는 모두 맞지 않으니 「데려오기」예요. 마주 볼 칸까지 걸음 수가 가장 적은 e4로 한 걸음 옮겨요.`,
      ],
      fen: `8/4k3/1${K}6/8/8/4K3/8/8 w - - 0 1`,
      shows: { from: "e3", to: "e4", rule: "walk" },
    },
    {
      title: "그림으로 보기: 쉬기",
      body: [
        `내 킹(d5)이 마주 볼 칸(e5)보다 한 칸 옆에 있어요. 「쉬기」예요. ${obj(P)} 막는 줄을 따라 흑 킹에서 가장 먼 a6으로 옮겨요.`,
        `흑 킹은 꼭 움직여야 해요. d7로 오면 마주 보니 다음에 「밀기」, 8번째 줄로 물러나면 「좁히기」, 옆의 f7로 비키면 다시 「데려오기」를 해요.`,
      ],
      fen: `8/4k3/1${K}6/3K4/8/8/8/8 w - - 0 1`,
      shows: { from: "b6", to: "a6", rule: "tempo" },
    },
    {
      title: "그림으로 보기: 좁히기",
      body: [
        `흑 킹(e8)과 막는 줄(6번째 줄) 사이에 빈 줄(7번째 줄)이 있어요. 「좁히기」예요. ${obj(P)} b7로 똑바로 한 칸 옮겨 막는 줄을 7번째 줄로 당겨요. 이제 흑 킹은 8번째 줄에 갇혀요.`,
      ],
      fen: `4k3/8/1${K}6/8/8/4K3/8/8 w - - 0 1`,
      shows: { from: "b6", to: "b7", rule: "shrink" },
    },
    {
      title: "그림으로 보기: 마지막 메이트",
      body: [
        `흑 킹(e8)이 가장자리 줄에 있고 내 킹(e6)과 마주 봐요. ${obj(P)} a8로 옮겨 8번째 줄을 체크하면 흑 킹은 갈 칸이 없어요. 체크메이트예요.`,
      ],
      fen: `4k3/${K}7/4K3/8/8/8/8/8 w - - 0 1`,
      shows: { from: "a7", to: "a8", rule: "mate" },
    },
  ];
}

/** 연습 하나 */
export interface EndgameDrill {
  id: string;
  piece: EndgamePiece;
  /** 시작 판(백 차례) */
  fen: string;
}

export interface EndgameSet {
  id: string;
  piece: EndgamePiece;
  title: string;
  summary: string;
  drills: readonly EndgameDrill[];
}

const drills = (piece: EndgamePiece, fens: readonly string[]): EndgameDrill[] =>
  fens.map((fen, i) => ({
    id: `end-${piece.toLowerCase()}-${i + 1}`,
    piece,
    fen,
  }));

/** 연습 묶음. 흑 킹이 가운데에 있고 내 킹·기물이 멀리 있는 판부터 */
export const ENDGAME_SETS: readonly EndgameSet[] = [
  {
    id: "end-queen",
    piece: "Q",
    title: "퀸으로 메이트",
    summary: `킹과 퀸 하나로 흑 킹을 ${ENDGAME_LIMIT.Q}수 안에 메이트해요. 처음 열면 방법부터 읽어요.`,
    drills: drills("Q", [
      "8/8/3k4/8/8/8/8/2Q1K3 w - - 0 1",
      "8/8/8/4k3/8/8/8/K6Q w - - 0 1",
      "6Q1/8/8/8/3k4/8/8/7K w - - 0 1",
    ]),
  },
  {
    id: "end-rook",
    piece: "R",
    title: "룩으로 메이트",
    summary: `킹과 룩 하나로 흑 킹을 ${ENDGAME_LIMIT.R}수 안에 메이트해요. 퀸과 같은 방법이고, 룩을 지키는 단계가 하나 더 있어요.`,
    drills: drills("R", [
      "8/8/8/3k4/8/8/8/R3K3 w - - 0 1",
      "8/8/4k3/8/8/8/8/K6R w - - 0 1",
      "R7/8/8/8/4k3/8/8/7K w - - 0 1",
    ]),
  },
  {
    id: "end-rook-ladder",
    piece: "RR",
    title: "룩 둘로 사다리 메이트",
    summary: `룩 둘이 번갈아 체크해 흑 킹을 한 줄씩 판 끝 줄로 밀어요. 내 킹은 거의 쓰지 않고 ${ENDGAME_LIMIT.RR}수 안에 메이트해요.`,
    drills: drills("RR", [
      "8/8/8/3k4/8/8/8/R3K2R w - - 0 1",
      "7R/8/8/4k3/8/8/8/R6K w - - 0 1",
      "R6R/8/8/8/3k4/8/8/4K3 w - - 0 1",
    ]),
  },
  {
    id: "end-pawn",
    piece: "P",
    title: "킹과 폰으로 퀸 만들기",
    summary: `킹과 폰 하나로 흑 킹을 피해 폰을 ${ENDGAME_LIMIT.P}수 안에 퀸으로 바꿔요. 처음 열면 방법부터 읽어요.`,
    // 사각형 밖 → 이기는 칸에서 마주 보기 → 판 가장자리 옆 세로줄(g) 폰
    drills: drills("P", [
      "8/8/8/8/3P4/7k/8/K7 w - - 0 1",
      "4k3/8/4K3/8/4P3/8/8/8 w - - 0 1",
      "6k1/8/6K1/6P1/8/8/8/8 w - - 0 1",
    ]),
  },
];

/** 연습 id로 묶음과 차례를 찾는다 */
export function findDrill(id: string) {
  for (const set of ENDGAME_SETS) {
    const index = set.drills.findIndex((d) => d.id === id);
    if (index >= 0)
      return { set, index, drill: set.drills[index] as EndgameDrill };
  }
  return null;
}

/** 룩 둘 판을 엔진 계산 판으로(잡힌 룩은 -1) */
const rr = (b: DrillBoard): KrrkBoard => ({
  wk: b.wk,
  bk: b.bk,
  p: b.p,
  q: b.q ?? -1,
});

/** FEN을 판(백 킹·흑 킹·퀸이나 룩 자리)으로 */
export function drillBoard(piece: EndgamePiece, fen: string): DrillBoard {
  const board = parseFen(fen).board;
  const wk = board.indexOf("wK");
  const bk = board.indexOf("bK");
  if (piece === "RR") {
    const rooks = board.flatMap((c, i) => (c === "wR" ? [i] : []));
    return { wk, bk, p: rooks[0] ?? -1, q: rooks[1] ?? -1, frame: null };
  }
  return { wk, bk, p: board.indexOf(`w${piece}`) };
}

/** 판을 엔진 판 그림(칸 64개)으로 */
export function drillCells(piece: EndgamePiece, b: DrillBoard): Cell[] {
  const cells: Cell[] = Array<Cell>(64).fill("");
  cells[b.wk] = "wK";
  cells[b.bk] = "bK";
  if (piece === "RR") {
    for (const r of [b.p, b.q ?? -1]) if (r >= 0) cells[r] = "wR";
  } else if (piece === "P")
    // 끝줄에 닿은 폰은 퀸으로 그린다
    cells[b.p] = b.p < 8 ? "wQ" : "wP";
  else cells[b.p] = `w${piece}`;
  return cells;
}

/** 백 차례에 둘 수 있는 수 */
export function drillMoves(
  piece: EndgamePiece,
  b: DrillBoard,
): { from: number; to: number }[] {
  if (piece === "RR") return krrkWhiteMoves(rr(b));
  if (piece === "P") return pawnWhiteMoves(b);
  return kxkWhiteMoves(piece, b.wk, b.bk, b.p).map((m) => ({
    from: m.from,
    to: m.to,
  }));
}

/** 방법이 이 판에서 둘 수(「힌트」·「수 보기」). 룩 둘은 판에 적어 둔 미는 쪽을 이어 쓴다 */
export function drillGuide(
  piece: EndgamePiece,
  b: DrillBoard,
  tie: Tie = "first",
): { from: number; to: number; rule: MethodRule } | null {
  if (piece === "RR") return ladderMove(rr(b), tie, b.frame ?? null);
  if (piece === "P") return pawnGuide(b, tie);
  return guideMove(piece, b, tie);
}

/**
 * 백의 수를 둔 판. 룩 둘이면 방법이 이 판에서 고른 미는 쪽을 적어 둔다(내가 방법과 다른 수를 두어도 미는 쪽은 이어 간다)
 */
export function drillPlayed(
  piece: EndgamePiece,
  b: DrillBoard,
  move: { from: number; to: number },
): DrillBoard {
  if (piece === "P") return pawnPlayed(b, move);
  if (piece !== "RR") return whitePlayed(b, move);
  const frame = ladderMove(rr(b), "first", b.frame ?? null)?.frame;
  return {
    ...krrkWhitePlayed(rr(b), move),
    frame: frame ?? b.frame ?? null,
  };
}

/**
 * 이 시작 판을 가장 빨리 끝내는 수(메이트 거리 표가 있는 퀸·룩 하나는 메이트까지, 폰은 무사히 퀸이 될 때까지). 모르면 null
 */
export function drillBest(piece: EndgamePiece, b: DrillBoard): number | null {
  if (piece === "RR") return null;
  if (piece === "P") return kpkWhiteDistance(b.wk, b.bk, b.p);
  return kxkWhiteDistance(piece, b.wk, b.bk, b.p);
}

/** 실패한 까닭(draw: 폰 연습에서 이길 수 없는 판이 됨) */
export type DrillMiss = "stalemate" | "lost" | "limit" | "draw";

/** 폰 연습 판정: 무사히 퀸이 되면 성공, 폰(퀸)을 잡힐 자리·스테일메이트·비기는 판은 실패 */
function judgePawn(
  before: DrillBoard,
  move: { from: number; to: number },
): { verdict: "solved" | "next" } | { verdict: "wrong"; miss: DrillMiss } {
  if (move.from === before.p && move.to < 8) {
    if (safeQueen(before, move.to)) return { verdict: "solved" };
    const near =
      Math.max(
        Math.abs((move.to & 7) - (before.bk & 7)),
        Math.abs((move.to >> 3) - (before.bk >> 3)),
      ) <= 1;
    return { verdict: "wrong", miss: near ? "lost" : "stalemate" };
  }
  const a = pawnPlayed(before, move);
  if (kpkBlackMoves(a.wk, a.bk, a.p).some((m) => m.capture))
    return { verdict: "wrong", miss: "lost" };
  if (pawnStalemate(a)) return { verdict: "wrong", miss: "stalemate" };
  if (!kpkWins(1, a.wk, a.bk, a.p)) return { verdict: "wrong", miss: "draw" };
  return { verdict: "next" };
}

/**
 * 연습에서 내 수 하나를 판정한다. `step`은 이 수 앞에 둔 내 수의 개수(0부터).
 * - 메이트면 성공(폰은 무사히 퀸이 되면 성공)
 * - 스테일메이트, 흑 킹이 퀸·룩(폰)을 잡을 수 있게 됨, 정해진 수를 다 쓰고도 끝내지 못함은 실패.
 *   폰은 비기는 판이 되는 수도 실패
 * - 그 밖에는 흑이 받는다
 */
export function judgeDrill(
  piece: EndgamePiece,
  before: DrillBoard,
  move: { from: number; to: number },
  step: number,
): { verdict: "solved" | "next" } | { verdict: "wrong"; miss: DrillMiss } {
  if (piece === "P") {
    const verdict = judgePawn(before, move);
    if (verdict.verdict !== "next") return verdict;
  } else if (piece === "RR") {
    const a = krrkWhitePlayed(rr(before), move);
    if (krrkMated(a)) return { verdict: "solved" };
    if (krrkStalemate(a)) return { verdict: "wrong", miss: "stalemate" };
    if (krrkBlackMoves(a).some((m) => m.capture))
      return { verdict: "wrong", miss: "lost" };
  } else {
    const b = whitePlayed(before, move);
    if (kxkMated(piece, b.wk, b.bk, b.p)) return { verdict: "solved" };
    if (kxkStalemate(piece, b.wk, b.bk, b.p))
      return { verdict: "wrong", miss: "stalemate" };
    if (kxkDefense(piece, b.wk, b.bk, b.p)?.capture)
      return { verdict: "wrong", miss: "lost" };
  }
  if (step + 1 >= ENDGAME_LIMIT[piece])
    return { verdict: "wrong", miss: "limit" };
  return { verdict: "next" };
}

/**
 * 흑 킹이 받는 수를 둔 판. 둘 수가 없으면 null.
 * 퀸·룩 하나는 메이트 거리 표로 가장 오래 버티는 수, 룩 둘은 짧은 깊이 탐색(`krrkDefense`),
 * 폰은 승급 거리 표로 가장 오래 버티는 수(`kpkDefense`)
 */
export function blackReply(
  piece: EndgamePiece,
  b: DrillBoard,
): { board: DrillBoard; from: number; to: number } | null {
  if (piece === "P") {
    const reply = kpkDefense(b.wk, b.bk, b.p);
    if (!reply) return null;
    return { board: { ...b, bk: reply.to }, from: b.bk, to: reply.to };
  }
  if (piece === "RR") {
    const reply = krrkDefense(rr(b));
    if (!reply) return null;
    const after = krrkBlackPlayed(rr(b), reply.to);
    return {
      board: { ...after, frame: b.frame ?? null },
      from: b.bk,
      to: reply.to,
    };
  }
  const reply = kxkDefense(piece, b.wk, b.bk, b.p);
  if (!reply) return null;
  return { board: { ...b, bk: reply.to }, from: b.bk, to: reply.to };
}
