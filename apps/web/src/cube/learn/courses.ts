// 배우기 과정 목록(docs/47 8절). 단원 글(lessons-*.ts)을 모으는 곳은 여기 하나다.
// 단원 글을 고치면 이 파일을 부르는 화면만 다시 시험한다: 과정이 필요 없는 화면은 notation·types·alg-sets를 바로 부른다.
import { withFinale } from "./finale";
import { TWO_LOOK_LL } from "./lessons-2look";
import { BASICS_222, BEGINNER_222 } from "./lessons-222";
import { BASICS_222_FROM333, FROM_333_222 } from "./lessons-222-from333";
import { BASICS_333, BEGINNER_333 } from "./lessons-333";
import {
  BASICS_444,
  BASICS_555,
  REDUCTION_444,
  REDUCTION_555,
} from "./lessons-big";
import { BIG_666_777 } from "./lessons-big67";
import { BLD_OP } from "./lessons-bld";
import { CFOP_INTRO } from "./lessons-cfop";
import { ROUX } from "./lessons-roux";
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

/** 큐브의 기초(`/cube/basics`, docs/47 16-27) 3×3: 해법 배우기 목록에 넣지 않고 따로 보이는 과정 */
export const BASICS: Course = BASICS_333;

/** 큐브의 기초 크기 탭(docs/47 16-35) */
export const BASICS_SIZES = [2, 3, 4, 5] as const;

/**
 * 크기 탭마다 보일 기초 과정(차례대로). 2×2는 두 독자의 조각 강 둘을 나란히 둔다(2026-11-27 사용자): 2×2부터 하는
 * 사람의 「2×2의 조각」, 3×3을 아는 사람의 「3×3에서 2×2로」. 고르기 화면은 두지 않는다
 */
export const BASICS_BY_SIZE: Record<number, Course[]> = {
  2: [BASICS_222, BASICS_222_FROM333],
  3: [BASICS_333],
  4: [BASICS_444],
  5: [BASICS_555],
};

/** 크기와 상관없어 어느 탭에서나 보이는 기초 강(표기 읽기) */
const BASICS_EVERY_SIZE = BASICS_333.lessons.filter(
  (l) => l.id === "333-notation",
);

/** 크기 탭에 보일 강(차례대로): 그 크기의 기초 강, 그다음 크기와 상관없는 강 */
export function basicsLessons(n: number): Lesson[] {
  const own = (BASICS_BY_SIZE[n] ?? []).flatMap((c) => c.lessons);
  return [...own, ...BASICS_EVERY_SIZE.filter((l) => !own.includes(l))];
}

/** 큐브의 기초 과정 모두(3×3 먼저) */
export const BASICS_COURSES: Course[] = [
  BASICS_333,
  BASICS_222,
  BASICS_222_FROM333,
  BASICS_444,
  BASICS_555,
];

/** 큐브의 기초 과정인가(돌아가기·「이어서 하기」를 가른다) */
export const isBasicsCourse = (c: Course): boolean =>
  BASICS_COURSES.some((b) => b.id === c.id);

/** 이 기초 과정이 보이는 크기 탭 */
export const basicsSizeOf = (c: Course): number =>
  (BASICS_SIZES as readonly number[]).find((n) =>
    BASICS_BY_SIZE[n]?.some((b) => b.id === c.id),
  ) ?? 3;

/**
 * 큐브의 기초를 열 크기 탭(보는 화면, docs/47 16-28·16-35): 주소 `?n=`가 탭에 있으면 그것, 아니면 지금 크기.
 * 지금 크기가 6×6·7×7이면 5×5(2026-11-27 사용자: 6×6·7×7 강의가 5×5 축소법을 먼저 배우게 되어 있고 조각 종류가
 * 가장 가깝다), 그 밖에 탭에 없으면 3×3
 */
export function basicsSizeFor(
  current: number,
  fromUrl?: number | null,
): number {
  const sizes = BASICS_SIZES as readonly number[];
  if (fromUrl != null && sizes.includes(fromUrl)) return fromUrl;
  if (sizes.includes(current)) return current;
  if (current >= 6) return 5;
  return 3;
}

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
export const COURSES: Course[] = [...BASICS_COURSES, ...METHOD_COURSES];

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
