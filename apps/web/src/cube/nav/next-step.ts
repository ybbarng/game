// 첫 화면 맨 위 「다음에 할 것」(docs/47 16-5). 이미 있는 진도·기록만 읽고 저장 형식을 새로 만들지 않는다.
// 권하는 차례: 사이트 쓰는 법 → 처음 맞추기(큐브의 기초 단원 → 3×3 초보자 단원) → 초보자 해법 연습 → (처음 완성 뒤) 혼자 맞추기 기록 재기 → 다음 해법.

import { courseMethod } from "../learn/course-method";
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
/** 처음 맞추기 뒤에 권하는 해법(차례대로, 다 끝낸 것은 건너뛴다). 첫째는 CFOP로 가는 다리(docs/47 16-25) */
export const NEXT_METHODS = [
  "333-2look",
  "cfop",
  "roux",
  "zz",
  "petrus",
] as const;
/** 처음 맞추기를 끝낸 사람에게 권하는 연습(공식 연습의 초보자 십자 단계) */
export const BEGINNER_PRACTICE = "/cube/train?set=beginner-cross";
/** 기록 재기를 권하는 동안(5번 평균이 나올 때까지) */
export const SOLO_GOAL = 5;

const lessonHref = (id: string) => `/cube/learn?lesson=${id}`;

function firstUndone(
  lessons: readonly Lesson[],
  learn: LearnProgress,
): Lesson | undefined {
  return lessons.find((l) => !learn.lessons[l.id]?.done);
}

/**
 * 처음 맞추기의 단원 차례: 초보자 과정 앞에 이어 읽는 과정(큐브의 기초, `continues`)의 단원, 그다음 초보자 과정 단원.
 * 기초 단원을 초보자 과정에서 떼어 냈어도(docs/47 16-27) 처음 맞추기는 예전처럼 「큐브와 만나기」부터다
 */
export function firstSolveLessons(courses: readonly Course[]): Lesson[] {
  const beginner = courses.find((c) => c.id === BEGINNER);
  if (!beginner) return [];
  const lead = courses.filter((c) => c.continues === BEGINNER);
  return [...lead.flatMap((c) => c.lessons), ...beginner.lessons];
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

  const path = firstSolveLessons(courses);
  if (input.solo3 === 0 && path.length > 0) {
    const undone = firstUndone(path, learn);
    if (undone) {
      // 처음 맞추기를 보던 중이면 그 단원부터
      const last = path.find(
        (l) => l.id === learn.last && !learn.lessons[l.id]?.done,
      );
      const at = last ?? undone;
      const started = path.some((l) => learn.lessons[l.id]);
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
      // 공식 연습의 초보자 첫 단계(docs/47 16-9)
      href: BEGINNER_PRACTICE,
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
    const undone = course && firstUndone(course.lessons, learn);
    if (course && undone)
      return {
        kind: "method",
        icon: "🎓",
        // 해법을 말하는 곳이라 해법 카드 이름(강의 이름이 아니라, docs/47 16-38)
        title: `다음 해법: ${courseMethod(course)?.name ?? course.title}`,
        href: lessonHref(undone.id),
      };
  }
  return solo;
}
