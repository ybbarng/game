// 맞추는 도중의 큐브가 내 목록의 상황에 이르렀나(혼자 맞추기 「상황 알림」, docs/47 8-1 2026-11-04).
// F2L이 끝난 3×3에서 윗면 상황(OLL·PLL·2단계)만 본다. 큐브를 흰 면이 아래로 오게 쥔 네 방향마다
// 그 상황의 대표 공식을 해 보고, 검사기와 같은 목표(앞 윗면 돌리기는 봐줌)가 되면 그 상황이다.
// 판정은 검사기(check.ts)의 상황 역할을 그대로 쓴다.
import {
  applyMoves,
  type CubeMove,
  faceColors,
  OPPOSITE_FACE,
  parseMoves,
  U,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { goalMet } from "../learn/judge";
import type { AlgCase, AlgSet } from "../learn/types";
import { aufBefore, solvesFrom } from "./check";

/** 알림에서 보는 묶음(F2L 뒤 윗면 상황) */
export const SPOT_SETS: ReadonlySet<AlgSet> = new Set([
  "oll",
  "pll",
  "2look-oll",
  "2look-pll",
]);

const ORIENTS = ["", "x", "x2", "x'", "z", "z'"].flatMap((a) =>
  ["", "y", "y2", "y'"].map((b) => `${a} ${b}`.trim()),
);

const rotCache = new Map<string, CubeMove[]>();
const movesCache = new Map<string, CubeMove[]>();
const cached = (map: Map<string, CubeMove[]>, text: string) => {
  let m = map.get(text);
  if (!m) {
    m = parseMoves(3, text);
    map.set(text, m);
  }
  return m;
};

/** 흰 센터가 아래(D)에 오게 쥔 방향들(3×3, 넷). `rot`은 지금 쥔 큐브에서 그 방향으로 가는 큐브 돌리기 */
function whiteDownHolds(s: PuzzleState): { rot: string; state: PuzzleState }[] {
  const down = OPPOSITE_FACE[U as 0] as number;
  const out: { rot: string; state: PuzzleState }[] = [];
  for (const r of ORIENTS) {
    const t = r ? applyMoves(3, s, cached(rotCache, r)) : s;
    if (faceColors(3, t)[down * 9 + 4] === U) out.push({ rot: r, state: t });
  }
  return out;
}

/**
 * 3×3 큐브가 `cases` 중 어느 상황인가(첫 번째). F2L이 끝나지 않았거나 목록 밖이면 null.
 * `cases`는 SPOT_SETS 묶음만 본다
 */
export function spotCase(
  n: number,
  state: PuzzleState,
  cases: readonly AlgCase[],
): AlgCase | null {
  if (n !== 3) return null;
  const list = cases.filter((c) => SPOT_SETS.has(c.set));
  if (list.length === 0) return null;
  if (!goalMet(3, state, "f2l")) return null;
  const holds = whiteDownHolds(state);
  for (const c of list) {
    const moves = cached(movesCache, c.algs[0] as string);
    if (holds.some((t) => solvesFrom(c, moves, t.state))) return c;
  }
  return null;
}

/** 알아본 상황과 쥐는 법: 큐브 돌리기(`rot`, 예 "y2"), 공식 앞 윗면 돌리기(`pre`, 예 "U'") */
export interface SpottedHold {
  c: AlgCase;
  rot: string;
  pre: string;
}

/**
 * `spotCase`처럼 상황을 찾되 쥐는 법까지 돌려준다(Cubie 「공식 보기」). 상황마다 돌리기가 적은 쥐기부터 본다
 */
export function spotHold(
  state: PuzzleState,
  cases: readonly AlgCase[],
): SpottedHold | null {
  const list = cases.filter((c) => SPOT_SETS.has(c.set));
  if (list.length === 0 || !goalMet(3, state, "f2l")) return null;
  const holds = whiteDownHolds(state);
  for (const c of list) {
    const moves = cached(movesCache, c.algs[0] as string);
    for (const h of holds) {
      const pre = aufBefore(c, moves, h.state);
      if (pre !== null) return { c, rot: h.rot, pre };
    }
  }
  return null;
}
