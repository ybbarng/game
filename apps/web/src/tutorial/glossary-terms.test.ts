// 마이티 용어 사전이 사전 차례(묶음 순서, 묶음 안 순서)대로 읽을 때 뜻을 먼저 알리고 쓰는지 본다(term-order.ts).
// 용어 하나를 뜻풀이 단추로 따로 열어도 읽히도록, 뜻풀이 안에서 다른 용어를 쓸 때는 앞 항목에서 이미 풀었어야 한다.
import { describe, expect, it } from "vitest";

import { GLOSSARY, TERM_GROUPS } from "./glossary";
import { earlyUses, type OrderedTerm, type TextPlace } from "./term-order";

const PLACES: TextPlace[] = TERM_GROUPS.flatMap((g) =>
  GLOSSARY.filter((t) => t.group === g.id),
).map((t, i) => ({
  where: `용어 사전 ${t.term}`,
  group: i,
  text: `${t.term}\n${t.meaning}`,
}));

/** 표제어 자리가 뜻을 알린 곳이다 */
const entry = (term: string) => new RegExp(`^${term}\\n`);

const TERMS: OrderedTerm[] = [
  { term: "턴", use: /턴/, define: entry("턴") },
  { term: "선", use: /(^|[^가-힣])선(이|으로|$|\n| )/, define: entry("선") },
  { term: "점수 카드", use: /점수 카드/, define: entry("점수 카드") },
  { term: "기루다", use: /(^|[^노])기루다/, define: entry("기루다") },
  { term: "노기루다", use: /노기루다/, define: entry("노기루다") },
  { term: "선거", use: /선거/, define: entry("선거") },
  { term: "공약", use: /공약/, define: /약속이 공약|^공약\n/ },
  { term: "바닥 카드", use: /바닥 카드/, define: entry("바닥 카드") },
  { term: "주공", use: /주공/, define: /대표인 주공|^주공\n/ },
  { term: "프렌드", use: /프렌드/, define: /\(프렌드\)|^프렌드\n/ },
  { term: "여당·야당", use: /여당|야당/, define: entry("여당·야당") },
  { term: "마이티", use: /마이티/, define: entry("마이티") },
  { term: "조커", use: /조커(?!콜)/, define: entry("조커") },
  { term: "조커콜", use: /조커콜/, define: entry("조커콜") },
  { term: "딜러", use: /딜러/, define: /\(딜러\)/ },
];

describe("마이티 용어 사전", () => {
  it(`용어 ${TERMS.length}개: 사전 차례로 읽을 때 뜻을 알린 뒤에 쓴다`, () => {
    expect(earlyUses(PLACES, TERMS)).toEqual([]);
  });
});
