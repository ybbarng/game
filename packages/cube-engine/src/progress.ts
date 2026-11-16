import type { PuzzleState } from "@game/puzzle-core";
import { faceColors, isSolved, rotatedSolved } from "./state";
import { CUBE_ROTATIONS, cubeTopology, OPPOSITE_FACE } from "./topology";

/**
 * 진행 표시(온라인 대결의 진행 막대·단계 이름, docs/47 9-1).
 * 모두 지금 보이는 색만 본다. 큐브 전체 방향과 상관없다.
 */

/**
 * 3×3 진행 단계(어디까지 끝났나).
 * none → cross(십자) → f2l(첫 두 층) → oll(윗면 한 색) → solved
 */
export type Cube3Stage = "none" | "cross" | "f2l" | "oll" | "solved";

export interface Cube3Progress {
  readonly stage: Cube3Stage;
  /** 십자가 생긴 면(자리 기준 면 번호, 지금 큐브를 쥔 방향에서). 없으면 null */
  readonly crossFace: number | null;
  /** 그 십자 위에 끼운 F2L 짝 수(0~4) */
  readonly f2lPairs: number;
}

/**
 * 3×3 진행 단계 인식. 흰 십자만이 아니라 "어느 면이든 십자가 생긴 면"을 찾고,
 * 여러 면이면 가장 많이 나아간 면을 고른다.
 */
export function cube3Progress(state: PuzzleState): Cube3Progress {
  const n = 3;
  if (isSolved(n, state))
    return { stage: "solved", crossFace: null, f2lPairs: 4 };
  const topo = cubeTopology(n);
  const colors = faceColors(n, state);
  const center = (f: number) => colors[f * 9 + 4];
  /** 조각 자리 q가 가운데 색 기준으로 맞았나 */
  const pieceOk = (q: number) =>
    (topo.pieces[q]?.stickers ?? []).every(
      (s) => colors[s] === center(topo.stickers[s]?.face as number),
    );
  const facesOf = (q: number) =>
    (topo.pieces[q]?.stickers ?? []).map((s) => topo.stickers[s]?.face);

  let best: Cube3Progress = { stage: "none", crossFace: null, f2lPairs: 0 };
  let bestScore = -1;
  for (let f = 0; f < 6; f++) {
    const top = OPPOSITE_FACE[f as 0] as number;
    const edges: number[] = [];
    const corners: number[] = [];
    const middle: number[] = [];
    topo.pieces.forEach((p, q) => {
      const faces = facesOf(q);
      if (p.kind === "edge") {
        if (faces.includes(f)) edges.push(q);
        else if (!faces.includes(top)) middle.push(q);
      } else if (p.kind === "corner" && faces.includes(f)) corners.push(q);
    });
    if (!edges.every(pieceOk)) continue;
    const pairs = corners.filter((c) => {
      if (!pieceOk(c)) return false;
      const sides = facesOf(c).filter((x) => x !== f);
      const edge = middle.find((e) =>
        sides.every((x) => facesOf(e).includes(x)),
      );
      return edge !== undefined && pieceOk(edge);
    }).length;
    const topDone =
      pairs === 4 &&
      Array.from({ length: 9 }, (_, k) => colors[top * 9 + k]).every(
        (c) => c === center(top),
      );
    const score = 1 + pairs + (topDone ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = {
        stage: topDone ? "oll" : pairs === 4 ? "f2l" : "cross",
        crossFace: f,
        f2lPairs: pairs,
      };
    }
  }
  return best;
}

const faceMapCache = new Map<number, Uint8Array[]>();

/** 큐브 전체 방향 24가지마다 "자리 면 → 있어야 할 색" */
function faceColorMaps(n: number): Uint8Array[] {
  let hit = faceMapCache.get(n);
  if (!hit) {
    const nn = n * n;
    hit = CUBE_ROTATIONS.map((g) => {
      const colors = faceColors(n, rotatedSolved(n, g));
      return Uint8Array.from({ length: 6 }, (_, f) => colors[f * nn] as number);
    });
    faceMapCache.set(n, hit);
  }
  return hit;
}

/**
 * 맞은 조각 비율(0~1, 진행 막대용). 큐브 전체 방향 24가지 중 가장 잘 맞는 방향을 기준으로,
 * 모든 스티커가 그 방향의 면 색과 같은 조각을 센다. 움직이지 않는 정가운데는 세지 않는다.
 */
export function solvedPieceRatio(n: number, state: PuzzleState): number {
  const { start, sticker, face } = countedPieces(n);
  const pieces = start.length - 1;
  const colors = faceColors(n, state);
  let best = 0;
  for (const map of faceColorMaps(n)) {
    let ok = 0;
    for (let i = 0; i < pieces; i++) {
      const end = start[i + 1] as number;
      let k = start[i] as number;
      while (k < end && colors[sticker[k] as number] === map[face[k] as number])
        k++;
      if (k === end) ok++;
    }
    if (ok > best) best = ok;
  }
  return best / pieces;
}

interface CountedPieces {
  /** 조각 i의 스티커는 `sticker[start[i]]`부터 `start[i + 1]` 앞까지, 그 자리 면은 `face` 같은 칸 */
  start: Int32Array;
  sticker: Int32Array;
  face: Uint8Array;
}

const countedCache = new Map<number, CountedPieces>();

/** `solvedPieceRatio`가 세는 조각(움직이지 않는 정가운데 빼고)의 스티커 자리와 그 면. 크기마다 한 번 만든다 */
function countedPieces(n: number): CountedPieces {
  let hit = countedCache.get(n);
  if (!hit) {
    const topo = cubeTopology(n);
    const counted = topo.pieces.filter((p) => p.kind !== "center");
    const stickers = counted.flatMap((p) => [...p.stickers]);
    const start = new Int32Array(counted.length + 1);
    counted.forEach((p, i) => {
      start[i + 1] = (start[i] as number) + p.stickers.length;
    });
    hit = {
      start,
      sticker: Int32Array.from(stickers),
      face: Uint8Array.from(
        stickers,
        (st) => topo.stickers[st]?.face as number,
      ),
    };
    countedCache.set(n, hit);
  }
  return hit;
}
