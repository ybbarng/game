// 큐브 단원(큐브의 기초·해법 배우기)을 읽는 차례대로 글 자리로 펼친다. 용어 순서 시험(glossary-333.test.ts, course-terms.test.ts)이
// 공통 틀 `@/tutorial/term-order`에 넘긴다. 실제로 쳐 보는 공식 줄(alg)은 시연이라 빼고 글만 읽는다.
import type { TextPlace } from "@/tutorial/term-order";

import { sheetText } from "./two-look-sheets";
import type { Course, LessonStep } from "./types";

export const stepText = (s: LessonStep) =>
  [
    s.body,
    s.sheet ? sheetText(s.sheet) : "",
    s.beside?.caption ?? "",
    s.quiz?.question ?? "",
    ...(s.quiz?.choices ?? []),
    s.quiz?.why ?? "",
    s.passedText ?? "",
  ].join("\n");

/** 과정의 단계들. `group`은 단원 번호(앞 과정으로 이어 읽을 때는 `group`을 받아 쓴다) */
export function coursePlaces(course: Course, group?: number): TextPlace[] {
  return course.lessons.flatMap((l, li) =>
    l.steps.map((s, si) => ({
      where: `${course.title} · ${l.title} ${si + 1}번`,
      group: group ?? li,
      text: stepText(s),
    })),
  );
}

export const courseSummaries = (course: Course) =>
  course.lessons.map((l, li) => ({
    where: `${l.title} 요약`,
    group: li,
    text: `${l.title}\n${l.summary}`,
  }));

/**
 * 이어 읽는 과정들(예: 큐브의 기초 → 3×3 초보자, `continues`)을 한 과정처럼 펼친다. 단원 번호는 앞 과정부터 이어 센다
 * (요약 검사가 앞 과정 단원을 먼저 읽은 것으로 보게)
 */
export function chainPlaces(courses: readonly Course[]): TextPlace[] {
  let base = 0;
  return courses.flatMap((c) => {
    const places = coursePlaces(c).map((p) => ({
      ...p,
      group: p.group + base,
    }));
    base += c.lessons.length;
    return places;
  });
}

export function chainSummaries(courses: readonly Course[]) {
  let base = 0;
  return courses.flatMap((c) => {
    const out = courseSummaries(c).map((s) => ({
      ...s,
      group: s.group + base,
    }));
    base += c.lessons.length;
    return out;
  });
}
