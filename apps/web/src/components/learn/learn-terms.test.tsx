// 보안 배우기(/learn)가 용어의 뜻을 먼저 알리고 쓰는지 본다(docs/standing-rules.md 1절, 공통 틀 term-order.ts).
// 본문은 JSX라 글로 펼쳐 읽는다. 목차에는 단원 제목·한 줄 요약(hook)이 먼저 보이므로 요약으로 따로 본다.
// 체험 상자(demo) 안 글은 여기서 보지 않고 처음 보는 독자 검토로 본다.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  earlySummaryUses,
  earlyUses,
  type GroupSummary,
  type OrderedTerm,
  type TextPlace,
} from "@/tutorial/term-order";

import { ADVANCED, LESSONS, type Lesson } from "./LearnPage";

const text = (node: Lesson["body"]) =>
  renderToStaticMarkup(<>{node}</>)
    .replace(/<sup>(.*?)<\/sup>/g, "^$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ");

const ALL = [...LESSONS, ...ADVANCED];

const places: TextPlace[] = ALL.map((l, i) => ({
  where: `${i < LESSONS.length ? `${i + 1}단원` : `심화 ${i - LESSONS.length + 1}`} ${l.title}`,
  group: i,
  text: [
    l.title,
    // 심화 단원은 본문 위에 한 줄 요약을 다시 보인다.
    i < LESSONS.length ? "" : l.hook,
    text(l.body),
    ...l.points,
    ...l.quiz.flatMap((q) => [q.q, ...q.options, q.why]),
  ].join("\n"),
}));

const summaries: GroupSummary[] = LESSONS.map((l, i) => ({
  where: `목차 ${i + 1}`,
  group: i,
  text: `${l.title}\n${l.hook}`,
}));

/** 읽는 차례대로 처음 보는 사람이 모를 말 */
const TERMS: OrderedTerm[] = [
  { term: "엔진", use: /엔진/, define: /프로그램\(엔진\)/ },
  { term: "WebRTC", use: /WebRTC/, define: /WebRTC\(브라우저끼리/ },
  { term: "개발자 도구", use: /개발자 도구/, define: /개발자 도구\(/ },
  { term: "멘탈 포커", use: /멘탈 포커/, define: /멘탈 포커\(카드를 잠가/ },
  { term: "시드", use: /시드/, define: /시드\(무작위 결과를/ },
  { term: "해시", use: /해시/, define: /해시는 어떤 값을 넣으면/ },
  { term: "약속(commit)", use: /commit/, define: /약속\(commit\)이라고/ },
  { term: "서명 열쇠", use: /서명 열쇠/, define: /혼자 간직하는 서명 열쇠/ },
  { term: "공개 열쇠", use: /공개 열쇠/, define: /짝이 되는 공개 열쇠/ },
  { term: "신호 서버", use: /신호 서버/, define: /신호 서버라고/ },
  { term: "DTLS 인증서", use: /DTLS/, define: /신분증 같은 값\(DTLS/ },
  { term: "중간자", use: /중간자/, define: /중간자라고 합니다/ },
  { term: "SRA", use: /SRA/, define: /SRA라고 합니다/ },
  { term: "mod", use: /mod/, define: /mod p라고 씁니다/ },
  { term: "소수", use: /소수/, define: /큰 수\(소수\)/ },
  { term: "지수", use: /지수/, define: /지수라고 합니다/ },
  { term: "타원곡선", use: /타원곡선/, define: /타원곡선\(수학에서/ },
  { term: "ristretto255", use: /ristretto255/, define: /그중 ristretto255/ },
  { term: "제곱수", use: /제곱수/, define: /제곱수라고 하고/ },
  { term: "이차잉여", use: /이차잉여/, define: /이차잉여라고/ },
  { term: "오일러 판정", use: /오일러/, define: /오일러 판정이라고/ },
  { term: "비트", use: /비트/, define: /1비트라고 합니다/ },
  { term: "원소", use: /원소/, define: /원소라고/ },
  { term: "부분군", use: /부분군/, define: /부분군이라 합니다/ },
  { term: "칸", use: /\d번 칸|칸마다|칸 s/, define: /칸이라고 부르겠습니다/ },
  { term: "칸 표", use: /칸 표/, define: /칸 표라고 부르겠습니다/ },
  { term: "죽이기", use: /죽이기/, define: /「죽이기」\(카드 한 장을/ },
  { term: "프렌드", use: /프렌드/, define: /프렌드\(공격하는 쪽의/ },
  { term: "선 무늬", use: /선 무늬/, define: /무늬\(선 무늬\)/ },
  { term: "도전값", use: /도전값/, define: /도전값이라고 합니다/ },
  { term: "영지식", use: /영지식/, define: /영지식 증명이라고 합니다/ },
  { term: "Chaum–Pedersen", use: /Chaum/, define: /Chaum–Pedersen 증명은/ },
  { term: "가중치", use: /가중치/, define: /곱할 수\(가중치\)/ },
  {
    term: "cut-and-choose",
    use: /cut-and-choose/,
    define: /cut-and-choose\(둘로 나눠/,
  },
  { term: "Fiat–Shamir", use: /Fiat/, define: /방법\(Fiat–Shamir\)/ },
];

describe("보안 배우기 용어", () => {
  it(`용어 ${TERMS.length}개: 모두 뜻을 알린 뒤에 쓴다`, () => {
    expect(earlyUses(places, TERMS)).toEqual([]);
  });
  it("목차의 제목·요약은 그 단원까지 뜻을 알린 용어만 쓴다", () => {
    expect(earlySummaryUses(summaries, places, TERMS)).toEqual([]);
  });
});
