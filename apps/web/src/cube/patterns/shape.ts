import {
  applyMoves,
  cubeTopology,
  faceColors,
  isSolved,
  OPPOSITE_FACE,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

/**
 * 패턴 모양 판정(`/cube/patterns`). 두 가지를 둔다.
 * - 같은 모양인가(`samePattern`): 「직접 만들어 보기」 채점. 큐브 전체 방향이 달라도 색 배치가 같으면 통과.
 * - 이름대로의 모양인가(`isCheckerboard` 등): 공식 자료가 맞는지 단위 시험으로 확인할 때 쓴다.
 *
 * 색은 면 번호(U R F D L B = 0~5), 칸 차례는 엔진과 같다(면마다 줄 위→아래, 칸 왼→오른).
 */

/** 맞춘 큐브에서 공식을 한 결과 */
export function patternState(n: number, alg: string): PuzzleState {
  return applyMoves(n, solvedCube(n), parseMoves(n, alg));
}

/** 큐브 전체 돌리기 24가지(위로 올 면 6 × y 4) */
const ROTATIONS: readonly string[] = ["", "x", "x2", "x'", "z", "z'"].flatMap(
  (up) => ["", "y", "y2", "y'"].map((y) => `${up} ${y}`.trim()),
);

/** 색 배치가 같은가. 큐브를 통째로 돌린 차이는 같다고 본다 */
export function samePattern(
  n: number,
  state: PuzzleState,
  target: PuzzleState,
): boolean {
  const want = faceColors(n, target);
  for (const r of ROTATIONS) {
    const got = faceColors(
      n,
      r ? applyMoves(n, state, parseMoves(n, r)) : state,
    );
    let same = true;
    for (let i = 0; i < want.length; i++) {
      if (got[i] !== want[i]) {
        same = false;
        break;
      }
    }
    if (same) return true;
  }
  return false;
}

/** 공식을 몇 번 되풀이하면 다시 맞춰지나(상한까지 안 되면 null) */
export function repeatOrder(n: number, alg: string, limit = 12): number | null {
  const moves = parseMoves(n, alg);
  let s = applyMoves(n, solvedCube(n), moves);
  for (let k = 1; k <= limit; k++) {
    if (isSolved(n, s)) return k;
    s = applyMoves(n, s, moves);
  }
  return null;
}

// ---------- 이름대로의 모양인가(시험용 성질) ----------

type Grid = (f: number, r: number, c: number) => number;

function grid(n: number, state: PuzzleState): Grid {
  const colors = faceColors(n, state);
  return (f, r, c) => colors[f * n * n + r * n + c] as number;
}

/** 면 칸을 무리로 나눠, 무리마다 한 색이고 무리끼리 색이 다른가 */
function faceSplits(
  n: number,
  g: Grid,
  f: number,
  groupOf: (r: number, c: number) => number,
): number[] | null {
  const colors: number[] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const k = groupOf(r, c);
      const color = g(f, r, c);
      if (colors[k] === undefined) colors[k] = color;
      else if (colors[k] !== color) return null;
    }
  if (new Set(colors).size !== colors.length) return null;
  return colors;
}

/** 체커보드: 면마다 맞은편 두 색이 한 칸씩 엇갈린다 */
export function isCheckerboard(n: number, state: PuzzleState): boolean {
  const g = grid(n, state);
  for (let f = 0; f < 6; f++) {
    const c = faceSplits(n, g, f, (r, k) => (r + k) % 2);
    if (!c || OPPOSITE_FACE[c[0] as number] !== c[1]) return false;
  }
  return true;
}

const onEdge = (n: number, r: number, c: number) =>
  r === 0 || c === 0 || r === n - 1 || c === n - 1;
const isCorner = (n: number, r: number, c: number) =>
  (r === 0 || r === n - 1) && (c === 0 || c === n - 1);

/**
 * 테두리 모서리만 맞은편 색(꼭짓점·가운데는 제 면 색). 3×3에서는 체커보드와 같다
 */
export function isEdgeSwap(n: number, state: PuzzleState): boolean {
  const g = grid(n, state);
  for (let f = 0; f < 6; f++)
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        const edge = onEdge(n, r, c) && !isCorner(n, r, c);
        if (g(f, r, c) !== (edge ? OPPOSITE_FACE[f] : f)) return false;
      }
  return true;
}

/** 점: 면의 안쪽 (n-2)×(n-2)만 다른 색이고 테두리는 한 색. `faces`에 든 면만 보고 나머지 면은 다 한 색 */
export function isSpots(
  n: number,
  state: PuzzleState,
  faces: readonly number[] = [0, 1, 2, 3, 4, 5],
): boolean {
  const g = grid(n, state);
  for (let f = 0; f < 6; f++) {
    const c = faces.includes(f)
      ? faceSplits(n, g, f, (r, k) => (onEdge(n, r, k) ? 0 : 1))
      : faceSplits(n, g, f, () => 0);
    if (!c) return false;
  }
  return true;
}

/** 십자: 꼭짓점 네 칸이 한 색, 나머지(십자)가 다른 한 색 */
export function isCross(n: number, state: PuzzleState): boolean {
  const g = grid(n, state);
  for (let f = 0; f < 6; f++)
    if (!faceSplits(n, g, f, (r, c) => (isCorner(n, r, c) ? 1 : 0)))
      return false;
  return true;
}

/**
 * 면마다 한 꼭짓점에서 잰 거리(체스 왕 걸음)로 칸을 나눠, `bands`의 구간마다 한 색이고 구간끼리 다른가.
 * 큐브 속 큐브는 [0..n-2]·[n-1], 큐브 속 큐브 속 큐브는 [0]·[1..n-2]·[n-1]
 */
function nestedFromCorner(
  n: number,
  state: PuzzleState,
  bandOf: (d: number) => number,
): boolean {
  const g = grid(n, state);
  for (let f = 0; f < 6; f++) {
    let ok = false;
    for (const [r0, c0] of [
      [0, 0],
      [0, n - 1],
      [n - 1, 0],
      [n - 1, n - 1],
    ] as const) {
      const split = faceSplits(n, g, f, (r, c) =>
        bandOf(Math.max(Math.abs(r - r0), Math.abs(c - c0))),
      );
      if (split) {
        ok = true;
        break;
      }
    }
    if (!ok) return false;
  }
  return true;
}

/** 큐브 속 큐브: 면마다 한 꼭짓점 쪽 (n-1)×(n-1)이 한 색, 나머지 ㄱ자가 다른 한 색 */
export function isCubeInCube(n: number, state: PuzzleState): boolean {
  return nestedFromCorner(n, state, (d) => (d <= n - 2 ? 0 : 1));
}

/** 큐브 속 큐브 속 큐브: 꼭짓점 한 칸, 그 둘레 (n-1)×(n-1), 바깥 ㄱ자가 서로 다른 색 */
export function isCubeInCubeInCube(n: number, state: PuzzleState): boolean {
  if (n < 3) return false;
  return nestedFromCorner(n, state, (d) => (d === 0 ? 0 : d <= n - 2 ? 1 : 2));
}

/** 슈퍼플립(3×3): 모든 조각이 제자리이고, 엣지만 모두 뒤집혀 있다 */
export function isSuperflip(state: PuzzleState): boolean {
  const n = 3;
  const topo = cubeTopology(n);
  const colors = faceColors(n, state);
  for (const piece of topo.pieces) {
    const ids = piece.stickers;
    if (piece.kind === "edge") {
      const [a, b] = ids as [number, number];
      const fa = topo.stickers[a]?.face;
      const fb = topo.stickers[b]?.face;
      if (colors[a] !== fb || colors[b] !== fa) return false;
    } else {
      for (const i of ids)
        if (colors[i] !== topo.stickers[i]?.face) return false;
    }
  }
  return true;
}

/** 2×2·3×3: 위·아래는 한 색, 옆 네 면은 세로 두 줄(왼쪽·오른쪽 반이 다른 색) */
export function isSideStripes(n: number, state: PuzzleState): boolean {
  const g = grid(n, state);
  const half = (_r: number, c: number) => (c < n / 2 ? 0 : 1);
  for (const f of [0, 3]) if (!faceSplits(n, g, f, () => 0)) return false;
  for (const f of [1, 2, 4, 5]) if (!faceSplits(n, g, f, half)) return false;
  return true;
}

/** 기둥: 위·아래는 맞은편 색 체커보드, 옆 네 면은 세로 줄이 한 줄씩 엇갈린다 */
export function isPillars(n: number, state: PuzzleState): boolean {
  const g = grid(n, state);
  for (const f of [0, 3]) {
    const c = faceSplits(n, g, f, (r, k) => (r + k) % 2);
    if (!c || OPPOSITE_FACE[c[0] as number] !== c[1]) return false;
  }
  for (const f of [1, 2, 4, 5])
    if (!faceSplits(n, g, f, (_r, c) => c % 2)) return false;
  return true;
}

/** 세 줄 무늬: 위·아래는 한 색, 옆 네 면은 세로 줄마다 다른 색 */
export function isColumnStripes(n: number, state: PuzzleState): boolean {
  const g = grid(n, state);
  for (const f of [0, 3]) if (!faceSplits(n, g, f, () => 0)) return false;
  for (const f of [1, 2, 4, 5])
    if (!faceSplits(n, g, f, (_r, c) => c)) return false;
  return true;
}

/** 2×2: 모든 면이 두 색 반쪽(가로든 세로든) */
export function isAllHalves(state: PuzzleState): boolean {
  const n = 2;
  const g = grid(n, state);
  for (let f = 0; f < 6; f++) {
    const rows = faceSplits(n, g, f, (r) => r);
    const cols = faceSplits(n, g, f, (_r, c) => c);
    if (!rows && !cols) return false;
  }
  return true;
}

/** 2×2: 위·아래 면은 맞은편 두 색 체커보드, 옆 네 면은 가로나 세로 두 줄 */
export function isTopBottomChecker(state: PuzzleState): boolean {
  const n = 2;
  const g = grid(n, state);
  for (const f of [0, 3]) {
    const c = faceSplits(n, g, f, (r, k) => (r + k) % 2);
    if (!c || OPPOSITE_FACE[c[0] as number] !== c[1]) return false;
  }
  for (const f of [1, 2, 4, 5])
    if (!faceSplits(n, g, f, (r) => r) && !faceSplits(n, g, f, (_r, c) => c))
      return false;
  return true;
}
