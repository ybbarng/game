import {
  applyMoves,
  type CubeMove,
  centerTwists,
  cornerTwists,
  cross,
  cubeTopology,
  dot,
  edgeFlips,
  isRotation,
  isSolvable,
  orbitParityMask,
  type PieceKind,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState, Vec3 } from "@game/puzzle-core";

/**
 * 「큐브의 수학」이 쓰는 조각 셈(순수 함수, `pieces.test.ts`).
 * 상태를 조각 단위로 손보기(뽑아서 다시 끼우기), 방향·짝 계기, 수 묶음의 차수·바뀐 조각·고리 세기.
 */

/** 조각 자리 q의 스티커 자리를 기준 칸(U·D, 없으면 F·B 면) → 오른손 차례로 늘어놓는다 */
function orderedSlots(n: number, q: number): number[] {
  const topo = cubeTopology(n);
  const piece = topo.pieces[q];
  if (!piece) throw new Error(`조각 자리가 없어요: ${q}`);
  const slots = [...piece.stickers];
  const rank = (s: number) => {
    const f = topo.stickers[s]?.face as number;
    // U=0 D=3 → 0, F=2 B=5 → 1, R=1 L=4 → 2
    return f === 0 || f === 3 ? 0 : f === 2 || f === 5 ? 1 : 2;
  };
  slots.sort((a, b) => rank(a) - rank(b));
  if (slots.length === 3) {
    const [a, b, c] = slots as [number, number, number];
    const na = topo.stickers[a]?.normal as Vec3;
    const nb = topo.stickers[b]?.normal as Vec3;
    if (dot(cross(na, nb), piece.position) < 0) return [a, c, b];
  }
  return slots;
}

function cloneState(s: PuzzleState): { perm: Uint16Array; twist: Uint8Array } {
  return { perm: new Uint16Array(s.perm), twist: new Uint8Array(s.twist) };
}

/** 조각 자리 q의 조각을 뽑아 제자리에서 한 칸 돌려 끼운다(엣지는 뒤집기, 코너는 비틀기) */
export function rotatePieceInPlace(
  n: number,
  state: PuzzleState,
  q: number,
  times = 1,
): PuzzleState {
  const slots = orderedSlots(n, q);
  const out = cloneState(state);
  const k = slots.length;
  for (let i = 0; i < k; i++) {
    const from = slots[(i - (times % k) + k * 2) % k] as number;
    out.perm[slots[i] as number] = state.perm[from] as number;
    out.twist[slots[i] as number] = 0;
  }
  return out;
}

/** 같은 종류 조각 둘을 뽑아 서로 자리를 바꿔 끼운다(방향은 기준 칸끼리 맞춘다) */
export function swapPieces(
  n: number,
  state: PuzzleState,
  a: number,
  b: number,
): PuzzleState {
  const topo = cubeTopology(n);
  if (topo.pieces[a]?.kind !== topo.pieces[b]?.kind)
    throw new Error("같은 종류 조각끼리만 바꿀 수 있어요");
  const sa = orderedSlots(n, a);
  const sb = orderedSlots(n, b);
  const out = cloneState(state);
  sa.forEach((x, i) => {
    const y = sb[i] as number;
    out.perm[x] = state.perm[y] as number;
    out.perm[y] = state.perm[x] as number;
    out.twist[x] = 0;
    out.twist[y] = 0;
  });
  return out;
}

export interface Invariants {
  /** 코너 비틀림 합(나머지를 내지 않은 값) */
  twistSum: number;
  /** 엣지 뒤집힘 합 */
  flipSum: number;
  /** 코너 자리 짝(0 짝, 1 홀) */
  cornerParity: number;
  /** 가운데 엣지 자리 짝 */
  edgeParity: number;
  /** 정가운데 칸 회전 합(90° 단위, 나머지를 내지 않은 값) */
  centerTurnSum: number;
  /** 돌리기로 맞출 수 있는가(엔진 판정) */
  solvable: boolean;
}

function orbitParity(n: number, state: PuzzleState, kind: PieceKind): number {
  const topo = cubeTopology(n);
  const mask = orbitParityMask(n, state);
  const i = topo.orbits.findIndex((o) => o.kind === kind);
  return i < 0 ? 0 : (mask >> i) & 1;
}

/** 방향·짝 계기(3×3 같은 홀수 크기) */
export function invariants(n: number, state: PuzzleState): Invariants {
  return {
    twistSum: cornerTwists(n, state).reduce((s, c) => s + c.twist, 0),
    flipSum: edgeFlips(n, state).reduce((s, e) => s + e.flip, 0),
    cornerParity: orbitParity(n, state, "corner"),
    edgeParity: orbitParity(n, state, "edge"),
    centerTurnSum: centerTwists(n, state).reduce((s, c) => s + c.twist, 0),
    solvable: isSolvable(n, state),
  };
}

/** 면 돌리기(바깥 한 층)인가. 센터 방향 계기는 이 수만 받는다 */
export function isFaceTurn(n: number, m: CubeMove): boolean {
  return m.from === m.to && (m.from === 1 || m.from === n) && !isRotation(n, m);
}

/** 조각 자리 q에 지금 있는 조각 */
export function pieceAtSlot(n: number, state: PuzzleState, q: number): number {
  const topo = cubeTopology(n);
  const slot = topo.pieces[q]?.stickers[0] as number;
  return topo.stickers[state.perm[slot] as number]?.piece as number;
}

/** 제자리·제 방향이 아닌 조각 수(종류별). 센터는 색만 본다(방향은 보지 않는다) */
export function changedPieces(
  n: number,
  state: PuzzleState,
): Partial<Record<PieceKind, number>> {
  const topo = cubeTopology(n);
  const out: Partial<Record<PieceKind, number>> = {};
  topo.pieces.forEach((p) => {
    if (p.stickers.every((s) => state.perm[s] === s)) return;
    out[p.kind] = (out[p.kind] ?? 0) + 1;
  });
  return out;
}

/**
 * 같은 수 묶음을 되풀이해 처음 모양(스티커 자리 기준, 칸 방향은 보지 않는다)으로 돌아오는 횟수.
 * `limit`번 안에 안 돌아오면 null
 */
export function orderOf(
  n: number,
  moves: readonly CubeMove[],
  limit = 100_000,
): number | null {
  if (moves.length === 0) return 1;
  const start = solvedCube(n);
  // 한 번 돌린 결과를 순열로 보고 고리 길이의 최소공배수를 낸다
  const once = applyMoves(n, start, moves);
  const seen = new Uint8Array(once.perm.length);
  let order = 1;
  for (let i = 0; i < once.perm.length; i++) {
    if (seen[i]) continue;
    let len = 0;
    let j = i;
    while (!seen[j]) {
      seen[j] = 1;
      j = once.perm[j] as number;
      len++;
    }
    order = lcm(order, len);
    if (order > limit) return null;
  }
  return order;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}

/** 수 묶음 하나가 종류별 조각 자리를 몇 개짜리 고리로 옮기는지(길이 2 이상만) */
export function pieceCycles(
  n: number,
  moves: readonly CubeMove[],
): { orbit: number; kind: PieceKind; cycles: number[] }[] {
  const topo = cubeTopology(n);
  const s = applyMoves(n, solvedCube(n), moves);
  return topo.orbits.map((o, oi) => {
    const where = new Map<number, number>();
    for (const q of o.pieces) where.set(pieceAtSlot(n, s, q), q);
    const seen = new Set<number>();
    const cycles: number[] = [];
    for (const q of o.pieces) {
      if (seen.has(q)) continue;
      let len = 0;
      let j = q;
      while (!seen.has(j)) {
        seen.add(j);
        j = where.get(j) as number;
        len++;
      }
      if (len > 1) cycles.push(len);
    }
    return { orbit: oi, kind: o.kind, cycles };
  });
}

/** 고리 길이들로 순열의 짝(0 짝, 1 홀): 길이 k 고리는 맞바꾸기 k-1번 */
export function cycleParity(cycles: readonly number[]): number {
  return cycles.reduce((s, k) => s + (k - 1), 0) % 2;
}

/** 교환자 A B A' B' 글 */
export function commutator(a: string, b: string): string {
  return `${a} ${b} ${invertText(a)} ${invertText(b)}`;
}

/** 켤레 A B A' 글 */
export function conjugate(a: string, b: string): string {
  return `${a} ${b} ${invertText(a)}`;
}

/** 표기 글을 거꾸로(토막 순서를 뒤집고 ' 를 붙이거나 뗀다) */
export function invertText(alg: string): string {
  return alg
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .reverse()
    .map((t) =>
      t.endsWith("2") ? t : t.endsWith("'") ? t.slice(0, -1) : `${t}'`,
    )
    .join(" ");
}

/** 표기를 읽어 상태로(맞춘 상태에서) */
export function stateAfter(n: number, alg: string): PuzzleState {
  return applyMoves(n, solvedCube(n), parseMoves(n, alg));
}
