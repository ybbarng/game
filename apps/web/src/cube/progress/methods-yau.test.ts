// 4×4 「야우」를 고르면 칩·구간·이론 최고가 야우 단계를 따른다(docs/47 8-8 「내 해법」). 섞기를 야우 풀이 함수
// (배우기 단원의 경우별 길)로 한 수씩 풀며 이정표가 그 단계 안에서 차례로 처음 켜지는지 본다.
import {
  applyMoves,
  type MilestoneId,
  milestonesOf,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import { scramble } from "@game/cube-scramble";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { solveYau, type YauStageId } from "../learn/yau-solve";
import { formatSplits, type SolveRecord, type Split } from "../records";
import { methodPath, methodSplits, methodsFor, theoryBest } from "./methods";

const n = 4;

/** 이정표가 처음 켜져야 하는 야우 단계(단계 지도 4×4 야우 차례) */
const STAGE_OF: Record<string, YauStageId> = {
  centers2: "centers-ud",
  cross3: "cross3",
  centers: "centers-rest",
  cross: "last-cross",
  edges: "edges",
  layer2: "three",
  oll: "three",
  ll: "three",
};

interface Lit {
  /** 처음 켜진 수 번호(1부터) */
  move: number;
  stage: YauStageId;
}

/** 야우 풀이를 한 수씩 두며 이정표마다 처음 켜진 수와 그때의 단계 */
function playYau(start: PuzzleState): Map<string, Lit> {
  const lit = new Map<string, Lit>();
  let s = start;
  let k = 0;
  for (const st of solveYau(start).stages)
    for (const m of parseMoves(n, st.moves)) {
      s = applyMoves(n, s, [m]);
      k++;
      for (const id of milestonesOf(n, s))
        if (!lit.has(id)) lit.set(id, { move: k, stage: st.id });
    }
  return lit;
}

/** 수 하나에 1초씩 걸린 판의 구간 기록 */
const splitsOf = (lit: Map<string, Lit>): Split[] =>
  [...lit].map(([id, l]) => ({ id, ms: l.move * 1000 }));

const SEEDS = [1, 2, 3, 4];
const start = (seed: number) =>
  applyMoves(n, solvedCube(n), parseMoves(n, scramble("444", seed).text));

describe("4×4 야우 고르기", () => {
  it("4×4에서만 고를 수 있다", () => {
    expect(methodsFor(4)).toContain("yau");
    expect(methodsFor(3)).not.toContain("yau");
    expect(methodsFor(5)).not.toContain("yau");
    expect(methodPath(5, "yau")).toBeNull();
  });

  it.each(SEEDS)(
    "섞기(씨앗 %i)를 야우로 풀면 야우 단계가 그 단계 안에서 차례로 처음 켜진다",
    (seed) => {
      const lit = playYau(start(seed));
      const path = methodPath(n, "yau") as readonly MilestoneId[];
      for (const id of path)
        expect(lit.get(id)?.stage, `${seed} ${id}`).toBe(STAGE_OF[id]);
      // 단계마다 다른 수에 켜져(같은 순간에 묶이지 않아) 칩이 단계마다 하나씩 생긴다
      const moves = path.map((id) => lit.get(id)?.move as number);
      expect(moves).toEqual([...moves].sort((a, b) => a - b));
      expect(new Set(moves).size).toBe(path.length);
      expect(methodSplits(n, "yau", splitsOf(lit)).map((s) => s.id)).toEqual(
        path,
      );
    },
  );

  it("야우로 푼 판들의 이론 최고는 단계마다 가장 짧은 구간을 더한 값이다", () => {
    const records: SolveRecord[] = SEEDS.map((seed) => {
      const splits = splitsOf(playYau(start(seed)));
      return {
        at: seed,
        n,
        mode: "solo",
        ms: Math.max(...splits.map((s) => s.ms)),
        penalty: 0,
        moves: 0,
        scramble: scramble("444", seed).text,
        splits: formatSplits(splits),
      };
    });
    const t = theoryBest(n, "yau", records);
    expect(t?.parts.map((p) => p.key)).toEqual([
      "start>centers2",
      "centers2>cross3",
      "cross3>centers",
      "centers>cross",
      "cross>edges",
      "edges>layer2",
      "layer2>oll",
      "oll>ll",
    ]);
    expect(t?.parts.every((p) => p.ms !== null)).toBe(true);
    expect(t?.total).toBe(
      t?.parts.reduce((sum, p) => sum + (p.ms as number), 0),
    );
  });
});
