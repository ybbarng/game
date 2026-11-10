import {
  type HumanSolve,
  STAGE_LABELS,
  solveAdvanced2,
  solveCfop,
} from "@game/cube-ai";
import { applyMoves, isSolved, parseMoves } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import { spotHold } from "../algs/spot";
import { ALG_SETS } from "../learn/alg-sets";
import { goalMet } from "../learn/judge";
import type { AlgCase } from "../learn/types";
import type { HintAnswer } from "./hint";

/**
 * Cubie 「공식 보기」의 공식 고르기(docs/47 15-15). 사이트에 이미 있는 판정을 그대로 쓴다.
 *
 * - 3×3, F2L이 끝났으면: 혼자 맞추기 「상황 알림」의 상황 찾기(`algs/spot.ts`)로 2단계 OLL → 2단계 PLL 상황을 찾고,
 *   그 상황의 대표 공식과 쥐는 법(흰 면 아래로 가는 큐브 돌리기, 공식 앞 윗면 돌리기)을 낸다. 공식 모음은 배우기의
 *   CFOP 2단계 단원과 같은 `algs-2look.ts`라, 보이는 공식이 「배우기」에서 익히는 것과 같다.
 *   윗층이 다 맞고 윗면 돌리기만 남았으면 그 한 수.
 * - 3×3, F2L 전: 컴퓨터 고수 해법(`solveCfop`, 십자 → F2L 네 쌍)이 지금 상태에서 낸 다음 단계(십자 또는 F2L 짝 하나)의 수.
 * - 2×2: 컴퓨터 고수 해법(`solveAdvanced2`, 첫 층 → 윗면 → 윗층)의 다음 단계 수.
 * - 4×4~7×7: 판정이 없다(`unsupported`).
 *
 * 무거운 모듈(해법·공식 모음)을 끌어오므로 화면은 이 파일을 필요할 때 불러온다.
 */

const TWO_LOOK: readonly AlgCase[] = ALG_SETS.filter(
  (s) => s.set === "2look-oll" || s.set === "2look-pll",
).flatMap((s) => s.cases);

const AUF = ["U", "U2", "U'"] as const;

const LESSON = {
  "2look-oll": "cfop-2look-oll",
  "2look-pll": "cfop-2look-pll",
  cross: "cfop-cross",
  f2l: "cfop-f2l-pair",
} as const satisfies Record<string, string>;

/** 「OLL 1단계: 노란 십자」 같은 단계 이름 */
function twoLookStage(c: AlgCase): string {
  if (c.set === "2look-oll")
    return c.group === "edges" ? "OLL 1단계(노란 십자)" : "OLL 2단계(노란 면)";
  return c.group === "corners" ? "PLL 1단계(코너)" : "PLL 2단계(엣지)";
}

const isRotation = (t: string) => /^[xyz]/.test(t);

/** 해법이 낸 다음 단계(수가 있는 첫 단계). 앞의 큐브 돌리기는 쥐는 법으로 뗀다 */
function nextStage(
  solve: HumanSolve,
  label: (name: string) => { stage: string; lesson?: string },
): HintAnswer {
  for (const st of solve.stages) {
    if (st.end <= st.start) continue;
    const moves = solve.moves.slice(st.start, st.end);
    let k = 0;
    while (k < moves.length && isRotation(moves[k] as string)) k++;
    // 돌리기만 있는 단계(흰 면을 아래로)는 다음 단계 앞에 붙인다
    if (k === moves.length) continue;
    const before = solve.moves
      .slice(0, st.start)
      .filter(isRotation)
      .concat(moves.slice(0, k))
      .join(" ");
    return {
      kind: "hint",
      hint: {
        ...label(st.name),
        before,
        alg: moves.slice(k).join(" "),
      },
    };
  }
  return { kind: "none" };
}

/** 지금 상태에 맞는 공식 하나 */
export function pickHint(n: number, state: PuzzleState): HintAnswer {
  if (n !== 2 && n !== 3) return { kind: "unsupported" };
  if (isSolved(n, state)) return { kind: "none" };
  if (n === 2)
    return nextStage(solveAdvanced2(state), (name) => ({
      stage: STAGE_LABELS[name as keyof typeof STAGE_LABELS] ?? name,
    }));

  if (goalMet(3, state, "f2l")) {
    const spotted = spotHold(state, TWO_LOOK);
    if (spotted) {
      const { c, rot, pre } = spotted;
      return {
        kind: "hint",
        hint: {
          stage: twoLookStage(c),
          name: c.name,
          before: [rot, pre].filter(Boolean).join(" "),
          alg: c.algs[0] as string,
          lesson: LESSON[c.set as "2look-oll" | "2look-pll"],
        },
      };
    }
    // 윗면 돌리기 하나만 남음
    for (const u of AUF)
      if (isSolved(3, applyMoves(3, state, parseMoves(3, u))))
        return {
          kind: "hint",
          hint: { stage: "마무리(윗면 맞추기)", before: "", alg: u },
        };
  }
  return nextStage(solveCfop(state), (name) =>
    name === "cross"
      ? { stage: "십자", lesson: LESSON.cross }
      : name.startsWith("f2l")
        ? { stage: "F2L 짝 하나", lesson: LESSON.f2l }
        : { stage: STAGE_LABELS[name as keyof typeof STAGE_LABELS] ?? name },
  );
}
