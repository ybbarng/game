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
import { type Course, GOALS } from "./types";

/**
 * 먼저 배우는 과정부터 차례로(겹치면 한 번만). 바로 앞에 이어 읽는 과정(`continues`, 큐브의 기초 → 3×3 초보자)도
 * 먼저 배우는 과정으로 본다
 */
function chain(course: Course, seen = new Set<string>()): Course[] {
  const lead = COURSES.filter((c) => c.continues === course.id).map(
    (c) => c.id,
  );
  const before = [...(course.requires ?? []), ...lead].flatMap((id) => {
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
  // 패리티 이름(사용자 2026-11-26, docs/47 1-1): OLL 패리티는 토끼이빨, PLL 패리티는 바보토끼이빨
  { term: "토끼이빨", use: /(?<!바보)토끼이빨/, define: /「토끼이빨」/ },
  { term: "바보토끼이빨", use: /바보토끼이빨/, define: /「바보토끼이빨」/ },
];

/** 6×6·7×7로 넓히기(docs/47 16-29) */
const BIG67_TERMS: OrderedTerm[] = [
  { term: "세로 열", use: /세로 열/, define: /「세로 열」/ },
  { term: "막대", use: /막대/, define: /「막대」/ },
  { term: "막대 넣기", use: /막대 넣기/, define: /「막대 넣기」/ },
  // 「겹치다」와 큐브의 기초 「한 겹으로 함께 돌아요」(층)는 다른 말
  { term: "겹", use: /(?<!한 )겹(?![치쳐친칠])/, define: /「바깥 겹」/ },
  {
    term: "4R(한가운데 층)",
    use: /(^|[^0-9A-Za-z×-])4[RLUDFB]/m,
    define: /4R은 바깥에서 넷째 층|위에서 넷째 층, 곧 한가운데 가로 층\(4U\)/,
  },
  {
    term: "여러 안쪽 층(2-3Rw)",
    use: /\d-\d[RLUDFB]w/,
    define: /2-3Rw는 오른쪽에서 둘째·셋째 층/,
  },
  { term: "바깥 세 층(3Rw)", use: /(?<!-)3Rw/, define: /바깥 세 층 3Rw/ },
  { term: "위 세 층(3Uw)", use: /(?<!-)3Uw/, define: /3Uw\(위 세 층\)/ },
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
  // 코너 방향 먼저(docs/47 16-33): 앞 과정은 3×3 처음 맞추기라 CFOP 낱말은 쓰지 않는다
  "333-twist-first": [
    ...NOTATION,
    {
      term: "「노란 면」 공식",
      use: /「노란 면」 공식/,
      define: /「노란 면」 공식 R U R' U R U2 R'/,
    },
    { term: "바른 짝", use: /바른 짝/, define: /「바른 짝」이라고/ },
    {
      term: "위 층 코너 바꾸기",
      use: /코너 바꾸기/,
      define: /「위 층 코너 바꾸기」 공식 R' F R'/,
    },
    {
      term: "엣지 돌리기",
      use: /엣지 돌리기|오른손 먼저|왼손 먼저/,
      define: /쓰는 공식은 「엣지 돌리기」예요/,
    },
    {
      term: "왼손 노란 면",
      use: /왼손 노란 면|왼손 공식|왼손 꼴/,
      define: /「왼손 노란 면」 공식 L' U' L/,
    },
    // 공식 쪽에서 「거울」을 쓰면 화면의 뒤쪽 보기 판(거울)과 헷갈린다
    { term: "거울(쓰지 않음)", use: /거울/, define: /$^/ },
    { term: "퍼뮤(쓰지 않음)", use: /퍼뮤|수네|헤드라이트/, define: /$^/ },
  ],
  "333-2look": [...NOTATION, ...CFOP_TERMS],
  cfop: [...NOTATION, ...CFOP_TERMS],
  roux: [...NOTATION, ...CFOP_TERMS, ...BLOCK_TERMS],
  zz: [...NOTATION, ...CFOP_TERMS, ...BLOCK_TERMS],
  petrus: [...NOTATION, ...CFOP_TERMS, ...BLOCK_TERMS],
  "444-reduction": [...NOTATION, ...BIG_TERMS],
  "444-yau": [
    ...NOTATION,
    ...CFOP_TERMS,
    ...BIG_TERMS,
    // 줄 안의 날개 자리와 한 면의 센터 블럭 둘씩(docs/47 1-1, 16-20)
    {
      term: "위 자리·아래 자리",
      use: /(위|아래) 자리/,
      define: /「위 자리」/,
    },
    {
      term: "위 두 칸·아래 두 칸",
      use: /(위|아래) 두 칸/,
      define: /「위 두 칸」/,
    },
  ],
  "555-reduction": [...NOTATION, ...BIG_TERMS],
  "big-666-777": [...NOTATION, ...BIG_TERMS, ...BIG67_TERMS],
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

// 큰 큐브 낱말 하나에 뜻 하나(docs/47 1-1, 16-20): 「줄」은 두 옆면 사이 세로 엣지 자리, 「칸」은 한 면의 센터 블럭 자리.
// 날개가 붙은 덩이는 「엣지」(「한 줄로 붙어요」 아님), 줄 안의 날개 자리는 「위 자리·아래 자리」(「위 칸」 아님),
// 한 면의 센터 블럭 둘씩은 「위 두 칸·아래 두 칸」(「윗줄·아랫줄」 아님)
describe("큰 큐브 줄·칸 낱말", () => {
  const OLD =
    /윗줄|아랫줄|(?<!오른쪽|왼쪽) (위|아래) 칸|한 줄로|한 줄이|한 줄에|한 줄의|한 줄\)|묶은 줄|안쪽 줄|면의 줄|엣지 [한두세열] 줄|묶인 줄/;
  for (const course of COURSES) {
    if (course.size < 4) continue;
    it(`${course.title}: 옛 꼴(윗줄·위 칸·한 줄로 등)을 쓰지 않는다`, () => {
      const found = bigCourseTexts(course).flatMap(({ where, text }) => {
        const m = text.match(OLD);
        return m
          ? [`${where}: …${text.slice(m.index ?? 0, (m.index ?? 0) + 12)}…`]
          : [];
      });
      expect(found).toEqual([]);
    });
  }
});

// 큰 큐브에서 「엣지 블럭」은 조각 하나(날개, 5×5 가운데 엣지 블럭)다. 날개가 붙은 덩이는 「엣지」라서(docs/47 1-1)
// 「흰-파랑 엣지 블럭의 제자리」처럼 덩이를 「엣지 블럭」으로 부르지 않는다. 조각을 세거나(「엣지 블럭 둘」·「셋」),
// 「가운데 엣지 블럭」, 3×3과 견주는 「3×3의 엣지 블럭」, 뜻을 알리는 「엣지 블럭(날개)」만 쓴다(docs/47 16-23)
describe("큰 큐브 엣지 낱말", () => {
  const PIECE_OK =
    /(가운데 |3×3의 )엣지 블럭|엣지 블럭( ?(둘|셋|넷|다섯|두 개|세 개|하나)|\(날개\))/g;
  for (const course of COURSES) {
    if (course.size < 4) continue;
    it(`${course.title}: 날개가 붙은 덩이를 「엣지 블럭」으로 부르지 않는다`, () => {
      const found = bigCourseTexts(course).flatMap(({ where, text }) => {
        const rest = text.replace(PIECE_OK, "");
        const at = rest.indexOf("엣지 블럭");
        return at < 0
          ? []
          : [`${where}: …${rest.slice(Math.max(0, at - 8), at + 12)}…`];
      });
      expect(found).toEqual([]);
    });
  }
});

/** 큰 큐브 과정의 글: 단원 요약·단계 글과 해 보기 화면의 「목표:」 글(GOALS) */
function bigCourseTexts(course: Course): { where: string; text: string }[] {
  const goals = course.lessons.flatMap((l) =>
    l.steps.flatMap((s, si) =>
      s.goal
        ? [{ where: `${l.title} ${si + 1}번 목표`, text: GOALS[s.goal] }]
        : [],
    ),
  );
  return [...courseSummaries(course), ...coursePlaces(course), ...goals];
}

// OLL 모양 이름(「T 모양」)과 PLL 공식 이름(「T퍼뮤」)은 같은 글자를 쓰니 늘 「모양」·「퍼뮤」를 붙여 구별한다
// (2026-11-10, docs/47 16-16). 수네·안티수네도 모양은 「수네 모양」, 공식은 「수네」.
describe("CFOP 모양 이름과 공식 이름", () => {
  const bare = /(^|[^A-Za-z0-9'])(H|T|Y|Z|Ua|Ub)(?![A-Za-z0-9'퍼]| 모양)/;
  for (const course of COURSES) {
    if (
      !["333-2look", "cfop", "roux", "zz", "petrus", "444-yau"].includes(
        course.id,
      )
    )
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
