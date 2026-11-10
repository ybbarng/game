// 배우는 글이 용어의 뜻을 먼저 알리고 쓰는지 보는 공통 틀(2026-11-10 사용자 「처음 보는 용어는 최대한 풀어서 쓰거나,
// 먼저 의미를 알려 주고 쓰기. 갑자기 새로운 단어를 설명 없이 쓰지 않기」).
//
// 글을 읽는 차례대로 늘어놓은 자리(TextPlace)와 용어 목록(OrderedTerm)을 받아, 용어를 처음 쓴 자리가 뜻을 알린 자리보다
// 앞이면 그 용어를 돌려준다. 게임 튜토리얼은 lessonPlaces로 자리를 만들고, 다른 형식의 글(큐브 단원, 보안 배우기)은
// 자기 자리를 만들어 넘긴다.

import type { Lesson } from "./types";

export interface OrderedTerm {
  term: string;
  /** 글에서 이 용어를 쓴 곳 */
  use: RegExp;
  /** 뜻을 알리는 문장(이 꼴이 처음 나온 자리가 뜻을 알린 곳). 없으면 뜻을 알릴 필요가 없는 말로 보지 않는다 */
  define: RegExp;
}

export interface TextPlace {
  /** 실패 문구에 쓸 이름(「단원 제목 3번」) */
  where: string;
  /** 단원 번호. 단원 요약은 그 단원 안에서 뜻을 알린 용어까지 써도 된다 */
  group: number;
  text: string;
}

export interface GroupSummary {
  where: string;
  group: number;
  text: string;
}

const firstAt = (places: readonly TextPlace[], re: RegExp) =>
  places.findIndex((p) => re.test(p.text));

/** 뜻을 알리기 전에 쓴 용어(없으면 빈 배열). 뜻을 알리는 자리 안에서는 함께 써도 된다 */
export function earlyUses(
  places: readonly TextPlace[],
  terms: readonly OrderedTerm[],
): string[] {
  const early: string[] = [];
  for (const t of terms) {
    const def = firstAt(places, t.define);
    if (def < 0) {
      early.push(`${t.term}: 뜻을 알린 곳이 없다`);
      continue;
    }
    const use = firstAt(places, t.use);
    if (use >= 0 && use < def)
      early.push(
        `${t.term}: ${places[use]?.where}에서 먼저 씀(뜻은 ${places[def]?.where})`,
      );
  }
  return early;
}

/** 단원 요약(목록에 먼저 보이는 글)이 그 단원 뒤에야 뜻을 알리는 용어를 쓰는 곳 */
export function earlySummaryUses(
  summaries: readonly GroupSummary[],
  places: readonly TextPlace[],
  terms: readonly OrderedTerm[],
): string[] {
  const early: string[] = [];
  for (const s of summaries)
    for (const t of terms) {
      if (!t.use.test(s.text)) continue;
      const def = places[firstAt(places, t.define)];
      if (!def || def.group > s.group) early.push(`${s.where}: ${t.term}`);
    }
  return early;
}

type AnyLesson = Lesson<unknown, unknown, unknown, unknown>;

/**
 * 게임 튜토리얼 단원을 읽는 차례대로 자리로 펼친다. 설명 단계 아래 용어 칸(terms)의 글은 termText로 받아 그 단계 글 뒤에 둔다.
 * 단원 제목·요약은 단원 목록에 먼저 보이므로 lessonSummaries로 따로 본다.
 */
export function lessonPlaces(
  lessons: readonly AnyLesson[],
  termText: (id: string) => string = () => "",
): TextPlace[] {
  return lessons.flatMap((l, li) =>
    l.steps.map((s, si) => {
      const parts =
        s.kind === "explain"
          ? [s.title, ...s.body, ...(s.terms ?? []).map(termText)]
          : s.kind === "quiz"
            ? [s.question, ...s.options, s.explain]
            : [s.title, s.objective, s.hint, s.success, s.fail];
      return {
        where: `${l.title} ${si + 1}번`,
        group: li,
        text: parts.join("\n"),
      };
    }),
  );
}

export function lessonSummaries(lessons: readonly AnyLesson[]): GroupSummary[] {
  return lessons.map((l, li) => ({
    where: `${l.title} 요약`,
    group: li,
    text: `${l.title}\n${l.summary}`,
  }));
}
