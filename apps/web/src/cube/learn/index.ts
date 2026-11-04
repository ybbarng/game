// 큐브 맞추기 배우기·훈련 자료 모음(docs/47 8절). 화면은 여기서 과정·상황 묶음·손가락 연습을 읽는다.
import { TWO_LOOK_OLL, TWO_LOOK_PLL } from "./algs-2look";
import { EDGES_5X5, PARITY_4X4 } from "./algs-big";
import { F2L_CASES } from "./algs-f2l";
import { OLL_CASES } from "./algs-oll";
import { ORTEGA_OLL, ORTEGA_PBL } from "./algs-ortega";
import { PLL_CASES } from "./algs-pll";
import { BLD_ALGS } from "./bld";
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
import type { AlgCase, AlgSet, Course, CubeSize, MaskName } from "./types";

export { F2L_GROUPS } from "./algs-f2l";
export { OLL_GROUPS } from "./algs-oll";
export { PLL_GROUPS } from "./algs-pll";
export { BLD_CORNER_TARGETS, BLD_EDGE_TARGETS, type BldTarget } from "./bld";
export { FINGER_DRILLS, FINGER_INTRO } from "./fingers";
export { algTokens, invertAlg, setupFor } from "./notation";
export * from "./types";

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

/** 배우기 과정(차례대로 보여 줄 순서). 끝에 섞인 큐브를 처음부터 맞추는 마무리가 없는 과정에는 붙인다 */
export const COURSES: Course[] = [
  withFinale(BEGINNER_333, {
    rule: "random-cross",
    stages: [
      "흰 십자",
      "첫 층 꼭짓점",
      "둘째 층 모서리",
      "노란 십자",
      "노란 면",
      "위 꼭짓점 자리",
      "위 모서리 자리",
    ],
    drill: "2look-oll",
  }),
  withFinale(BEGINNER_222, {
    rule: "2x2-random",
    stages: ["첫 층", "윗면 노랗게", "윗층 자리"],
    drill: "ortega-oll",
  }),
  withFinale(FROM_333_222, {
    rule: "2x2-random",
    stages: ["첫 층", "윗면 노랗게", "위 꼭짓점 자리"],
    drill: "ortega-oll",
  }),
  withFinale(CFOP_INTRO, {
    rule: "random-cross",
    stages: ["아래 십자", "F2L 짝 넷", "OLL", "PLL"],
    drill: "f2l",
  }),
  ROUX,
  ZZ,
  PETRUS,
  withFinale(REDUCTION_444, {
    rule: "4x4-random",
    stages: ["가운데", "모서리 짝", "3×3처럼(패리티)"],
    drill: "parity-4x4",
  }),
  YAU_444,
  REDUCTION_555,
  BLD_OP,
].map(needs);

/** 이 과정 다음에 배우면 좋은 과정(그 과정을 먼저 배울 것으로 둔 과정들, COURSES 차례) */
export function nextCourses(course: Course): Course[] {
  return COURSES.filter((c) => c.requires?.includes(course.id));
}

/** 과정 id → 과정 */
export function courseById(id: string): Course | undefined {
  return COURSES.find((c) => c.id === id);
}

export interface AlgSetInfo {
  set: AlgSet;
  size: CubeSize;
  title: string;
  /** 훈련 「가리기」 모드의 마스크 */
  mask: MaskName;
  cases: AlgCase[];
}

/** 훈련 묶음. 상황을 무작위로 내고, 결과 모양으로 채점한다(사람마다 공식이 달라도 된다) */
export const ALG_SETS: AlgSetInfo[] = [
  {
    set: "2look-oll",
    size: 3,
    title: "2단계 OLL(10)",
    mask: "oll",
    cases: TWO_LOOK_OLL,
  },
  {
    set: "2look-pll",
    size: 3,
    title: "2단계 PLL(6)",
    mask: "pll",
    cases: TWO_LOOK_PLL,
  },
  { set: "f2l", size: 3, title: "F2L(41)", mask: "f2l", cases: F2L_CASES },
  { set: "oll", size: 3, title: "OLL(57)", mask: "oll", cases: OLL_CASES },
  { set: "pll", size: 3, title: "PLL(21)", mask: "pll", cases: PLL_CASES },
  {
    set: "ortega-oll",
    size: 2,
    title: "오르테가 OLL(7)",
    mask: "oll",
    cases: ORTEGA_OLL,
  },
  {
    set: "ortega-pbl",
    size: 2,
    title: "오르테가 PBL(5)",
    mask: "all",
    cases: ORTEGA_PBL,
  },
  {
    set: "parity-4x4",
    size: 4,
    title: "4×4 패리티(2)",
    mask: "all",
    cases: PARITY_4X4,
  },
  {
    set: "edges-5x5",
    size: 5,
    title: "5×5 마지막 모서리(2)",
    mask: "all",
    cases: EDGES_5X5,
  },
  {
    set: "bld-op",
    size: 3,
    title: "블라인드 공식(3)",
    mask: "all",
    cases: BLD_ALGS,
  },
];

export const ALL_ALG_CASES: AlgCase[] = ALG_SETS.flatMap((s) => s.cases);
