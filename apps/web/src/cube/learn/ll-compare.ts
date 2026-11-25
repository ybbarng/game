// 마지막 층 두 길(docs/47 16-24): 초보자 해법의 네 단계(beginner-path.ts 단원 규칙)와 2단계 OLL·PLL(단원 공식).
// 「마지막 층을 공식으로」 과정의 지도 시연과 「초보자 해법과 견주기」 숫자가 쓴다. 숫자(LL_COMPARE)는
// ll-compare.test.ts가 같은 섞기로 다시 재서 확인한다(자료가 바뀌면 시험이 숫자를 고치라고 알린다).
import { isRotation, parseMoves } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import { TWO_LOOK_OLL } from "./algs-2look";
import {
  type PathStageId,
  pathCase,
  play,
  runStage,
  stepMoves,
} from "./beginner-path";
import { goalMet } from "./judge";
import { runZzLl, stepMovesLl } from "./zz-path";

const U4 = ["", "U", "U'", "U2"];
const join = (xs: string[]) => xs.filter(Boolean).join(" ");

/** 노란 십자 걸음: 가로줄·ㄱ자·점 공식 가운데 윗면을 U로 돌려 쥐고 쳐서 노란 십자가 되는 첫 것(이미 있으면 "") */
export function yellowCrossByFormula(s: PuzzleState): string {
  if (goalMet(3, s, "yellow-cross")) return "";
  for (const c of TWO_LOOK_OLL.filter((x) => x.group === "edges"))
    for (const u of U4) {
      const m = join([u, c.algs[0] as string]);
      if (goalMet(3, play(s, m), "yellow-cross")) return m;
    }
  throw new Error("노란 십자 공식이 없다");
}

export interface LlRun {
  /** 걸음마다 친 수(공식 앞에 쥐려고 돌린 U·y 포함) */
  steps: string[];
  /** 공식을 친 횟수(윗면만 돌려 맞추는 걸음은 세지 않는다) */
  formulas: number;
  state: PuzzleState;
}

/** 2단계 OLL·PLL로 마지막 층을 끝까지(아래 두 층이 맞고 흰 면이 아래). OLL 걸음과 PLL 걸음을 나눠 돌려준다 */
export function solveTwoLook(s: PuzzleState): {
  oll: string[];
  pll: string[];
  run: LlRun;
} {
  const cross = yellowCrossByFormula(s);
  const rest = runZzLl(play(s, cross));
  const oll = [
    cross,
    ...rest.steps.filter((x) => x.stage === "oll").map(stepMovesLl),
  ].filter(Boolean);
  const pll = rest.steps
    .filter((x) => x.stage !== "oll")
    .map(stepMovesLl)
    .filter(Boolean);
  // 점 모양은 가로줄 공식 뒤 소문자 공식을 이어 치니 둘로 센다
  const crossCount = !cross ? 0 : cross.includes("f") ? 2 : 1;
  const formulas =
    crossCount + rest.steps.filter((x) => x.stage !== "align").length;
  return {
    oll,
    pll,
    run: { steps: [...oll, ...pll], formulas, state: rest.state },
  };
}

const BEGINNER_LL: PathStageId[] = [
  "yellow-cross",
  "edges",
  "corner-place",
  "corner-twist",
];

/** 초보자 해법 네 단계로 마지막 층을 끝까지(단원 규칙의 첫 고르기). 공식 횟수는 공식을 친 걸음 수 */
export function solveBeginnerLl(s: PuzzleState): LlRun {
  let state = s;
  const steps: string[] = [];
  let formulas = 0;
  for (const id of BEGINNER_LL) {
    const r = runStage(id, state);
    state = r.state;
    for (const st of r.steps) {
      const m = stepMoves(st);
      if (!m) continue;
      steps.push(m);
      // 공식 × 횟수로 센다. 윗면만 돌린 걸음(마지막 맞추기)은 공식이 아니다
      const c = pathCase(id, st.caseId);
      if (c.alg.split(" ").some((t) => t && !/^U/.test(t))) formulas += c.times;
    }
  }
  return { steps, formulas, state };
}

/** 친 수(큐브 전체 돌리기 x·y·z는 빼고, U2·M도 한 수) */
export function turnCount(steps: string[]): number {
  return steps.reduce(
    (sum, alg) =>
      sum + parseMoves(3, alg).filter((m) => !isRotation(3, m)).length,
    0,
  );
}

/**
 * 「아래 두 층 맞음, 윗층만 섞음」(f2l-solved) 씨앗 1~50을 두 길로 맞춘 평균(반올림). 단원 글이 이 값을 쓴다.
 * ll-compare.test.ts가 다시 잰다
 */
export const LL_COMPARE = {
  seeds: 50,
  beginnerTurns: 49,
  twoLookTurns: 36,
  beginnerFormulas: 9,
  twoLookFormulas: 4,
} as const;
