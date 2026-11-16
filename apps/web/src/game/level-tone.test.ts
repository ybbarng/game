/*
 * 컴퓨터 단계 설명 말투(docs/standing-rules.md 3절): 모든 게임의 단계 설명은 해요체 마침표 문장이다.
 * 웹 소스 글은 `src/screen-tone.test.ts`가 보지만, 원카드처럼 단계 설명을 패키지(`@game/onecard-ai`)에 둔 게임도 있어 자료로 모아 본다.
 */
import { describe, expect, it } from "vitest";
import { BADUK_LEVELS } from "@/baduk/settings";
import { BASEBALL_LEVELS } from "@/baseball/settings";
import { CHESS_LEVELS } from "@/chess/settings";
import { GALAXY_LEVELS } from "@/galaxy/settings";
import { GOSTOP_LEVELS } from "@/gostop/settings";
import { HEARTS_LEVELS } from "@/hearts/bots";
import { JANGGI_LEVELS } from "@/janggi/settings";
import { MINHWATU_LEVELS } from "@/minhwatu/settings";
import { NYRONGPPONG_LEVELS } from "@/nyrongppong/settings";
import { OMOK_LEVELS } from "@/omok/settings";
import { ONECARD_LEVELS } from "@/onecard/settings";
import { toneProblems } from "@/study/tone";
import { YUT_LEVELS } from "@/yut/settings";
import { BOT_LEVELS } from "./bots";

const GAMES: Record<string, readonly { description: string }[]> = {
  마이티: BOT_LEVELS,
  하트: HEARTS_LEVELS,
  원카드: ONECARD_LEVELS,
  고스톱: GOSTOP_LEVELS,
  민화투: MINHWATU_LEVELS,
  나이롱뽕: NYRONGPPONG_LEVELS,
  오목: OMOK_LEVELS,
  장기: JANGGI_LEVELS,
  체스: CHESS_LEVELS,
  바둑: BADUK_LEVELS,
  숫자야구: BASEBALL_LEVELS,
  윷놀이: YUT_LEVELS,
  은하: GALAXY_LEVELS,
};

describe("컴퓨터 단계 설명 말투", () => {
  it.each(Object.entries(GAMES))("%s: 해요체 마침표 문장", (_name, levels) => {
    expect(toneProblems(levels.map((l) => l.description))).toEqual([]);
  });
});
