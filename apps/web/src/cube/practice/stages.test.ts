import {
  applyMoves,
  isSolved,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { type PathStageId, runStage, stepMoves } from "../learn/beginner-path";
import { goalMet } from "../learn/judge";
import { PRACTICE_N, problemStart } from "./problem";
import { MORE_SETS, PRACTICE_STAGES, stageById, stagesOf } from "./stages";

const n = PRACTICE_N;
const beginner = stagesOf("beginner");

describe("공식 연습 단계", () => {
  it("차례: 십자 → 2층 → 3층 넷 → F2L → 2단계 OLL·PLL → OLL·PLL", () => {
    expect(PRACTICE_STAGES.map((s) => s.id)).toEqual([
      "beginner-cross",
      "beginner-second",
      "beginner-yellow-cross",
      "beginner-edges",
      "beginner-corners",
      "beginner-twist",
      "f2l",
      "2look-oll",
      "2look-pll",
      "oll",
      "pll",
    ]);
    expect(PRACTICE_STAGES.map((s) => s.cases.length)).toEqual([
      10, 3, 3, 2, 3, 4, 41, 10, 6, 57, 21,
    ]);
  });

  it("더 보기는 연습 단계 밖의 옛 묶음", () => {
    expect(MORE_SETS).toEqual([
      "ortega-oll",
      "ortega-pbl",
      "parity-4x4",
      "edges-5x5",
      "bld-op",
    ]);
    expect(stageById("pll")?.method).toBe("cfop");
    expect(stageById("ortega-oll")).toBeUndefined();
  });

  it("상황 id는 단계를 통틀어 겹치지 않는다", () => {
    const ids = PRACTICE_STAGES.flatMap((s) => s.cases.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  // 초보자 묶음: 단원이 만드는 상황(쥐기 + setup)에서 공식이 그 단계 목표를 만든다
  for (const stage of beginner)
    for (const c of stage.cases)
      it(`${stage.title} · ${c.name}: 단원 상황을 공식이 푼다`, () => {
        const alg = c.algs[0] as string;
        const lesson = c.setup
          ? applyMoves(
              n,
              solvedCube(n),
              parseMoves(n, `${stage.hold} ${c.setup}`),
            )
          : problemStart(stage, alg);
        expect(goalMet(n, lesson, stage.goal(c))).toBe(false);
        const after = applyMoves(n, lesson, parseMoves(n, alg));
        expect(goalMet(n, after, stage.goal(c))).toBe(true);
      });

  // 초보자 묶음: 시작 큐브에서 단원의 경우별 정해진 길이 내는 수 = 보이는 공식(단원과 같은 길)
  const PATH: Record<string, PathStageId> = {
    "beginner-cross": "cross",
    "beginner-second": "second",
    "beginner-yellow-cross": "yellow-cross",
    "beginner-edges": "edges",
    "beginner-corners": "corner-place",
    "beginner-twist": "corner-twist",
  };
  for (const stage of beginner)
    for (const c of stage.cases)
      it(`${stage.title} · ${c.name}: 정해진 길과 같은 공식`, () => {
        const alg = c.algs[0] as string;
        const start = problemStart(stage, alg);
        // 어느 조각부터 해도 되는 단계(흰 십자 등)는 먼저 고른 것부터든 나중 것부터든 같은 경우의 수다
        const paths = [() => 0, (k: number) => k - 1].map((pick) =>
          runStage(PATH[stage.id] as PathStageId, start, pick)
            .steps.map(stepMoves)
            .join(" "),
        );
        expect(paths).toContain(alg);
      });

  it("시작 큐브에서 보인 공식을 끝까지 치면 다 맞춰진다", () => {
    for (const stage of PRACTICE_STAGES)
      for (const c of stage.cases) {
        const alg = c.algs[0] as string;
        const start = problemStart(stage, alg);
        const end = applyMoves(n, start, parseMoves(n, alg));
        expect(isSolved(n, end), `${stage.id} ${c.id}`).toBe(true);
      }
  });
});
