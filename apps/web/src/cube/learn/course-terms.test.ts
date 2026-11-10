// 큐브 중급 과정(2×2 3×3에서, CFOP, 루, ZZ, 페트루스, 4×4, 야우, 5×5, 블라인드)이 용어의 뜻을 먼저 알리고 쓰는지
// 본다(tutorial/term-order.ts). 먼저 배우는 과정(REQUIRES)에서 알린 말은 그냥 써도 되므로, 그 과정들을 앞에 이어
// 읽는다. 3×3·2×2 처음 맞추기는 glossary-333 쪽이 따로 본다. 실제로 보이는 공식 줄([공식])은 시연이라 빼고 글만 읽는다.
import { describe, expect, it } from "vitest";

import {
  earlySummaryUses,
  earlyUses,
  type OrderedTerm,
  type TextPlace,
} from "@/tutorial/term-order";

import { COURSES, courseById } from "./index";
import type { Course, LessonStep } from "./types";

const stepText = (s: LessonStep) =>
  [
    s.body,
    s.beside?.caption ?? "",
    s.quiz?.question ?? "",
    ...(s.quiz?.choices ?? []),
    s.quiz?.why ?? "",
    s.passedText ?? "",
  ].join("\n");

/** 먼저 배우는 과정부터 차례로(겹치면 한 번만) */
function chain(course: Course, seen = new Set<string>()): Course[] {
  const before = (course.requires ?? []).flatMap((id) => {
    const c = courseById(id);
    return c && !seen.has(id) ? chain(c, seen) : [];
  });
  if (seen.has(course.id)) return before;
  seen.add(course.id);
  return [...before, course];
}

/** 대상 과정의 단원 번호가 0부터, 앞 과정은 음수 단원으로 둔다(요약 검사가 앞 과정을 이미 배운 것으로 보게) */
function placesOf(course: Course): TextPlace[] {
  const courses = chain(course);
  return courses.flatMap((c) =>
    c.lessons.flatMap((l, li) =>
      l.steps.map((s, si) => ({
        where: `${c.title} · ${l.title} ${si + 1}번`,
        group: c.id === course.id ? li : -1,
        text: stepText(s),
      })),
    ),
  );
}

const NOTATION: OrderedTerm[] = [
  {
    term: "소문자 표기(f·r·d·l)",
    use: /(^|[^A-Za-z])[frludb]['2]?(?=[ ,.)」·]|$)/m,
    define: /소문자\(f·r·l·u·d·b\)|l2는 왼쪽 두 층/,
  },
  {
    term: "M",
    use: /(^|[^A-Za-z])M['2]?(?![A-Za-z])/m,
    define: /M은 L과 R 사이|돌리는 M\(L과/,
  },
  {
    term: "넓게 돌리기(Rw·Uw)",
    use: /[RLUDFB]w/,
    define: /Rw라고도 적어요|w를 붙인 Rw/,
  },
  {
    term: "안쪽 층(2R)",
    use: /(^|[^0-9A-Za-z×])[23][RLUDFB]/m,
    define: /숫자를 앞에 붙인 2R/,
  },
];

const CFOP_TERMS: OrderedTerm[] = [
  {
    term: "2단계 OLL·PLL",
    use: /2단계 (OLL|PLL)/,
    define: /\*\*2단계 OLL\*\*/,
  },
  {
    term: "헤드라이트",
    use: /헤드라이트/,
    define: /헤드라이트라고 해요|「헤드라이트」라고/,
  },
  { term: "퍼뮤", use: /퍼뮤/, define: /「퍼뮤」는/ },
];

const SCOPE: Record<string, OrderedTerm[]> = {
  "222-from333": NOTATION,
  cfop: [...NOTATION, ...CFOP_TERMS],
  roux: [...NOTATION, ...CFOP_TERMS],
  zz: [...NOTATION, ...CFOP_TERMS],
  petrus: [...NOTATION, ...CFOP_TERMS],
  "444-reduction": NOTATION,
  "444-yau": [...NOTATION, ...CFOP_TERMS],
  "555-reduction": NOTATION,
  "bld-op": [...NOTATION, ...CFOP_TERMS],
};

describe("큐브 중급 과정 용어", () => {
  for (const course of COURSES) {
    const terms = SCOPE[course.id];
    if (!terms) continue;
    const places = placesOf(course);
    it(`${course.title}: 용어 ${terms.length}개를 뜻을 알린 뒤에 쓴다`, () => {
      // 이 과정에 한 번도 안 나오는 말은 뜻을 알릴 필요도 없다
      const used = terms.filter((t) =>
        places.some((p) => p.group >= 0 && t.use.test(p.text)),
      );
      expect(earlyUses(places, used)).toEqual([]);
    });
    it(`${course.title}: 단원 목록은 그 단원까지 뜻을 알린 용어만 쓴다`, () => {
      const summaries = course.lessons.map((l, li) => ({
        where: `${l.title} 요약`,
        group: li,
        text: `${l.title}\n${l.summary}`,
      }));
      expect(earlySummaryUses(summaries, places, terms)).toEqual([]);
    });
  }
});
