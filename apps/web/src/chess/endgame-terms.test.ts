// 기본 엔드게임 단원이 용어의 뜻을 먼저 알리고 쓰는지 본다(tutorial/term-order.ts).
// 수 배우기는 규칙 배우기 다음에 오므로, 규칙 배우기 단원을 앞에 이어 읽는다(체크·스테일메이트 등은 거기서 배운다).
import type { KxkPiece } from "@game/chess-ai";
import { describe, expect, it } from "vitest";

import {
  earlyUses,
  lessonPlaces,
  type OrderedTerm,
  splitSentences,
  type TextPlace,
} from "@/tutorial/term-order";

import { endgamePages } from "./endgame";
import { CHESS_LESSONS } from "./tutorial";

const TERMS: OrderedTerm[] = [
  { term: "킹", use: /킹/, define: /\*\*킹\*\*은 각 편의 왕/ },
  { term: "룩", use: /룩/, define: /\*\*룩\*\*은 가로·세로/ },
  { term: "퀸", use: /퀸/, define: /\*\*퀸\*\*은 룩과 비숍/ },
  { term: "체크메이트", use: /체크메이트/, define: /\(\*\*체크메이트\*\*\)/ },
  { term: "체크", use: /체크(?!메이트)/, define: /\*\*체크\*\*예요/ },
  {
    term: "스테일메이트",
    use: /스테일메이트/,
    define: /\(\*\*스테일메이트\*\*\)/,
  },
  {
    term: "칸 이름(e4)",
    use: /(^|[^A-Za-z])[a-h][1-8]/,
    define: /세로줄은 왼쪽부터 a~h/,
  },
  { term: "50수 규칙", use: /50수 규칙/, define: /50수 규칙이라고 해요/ },
  { term: "막는 줄", use: /막는 줄/, define: /\*\*막는 줄\*\*이라고/ },
  {
    term: "흑 킹 쪽",
    use: /흑 킹 쪽(?!으로)/,
    define: /\*\*흑 킹 쪽\*\*이라고/,
  },
  { term: "바로 너머 줄", use: /바로 너머 줄/, define: /\*\*바로 너머 줄\*\*/ },
  { term: "바로 이쪽 줄", use: /바로 이쪽 줄/, define: /\*\*바로 이쪽 줄\*\*/ },
  {
    term: "마주 보기",
    use: /마주 (보|봐|볼)/,
    define: /마주 보게\*\*\(한 칸 띄우고|\*\*마주 보기\*\*라고/,
  },
  { term: "마주 볼 칸", use: /마주 볼 칸/, define: /\*\*마주 볼 칸\*\*/ },
  {
    term: "가장자리 줄",
    use: /가장자리 줄/,
    define: /\*\*가장자리\*\*로|\*\*가장자리 줄\*\*/,
  },
];

describe.each(["Q", "R"] as const)(
  "%s 엔드게임 단원 용어 순서",
  (piece: KxkPiece) => {
    const places: TextPlace[] = [
      ...lessonPlaces(CHESS_LESSONS),
      ...endgamePages(piece).map((page, i) => ({
        where: `엔드게임 ${i + 1}쪽(${page.title})`,
        group: CHESS_LESSONS.length,
        text: [page.title, ...page.body].join("\n"),
      })),
    ];

    it("뜻을 알리기 전에 쓴 용어가 없다", () => {
      expect(earlyUses(places, TERMS)).toEqual([]);
    });
  },
);

/** 룩 둘 단원이 규칙 배우기에서 이어 쓰는 용어(규칙 배우기 단원을 앞에 이어 읽는다) */
const RULE_TERMS = TERMS.filter((t) =>
  [
    "킹",
    "룩",
    "체크메이트",
    "체크",
    "스테일메이트",
    "칸 이름(e4)",
    "50수 규칙",
    "가장자리 줄",
  ].includes(t.term),
);

/**
 * 룩 둘 사다리 메이트 단원이 새로 알리는 용어. 퀸·룩 하나 단원과 따로 읽어도 되게 이 단원 안에서 처음부터 알린다.
 * 「앞쪽」·「옆으로」처럼 규칙 배우기에서 보통 뜻으로 쓰는 말도 있어, 이 단원의 쪽만 본다
 */
const LADDER_TERMS: OrderedTerm[] = [
  {
    term: "사다리 메이트",
    use: /사다리 메이트/,
    define: /\*\*사다리 메이트\*\*/,
  },
  { term: "미는 쪽", use: /미는 쪽/, define: /\*\*미는 쪽\*\*/ },
  { term: "나란한 줄", use: /나란한 줄/, define: /\*\*나란한 줄\*\*/ },
  { term: "엇갈리는 줄", use: /엇갈리는 줄/, define: /\*\*엇갈리는 줄\*\*/ },
  { term: "흑 킹 줄", use: /흑 킹 줄/, define: /\*\*흑 킹 줄\*\*/ },
  { term: "바로 뒤 줄", use: /바로 뒤 줄/, define: /\*\*바로 뒤 줄\*\*/ },
  { term: "둘째 뒤 줄", use: /둘째 뒤 줄/, define: /\*\*둘째 뒤 줄\*\*/ },
  { term: "앞쪽", use: /앞쪽/, define: /\*\*앞쪽\*\*/ },
  { term: "옆으로 몇 칸", use: /옆으로/, define: /\*\*옆으로 몇 칸\*\*/ },
  { term: "킹 걸음 수", use: /킹 걸음/, define: /\*\*킹 걸음 수\*\*/ },
  { term: "지키는 룩", use: /지키는 룩/, define: /\*\*지키는 룩\*\*/ },
  { term: "먼 칸", use: /먼 칸/, define: /\*\*먼 칸\*\*/ },
  { term: "준비된 칸", use: /준비된 칸/, define: /\*\*준비된 칸\*\*/ },
];

/** 킹과 폰 단원이 규칙 배우기에서 이어 쓰는 용어 */
const PAWN_RULE_TERMS: OrderedTerm[] = [
  ...RULE_TERMS.filter((t) => t.term !== "룩" && t.term !== "50수 규칙"),
  { term: "폰", use: /폰/, define: /작은 기물 8개는 \*\*폰\*\*/ },
  { term: "승급", use: /승급/, define: /\(승급\)/ },
  {
    term: "가로줄",
    use: /가로줄/,
    define: /가로줄은 백 쪽부터 1~8/,
  },
];

/**
 * 킹과 폰 단원이 새로 알리는 용어. 다른 엔드게임 단원과 따로 읽어도 되게 이 단원 안에서 처음부터 알린다.
 * 「마주 보기」는 퀸·룩 단원에도 있지만 이 단원은 같은 세로줄만 보니 다시 알린다
 */
const PAWN_TERMS: OrderedTerm[] = [
  {
    term: "앞",
    use: /(두|한) 줄 앞|더 앞|보다 앞|앞의 칸|바로 앞|앞으로/,
    define: /\*\*앞\*\*은/,
  },
  { term: "폰의 사각형", use: /사각형/, define: /\*\*폰의 사각형\*\*/ },
  { term: "이기는 칸", use: /이기는 칸/, define: /\*\*이기는 칸\*\*/ },
  {
    term: "마주 보기",
    use: /마주 (보|봐|본|볼)/,
    define: /\*\*마주 보기\*\*라고/,
  },
];

describe("킹과 폰 단원 용어 순서(문장마다)", () => {
  // 쪽 머리글(「폰의 사각형」)은 그 쪽이 뜻을 알릴 용어의 이름표라 본문 문장만 본다
  const pawn: TextPlace[] = endgamePages("P").flatMap((page, i) =>
    splitSentences(page.body.join("\n")).map((sentence, k) => ({
      where: `킹과 폰 ${i + 1}쪽(${page.title}) ${k + 1}번째 문장`,
      group: CHESS_LESSONS.length,
      text: sentence,
    })),
  );

  it("규칙 배우기에서 배운 용어는 그 뒤에 쓴다", () => {
    expect(
      earlyUses([...lessonPlaces(CHESS_LESSONS), ...pawn], PAWN_RULE_TERMS),
    ).toEqual([]);
  });

  it("이 단원이 새로 알리는 용어는 뜻을 알린 문장부터 쓴다", () => {
    expect(earlyUses(pawn, PAWN_TERMS)).toEqual([]);
  });
});

describe("룩 둘 사다리 메이트 단원 용어 순서(문장마다)", () => {
  const ladder: TextPlace[] = endgamePages("RR").flatMap((page, i) =>
    splitSentences([page.title, ...page.body].join("\n")).map(
      (sentence, k) => ({
        where: `사다리 메이트 ${i + 1}쪽(${page.title}) ${k + 1}번째 문장`,
        group: CHESS_LESSONS.length,
        text: sentence,
      }),
    ),
  );

  it("규칙 배우기에서 배운 용어는 그 뒤에 쓴다", () => {
    expect(
      earlyUses([...lessonPlaces(CHESS_LESSONS), ...ladder], RULE_TERMS),
    ).toEqual([]);
  });

  it("이 단원이 새로 알리는 용어는 뜻을 알린 문장부터 쓴다", () => {
    expect(earlyUses(ladder, LADDER_TERMS)).toEqual([]);
  });
});
