import type { PuzzleDef } from "@game/puzzle-core";
import {
  applyMove,
  type CubeMove,
  invertMoves,
  isValidMove,
  moveGeometry,
} from "./move";
import { formatMoves, parseMoves } from "./notation";
import { isSolved, solvedCube } from "./state";
import { cubeTopology, FACE_DEFS } from "./topology";

const defs = new Map<number, PuzzleDef<CubeMove>>();

/** n×n 큐브를 퍼즐 공통 계약으로(화면·경주 틀처럼 퍼즐을 모르는 쪽이 쓴다) */
export function cubeDef(n: number): PuzzleDef<CubeMove> {
  const hit = defs.get(n);
  if (hit) return hit;
  const topo = cubeTopology(n);
  const def: PuzzleDef<CubeMove> = {
    id: `cube${n}`,
    stickerCount: topo.stickerCount,
    faces: FACE_DEFS,
    solved: () => solvedCube(n),
    parse: (text) => parseMoves(n, text),
    format: (moves) => formatMoves(n, moves),
    apply: (state, move) => applyMove(n, state, move),
    canApply: (_state, move) => isValidMove(n, move),
    invert: invertMoves,
    isSolved: (state, opts) => isSolved(n, state, opts),
    geometry: {
      pieces: topo.pieces,
      stickers: topo.stickers,
      move: (move) => moveGeometry(n, move),
    },
  };
  defs.set(n, def);
  return def;
}
