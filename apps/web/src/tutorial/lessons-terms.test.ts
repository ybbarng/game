// 마이티 튜토리얼이 용어의 뜻을 먼저 알리고 쓰는지 본다(term-order.ts). 설명 단계 아래 용어 칸도 그 단계 글로 읽는다.
import { describe, expect, it } from "vitest";

import { GLOSSARY } from "./glossary";
import { LESSONS } from "./lessons";
import {
  earlySummaryUses,
  earlyUses,
  lessonPlaces,
  lessonSummaries,
  type OrderedTerm,
} from "./term-order";

const TERMS: OrderedTerm[] = [
  { term: "턴", use: /턴/, define: /한 바퀴를 \*\*턴\*\*/ },
  { term: "초구·막구", use: /초구|막구/, define: /첫 턴은 초구/ },
  {
    term: "점수 카드",
    use: /점수 카드/,
    define: /\*\*10·J·Q·K·A\*\*가 점수 카드/,
  },
  { term: "공약", use: /공약/, define: /\*\*공약\*\*을 걸어요/ },
  { term: "주공", use: /주공/, define: /\*\*주공\*\*이 돼요/ },
  { term: "프렌드", use: /프렌드/, define: /\(\*\*프렌드\*\*\)/ },
  { term: "여당·야당", use: /여당|야당/, define: /\*\*여당\*\*/ },
  {
    term: "선(턴에서 맨 처음 내는 사람)",
    use: /선이 |선 무늬|선으로|다음 선|첫 턴의 선/,
    define: /\*\*선\*\*이라고/,
  },
  { term: "기루다", use: /기루다/, define: /\*\*기루다\*\*로 정해요/ },
  { term: "간", use: /간을|간 치기|\*\*간\*\*/, define: /\*\*간\*\*이라고/ },
  { term: "조커콜", use: /조커콜|쪼콜/, define: /"조커콜!"을 외치면/ },
  { term: "표준 규칙", use: /표준 규칙/, define: /\*\*표준 규칙\*\*/ },
  { term: "딜러", use: /딜러/, define: /\*\*딜러\*\*/ },
  { term: "선거·출마·당선", use: /선거|출마|당선/, define: /\*\*선거\*\*/ },
  { term: "노기루다", use: /노기루다|노기/, define: /\*\*노기루다\*\*/ },
  {
    term: "바닥 카드",
    use: /바닥 카드|바닥에/,
    define: /\*\*바닥 카드\*\* 3장/,
  },
  { term: "물패", use: /물패/, define: /\*\*물패\*\*라고/ },
  { term: "득점", use: /득점/, define: /\*\*득점\*\*/ },
  { term: "런·백런", use: /(^|[^가-힣])런|백런/, define: /\*\*런\*\*\(20장/ },
  { term: "노프렌드", use: /노프렌드|노프/, define: /\*\*노프렌드\*\*/ },
  { term: "패(손에 든 카드)", use: /(^|[^가-힣])패/, define: /\*\*패\*\*라고/ },
];

const termText = (id: string) => {
  const t = GLOSSARY.find((g) => g.id === id);
  return t ? `${t.term} ${t.meaning}` : "";
};
const PLACES = lessonPlaces(LESSONS, termText);

describe("마이티 튜토리얼 용어", () => {
  it(`용어 ${TERMS.length}개: 모두 뜻을 알린 뒤에 쓴다`, () => {
    expect(earlyUses(PLACES, TERMS)).toEqual([]);
  });

  it("단원 목록의 제목·요약은 그 단원까지 뜻을 알린 용어만 쓴다", () => {
    expect(earlySummaryUses(lessonSummaries(LESSONS), PLACES, TERMS)).toEqual(
      [],
    );
  });
});
