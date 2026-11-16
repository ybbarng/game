import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import { scramble } from "@game/cube-scramble";
import { describe, expect, it } from "vitest";

import { goalMet } from "./judge";
import type { GoalName } from "./types";
import { solveYau, type YauStageId } from "./yau-solve";

const n = 4;
const play = (alg: string) => applyMoves(n, solvedCube(n), parseMoves(n, alg));

/** 단계가 끝났을 때 맞아 있어야 하는 것(단계 지도 4×4 야우와 같은 목표) */
const GOAL_AFTER: Record<YauStageId, GoalName> = {
  "centers-ud": "yau-ud-centers",
  cross3: "yau-cross3",
  "centers-rest": "yau-centers",
  "last-cross": "yau-cross",
  edges: "edges-paired",
  three: "solved",
};

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

describe("4×4 야우 풀이 함수", () => {
  it.each(SEEDS)(
    "대회 섞기(씨앗 %i)를 야우 차례로 끝까지 맞추고, 단계마다 그 단계 목표가 된다",
    (seed) => {
      const start = play(scramble("444", seed).text);
      const r = solveYau(start);
      expect(r.stages.map((st) => st.id)).toEqual([
        "centers-ud",
        "cross3",
        "centers-rest",
        "last-cross",
        "edges",
        "three",
      ]);
      let s = start;
      for (const st of r.stages) {
        s = applyMoves(n, s, parseMoves(n, st.moves));
        expect(goalMet(n, s, GOAL_AFTER[st.id]), `${seed} ${st.id}`).toBe(true);
      }
      // 이어 붙인 수만 쳐도 맞는다
      expect(
        goalMet(n, applyMoves(n, start, parseMoves(n, r.moves)), "solved"),
      ).toBe(true);
    },
  );

  it("섞기 전에는 단계 목표가 아니다: 흰·노랑 센터 단계는 수를 쳐야 끝난다", () => {
    const start = play(scramble("444", 1).text);
    expect(goalMet(n, start, "yau-ud-centers")).toBe(false);
    expect(solveYau(start).stages[0]?.moves).not.toBe("");
  });

  it("맞춘 큐브는 칠 수가 없다", () => {
    const r = solveYau(solvedCube(n));
    expect(r.moves.replace(/\b[xyz]['2]?\b/g, "").trim()).toBe("");
  });
});
