import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { STORY_TECH_PAIRS } from "@/stardraw/components/StoryTechWords";
import {
  earlySummaryUses,
  earlyUses,
  type GroupSummary,
  type OrderedTerm,
  type TextPlace,
} from "@/tutorial/term-order";

import { ATTACKS } from "./attacks";
import { INTRO, LESSONS, LIMITS } from "./StardrawLearn";

/**
 * 하늘의 별 따기 보안 배우기(/stardraw/learn)를 읽는 차례대로 펼쳐, 용어마다 뜻을 먼저 알리고 쓰는지 본다
 * (docs/standing-rules.md 1절, docs/36 11-74). 차례: 머리글 → 짝 낱말 표(머리에 접혀 있다) → 단계마다 본문·요점·문제 → 막지 못하는 것.
 * 목차 한 줄(hook)은 모든 단계보다 먼저 보이므로 그 단계까지 뜻을 알린 말만 쓴다. 체험 상자(demo) 글은 사람이 읽어 본다
 */

const text = (node: React.ReactNode) =>
  renderToStaticMarkup(node)
    .replace(/<[^>]+>/g, "")
    .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const LIMIT_GROUP = LESSONS.length;

const PLACES: TextPlace[] = [
  { where: "머리글", group: -1, text: text(INTRO) },
  {
    where: "짝 낱말 표",
    group: -1,
    text: STORY_TECH_PAIRS.map(([s, t]) => `${s}: ${t}`).join("\n"),
  },
  ...LESSONS.flatMap((l, i): TextPlace[] => [
    {
      where: `${i + 1}단계 본문`,
      group: i,
      text: `${l.title}\n${text(l.body)}`,
    },
    { where: `${i + 1}단계 요점`, group: i, text: l.points.join("\n") },
    {
      where: `${i + 1}단계 문제`,
      group: i,
      text: l.quiz.flatMap((q) => [q.q, ...q.options, q.why]).join("\n"),
    },
  ]),
  ...LIMITS.map((x) => ({
    where: `막지 못하는 것 「${x.title}」`,
    group: LIMIT_GROUP,
    text: `${x.title}\n${x.body}`,
  })),
];

const SUMMARIES: GroupSummary[] = LESSONS.map((l, i) => ({
  where: `목차 ${i + 1}단계`,
  group: i,
  text: `${l.title}\n${l.hook}`,
}));

/** 읽는 사람이 처음 보는 말. define은 뜻을 알리는 문장의 꼴 */
const TERMS: OrderedTerm[] = [
  { term: "운영자", use: /운영자/, define: /운영자는 별 따기 서버를 돌리는/ },
  { term: "검사기", use: /검사기/, define: /검사기는 [^.]*공개한 기록을 받아/ },
  { term: "터미널", use: /터미널/, define: /터미널\(명령 줄\)/ },
  { term: "공개 난수", use: /공개 난수/, define: /공개 난수는 나온 뒤에는/ },
  { term: "drand", use: /drand/, define: /drand 공개 난수로 정해지는 값/ },
  {
    term: "공개 열쇠·비밀 열쇠",
    use: /공개 열쇠|비밀 열쇠/,
    define: /비밀 열쇠와 공개 열쇠 한 쌍|열쇠는 한 쌍으로/,
  },
  { term: "패스키", use: /패스키/, define: /패스키는 비밀 열쇠와 공개 열쇠/ },
  {
    term: "서명",
    use: /서명/,
    define: /서명을 만드는 데만 쓰이며|서명은 비밀 열쇠로만/,
  },
  {
    term: "운영 기록",
    use: /운영 기록/,
    define: /운영 기록은 [^.]*남긴 기록/,
  },
  { term: "머클 루트", use: /머클 루트/, define: /값 하나\(머클 루트\)/ },
  { term: "해시", use: /해시/, define: /해시는 [^.]*(값|계산)/ },
  { term: "장부", use: /장부/, define: /장부: 회차 기록을/ },
  { term: "봉인", use: /봉인/, define: /봉인: 봉인 값과/ },
  { term: "관인", use: /관인/, define: /우주국 서명·관인: / },
  { term: "P-256", use: /P-256/, define: /P-256이라는 서명 방식/ },
  { term: "예측자 id", use: /예측자 id/, define: /예측자 id라 부릅니다/ },
  { term: "예측서 id", use: /예측서 id/, define: /이것은 예측서 id입니다/ },
  { term: "화면 코드", use: /화면 코드/, define: /화면 코드는 서버가 보내/ },
  { term: "UV·UP", use: /\bU[VP]\b/, define: /거쳤다는 표시\(UV\)/ },
  {
    term: "사이트 해시",
    use: /사이트 해시/,
    define: /사이트 해시\(사이트 이름/,
  },
  { term: "작업 증명", use: /작업 증명/, define: /작업 증명이라 하고/ },
  { term: "Argon2id", use: /Argon2/, define: /Argon2id라는 해시/ },
  { term: "문제 값", use: /문제 값/, define: /문제 값은 앞 회차/ },
  { term: "뿌리", use: /뿌리/, define: /남은 값 하나가 뿌리/ },
  { term: "잎·가지", use: /잎|가지/, define: /잎으로 늘어놓고/ },
  {
    term: "포함 증명",
    use: /포함 증명/,
    define: /포함 증명이라 부릅니다/,
  },
  { term: "토큰", use: /토큰/, define: /시각 인증 토큰은|토큰이라 부릅니다/ },
  { term: "결과 결정", use: /결과 결정/, define: /결과 결정이라 부릅니다/ },
  {
    term: "시각 인증 기관",
    use: /시각 인증|TSA/,
    define: /시각 인증 기관이 그 값이 그 시각에|시각 인증 기관\(TSA\)은/,
  },
  { term: "커밋", use: /커밋/, define: /커밋은 저장소에/ },
  { term: "루트 열쇠", use: /루트 열쇠/, define: /루트 열쇠는 기관이/ },
  { term: "drand 순번", use: /drand 순번/, define: /drand 순번이라 부릅니다/ },
  { term: "BLS", use: /BLS/, define: /BLS라는 방식/ },
  { term: "씨앗", use: /씨앗/, define: /씨앗은 번호를 뽑는/ },
  { term: "거절 표본", use: /거절 표본/, define: /거절 표본이라/ },
  { term: "꼬리 확률", use: /꼬리 확률/, define: /꼬리 확률은 고르게/ },
  {
    term: "치우침 점수",
    use: /치우침 점수/,
    define: /치우침 점수는 꼬리 확률이/,
  },
  { term: "앵커", use: /앵커/, define: /앵커라 부릅니다/ },
  { term: "끝 해시", use: /끝 해시/, define: /해시\(끝 해시\)/ },
  { term: "genesis.txt", use: /genesis/, define: /genesis\.txt라는 파일/ },
  { term: "main", use: /\bmain\b/, define: /main 브랜치\(/ },
  { term: "강제 push", use: /강제 push/, define: /강제 push\(/ },
  { term: "임시 열쇠", use: /임시 열쇠/, define: /이번 확인에만 쓸 임시/ },
  { term: "공유 비밀", use: /공유 비밀|ECDH/, define: /공유 비밀이라 합니다/ },
  { term: "중간자", use: /중간자/, define: /중간자는 내 기기와/ },
  {
    term: "국장 열쇠",
    use: /국장 열쇠/,
    define: /국장 열쇠로 지정된 패스키\(/,
  },
  { term: "소속", use: /소속/, define: /소속은 우주국장이/ },
  { term: "천체 주소", use: /천체/, define: /천체 주소는 등록증에/ },
  { term: "등록증 해시", use: /등록증 해시/, define: /등록증 해시라 부릅니다/ },
  { term: "랑데부 해싱", use: /랑데부/, define: /랑데부 해싱은 주소마다/ },
  { term: "가중치", use: /가중치/, define: /가중치는 점수에/ },
  { term: "빌드", use: /빌드/, define: /빌드\(소스 코드를/ },
  { term: "가상 인증기", use: /가상 인증기/, define: /가상 인증기\(/ },
  { term: "기기 증명", use: /기기 증명/, define: /기기 증명\(/ },
];

describe("보안 배우기 용어 순서", () => {
  it("모든 용어는 뜻을 먼저 알리고 쓴다", () => {
    expect(earlyUses(PLACES, TERMS)).toEqual([]);
  });

  it("목차 한 줄은 그 단계까지 뜻을 알린 말만 쓴다", () => {
    expect(earlySummaryUses(SUMMARIES, PLACES, TERMS)).toEqual([]);
  });

  it("두 뜻으로 읽히거나 뜻을 알리지 않던 옛 낱말을 쓰지 않는다", () => {
    const all = [
      ...PLACES.map((p) => p.text),
      ...SUMMARIES.map((s) => s.text),
      ...ATTACKS.flatMap((a) => [a.title, a.how]),
    ].join("\n");
    // 「예측서 열쇠」, drand의 번호를 「회차」로 부르기, 표기 「기대값」(docs/36 11-74)
    expect(all).not.toMatch(/예측서 열쇠/);
    expect(all).not.toMatch(/drand [0-9,]*회(?!차의|차와)|drand 회차/);
    expect(all).not.toMatch(/기대값/);
  });
});

/** 문장마다 「~니다.」(뒤에 괄호 덧말이 붙어도)나 「~까요?」로 끝나는지(합니다체, 마침표) */
const politeSentences = (s: string) =>
  s.split(/(?<=[.?])\s+/).every((x) => /니다(\([^)]*\))?\.$|까요\?$/.test(x));

describe("보안 배우기 말투(합니다체, 마침표로 끝)", () => {
  it("목차 한 줄", () => {
    for (const l of LESSONS) expect(politeSentences(l.hook), l.hook).toBe(true);
  });
  it("요점과 막지 못하는 것", () => {
    for (const p of LESSONS.flatMap((l) => l.points))
      expect(politeSentences(p), p).toBe(true);
    for (const x of LIMITS) expect(politeSentences(x.body), x.title).toBe(true);
  });
  it("공격 설명과 걸린 까닭(합니다체 판정 뒤에 붙는다)", () => {
    for (const a of ATTACKS) expect(politeSentences(a.how), a.how).toBe(true);
  });
});
