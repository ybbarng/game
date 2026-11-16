// 정석 따라 두기 글이 용어의 뜻을 먼저 알리고 쓰는지 본다(docs/standing-rules.md 1절, tutorial/term-order.ts).
// 읽는 차례: 규칙 배우기 → 수 배우기 단원(「정석: 귀에서 주고받기」가 돌 모양 이름을 알린다) → 정석 따라 두기 묶음 소개 → 수순마다 이름·소개·수 설명.
import { describe, expect, it } from "vitest";

import type { LineNode } from "@/study/line";
import {
  earlyUses,
  lessonPlaces,
  type OrderedTerm,
  type TextPlace,
} from "@/tutorial/term-order";

import { BADUK_JOSEKI, BADUK_JOSEKI_SET } from "./joseki";
import { BADUK_STUDY_LESSONS } from "./study-lessons";
import { BADUK_LESSONS } from "./tutorial";

/** 앞 단원에서 알린 말(활로·단수·패·선수·화점·소목·삼삼·굳힘·벌림 등). 정석 글도 이 뜻대로 쓴다 */
const EARLIER_TERMS: OrderedTerm[] = [
  { term: "활로", use: /활로/, define: /\*\*활로\*\*\(숨 쉴 곳\)/ },
  { term: "단수", use: /단수/, define: /\(\*\*단수\*\*\)/ },
  { term: "패", use: /(^|[^가-힣])패/, define: /\*\*패\*\*라고/ },
  { term: "몰다", use: /몰(아|면|지|고|았)|모는/, define: /\*\*몬다\*\*고/ },
  { term: "선수", use: /선수/, define: /\*\*선수\*\*라고/ },
  { term: "화점", use: /화점/, define: /\*\*화점\*\*이라고/ },
  { term: "소목", use: /소목/, define: /\*\*소목\*\*이에요/ },
  { term: "삼삼", use: /삼삼/, define: /\*\*삼삼\*\*이에요/ },
  { term: "굳힘", use: /굳힘|굳히/, define: /\*\*굳힘\*\*이라고/ },
  { term: "벌림", use: /벌림|벌리|벌려/, define: /\*\*벌림\*\*이라고/ },
  { term: "뻗다", use: /뻗/, define: /\*\*뻗는다\*\*고/ },
];

/** 정석 단원이 처음 알리는 돌 모양 이름 */
const SHAPE_TERMS: OrderedTerm[] = [
  { term: "정석", use: /정석/, define: /\*\*정석\*\*이라고/ },
  { term: "걸침", use: /걸침|걸쳐|걸친|걸치/, define: /\*\*걸침\*\*이라고/ },
  { term: "날일자", use: /날일자/, define: /\*\*날일자\*\*라고/ },
  { term: "낮은 걸침", use: /낮은 걸침/, define: /\*\*낮은 걸침\*\*/ },
  {
    term: "높은 걸침",
    use: /높은 걸침|높게 걸/,
    define: /\*\*높은 걸침\*\*/,
  },
  {
    term: "한 칸 뛰기",
    use: /한 칸 (뛰|뛴)/,
    define: /\*\*한 칸 뛴다\*\*고/,
  },
  // 규칙 배우기의 「같은 색 돌이 붙어 있으면」은 맞닿아 있다는 보통 말이라 뺀다
  { term: "붙이다", use: /붙(여|이|임|인|였)/, define: /\*\*붙인다\*\*고/ },
  { term: "젖히다", use: /젖/, define: /\*\*젖힌다\*\*고/ },
  { term: "양 젖힘", use: /양 젖힘/, define: /\*\*양 젖힘\*\*/ },
  { term: "마늘모", use: /마늘모/, define: /\*\*마늘모\*\*라고/ },
  { term: "끊다", use: /끊/, define: /\*\*끊는다\*\*고/ },
  { term: "서다", use: /서서|로 서요|서면/, define: /\*\*선다\*\*고/ },
  { term: "2선", use: /[0-9]선/, define: /\*\*2선\*\*이라고/ },
  {
    term: "기다",
    use: /(^|[^가-힣])(기어|긴다|기면)/,
    define: /\*\*긴다\*\*고/,
  },
  { term: "두텁다", use: /두터|두텁/, define: /\*\*두텁다\*\*고/ },
  { term: "침입", use: /침입/, define: /\*\*침입\*\*이라고/ },
];

const notes = (nodes: readonly LineNode[]): string[] =>
  nodes.flatMap((n) => [
    ...(n.note ? [n.note] : []),
    ...(n.branches ?? []).flatMap(notes),
  ]);

const lessonList = [...BADUK_LESSONS, ...BADUK_STUDY_LESSONS];
const places: TextPlace[] = [
  ...lessonPlaces(lessonList),
  {
    where: "정석 따라 두기 소개",
    group: lessonList.length,
    text: `${BADUK_JOSEKI_SET.title}\n${BADUK_JOSEKI_SET.summary}`,
  },
  ...BADUK_JOSEKI.map((line, i) => ({
    where: `정석 「${line.name}」`,
    group: lessonList.length + 1 + i,
    text: [line.name, line.summary, ...notes(line.moves)].join("\n"),
  })),
];

describe("바둑 정석 따라 두기 용어", () => {
  const terms = [...EARLIER_TERMS, ...SHAPE_TERMS];
  it(`용어 ${terms.length}개: 단원에서 뜻을 알린 뒤에 정석 글에서 쓴다`, () => {
    expect(earlyUses(places, terms)).toEqual([]);
  });

  it("돌 모양 이름은 모두 정석 단원이 알린다", () => {
    const lesson = BADUK_STUDY_LESSONS.find((l) => l.id === "lesson-joseki");
    const lessonText = lessonPlaces(lesson ? [lesson] : [])
      .map((p) => p.text)
      .join("\n");
    expect(
      SHAPE_TERMS.filter((t) => !t.define.test(lessonText)).map((t) => t.term),
    ).toEqual([]);
  });
});
