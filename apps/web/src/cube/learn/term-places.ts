// 큐브 배우기 단원을 읽는 차례대로 글 자리로 펼친다. 용어 순서 시험(glossary-333.test.ts, course-terms.test.ts)이
// 공통 틀 `@/tutorial/term-order`에 넘긴다. 실제로 쳐 보는 공식 줄(alg)은 시연이라 빼고 글만 읽는다.
import type { TextPlace } from "@/tutorial/term-order";

import type { Course, LessonStep } from "./types";

export const stepText = (s: LessonStep) =>
  [
    s.body,
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
