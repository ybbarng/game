// 3×3 처음 맞추기에서 용어마다 뜻을 먼저 알리고 쓰는지 본다(glossary-333.ts, 공통 틀 `@/tutorial/term-order`).
// 단원을 위에서 아래로 읽는 차례로, 용어를 처음 쓴 단계가 뜻을 알린 단계보다 앞이면 실패한다. 단원 요약은 그 단원
// 머리에 보이므로, 그 단원 안에서 뜻을 알린 용어까지는 써도 된다(무엇을 배우는 단원인지 알리는 글).
import { describe, expect, it } from "vitest";

import { earlySummaryUses, earlyUses } from "@/tutorial/term-order";

import { stagesOf } from "../practice/stages";
import { GLOSSARY_333, loosePieceWords } from "./glossary-333";
import { BEGINNER_222 } from "./lessons-222";
import { FROM_333_222 } from "./lessons-222-from333";
import { BEGINNER_333 } from "./lessons-333";
import { coursePlaces, courseSummaries } from "./term-places";
import type { Course } from "./types";

const PLACES = coursePlaces(BEGINNER_333);

describe("3×3 처음 맞추기 용어", () => {
  it(`용어 ${GLOSSARY_333.length}개: 모두 뜻을 알린 뒤에 쓴다`, () => {
    expect(earlyUses(PLACES, GLOSSARY_333)).toEqual([]);
  });

  it("단원 요약은 그 단원까지 뜻을 알린 용어만 쓴다", () => {
    expect(
      earlySummaryUses(courseSummaries(BEGINNER_333), PLACES, GLOSSARY_333),
    ).toEqual([]);
  });
});

// 조각 이름: 홀로 부르거나 색을 모두 대어 부르면 블럭을 붙인다(docs/standing-rules.md 2절)
const courseTexts = (c: Course) => [...courseSummaries(c), ...coursePlaces(c)];

describe("조각 이름(블럭)", () => {
  it("찾는 법: 홀로 쓴 것과 색을 모두 댄 것만 잡는다", () => {
    expect(loosePieceWords("이 엣지는 뒤집혔어요.")).toHaveLength(1);
    expect(loosePieceWords("흰-초록 엣지를 눌러요.")).toHaveLength(1);
    expect(loosePieceWords("코너가 앞에 있어요.")).toHaveLength(1);
    expect(
      loosePieceWords(
        "흰-초록 엣지 블럭과 흰 엣지, 첫 층 코너, 옆 센터, 앞-오른쪽 위 코너, 코너 방향, 엣지 짝.",
      ),
    ).toEqual([]);
    // 이름은 꾸미는 말이 붙어도 조각 하나를 가리킨다. 글 속 「노란색이 붙은 엣지」는 묶음이라 넘긴다
    expect(
      loosePieceWords("자리에서 뒤집힌 엣지", { name: true }),
    ).toHaveLength(1);
    expect(
      loosePieceWords("위 층, 자리가 바뀐 엣지 둘", { name: true }),
    ).toHaveLength(1);
    expect(
      loosePieceWords("자리에서 뒤집힌 엣지 블럭", { name: true }),
    ).toEqual([]);
    expect(loosePieceWords("노란색이 붙은 엣지를 넣어요.")).toEqual([]);
    // 면 이름은 받침 ㄴ이어도 꾸미는 말이 아니다(자리를 말하는 꼴)
    expect(loosePieceWords("앞면 센터, 윗면 코너", { name: true })).toEqual([]);
  });

  for (const c of [BEGINNER_333, BEGINNER_222, FROM_333_222])
    it(`${c.title}: 홀로 쓴 엣지·코너·센터가 없다`, () => {
      const loose = courseTexts(c).flatMap(({ where, text }) =>
        loosePieceWords(text).map((w) => `${where}: …${w}…`),
      );
      expect(loose).toEqual([]);
    });

  // 이름은 조각 하나를 홀로 부르는 자리라 꾸미는 말이 붙어도 블럭을 붙인다(`name`). 2026-11-10 「자리에서 뒤집힌 엣지」를
  // 이 시험이 못 잡은 까닭: 받침이 ㄴ·ㄹ인 앞말(「뒤집힌」)을 모두 묶음을 말하는 꾸밈으로 보고 넘겼다
  // CFOP F2L 이름(「코너 칸에·엣지 위」)은 docs/47 1절이 허용한 짧은 꼬리표 꼴이라 보지 않는다
  it("공식 연습 초보자 단계·상황 이름", () => {
    const loose = stagesOf("beginner").flatMap((s) => [
      ...loosePieceWords(s.title, { name: true }).map(
        (w) => `${s.title}: ${w}`,
      ),
      ...s.cases.flatMap((c) =>
        loosePieceWords(c.name, { name: true }).map(
          (w) => `${s.title} · ${c.name}: ${w}`,
        ),
      ),
    ]);
    expect(loose).toEqual([]);
  });
});
