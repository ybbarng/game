// 게임 튜토리얼마다 붙이는 용어 순서 시험(term-order.ts). 시험 파일에서만 불러 쓴다.
import { describe, expect, it } from "vitest";

import {
  type AnyLesson,
  earlySummaryUses,
  earlyUses,
  lessonPlaces,
  lessonSummaries,
  type OrderedTerm,
} from "./term-order";

export function termOrderSuite(
  name: string,
  lessons: readonly AnyLesson[],
  terms: readonly OrderedTerm[],
  termText?: (id: string) => string,
) {
  const places = lessonPlaces(lessons, termText);
  describe(`${name} 튜토리얼 용어`, () => {
    it(`용어 ${terms.length}개: 모두 뜻을 알린 뒤에 쓴다`, () => {
      expect(earlyUses(places, terms)).toEqual([]);
    });
    it("단원 목록의 제목·요약은 그 단원까지 뜻을 알린 용어만 쓴다", () => {
      expect(earlySummaryUses(lessonSummaries(lessons), places, terms)).toEqual(
        [],
      );
    });
  });
}
