import { type SolveMethod, solveHuman } from "@game/cube-ai";
import {
  applyMove,
  type CubeMove,
  faceColors,
  flowScore,
  isRotation,
  isSolved,
  parseMoves,
  randomCubeState,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { EMPTY_COMBO, longestCombo, pushCombo } from "./combo";

/**
 * 실제 풀이를 따라 칠 때 흐름 콤보가 끊기지 않는가(docs/47 8-8). 컴퓨터의 사람 해법(`solveHuman`, 대결 컴퓨터가 두는
 * 수 차례 그대로)을 0.3초 간격으로 넣는다. 해법 글에는 공식을 이어 붙이다 생긴 서로 지우는 수(U′ U, U′ y U)가 있어
 * 사람처럼 먼저 지운다(그런 수는 「되돌리는 수」라 일부러 끊는다).
 */

const sameColors = (n: number, a: PuzzleState, b: PuzzleState) => {
  const x = faceColors(n, a);
  const y = faceColors(n, b);
  return x.every((c, i) => y[i] === c);
};

/** 서로 지우는 수를 지운다: 되돌리는 수가 오면 그 앞 면 돌리기를 (큐브 돌리기는 남기고) 같은 상태가 될 때까지 지운다 */
function cancelUndos(
  n: number,
  start: PuzzleState,
  moves: readonly CubeMove[],
): CubeMove[] {
  const out: CubeMove[] = [];
  let c = EMPTY_COMBO;
  const stateOf = (list: readonly CubeMove[]) =>
    list.reduce((s, mv) => applyMove(n, s, mv), start);
  for (const mv of moves) {
    const next = pushCombo(c, n, mv, 0);
    if (isRotation(n, mv) || next.combo !== 0) {
      out.push(mv);
      c = next;
      continue;
    }
    const want = stateOf([...out, mv]);
    let cut = [...out];
    for (let k = 0; k < 3; k++) {
      const i = cut.findLastIndex((x) => !isRotation(n, x));
      cut = [...cut.slice(0, i), ...cut.slice(i + 1)];
      if (sameColors(n, stateOf(cut), want)) break;
    }
    expect(sameColors(n, stateOf(cut), want)).toBe(true);
    out.length = 0;
    out.push(...cut);
    c = out.reduce((s, x) => pushCombo(s, n, x, 0), EMPTY_COMBO);
  }
  return out;
}

function playSolve(n: number, start: PuzzleState, moves: readonly CubeMove[]) {
  let state = start;
  const steps = moves.map((move, i) => {
    state = applyMove(n, state, move);
    return { move, at: i * 300, progress: flowScore(n, state) };
  });
  expect(isSolved(n, state)).toBe(true);
  return {
    longest: longestCombo(n, steps),
    turns: moves.filter((mv) => !isRotation(n, mv)).length,
  };
}

/** 크기·해법·섞기 씨앗마다 「처음부터 끝까지 한 콤보」를 확인하는 시험을 둔다(시험 파일이 부른다) */
export function expectUnbrokenSolves(
  cases: readonly [number, SolveMethod, readonly number[]][],
): void {
  describe("실제 풀이로는 끊기지 않는다", () => {
    for (const [n, method, seeds] of cases)
      it(`${n}×${n} ${method}: 섞기 ${seeds.length}개를 처음부터 끝까지 한 콤보로`, () => {
        for (const seed of seeds) {
          const start = randomCubeState(n, seed);
          const solve = solveHuman(method, n, start);
          const moves = cancelUndos(
            n,
            start,
            solve.moves.flatMap((s) => parseMoves(n, s)),
          );
          const r = playSolve(n, start, moves);
          expect(r.longest, `씨앗 ${seed}`).toBe(r.turns);
        }
      });
  });
}
