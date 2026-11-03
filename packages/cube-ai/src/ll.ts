import { FACES } from "@game/cube-solver";
import { type Solve, uTurn } from "./solve";

/**
 * 윗층 판정과 공식 고르기. 사람은 모양을 보고 공식을 떠올리지만, 여기서는
 * "U를 몇 번 돌린 뒤 이 공식을 두면 목표가 되나"를 공식 표 차례대로 해 본다(결과는 같다).
 */

/** 아래 면과 옆면 아래쪽(윗줄을 뺀 줄)이 다 맞았나(n×n, 기준 방향) */
export function lowerSolved(rel: string, n: number): boolean {
  const nn = n * n;
  for (let i = 0; i < nn; i++) if (rel[3 * nn + i] !== "D") return false;
  for (const face of [1, 2, 4, 5]) {
    const letter = FACES[face];
    for (let i = n; i < nn; i++)
      if (rel[face * nn + i] !== letter) return false;
  }
  return true;
}

/** 윗면이 다 U색인가 */
export function topOriented(rel: string, n: number): boolean {
  for (let i = 0; i < n * n; i++) if (rel[i] !== "U") return false;
  return true;
}

/** 위 모서리 넷이 U색을 위로 하고 있나(3×3) */
export function topEdgesOriented(rel: string): boolean {
  return rel[1] === "U" && rel[3] === "U" && rel[5] === "U" && rel[7] === "U";
}

/** 옆면 네 개 모두 윗줄 양 끝 꼭짓점 색이 같은가(위 꼭짓점끼리 자리가 맞음) */
export function topCornersPermuted(rel: string, n: number): boolean {
  const nn = n * n;
  for (const face of [1, 2, 4, 5]) {
    if (rel[face * nn] !== rel[face * nn + n - 1]) return false;
  }
  return true;
}

export type Goal = (s: Solve) => boolean;

export interface AlgMatch {
  /** 공식 앞 U 돌리기 횟수 */
  pre: number;
  /** 공식 번호(-1이면 공식 없이 이미 목표) */
  alg: number;
  /** 공식 뒤 U 돌리기 횟수(postAuf일 때만) */
  post: number;
}

function reached(s: Solve, goal: Goal, postAuf: boolean): number {
  if (!postAuf) return goal(s) ? 0 : -1;
  for (let b = 0; b < 4; b++) {
    const t = b === 0 ? s : s.clone().apply(uTurn(b));
    if (goal(t)) return b;
  }
  return -1;
}

/** 목표에 닿는 (U 몇 번, 공식, U 몇 번)을 찾는다. 없으면 null */
export function matchAlg(
  s: Solve,
  algs: readonly string[],
  goal: Goal,
  postAuf = false,
): AlgMatch | null {
  const already = reached(s, goal, postAuf);
  if (already >= 0) return { pre: 0, alg: -1, post: already };
  for (let pre = 0; pre < 4; pre++) {
    const base = s.clone().apply(uTurn(pre));
    for (let i = 0; i < algs.length; i++) {
      const t = base.clone().apply(algs[i] as string);
      const post = reached(t, goal, postAuf);
      if (post >= 0) return { pre, alg: i, post };
    }
  }
  return null;
}

/** 목표에 닿는 공식을 찾아 실제로 둔다. 못 찾으면 오류 */
export function applyMatch(
  s: Solve,
  algs: readonly string[],
  goal: Goal,
  postAuf = false,
): AlgMatch {
  const m = matchAlg(s, algs, goal, postAuf);
  if (!m) throw new Error("맞는 공식을 찾지 못했다");
  if (m.alg >= 0) s.apply(uTurn(m.pre)).apply(algs[m.alg] as string);
  s.apply(uTurn(m.post));
  return m;
}
