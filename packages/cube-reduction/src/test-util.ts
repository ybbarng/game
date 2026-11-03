/** 시험에서만 쓰는 도구: 해를 단계마다 끊어 돌리고, 그 순간의 조각 상태를 본다 */
import {
  applyMoves,
  faceColors,
  isSolved,
  parseMoves,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { faceOfSticker, reductionGeometry, slotPaired } from "./geometry";
import type { ReductionSolution, ReductionStageId } from "./solve";
import { threeParity, toThreeFacelets } from "./three";

const IDENTITY = [0, 1, 2, 3, 4, 5];

/** 면 f의 가운데가 모두 그 면 색인가(무작위 상태는 큐브 방향이 기본 그대로) */
export function centersSolvedOn(
  n: number,
  colors: Uint8Array,
  faces: readonly number[],
): boolean {
  const g = reductionGeometry(n);
  return g.centers.every((p) => {
    const f = faceOfSticker(n, p);
    return !faces.includes(f) || colors[p] === f;
  });
}

export function pairedSlots(n: number, colors: Uint8Array): number {
  return reductionGeometry(n).slots.filter((s) =>
    slotPaired(s, (p) => colors[p] as number),
  ).length;
}

/** 해의 앞에서부터 `count`수를 돌린 상태 */
export function after(
  n: number,
  state: PuzzleState,
  sol: ReductionSolution,
  count: number,
): PuzzleState {
  const list = parseMoves(n, sol.moves).slice(0, count);
  return applyMoves(n, state, list);
}

/** 단계가 끝난 순간마다 그 단계가 맞춰야 할 조각이 맞아 있는지 확인한다 */
export function checkStages(
  n: number,
  state: PuzzleState,
  sol: ReductionSolution,
): void {
  const total = parseMoves(n, sol.moves).length;
  let prev = 0;
  for (const stage of sol.stages) {
    if (stage.from !== prev || stage.to < stage.from) {
      throw new Error(`단계 범위가 이어지지 않는다: ${stage.id}`);
    }
    prev = stage.to;
    const s = after(n, state, sol, stage.to);
    const colors = faceColors(n, s);
    const ok: Record<ReductionStageId, () => boolean> = {
      "centers-ud": () => centersSolvedOn(n, colors, [0, 3]),
      "centers-rest": () => centersSolvedOn(n, colors, IDENTITY),
      edges: () =>
        centersSolvedOn(n, colors, IDENTITY) && pairedSlots(n, colors) >= 10,
      "last-edges": () =>
        centersSolvedOn(n, colors, IDENTITY) && pairedSlots(n, colors) === 12,
      "oll-parity": () =>
        pairedSlots(n, colors) === 12 &&
        !threeParity(toThreeFacelets(n, colors, IDENTITY)).oll,
      "pll-parity": () => {
        const p = threeParity(toThreeFacelets(n, colors, IDENTITY));
        return pairedSlots(n, colors) === 12 && !p.oll && !p.pll;
      },
      three: () => isSolved(n, s),
    };
    if (!ok[stage.id]())
      throw new Error(`단계가 끝났는데 맞지 않았다: ${stage.id}`);
  }
  if (prev !== total) throw new Error("마지막 단계가 해 끝에 닿지 않는다");
}
