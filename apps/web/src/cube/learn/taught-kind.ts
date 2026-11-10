// 어느 해 보기가 「배우는 방식 두 단계 힌트」(taught-hint.ts)를 쓰는가. 화면이 처음 그릴 때 바로 알아야 해서
// cube-ai를 싣지 않는 이 작은 파일에 둔다(힌트 계산은 필요할 때 따로 불러온다).
import type { TaughtStage } from "@game/cube-ai";

import { courseById } from "./courses";
import { stepIsRandom } from "./judge";
import type { Lesson, LessonStep } from "./types";

export const BEGINNER_COURSE_ID = "333-beginner";
export const BEGINNER_FINALE_ID = `${BEGINNER_COURSE_ID}-finale`;

/** 3×3 초보자 과정 단계 지도(course.stages)와 같은 차례의 배우는 방식 단계(cube-ai `TAUGHT_STAGES`와 같다) */
export const BEGINNER_TAUGHT: readonly TaughtStage[] = [
  "cross",
  "corners",
  "middle",
  "eo",
  "ll-edges",
  "ll-corner-place",
  "ll-corner-twist",
];

/** 이 해 보기의 힌트 방식: 한 단계(단원의 무작위 해 보기), 마무리(지금 단계를 스스로 찾음), 없음 */
export function taughtHintKind(
  lesson: Lesson,
  step: LessonStep,
): TaughtStage | "finale" | null {
  if (step.kind !== "try" || step.alg || !stepIsRandom(step)) return null;
  if (lesson.id === BEGINNER_FINALE_ID) return "finale";
  const stages = courseById(BEGINNER_COURSE_ID)?.stages ?? [];
  const i = stages.findIndex(
    (st) => st.lessons.includes(lesson.id) && st.goal === step.goal,
  );
  return i >= 0 ? (BEGINNER_TAUGHT[i] ?? null) : null;
}
