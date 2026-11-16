// 기본 엔드게임 단원이 용어의 뜻을 먼저 알리고 쓰는지 본다(tutorial/term-order.ts).
// 수 배우기는 규칙 배우기 다음에 오므로, 규칙 배우기 단원을 앞에 이어 읽는다(체크·스테일메이트 등은 거기서 배운다).
import type { KxkPiece } from "@game/chess-ai";
import { describe, expect, it } from "vitest";

import {
  earlyUses,
  lessonPlaces,
  type OrderedTerm,
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
