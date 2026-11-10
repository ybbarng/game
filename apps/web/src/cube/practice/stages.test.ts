import {
  applyMoves,
  isSolved,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { type PathStageId, runStage, stepMoves } from "../learn/beginner-path";
import { goalMet } from "../learn/judge";
import { nextBlock, runBlocks, stepMovesBlock } from "../learn/zz-path";
import { choicesOf } from "./pick-alg";
import {
  alignPrefix,
  caseStart,
  PRACTICE_N,
  problemStart,
  SHAPE_TURNS,
} from "./problem";
import { MORE_SETS, PRACTICE_STAGES, stageById, stagesOf } from "./stages";

const n = PRACTICE_N;
const beginner = stagesOf("beginner");

describe("공식 연습 단계", () => {
  it("차례: 십자 → 2층 → 3층 넷 → F2L → 2단계 OLL·PLL → OLL·PLL → ZZ 짝 넣기", () => {
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
      "zz-pair",
    ]);
    expect(PRACTICE_STAGES.map((s) => s.cases.length)).toEqual([
      10, 3, 3, 2, 3, 4, 41, 10, 6, 57, 21, 12,
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
        const start = caseStart(stage, c);
        // 어느 조각부터 해도 되는 단계(흰 십자 등)는 먼저 고른 것부터든 나중 것부터든 같은 경우의 수다
        const paths = [() => 0, (k: number) => k - 1].map((pick) =>
          runStage(PATH[stage.id] as PathStageId, start, pick)
            .steps.map(stepMoves)
            .join(" "),
        );
        expect(paths).toContain(alg);
      });

  it("ZZ 짝 넣기: 상황마다 시작 큐브에서 ZZ 블록 규칙(nextBlock)이 내는 수 = 보이는 공식, 열두 경우가 모두 다르다", () => {
    const zz = stageById("zz-pair") as NonNullable<
      ReturnType<typeof stageById>
    >;
    const seen = new Set<string>();
    for (const c of zz.cases) {
      const start = caseStart(zz, c);
      const moves = runBlocks(start).steps.map(stepMovesBlock).join(" ");
      expect(moves, c.id).toBe(c.algs[0]);
      seen.add(nextBlock(start)?.caseId ?? "");
    }
    expect(seen.size).toBe(12);
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

  // 시작 모양은 상황 자체로 정하고 공식은 사람마다 다르게 고르므로(docs/47 16-14), 고를 수 있는 모든 공식이 같은 모양을 풀어야 한다
  it("모든 단계·상황·후보·윗면 돌리기에서, 앞에 맞춤을 붙인 공식이 상황의 시작 모양을 목표까지 푼다", () => {
    const fails: string[] = [];
    let checked = 0;
    for (const stage of PRACTICE_STAGES)
      for (const c of stage.cases)
        for (const alg of choicesOf(c))
          for (const turn of stage.auf ? SHAPE_TURNS : [""]) {
            checked++;
            const start = caseStart(stage, c, turn);
            const pre = alignPrefix(stage, c, start, alg);
            if (pre === null) {
              fails.push(`${stage.id} ${c.id} [${turn}] ${alg}`);
              continue;
            }
            const end = applyMoves(n, start, parseMoves(n, `${pre} ${alg}`));
            if (!goalMet(n, end, stage.goal(c)))
              fails.push(`${stage.id} ${c.id} [${turn}] ${pre} ${alg}`);
          }
    expect(fails).toEqual([]);
    expect(checked).toBeGreaterThan(1000);
  });

  it("시작 모양에 아직 목표가 이뤄져 있지 않다(윗면 돌리기와 상관없이 칠 것이 있다)", () => {
    for (const stage of PRACTICE_STAGES)
      for (const c of stage.cases)
        for (const turn of stage.auf ? SHAPE_TURNS : [""])
          expect(
            goalMet(n, caseStart(stage, c, turn), stage.goal(c)),
            `${stage.id} ${c.id} [${turn}]`,
          ).toBe(false);
  });
});
