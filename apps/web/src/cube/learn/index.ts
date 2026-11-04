// 큐브 맞추기 배우기·훈련 자료 모음(docs/47 8절). 화면은 여기서 과정·상황 묶음·손가락 연습을 읽는다.
import { TWO_LOOK_OLL, TWO_LOOK_PLL } from "./algs-2look";
import { EDGES_5X5, PARITY_4X4 } from "./algs-big";
import { F2L_CASES } from "./algs-f2l";
import { OLL_CASES } from "./algs-oll";
import { ORTEGA_OLL, ORTEGA_PBL } from "./algs-ortega";
import { PLL_CASES } from "./algs-pll";
import { BLD_ALGS } from "./bld";
import { BEGINNER_222 } from "./lessons-222";
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

/** 배우기 과정(차례대로 보여 줄 순서) */
export const COURSES: Course[] = [
  BEGINNER_333,
  BEGINNER_222,
  CFOP_INTRO,
  REDUCTION_444,
  REDUCTION_555,
  BLD_OP,
  ROUX,
  ZZ,
  PETRUS,
  YAU_444,
];

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
