// 5×5 엣지 열둘의 경우별 정해진 길(big-edges-555.ts): 센터만 맞은 무작위 5×5를 규칙만으로 다 묶는지 엔진으로 본다.
import {
  applyMoves,
  cubeTopology,
  faceColors,
  parseMoves,
  randomCubeState,
  solvedCube,
} from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import {
  nextEdge5,
  runEdges555,
  stepMoves5,
  WING_SWAP_5,
} from "./big-edges-555";
import { playN } from "./big-path";
import { centersSolved, stateForRule, unpairedEdgeLines } from "./judge";
import { EDGE_PAIR_DOWN, EDGE_PAIR_UP, EDGE_SWAP_CASE_5 } from "./lessons-big";
import { setupFor } from "./notation";

const centersOnly = (seed: number) =>
  randomCubeState(5, seed, {
    keep: cubeTopology(5)
      .pieces.map((p, i) => ({ p, i }))
      .filter(({ p }) => p.kind === "center" || p.kind === "innerCenter")
      .map(({ i }) => i),
  });

describe("5×5 엣지 열둘", () => {
  it("센터만 맞은 무작위 30개를 규칙만으로 다 묶고 센터는 그대로, 경우를 모두 만난다", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const r = runEdges555(centersOnly(seed));
      expect(unpairedEdgeLines(5, r.state)).toBe(0);
      expect(centersSolved(5, r.state)).toBe(true);
      for (const st of r.steps) seen.add(st.caseId);
    }
    expect([...seen].sort()).toEqual([
      "drop-down",
      "drop-up",
      "flip",
      "high",
      "low",
      "next-line",
      "store",
      "swap-wings",
      "turn-over",
    ]);
  });

  it("걸음마다 묶인 줄 수가 줄지 않는다(올리기·내리기·Dw·Uw·뒤집기·날개 바꾸기 모두)", () => {
    for (let seed = 31; seed <= 45; seed++) {
      let s = centersOnly(seed);
      for (let guard = 0; guard < 150; guard++) {
        const st = nextEdge5(s);
        if (!st) break;
        const before = 12 - unpairedEdgeLines(5, s);
        s = playN(5, s, stepMoves5(st));
        expect(12 - unpairedEdgeLines(5, s)).toBeGreaterThanOrEqual(before);
        expect(centersSolved(5, s)).toBe(true);
      }
    }
  });

  it("단원 모범 답 = 규칙이 낸 수: Uw 경우 시연, Dw 경우 해 보기, 엇갈림(R U R' → 날개 바꾸기), 마지막 두 엣지 Dw 경우", () => {
    for (const [answer, ids] of [
      [EDGE_PAIR_UP, ["high"]],
      [EDGE_PAIR_DOWN, ["low"]],
      [EDGE_SWAP_CASE_5, ["swap-wings"]],
    ] as const) {
      const s = applyMoves(5, solvedCube(5), parseMoves(5, setupFor(answer)));
      const r = runEdges555(s);
      expect(r.steps.map((x) => x.caseId)).toEqual(ids);
      expect(r.steps.map(stepMoves5).join(" ")).toBe(answer);
      expect(unpairedEdgeLines(5, r.state)).toBe(0);
    }
  });

  it("마지막 두 엣지 연습 상황(5x5-two-edges-left)을 규칙만으로 묶는다", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = runEdges555(stateForRule("5x5-two-edges-left", seed));
      // 바깥 층을 섞어 남은 둘이 위·아래 층에 있기도 하다. 그때는 앞 단원 차례(올리기·내리기)가 그대로 쓰인다
      expect(unpairedEdgeLines(5, r.state)).toBe(0);
      expect(r.steps.length).toBeLessThanOrEqual(12);
    }
  });

  it("날개 바꾸기는 위-앞 엣지의 두 날개만 바꾼다(색이 달라지는 칸은 그 둘뿐, 센터 블럭은 같은 색끼리만 옮겨진다)", () => {
    const s = applyMoves(5, solvedCube(5), parseMoves(5, WING_SWAP_5));
    const topo = cubeTopology(5);
    const col = faceColors(5, s);
    const want = faceColors(5, solvedCube(5));
    const changed = topo.pieces
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.stickers.some((st) => col[st] !== want[st]));
    expect(changed.map(({ p }) => p.kind)).toEqual(["wing", "wing"]);
  });
});
