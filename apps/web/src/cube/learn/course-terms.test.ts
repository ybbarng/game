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

import { loosePieceWords, movedPieceWords } from "./glossary-333";
import { COURSES, courseById } from "./index";
import { coursePlaces, courseSummaries } from "./term-places";
import type { Course } from "./types";

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
  return chain(course).flatMap((c) =>
    coursePlaces(c, c.id === course.id ? undefined : -1),
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
  // 중급 과정은 전문 이름을 쓰되 처음 나올 때 뜻을 먼저 알린다(2026-11-10, docs/standing-rules.md 1절)
  { term: "F2L", use: /F2L/, define: /F2L\(First Two Layers/ },
  {
    term: "OLL",
    use: /OLL/,
    define: /OLL\(Orientation of the Last Layer|OLL은 윗면을 노랗게/,
  },
  {
    term: "PLL",
    use: /PLL/,
    define: /PLL\(Permutation of the Last Layer|PLL은 마지막 층 조각의 자리/,
  },
  { term: "수네·안티수네", use: /수네/, define: /「수네」/ },
];

/** 루·ZZ·페트루스의 덩어리 「블록」(조각 하나 「블럭」과 다른 말)과 단계 이름 */
const BLOCK_TERMS: OrderedTerm[] = [
  { term: "블록", use: /블록/, define: /덩어리를 「블록」이라고 해요/ },
  {
    term: "CMLL",
    use: /CMLL/,
    define: /맞추는 단계\(CMLL\)|이 단계를 CMLL이라고/,
  },
  {
    term: "LSE",
    use: /LSE/,
    define: /맞추는 단계\(LSE\)|LSE\(Last Six Edges/,
  },
  { term: "엣지 방향(EO)", use: /EO(?!라인)/, define: /방향\(EO\)/ },
  {
    term: "좋은 엣지",
    use: /좋은 엣지|나쁜 엣지/,
    define: /「좋은 엣지」|보면 좋은 엣지/,
  },
  {
    term: "EO라인",
    use: /EO라인/,
    define: /EO라인\(엣지 방향 맞추기/,
  },
];

/** 큰 큐브 */
const BIG_TERMS: OrderedTerm[] = [
  { term: "날개", use: /날개/, define: /「날개」/ },
  { term: "축소법", use: /축소법/, define: /「축소법」/ },
  { term: "패리티", use: /패리티/, define: /「패리티」/ },
];

/** 블라인드 */
const BLD_TERMS: OrderedTerm[] = [
  { term: "버퍼", use: /버퍼/, define: /「버퍼」/ },
  { term: "고리 깨기", use: /고리 깨기/, define: /「고리 깨기」/ },
  { term: "준비 수", use: /준비 수/, define: /「준비 수」/ },
  { term: "패리티", use: /패리티/, define: /「패리티」/ },
];

/** 2×2 처음 맞추기: 3×3을 몰라도 읽는 과정이라 층·구석 이름·거꾸로부터 스스로 알린다(2026-11-10) */
const TERMS_222: OrderedTerm[] = [
  { term: "층", use: /층/, define: /「층」/ },
  {
    term: "위 층·아래 층",
    use: /위 층|아래 층/,
    define: /「위 층」, 아래 것을 「아래 층」/,
  },
  {
    term: "구석 이름(앞-오른쪽 위)",
    use: /(앞|뒤|오른쪽)-(오른쪽|왼쪽|뒤) (위|아래)/,
    define: /「앞-오른쪽 위」/,
  },
  { term: "거꾸로 치기", use: /거꾸로/, define: /「거꾸로 친다」/ },
  {
    term: "기준 코너",
    use: /기준 코너/,
    define: /「기준 코너」|기준 코너 하나를 정하면/,
  },
  { term: "첫 층", use: /첫 층/, define: /「첫 층」/ },
  { term: "코너 돌리기", use: /코너 돌리기/, define: /「코너 돌리기」/ },
  { term: "윗면 공식", use: /윗면 공식/, define: /「윗면 공식」/ },
  { term: "바른 짝", use: /바른 짝/, define: /「바른 짝」/ },
  {
    term: "위 층 코너 바꾸기",
    use: /위 층 코너 바꾸기/,
    define: /「위 층 코너 바꾸기」/,
  },
  { term: "OLL", use: /OLL/, define: /줄여 OLL이라고/ },
  { term: "PBL", use: /PBL/, define: /줄여 PBL이라고/ },
  { term: "퍼뮤(쓰지 않음)", use: /퍼뮤|수네|헤드라이트/, define: /$^/ },
];

const SCOPE: Record<string, OrderedTerm[]> = {
  "222-beginner": [...NOTATION, ...TERMS_222],
  "222-from333": [
    ...NOTATION,
    { term: "기준 코너", use: /기준 코너/, define: /「기준 코너」/ },
    { term: "퍼뮤(쓰지 않음)", use: /퍼뮤|수네|헤드라이트/, define: /$^/ },
  ],
  cfop: [...NOTATION, ...CFOP_TERMS],
  roux: [...NOTATION, ...CFOP_TERMS, ...BLOCK_TERMS],
  zz: [...NOTATION, ...CFOP_TERMS, ...BLOCK_TERMS],
  petrus: [...NOTATION, ...CFOP_TERMS, ...BLOCK_TERMS],
  "444-reduction": [...NOTATION, ...BIG_TERMS],
  "444-yau": [...NOTATION, ...CFOP_TERMS, ...BIG_TERMS],
  "555-reduction": [...NOTATION, ...BIG_TERMS],
  "bld-op": [...NOTATION, ...CFOP_TERMS, ...BLD_TERMS],
};

// 조각 이름: 홀로 부르거나 색을 모두 대어 부르면 블럭을 붙인다(docs/standing-rules.md 2절). 2×2 둘은 glossary-333 쪽
describe("큐브 중급 과정 조각 이름(블럭)", () => {
  for (const course of COURSES) {
    if (!SCOPE[course.id] || course.size === 2) continue;
    it(`${course.title}: 홀로 쓴 엣지·코너·센터가 없다`, () => {
      const loose = [
        ...courseSummaries(course),
        ...coursePlaces(course),
      ].flatMap(({ where, text }) =>
        [
          ...loosePieceWords(text, { bigCube: course.size > 3 }),
          ...movedPieceWords(text, { bigCube: course.size > 3 }),
        ].map((w) => `${where}: …${w}…`),
      );
      expect(loose).toEqual([]);
    });
  }
});

// OLL 모양 이름(「T 모양」)과 PLL 공식 이름(「T퍼뮤」)은 같은 글자를 쓰니 늘 「모양」·「퍼뮤」를 붙여 구별한다
// (2026-11-10, docs/47 16-16). 수네·안티수네도 모양은 「수네 모양」, 공식은 「수네」.
describe("CFOP 모양 이름과 공식 이름", () => {
  const bare = /(^|[^A-Za-z0-9'])(H|T|Y|Z|Ua|Ub)(?![A-Za-z0-9'퍼]| 모양)/;
  for (const course of COURSES) {
    if (!["cfop", "roux", "zz", "petrus", "444-yau"].includes(course.id))
      continue;
    it(`${course.title}: H·T·U·Y·Z 이름에 「모양」이나 「퍼뮤」를 붙인다`, () => {
      const found = [
        ...courseSummaries(course),
        ...coursePlaces(course),
      ].flatMap(({ where, text }) => {
        const m = text.match(bare);
        return m
          ? [`${where}: …${text.slice(m.index ?? 0, (m.index ?? 0) + 12)}…`]
          : [];
      });
      expect(found).toEqual([]);
    });
  }
});

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
      expect(earlySummaryUses(courseSummaries(course), places, terms)).toEqual(
        [],
      );
    });
  }
});
