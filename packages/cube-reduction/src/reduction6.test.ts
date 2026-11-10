import {
  applyMoves,
  isSolved,
  parseMoves,
  randomCubeState,
} from "@game/cube-engine";
import { describe, expect, test } from "vitest";
import { wingParity } from "./geometry";
import { edgeParityMacros, ollParityText, pllParityText } from "./macros";
import { applyMovesColors, moves } from "./sim";
import { solveReductionState } from "./solve";
import { centersSolvedOn, checkStages, pairedSlots } from "./test-util";
import { threeParity, toThreeFacelets } from "./three";

/**
 * 6×6: 가운데 조각 묶음이 넷, 날개 묶음이 둘(모서리 끝에서 1·2칸). 씨앗 2는 OLL·PLL 패리티가 모두 나온다.
 * 한 판에 1초 안팎이라 씨앗은 하나만 둔다(더 많은 씨앗은 손으로 돌려 보았다: 씨앗 1~12 모두 풀림).
 */
const n = 6;
const IDENTITY = [0, 1, 2, 3, 4, 5];

function solvedColors(): Uint8Array {
  return new Uint8Array(6 * n * n).map((_, i) => Math.floor(i / (n * n)));
}

describe("6×6 무작위 상태", () => {
  const state = randomCubeState(n, 2);
  const sol = solveReductionState(n, state);

  test("풀리고, 단계가 끝날 때마다 그 단계의 조각이 맞아 있다", () => {
    expect(isSolved(n, applyMoves(n, state, parseMoves(n, sol.moves)))).toBe(
      true,
    );
    expect(sol.stages.map((s) => s.id)).toEqual([
      "centers-ud",
      "centers-rest",
      "edges",
      "last-edges",
      "oll-parity",
      "pll-parity",
      "three",
    ]);
    checkStages(n, state, sol);
  });
});

describe("6×6 패리티 공식", () => {
  test("OLL 패리티는 안쪽 층 묶음 전부를 돌려 짝 지은 모서리 하나만 뒤집는다", () => {
    expect(ollParityText(4)).toBe(
      "2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2",
    );
    const c = applyMovesColors(n, solvedColors(), moves(n, ollParityText(n)));
    expect(centersSolvedOn(n, c, IDENTITY)).toBe(true);
    expect(pairedSlots(n, c)).toBe(12);
    const p = threeParity(toThreeFacelets(n, c, IDENTITY));
    expect(p.oll).toBe(true);
  });

  test("PLL 패리티는 짝 지은 모서리 둘만 맞바꾼다", () => {
    expect(pllParityText(4)).toBe("2R2 U2 2R2 Uw2 2R2 2U2");
    const c = applyMovesColors(n, solvedColors(), moves(n, pllParityText(n)));
    expect(centersSolvedOn(n, c, IDENTITY)).toBe(true);
    expect(pairedSlots(n, c)).toBe(12);
    const p = threeParity(toThreeFacelets(n, c, IDENTITY));
    expect(p).toEqual({ oll: false, pll: true });
  });

  test("날개 묶음 하나의 패리티 공식은 그 묶음의 홀짝만 바꾸고 가운데는 그대로 둔다", () => {
    for (const depth of [1, 2]) {
      const [macro] = edgeParityMacros(n, depth);
      if (!macro) throw new Error("공식이 없다");
      expect(macro.centersKeepFace).toBe(true);
      const c = applyMovesColors(n, solvedColors(), macro.moves);
      expect(wingParity(n, c, depth)).toBe(1);
      expect(wingParity(n, c, 3 - depth)).toBe(0);
    }
  });
});
