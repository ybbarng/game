// 3×3 처음 맞추기에서 용어마다 뜻을 먼저 알리고 쓰는지 본다(glossary-333.ts). 단원을 위에서 아래로 읽는 차례로,
// 용어를 처음 쓴 단계가 뜻을 알린 단계보다 앞이면 실패한다. 단원 요약은 그 단원 머리에 보이므로, 그 단원 안에서
// 뜻을 알린 용어까지는 써도 된다(무엇을 배우는 단원인지 알리는 글).
import { describe, expect, it } from "vitest";

import { stagesOf } from "../practice/stages";
import { GLOSSARY_333, loosePieceWords } from "./glossary-333";
import { BEGINNER_222 } from "./lessons-222";
import { BEGINNER_333 } from "./lessons-333";
import type { Course, LessonStep } from "./types";

const stepText = (s: LessonStep) =>
  [
    s.body,
    s.passedText ?? "",
    s.quiz?.question ?? "",
    ...(s.quiz?.choices ?? []),
    s.quiz?.why ?? "",
  ].join("\n");

/** [단원 번호, 단계 번호, 글] 차례 */
const PLACES = BEGINNER_333.lessons.flatMap((l, li) =>
  l.steps.map((s, si) => ({
    li,
    si,
    where: `${l.title} ${si + 1}번`,
    text: stepText(s),
  })),
);

const firstAt = (re: RegExp) => PLACES.findIndex((p) => re.test(p.text));

describe("3×3 처음 맞추기 용어", () => {
  it(`용어 ${GLOSSARY_333.length}개: 모두 뜻을 알린 뒤에 쓴다`, () => {
    const early: string[] = [];
    for (const t of GLOSSARY_333) {
      const def = firstAt(t.define);
      const use = firstAt(t.use);
      if (def < 0) {
        early.push(`${t.term}: 뜻을 알린 곳이 없다`);
        continue;
      }
      // 뜻을 알리는 단계 안에서는 그 용어를 함께 써도 된다
      if (use >= 0 && use < def)
        early.push(
          `${t.term}: ${PLACES[use]?.where}에서 먼저 씀(뜻은 ${PLACES[def]?.where})`,
        );
    }
    expect(early).toEqual([]);
  });

  it("단원 요약은 그 단원까지 뜻을 알린 용어만 쓴다", () => {
    const early: string[] = [];
    BEGINNER_333.lessons.forEach((l, li) => {
      for (const t of GLOSSARY_333) {
        if (!t.use.test(l.summary)) continue;
        const def = PLACES[firstAt(t.define)];
        if (!def || def.li > li) early.push(`${l.title} 요약: ${t.term}`);
      }
    });
    expect(early).toEqual([]);
  });
});

// 조각 이름: 홀로 부르거나 색을 모두 대어 부르면 블럭을 붙인다(docs/standing-rules.md 2절)
const courseTexts = (c: Course) =>
  c.lessons.flatMap((l) => [
    { where: `${l.title} 요약`, text: l.summary },
    ...l.steps.map((s, si) => ({
      where: `${l.title} ${si + 1}번`,
      text: stepText(s),
    })),
  ]);

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
  });

  for (const c of [BEGINNER_333, BEGINNER_222])
    it(`${c.title}: 홀로 쓴 엣지·코너·센터가 없다`, () => {
      const loose = courseTexts(c).flatMap(({ where, text }) =>
        loosePieceWords(text).map((w) => `${where}: …${w}…`),
      );
      expect(loose).toEqual([]);
    });

  it("공식 연습 초보자 상황 이름", () => {
    const loose = stagesOf("beginner").flatMap((s) =>
      s.cases.flatMap((c) =>
        loosePieceWords(c.name).map((w) => `${s.title} · ${c.name}: ${w}`),
      ),
    );
    expect(loose).toEqual([]);
  });
});
