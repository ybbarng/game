// 배우기 과정 목록(docs/47 8절). 단원 글(lessons-*.ts)을 모으는 곳은 여기 하나다.
// 단원 글을 고치면 이 파일을 부르는 화면만 다시 시험한다: 과정이 필요 없는 화면은 notation·types·alg-sets를 바로 부른다.
import { withFinale } from "./finale";
import { TWO_LOOK_LL } from "./lessons-2look";
import { BEGINNER_222 } from "./lessons-222";
import { FROM_333_222 } from "./lessons-222-from333";
import { BASICS_333, BEGINNER_333 } from "./lessons-333";
import { REDUCTION_444, REDUCTION_555 } from "./lessons-big";
import { BIG_666_777 } from "./lessons-big67";
import { BLD_OP } from "./lessons-bld";
import { CFOP_INTRO } from "./lessons-cfop";
import { ROUX } from "./lessons-roux";
import { TWIST_FIRST_333 } from "./lessons-twist-first";
import { YAU_444 } from "./lessons-yau";
import { PETRUS, ZZ } from "./lessons-zz";
import { STAGE_SPECS, withStages } from "./stage-map";
import type { Course, Lesson } from "./types";

/**
 * 먼저 배우면 좋은 과정(목록에 보이기만 하고 잠그지 않는다). 과정 끝 「다음에 할 것」은 이 표의 거꾸로다.
 * 3×3을 아는 사람의 2×2는 3×3 초보자 과정을, 큰 큐브는 3×3 풀이를, 루·ZZ·블라인드는 CFOP의 F2L 짝·PLL 공식을 쓴다.
 * 「마지막 층을 공식으로」(2단계 OLL·PLL)는 초보자 해법과 CFOP 사이의 다리다(docs/47 16-25).
 */
const REQUIRES: Record<string, string[]> = {
  // 코너 방향 먼저는 노란 십자까지 3×3 처음 맞추기 강을 그대로 쓴다(docs/47 16-33)
  "333-twist-first": ["333-beginner"],
  "222-from333": ["333-beginner"],
  "333-2look": ["333-beginner"],
  cfop: ["333-2look"],
  roux: ["cfop"],
  zz: ["cfop"],
  petrus: ["zz"],
  "444-reduction": ["333-beginner"],
  "444-yau": ["444-reduction", "cfop"],
  "555-reduction": ["444-reduction"],
  "big-666-777": ["555-reduction"],
  "bld-op": ["cfop"],
};

const needs = (c: Course): Course => {
  const requires = REQUIRES[c.id];
  return requires ? { ...c, requires } : c;
};

/** 단계 지도를 단다(STAGE_SPECS에 있는 과정만). 마무리 단원보다 먼저 붙여 지도가 준비 단원 바로 뒤에 온다 */
const staged = (c: Course): Course => {
  const spec = STAGE_SPECS[c.id];
  return spec ? withStages(c, spec) : c;
};

/** 큐브의 기초(`/cube/basics`, docs/47 16-27): 해법 배우기 목록에 넣지 않고 따로 보이는 과정 */
export const BASICS: Course = BASICS_333;

/** 해법 배우기(`/cube/methods`) 과정(차례대로 보여 줄 순서). 끝에 섞인 큐브를 처음부터 맞추는 마무리가 없는 과정에는 붙인다 */
export const METHOD_COURSES: Course[] = [
  withFinale(staged(BEGINNER_333), {
    rule: "random-cross",
    stages: [
      "흰 십자",
      "첫 층 코너",
      "둘째 층 엣지",
      "노란 십자",
      "옆면 맞추기",
      "코너 자리",
      "코너 방향",
    ],
    // 공식 훈련 묶음은 잇지 않는다: 2단계 OLL(10)은 이 과정에서 안 배운 공식이 대부분이다(다음 과정 「마지막 층을 공식으로」에서)
  }),
  withFinale(staged(TWIST_FIRST_333), {
    rule: "random-cross",
    stages: [
      "흰 십자",
      "첫 층 코너",
      "둘째 층 엣지",
      "노란 십자",
      "노란 면",
      "코너 자리",
      "엣지 자리",
    ],
    elsewhere: "흰 십자부터 노란 십자까지는 3×3 처음 맞추기 강의에 있어요.",
  }),
  withFinale(staged(BEGINNER_222), {
    rule: "2x2-random",
    stages: ["첫 층", "윗면", "위 층 자리"],
    drill: "ortega-oll",
  }),
  withFinale(staged(FROM_333_222), {
    rule: "2x2-random",
    stages: ["첫 층", "코너 자리", "코너 방향"],
    // 오르테가 OLL은 이 과정에서 배우지 않는다(2×2 처음 맞추기의 오르테가 단원에서)
  }),
  withFinale(staged(TWO_LOOK_LL), {
    rule: "random-cross",
    stages: ["아래 두 층", "OLL(방향)", "PLL(자리)"],
    elsewhere: "아래 두 층은 3×3 처음 맞추기 과정에 있어요.",
  }),
  withFinale(staged(CFOP_INTRO), {
    rule: "random-cross",
    stages: ["아래 십자", "F2L 짝 넷", "OLL", "PLL"],
    drill: "f2l",
  }),
  staged(ROUX),
  staged(ZZ),
  PETRUS,
  withFinale(staged(REDUCTION_444), {
    rule: "4x4-random",
    stages: ["센터", "엣지 짝", "3×3처럼(패리티)"],
    drill: "parity-4x4",
  }),
  staged(YAU_444),
  staged(REDUCTION_555),
  // 6×6·7×7은 4×4·5×5의 응용이라 새로 부딪히는 셋만 짧게(docs/47 16-29). 6×6·7×7 탭 둘에 함께 보인다(`sizes`)
  BIG_666_777,
  staged(BLD_OP),
].map(needs);

/**
 * 단원이 든 과정 모두: 큐브의 기초 다음에 해법 과정. 단원을 id로 찾는 곳(단원 화면·「다음에 할 것」)과 단원을 모두 보는
 * 시험은 이것을 쓴다(기초 단원 id·진도는 3×3 초보자 과정에 있던 때 그대로)
 */
export const COURSES: Course[] = [BASICS, ...METHOD_COURSES];

/** 이 과정 다음에 배우면 좋은 과정(그 과정을 먼저 배울 것으로 둔 과정들, COURSES 차례) */
export function nextCourses(course: Course): Course[] {
  return COURSES.filter((c) => c.requires?.includes(course.id));
}

/** 해법 배우기 크기 탭에서 이 과정을 보일 크기들(`sizes`, 없으면 `size` 하나) */
export function courseSizes(course: Course): number[] {
  return course.sizes ?? [course.size];
}

/** 과정 id → 과정 */
export function courseById(id: string): Course | undefined {
  return COURSES.find((c) => c.id === id);
}

/** 단원 id → 그 단원과 과정 */
export function findLesson(
  id: string,
): { course: Course; lesson: Lesson } | null {
  for (const course of COURSES) {
    const lesson = course.lessons.find((l) => l.id === id);
    if (lesson) return { course, lesson };
  }
  return null;
}

/**
 * 단원 끝 「다음 단원」: 같은 과정의 다음 단원, 과정의 마지막 단원이면 이어 읽는 과정(`continues`)의 첫 단원.
 * 이어 읽는 과정이 없으면 없음(그때는 과정 끝 「다음에 할 것」)
 */
export function nextLesson(course: Course, lessonId: string): Lesson | null {
  const i = course.lessons.findIndex((l) => l.id === lessonId);
  if (i < 0) return null;
  const after = course.lessons[i + 1];
  if (after) return after;
  const then = course.continues ? courseById(course.continues) : undefined;
  return then?.lessons[0] ?? null;
}
