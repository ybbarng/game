// 3×3 처음 맞추기에서 용어마다 뜻을 먼저 알리고 쓰는지 본다(glossary-333.ts). 단원을 위에서 아래로 읽는 차례로,
// 용어를 처음 쓴 단계가 뜻을 알린 단계보다 앞이면 실패한다. 단원 요약은 그 단원 머리에 보이므로, 그 단원 안에서
// 뜻을 알린 용어까지는 써도 된다(무엇을 배우는 단원인지 알리는 글).
import { describe, expect, it } from "vitest";

import { GLOSSARY_333 } from "./glossary-333";
import { BEGINNER_333 } from "./lessons-333";
import type { LessonStep } from "./types";

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
