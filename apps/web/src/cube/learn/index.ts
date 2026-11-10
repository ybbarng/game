// 큐브 맞추기 배우기·훈련 자료 모음(docs/47 8절)을 한 이름으로 다시 내보낸다(시험·도구용).
// 화면 코드는 여기를 부르지 않고 필요한 모듈을 바로 부른다(courses·alg-sets·notation·types 등). 여기를 부르면
// 단원 글 하나만 고쳐도 그 화면까지 화면 시험이 돈다(docs/38 17절).
export { ALG_SETS, ALL_ALG_CASES, type AlgSetInfo } from "./alg-sets";
export { F2L_GROUPS } from "./algs-f2l";
export { OLL_GROUPS } from "./algs-oll";
export { PLL_GROUPS } from "./algs-pll";
export { BLD_CORNER_TARGETS, BLD_EDGE_TARGETS, type BldTarget } from "./bld";
export { COURSES, courseById, nextCourses } from "./courses";
export { FINGER_DRILLS, FINGER_INTRO } from "./fingers";
export { algTokens, invertAlg, setupFor } from "./notation";
export { lessonPlace, mapLessonId, STAGE_SPECS } from "./stage-map";
export * from "./types";
