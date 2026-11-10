// 배우기 과정 목록(docs/47 8절). 단원 글(lessons-*.ts)을 모으는 곳은 여기 하나다.
// 단원 글을 고치면 이 파일을 부르는 화면만 다시 시험한다: 과정이 필요 없는 화면은 notation·types·alg-sets를 바로 부른다.
import { withFinale } from "./finale";
import { BEGINNER_222 } from "./lessons-222";
import { FROM_333_222 } from "./lessons-222-from333";
import { BEGINNER_333 } from "./lessons-333";
import { REDUCTION_444, REDUCTION_555 } from "./lessons-big";
import { BLD_OP } from "./lessons-bld";
import { CFOP_INTRO } from "./lessons-cfop";
import { ROUX } from "./lessons-roux";
import { YAU_444 } from "./lessons-yau";
import { PETRUS, ZZ } from "./lessons-zz";
import { STAGE_SPECS, withStages } from "./stage-map";
import type { Course } from "./types";

/**
 * 먼저 배우면 좋은 과정(목록에 보이기만 하고 잠그지 않는다). 과정 끝 「다음에 할 것」은 이 표의 거꾸로다.
 * 3×3을 아는 사람의 2×2는 3×3 초보자 과정을, 큰 큐브는 3×3 풀이를, 루·ZZ·블라인드는 CFOP의 F2L 짝·PLL 공식을 쓴다.
 */
const REQUIRES: Record<string, string[]> = {
  "222-from333": ["333-beginner"],
  cfop: ["333-beginner"],
  roux: ["cfop"],
  zz: ["cfop"],
  petrus: ["zz"],
  "444-reduction": ["333-beginner"],
  "444-yau": ["444-reduction", "cfop"],
  "555-reduction": ["444-reduction"],
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

/** 배우기 과정(차례대로 보여 줄 순서). 끝에 섞인 큐브를 처음부터 맞추는 마무리가 없는 과정에는 붙인다 */
export const COURSES: Course[] = [
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
    // 공식 훈련 묶음은 잇지 않는다: 2단계 OLL(10)은 이 과정에서 안 배운 공식이 대부분이다(다음 과정 CFOP에서)
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
  staged(BLD_OP),
].map(needs);

/** 이 과정 다음에 배우면 좋은 과정(그 과정을 먼저 배울 것으로 둔 과정들, COURSES 차례) */
export function nextCourses(course: Course): Course[] {
  return COURSES.filter((c) => c.requires?.includes(course.id));
}

/** 과정 id → 과정 */
export function courseById(id: string): Course | undefined {
  return COURSES.find((c) => c.id === id);
}
