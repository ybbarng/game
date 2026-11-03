import {
  type PuzzleState,
  type SolvedOptions,
  solvedState,
  type Vec3,
} from "@game/puzzle-core";
import {
  CUBE_ROTATIONS,
  cubeTopology,
  faceOfNormal,
  quarterTurnsBetween,
  type Rot,
  rotate,
} from "./topology";

export function solvedCube(n: number): PuzzleState {
  return solvedState(cubeTopology(n).stickerCount);
}

/** 스티커 번호 → 그 스티커의 색(맞춘 상태에서 있던 면 번호) */
export function stickerFace(n: number, sticker: number): number {
  return Math.floor(sticker / (n * n));
}

/** 자리마다 지금 보이는 색(면 번호). 화면은 이 값으로 칠한다 */
export function faceColors(n: number, state: PuzzleState): Uint8Array {
  const nn = n * n;
  const out = new Uint8Array(state.perm.length);
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.floor((state.perm[i] as number) / nn);
  }
  return out;
}

/** 맞춘 큐브를 통째로 `g`만큼 돌린 상태 */
export function rotatedSolved(n: number, g: Rot): PuzzleState {
  const topo = cubeTopology(n);
  const perm = new Uint16Array(topo.stickerCount);
  const twist = new Uint8Array(topo.stickerCount);
  topo.stickers.forEach((s, i) => {
    const piece = topo.pieces[s.piece];
    if (!piece) return;
    const normal = rotate(g, s.normal);
    const j = topo.stickerAt(rotate(g, piece.position), faceOfNormal(normal));
    const target = topo.stickers[j];
    if (!target) throw new Error("스티커 자리를 찾지 못했다");
    perm[j] = i;
    twist[j] = quarterTurnsBetween(target.up, normal, rotate(g, s.up) as Vec3);
  });
  return { perm, twist };
}

const rotatedCache = new Map<number, PuzzleState[]>();

function allRotatedSolved(n: number): PuzzleState[] {
  let hit = rotatedCache.get(n);
  if (!hit) {
    hit = CUBE_ROTATIONS.map((g) => rotatedSolved(n, g));
    rotatedCache.set(n, hit);
  }
  return hit;
}

/**
 * 맞춤 판정. 큐브 전체 방향은 상관없다.
 * - 기본: 면마다 한 색이면 맞춤.
 * - `orientCenters`: 스티커 하나하나의 자리와 방향까지 맞아야 맞춤(그림 큐브).
 */
export function isSolved(
  n: number,
  state: PuzzleState,
  opts: SolvedOptions = {},
): boolean {
  if (opts.orientCenters) {
    return allRotatedSolved(n).some((s) => {
      for (let i = 0; i < s.perm.length; i++) {
        if (s.perm[i] !== state.perm[i] || s.twist[i] !== state.twist[i])
          return false;
      }
      return true;
    });
  }
  const nn = n * n;
  for (let f = 0; f < 6; f++) {
    const color = Math.floor((state.perm[f * nn] as number) / nn);
    for (let k = 1; k < nn; k++) {
      if (Math.floor((state.perm[f * nn + k] as number) / nn) !== color)
        return false;
    }
  }
  return true;
}
