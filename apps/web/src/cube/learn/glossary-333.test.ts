// 3×3 처음 맞추기에서 용어마다 뜻을 먼저 알리고 쓰는지 본다(glossary-333.ts, 공통 틀 `@/tutorial/term-order`).
// 단원을 위에서 아래로 읽는 차례로, 용어를 처음 쓴 단계가 뜻을 알린 단계보다 앞이면 실패한다. 단원 요약은 그 단원
// 머리에 보이므로, 그 단원 안에서 뜻을 알린 용어까지는 써도 된다(무엇을 배우는 단원인지 알리는 글).
import { describe, expect, it } from "vitest";

import { earlySummaryUses, earlyUses } from "@/tutorial/term-order";

import { GLOSSARY_333 } from "./glossary-333";
import { BEGINNER_333 } from "./lessons-333";
import { coursePlaces, courseSummaries } from "./term-places";

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
