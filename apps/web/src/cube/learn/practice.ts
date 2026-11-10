// 해법 익히기(`/cube/methods`, docs/47 16-2)의 「연습」: 해법(과정)마다 이어 둘 연습 화면.
// 공식 훈련 묶음은 과정 단원과 마무리가 이미 짝지어 둔 것(`Lesson.drill`)에서 읽는다. 새 연습은 2단계 일(16-7).

import type { AlgSet, Course } from "./types";

export interface PracticeLink {
  href: string;
  /** 칸 글(공식 훈련 묶음은 묶음 이름) */
  title: string;
  kind: "train" | "cross" | "algs";
}

/** 십자부터 맞추는 3×3 해법(십자 훈련을 잇는다) */
const CROSS_COURSES = new Set(["333-beginner", "cfop", "zz"]);
/** 내 공식(`/cube/algs`)에서 상황별 공식을 고를 수 있는 묶음 */
const MY_ALG_SETS = new Set<AlgSet>([
  "oll",
  "pll",
  "f2l",
  "2look-oll",
  "2look-pll",
  "ortega-oll",
  "ortega-pbl",
]);

export function practiceLinks(
  course: Course,
  setTitle: (set: AlgSet) => string,
): PracticeLink[] {
  const sets = [
    ...new Set(course.lessons.flatMap((l) => (l.drill ? [l.drill] : []))),
  ];
  const out: PracticeLink[] = [];
  if (CROSS_COURSES.has(course.id))
    out.push({ href: "/cube/train/cross", title: "십자 훈련", kind: "cross" });
  for (const set of sets)
    out.push({
      href: `/cube/train?set=${set}`,
      title: setTitle(set),
      kind: "train",
    });
  if (sets.some((s) => MY_ALG_SETS.has(s)))
    out.push({ href: "/cube/algs", title: "내 공식", kind: "algs" });
  return out;
}
