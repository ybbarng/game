/** 4×4·5×5 축소법이 돌려 쥐어도 막히면 `solveHuman`·`botPlan`이 던진다(화면이 잡는다) */
export { ReductionStuckError } from "@game/cube-reduction";
export * from "./algs";
export { toFaceletMove, toFacelets } from "./facelets";
export {
  type HumanOptions,
  SOLVE_METHODS,
  type SolveMethod,
  solveAdvanced2,
  solveBeginner2,
  solveBeginner3,
  solveCfop,
  solveExpert2,
  solveExpert3,
  solveHuman,
  solveIntermediate2,
  solveIntermediate3,
} from "./methods";
export { solveRoux, solveZZ } from "./methods-roux-zz";
export * from "./plan";
export * from "./skill";
export {
  type HumanSolve,
  type SolveStage,
  STAGE_LABELS,
  type StageName,
} from "./solve";
export {
  TAUGHT_CORNER_SHORTCUT,
  TAUGHT_CORNER_SLOT,
  TAUGHT_CORNER_TRIGGER,
} from "./taught";
export {
  type ColorLetter,
  TAUGHT_STAGES,
  type TaughtCase,
  type TaughtPlan,
  type TaughtPlanOptions,
  type TaughtSegment,
  type TaughtStage,
  taughtStagePlan,
} from "./taught-plan";
