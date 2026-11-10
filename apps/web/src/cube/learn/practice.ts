// 해법 익히기(`/cube/methods`, docs/47 16-2)의 「연습」: 해법(과정)마다 이어 둘 연습 화면.
// 초보자·CFOP는 공식 연습 단계(16-9)로 바로 들어간다. 그 밖의 과정은 단원이 짝지어 둔 묶음(`Lesson.drill`)을
// 자유 훈련으로 연다.

import { methodOfCourse, stageById, stagesOf } from "../practice/stages";
import type { AlgSet, Course } from "./types";

export interface PracticeLink {
  href: string;
  /** 칸 글(공식 연습은 단계 이름, 자유 훈련 묶음은 묶음 이름) */
  title: string;
  kind: "practice" | "train" | "cross" | "algs";
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

/** 초보자 3층 넷은 칸 하나(「3층」, 노란 십자부터)로 묶어 칸 수를 줄인다 */
const BEGINNER_LINKS: { id: string; title: string }[] = [
  { id: "beginner-cross", title: "십자" },
  { id: "beginner-second", title: "2층" },
  { id: "beginner-yellow-cross", title: "3층" },
];

const practiceHref = (id: string) => `/cube/train?set=${id}`;

export function practiceLinks(
  course: Course,
  setTitle: (set: AlgSet) => string,
): PracticeLink[] {
  const out: PracticeLink[] = [];
  const method = methodOfCourse(course.id);
  const stageLinks =
    method === "beginner"
      ? BEGINNER_LINKS
      : method
        ? stagesOf(method).map((s) => ({ id: s.id, title: s.title }))
        : [];
  for (const s of stageLinks)
    out.push({ href: practiceHref(s.id), title: s.title, kind: "practice" });
  if (CROSS_COURSES.has(course.id))
    out.push({ href: "/cube/train/cross", title: "십자 훈련", kind: "cross" });
  const sets = [
    ...new Set(course.lessons.flatMap((l) => (l.drill ? [l.drill] : []))),
  ];
  // 공식 연습 단계로 이미 이은 묶음은 빼고, 나머지(오르테가·패리티 등)는 자유 훈련으로
  for (const set of sets)
    if (!(method && stageById(set)))
      out.push({
        href: practiceHref(set),
        title: setTitle(set),
        kind: "train",
      });
  if (method === "cfop" || sets.some((s) => MY_ALG_SETS.has(s)))
    out.push({ href: "/cube/algs", title: "내 공식", kind: "algs" });
  return out;
}
