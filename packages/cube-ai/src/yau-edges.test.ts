import { applyMoves, faceColors, parseMoves } from "@game/cube-engine";
import { reductionGeometry, slotPaired } from "@game/cube-reduction";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";
import { scrambledState } from "./scramble-test-util";
import { type YauSideHold, yauReduce } from "./yau";
import { yauEdgesShort } from "./yau-edges";

/** 4×4 컴퓨터 야우의 짧은 엣지 짝(docs/47 10-5): 십자와 센터를 지키며 엣지 열둘을 모두 짝짓는다 */

const g = reductionGeometry(4);
const D_FACE = 3;
const crossSlots = g.slots.filter((s) => s.faces.includes(D_FACE));

/** 섞기에 단원 규칙의 앞 네 단계(센터 둘 → 십자 셋 → 옆 센터 → 마지막 십자 엣지)를 둔 상태와 단원 규칙 엣지 짝 수 */
function beforeEdges(
  seed: number,
  hold: YauSideHold = "orange",
): { state: PuzzleState; taught: number } {
  const start = scrambledState("444", seed);
  const { stages } = yauReduce(start, undefined, "taught", hold);
  const front = stages
    .slice(0, 4)
    .map((st) => st.moves)
    .filter(Boolean)
    .join(" ");
  return {
    state: applyMoves(4, start, parseMoves(4, front)),
    taught: stages[4]?.moves.split(" ").filter(Boolean).length ?? 0,
  };
}

const play = (s: PuzzleState, steps: readonly string[]) =>
  faceColors(4, applyMoves(4, s, parseMoves(4, steps.join(" "))));

/** 제자리에 든 십자 자리 수(두 날개가 그 자리 두 면의 센터 색) */
function placedCross(c: Uint8Array): number {
  const center = (p: number) => c[Math.floor(p / 16) * 16 + 5];
  return crossSlots.filter((s) =>
    s.pieces.every(([p, q]) => c[p] === center(p) && c[q] === center(q)),
  ).length;
}

describe("짧은 엣지 짝", () => {
  it.each([1, 2, 3])(
    "섞기(씨앗 %i)의 엣지를 모두 짝짓고, 십자 넷과 센터는 그대로다",
    (seed) => {
      const { state, taught } = beforeEdges(seed);
      const before = faceColors(4, state);
      expect(placedCross(before)).toBe(4);
      const steps = yauEdgesShort(state);
      const after = play(state, steps);
      expect(
        g.slots.filter((s) => !slotPaired(s, (p) => after[p] as number)),
      ).toEqual([]);
      const changed = [
        ...crossSlots.flatMap((s) => s.stickers),
        ...g.centers,
      ].filter((p) => after[p] !== before[p]);
      expect(changed).toEqual([]);
      // 단원 규칙(한 줄씩 묶기)보다 짧다
      const moves = steps.join(" ").split(" ").length;
      expect(moves).toBeLessThan(taught);
    },
  );

  it("계획 표 5의 옛 쥐기가 십자 엣지 하나를 빼냈으면(씨앗 1134) 남은 십자 셋을 지키고 나머지를 모두 짝짓는다", () => {
    const { state } = beforeEdges(1134, "shortest");
    const before = faceColors(4, state);
    expect(placedCross(before)).toBe(3);
    const after = play(state, yauEdgesShort(state));
    expect(
      g.slots.filter((s) => !slotPaired(s, (p) => after[p] as number)),
    ).toEqual([]);
    expect(placedCross(after)).toBe(3);
    expect(g.centers.filter((p) => after[p] !== before[p])).toEqual([]);
  });
});
