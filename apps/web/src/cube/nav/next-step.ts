// 첫 화면 맨 위 「다음에 할 것」(docs/47 16-5). 이미 있는 진도·기록만 읽고 저장 형식을 새로 만들지 않는다.
// 권하는 차례: 사이트 쓰는 법 → 처음 맞추기 → 초보자 해법 연습 → (처음 완성 뒤) 혼자 맞추기 기록 재기 → 다음 해법.

import type { LearnProgress } from "../learn/progress";
import type { Course, Lesson } from "../learn/types";

export type NextKind =
  | "intro"
  | "first-solve"
  | "beginner-practice"
  | "solo"
  | "method";

export interface NextStep {
  kind: NextKind;
  icon: string;
  title: string;
  href: string;
}

export interface NextInput {
  /** 키 익히기에서 마친 단계 수(`cube.keylearn.v1`) */
  keysDone: number;
  /** 배우기 진도(`cube.learn.v1`) */
  learn: LearnProgress;
  /** 혼자 맞추기 3×3 완성 기록 수(`cube.records.v1`, DNF 빼고) */
  solo3: number;
  /** 혼자 맞추기 기록이 크기 상관없이 하나라도 있나 */
  anySolo: boolean;
}

/** 처음 맞추기 과정 */
export const BEGINNER = "333-beginner";
/** 처음 맞추기 뒤에 권하는 해법(차례대로, 다 끝낸 것은 건너뛴다) */
export const NEXT_METHODS = ["cfop", "roux", "zz", "petrus"] as const;
/** 기록 재기를 권하는 동안(5번 평균이 나올 때까지) */
export const SOLO_GOAL = 5;

const lessonHref = (id: string) => `/cube/learn?lesson=${id}`;

function firstUndone(course: Course, learn: LearnProgress): Lesson | undefined {
  return course.lessons.find((l) => !learn.lessons[l.id]?.done);
}

export function nextStep(input: NextInput, courses: Course[]): NextStep {
  const { learn } = input;
  const touched = Object.keys(learn.lessons).length > 0;
  if (input.keysDone === 0 && !touched && !input.anySolo)
    return {
      kind: "intro",
      icon: "👋",
      title: "사이트 쓰는 법",
      href: "/cube/intro",
    };

  const beginner = courses.find((c) => c.id === BEGINNER);
  if (input.solo3 === 0 && beginner) {
    const undone = firstUndone(beginner, learn);
    if (undone) {
      // 처음 맞추기를 보던 중이면 그 단원부터
      const last = beginner.lessons.find(
        (l) => l.id === learn.last && !learn.lessons[l.id]?.done,
      );
      const at = last ?? undone;
      const started = beginner.lessons.some((l) => learn.lessons[l.id]);
      return {
        kind: "first-solve",
        icon: started ? "▶️" : "🧩",
        title: started ? `처음 맞추기 이어서: ${at.title}` : "처음 맞추기",
        href: lessonHref(at.id),
      };
    }
    return {
      kind: "beginner-practice",
      icon: "🎯",
      title: "초보자 해법 연습",
      href: `/cube/methods?m=${BEGINNER}`,
    };
  }

  const solo: NextStep = {
    kind: "solo",
    icon: "⏱",
    title: "혼자 맞추기 기록 재기",
    href: "/cube/solo",
  };
  if (input.solo3 < SOLO_GOAL) return solo;
  for (const id of NEXT_METHODS) {
    const course = courses.find((c) => c.id === id);
    const undone = course && firstUndone(course, learn);
    if (course && undone)
      return {
        kind: "method",
        icon: "🎓",
        title: `다음 해법: ${course.title}`,
        href: lessonHref(undone.id),
      };
  }
  return solo;
}
