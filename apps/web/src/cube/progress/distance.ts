// 완성까지 거리(docs/51 1-2). 진행 막대로는 쓰지 않는다(사람 풀이 동안 18~20수에 오래 머문다). 결과 상자의
// 「이 섞기의 가장 짧은 풀이」와 맞추는 중의 「완성까지 k수」(8수 안쪽일 때만)에 쓴다. 워커에서 부른다(`worker/jobs.ts`).
import { toFacelets } from "@game/cube-ai";
import { distance2x2, solve3x3 } from "@game/cube-solver";
import type { PuzzleState } from "@game/puzzle-core";

/** 「완성까지 k수」를 보이는 가장 먼 거리 */
export const NEAR_LIMIT = 8;

/**
 * 맞춘 상태까지의 가장 짧은 수(HTM, 면 돌리기만 센다). `max`보다 멀면 null. 2×2·3×3만(그 밖은 null).
 *
 * 3×3: 2단계 해법은 상한(`maxLength`) 안에 해가 있으면 반드시 하나를 찾는다(마지막 2단계 밖 수까지가 1단계,
 * 그 뒤는 2단계 수뿐이라 탐색이 그 해를 지난다). 그래서 상한을 0부터 하나씩 올려 처음 찾은 길이가 가장 짧은 수다.
 * 8수 안쪽은 상한마다 1ms 안쪽이다(2026-11-05 이 맥에서 잼, 섞기 3~24수).
 */
export function distanceToSolved(
  n: number,
  state: PuzzleState,
  max: number,
): number | null {
  if (n === 2) {
    const d = distance2x2(toFacelets(2, state));
    return d <= max ? d : null;
  }
  if (n !== 3) return null;
  const facelets = toFacelets(3, state);
  for (let limit = 0; limit <= max; limit++) {
    try {
      const s = solve3x3(facelets, { maxLength: limit });
      return s === "" ? 0 : s.split(" ").length;
    } catch {
      // 이 상한 안에는 해가 없다
    }
  }
  return null;
}

export interface ShortSolution {
  /** 수(HTM) */
  moves: number;
  /** 가장 짧은 것이 확실한가(2×2는 정확, 3×3은 2단계 해법의 첫 해라 몇 수 길 수 있다) */
  exact: boolean;
}

/** 3×3에서 가장 짧은 수를 끝까지 찾아보는 거리(넘으면 2단계 해법의 첫 해를 쓴다) */
export const EXACT_LIMIT_333 = 12;

/**
 * 이 섞기의 짧은 풀이(결과 상자). 2×2는 정확한 값. 3×3은 12수 안쪽이면 정확한 값, 그보다 멀면(대회 섞기는
 * 거의 늘 그렇다) 2단계 해법이 처음 찾은 해의 길이다
 */
export function shortSolution(
  n: number,
  state: PuzzleState,
): ShortSolution | null {
  if (n === 2) return { moves: distance2x2(toFacelets(2, state)), exact: true };
  if (n !== 3) return null;
  const near = distanceToSolved(3, state, EXACT_LIMIT_333);
  if (near !== null) return { moves: near, exact: true };
  const s = solve3x3(toFacelets(3, state));
  return { moves: s === "" ? 0 : s.split(" ").length, exact: false };
}
