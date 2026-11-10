// 「큐브의 수학」 첫 카드(섞는 경우의 수)의 글이 낱말의 뜻을 먼저 알리고 쓰는지 본다(공통 틀 `@/tutorial/term-order`,
// docs/standing-rules.md 1절). 「답만 보기」를 눌러도 보이는 글만 자리로 둔다: 맨 위 글, 크기별 조각 소개, 단계마다의
// 뜻, 줄인 식 풀이, 끝말. 크기 칸은 아무것이나 먼저 누를 수 있어서 크기마다 따로 읽는다.
// 조각 이름(블럭)은 3×3 처음 맞추기와 같은 점검(`loosePieceWords`)으로 묻는 말·예시 글까지 본다(2절).
import { describe, expect, it } from "vitest";

import {
  earlyUses,
  type OrderedTerm,
  type TextPlace,
} from "@/tutorial/term-order";

import { loosePieceWords } from "../learn/glossary-333";
import { bigNumberNote, COUNT_LEAD, COUNT_PLANS, koreanApprox } from "./counts";
import { COMMUTATOR_EXAMPLES } from "./examples";

const SIZES = [2, 3, 4, 5] as const;

const TERMS: OrderedTerm[] = [
  { term: "팩토리얼(8!)", use: /\d+!/, define: /팩토리얼/ },
  { term: "거듭제곱(3⁸)", use: /[⁰¹²³⁴⁵⁶⁷⁸⁹]/, define: /번 곱한 수를/ },
  { term: "비튼다", use: /비틀|비튼/, define: /「비튼다」/ },
  { term: "홀짝", use: /홀짝/, define: /「홀짝」/ },
  { term: "날개", use: /날개/, define: /「날개」/ },
  {
    term: "가운데 엣지 블럭",
    use: /가운데 엣지 블럭/,
    define: /「가운데 엣지 블럭」/,
  },
  {
    term: "꼭짓점 쪽·모서리 쪽 센터 블럭",
    use: /(꼭짓점|모서리) 쪽/,
    define: /「꼭짓점 쪽 센터 블럭」/,
  },
  { term: "(4!)⁶", use: /\(4!\)⁶/, define: /÷ \(4!\)⁶이라고 써요/ },
];

function places(n: (typeof SIZES)[number]): TextPlace[] {
  const plan = COUNT_PLANS[n];
  return [
    { where: "맨 위 글", group: 0, text: COUNT_LEAD },
    { where: `${n}×${n} 소개`, group: 0, text: plan.intro },
    ...plan.steps.map((s, i) => ({
      where: `${n}×${n} ${i + 1}단계 ${s.expr}`,
      group: 0,
      text: s.meaning,
    })),
    { where: `${n}×${n} 식 풀이`, group: 0, text: plan.formulaNote },
    { where: `${n}×${n} 끝말`, group: 0, text: plan.note ?? "" },
  ];
}

describe("섞는 경우의 수: 답만 보기로도 뜻이 먼저 보인다", () => {
  for (const n of SIZES)
    it(`${n}×${n}`, () => {
      const used = TERMS.filter((t) =>
        places(n).some((p) => t.use.test(p.text)),
      );
      expect(earlyUses(places(n), used)).toEqual([]);
    });

  it("줄인 식의 기호는 식 풀이에서 읽는 법을 알린다", () => {
    for (const n of SIZES) {
      const plan = COUNT_PLANS[n];
      for (const pow of plan.formula.match(/\d[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g) ?? [])
        if (!plan.steps.some((s) => s.expr === pow))
          expect(plan.formulaNote, `${n}×${n} ${pow}`).toContain(pow);
    }
  });

  it("조보다 큰 단위와 10^k에는 뜻을 붙인다", () => {
    expect(bigNumberNote(koreanApprox(COUNT_PLANS[3].total))).toBe(
      "경은 1 뒤에 0이 16개 붙은 수예요.",
    );
    expect(bigNumberNote(koreanApprox(COUNT_PLANS[4].total))).toBe(
      "재는 1 뒤에 0이 44개 붙은 수예요.",
    );
    expect(bigNumberNote(koreanApprox(COUNT_PLANS[5].total))).toBe(
      "10^74은 1 뒤에 0이 74개 붙은 수예요.",
    );
    expect(bigNumberNote("약 1조 3,705억 년")).toBe("");
  });
});

describe("큐브의 수학 조각 이름(블럭)", () => {
  it("경우의 수 단계의 모든 글", () => {
    const loose = SIZES.flatMap((n) => {
      const plan = COUNT_PLANS[n];
      const texts = [
        plan.intro,
        plan.formulaNote,
        plan.note ?? "",
        ...plan.steps.flatMap((s) => [s.question, s.why, s.meaning]),
      ];
      return texts.flatMap((t) =>
        loosePieceWords(t).map((w) => `${n}×${n}: …${w}…`),
      );
    });
    expect(loose).toEqual([]);
  });

  it("교환자 예시 글", () => {
    const loose = COMMUTATOR_EXAMPLES.flatMap((e) =>
      loosePieceWords(e.note ?? "").map((w) => `${e.a}/${e.b}: …${w}…`),
    );
    expect(loose).toEqual([]);
  });

  it("안내 문장은 마침표로 끝난다", () => {
    const texts = [
      COUNT_LEAD,
      ...SIZES.flatMap((n) => {
        const p = COUNT_PLANS[n];
        return [
          p.intro,
          p.formulaNote,
          p.note ?? ".",
          ...p.steps.map((s) => s.meaning),
        ];
      }),
      ...COMMUTATOR_EXAMPLES.map((e) => e.note ?? "."),
    ];
    for (const t of texts) expect(t.trim(), t).toMatch(/[.?]$/);
  });
});
