// 루·ZZ·페트루스·야우 단원의 목표 판정(docs/47 8-2). judge.ts의 goalMet이 이 이름들을 여기로 넘긴다.
// 모두 "지금 들고 있는 방향"의 자리로 본다(왼쪽 블록 = 왼쪽 면 L에 닿고 윗면 U에 닿지 않는 자리).
// 색은 큐브 전체 방향 24가지 중 하나라도 맞으면 된다. 루는 가운데 층(M)을 돌려 가운데가 움직이므로
// 가운데 색 하나로 기준을 정하지 않는다. ZZ의 모서리 방향(EO)만 가운데 색을 기준으로 본다.
import {
  applyMove,
  B,
  CUBE_ROTATIONS,
  type CubeMove,
  cubeTopology,
  D,
  F,
  faceColors,
  L,
  OPPOSITE_FACE,
  parseMoves,
  pieceFaces,
  piecesOfKind,
  R,
  rotatedSolved,
  U,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

export const METHOD_GOALS = [
  "roux-fb",
  "roux-sb",
  "cmll",
  "lse-eo",
  "lse-ulur",
  "eo",
  "eoline",
  "zz-left",
  "petrus-222",
  "petrus-223",
  "yau-ud-centers",
  "yau-cross3",
  "yau-centers",
  "yau-cross",
] as const;
export type MethodGoal = (typeof METHOD_GOALS)[number];

export const isMethodGoal = (g: string): g is MethodGoal =>
  (METHOD_GOALS as readonly string[]).includes(g);

const WHITE = U; // 색 번호 = 맞춘 상태에서 있던 면
const YELLOW = D;

const frameCache = new Map<number, Uint8Array[]>();

/** 큐브 전체 방향 24가지마다 "자리 면 → 있어야 할 색" */
function frames(n: number): Uint8Array[] {
  let hit = frameCache.get(n);
  if (!hit) {
    const nn = n * n;
    hit = CUBE_ROTATIONS.map((g) => {
      const c = faceColors(n, rotatedSolved(n, g));
      return Uint8Array.from({ length: 6 }, (_, f) => c[f * nn] as number);
    });
    frameCache.set(n, hit);
  }
  return hit;
}

/** 홀수 크기의 가운데 색 기준 */
function centerFrame(n: number, colors: Uint8Array): Uint8Array {
  const nn = n * n;
  const mid = (nn - 1) / 2;
  return Uint8Array.from(
    { length: 6 },
    (_, f) => colors[f * nn + mid] as number,
  );
}

const slabCache = new Map<string, number[]>();

/** 닿은 면 조건에 맞는 조각 자리(가운데 포함) */
function slab(
  n: number,
  key: string,
  pred: (faces: number[]) => boolean,
  kinds?: readonly string[],
): number[] {
  const k = `${n}|${key}`;
  let hit = slabCache.get(k);
  if (!hit) {
    const topo = cubeTopology(n);
    hit = [];
    for (let p = 0; p < topo.pieces.length; p++) {
      const kind = topo.pieces[p]?.kind as string;
      if (kinds && !kinds.includes(kind)) continue;
      if (pred(pieceFaces(n, p))) hit.push(p);
    }
    slabCache.set(k, hit);
  }
  return hit;
}

function ok(
  n: number,
  colors: Uint8Array,
  frame: Uint8Array,
  pieces: readonly number[],
) {
  const topo = cubeTopology(n);
  return pieces.every((p) =>
    (topo.pieces[p]?.stickers ?? []).every(
      (s) => colors[s] === frame[topo.stickers[s]?.face as number],
    ),
  );
}

/** 1×2×3 블록: 옆면 side에 닿고 윗면에 닿지 않는 자리(옆 가운데 포함) */
const block = (n: number, side: number) =>
  slab(n, `block${side}`, (f) => f.includes(side) && !f.includes(U));

const topCorners = (n: number) =>
  slab(n, "topCorners", (f) => f.includes(U), ["corner"]);

/** LSE가 다루는 모서리 여섯: 위 넷 + 아래 앞·뒤 */
const lseEdges = (n: number) =>
  slab(
    n,
    "lse",
    (f) => f.includes(U) || (f.includes(D) && (f.includes(F) || f.includes(B))),
    ["edge"],
  );

const ulur = (n: number) =>
  slab(n, "ulur", (f) => f.includes(U) && (f.includes(L) || f.includes(R)), [
    "edge",
  ]);

function turnU(n: number, state: PuzzleState, k: number): PuzzleState {
  const m = parseMoves(n, "U")[0] as CubeMove;
  let s = state;
  for (let i = 0; i < k; i++) s = applyMove(n, s, m);
  return s;
}

/** 조각마다 color 묶음 중 하나인 칸이 faces 중 한 면에 있나 */
function stickerOn(
  n: number,
  colors: Uint8Array,
  piece: number,
  want: readonly number[],
  faces: readonly number[],
): boolean | null {
  const topo = cubeTopology(n);
  for (const s of topo.pieces[piece]?.stickers ?? []) {
    if (want.includes(colors[s] as number))
      return faces.includes(topo.stickers[s]?.face as number);
  }
  return null;
}

/** 루: 두 블록 + 위 꼭짓점(윗면 돌리기 하나는 봐준다) + 단계마다 더 볼 것 */
function rouxLast(
  n: number,
  state: PuzzleState,
  extra: (colors: Uint8Array, frame: Uint8Array) => boolean,
): boolean {
  const pieces = [...block(n, L), ...block(n, R), ...topCorners(n)];
  for (let k = 0; k < 4; k++) {
    const colors = faceColors(n, turnU(n, state, k));
    for (const fr of frames(n))
      if (ok(n, colors, fr, pieces) && extra(colors, fr)) return true;
  }
  return false;
}

/** LSE의 EO: 위·아래 가운데가 위·아래 색이고, 모서리 여섯의 위·아래 색 칸이 위나 아래를 본다 */
function lseOriented(n: number, colors: Uint8Array, fr: Uint8Array) {
  const nn = n * n;
  const mid = (nn - 1) / 2;
  const ud = [fr[U] as number, fr[D] as number];
  if (!ud.includes(colors[U * nn + mid] as number)) return false;
  if (!ud.includes(colors[D * nn + mid] as number)) return false;
  return lseEdges(n).every((p) => stickerOn(n, colors, p, ud, [U, D]));
}

/**
 * ZZ의 모서리 방향: F·B를 4분의 1 돌리지 않고 맞출 수 있는가. 모서리마다 기준 칸(위·아래 색, 없으면
 * 앞·뒤 색)이 기준 면(위·아래에 닿은 자리면 위·아래, 가운데 줄이면 앞·뒤)에 있으면 바른 방향이다.
 */
function edgesOriented(n: number, colors: Uint8Array, fr: Uint8Array) {
  const ud = [fr[U] as number, fr[D] as number];
  const fb = [fr[F] as number, fr[B] as number];
  return piecesOfKind(n, "edge").every((p) => {
    const faces = pieceFaces(n, p);
    const refFaces = faces.includes(U) || faces.includes(D) ? [U, D] : [F, B];
    const byUD = stickerOn(n, colors, p, ud, refFaces);
    return byUD ?? stickerOn(n, colors, p, fb, refFaces) ?? false;
  });
}

const line = (n: number) =>
  slab(n, "line", (f) => f.includes(D) && (f.includes(F) || f.includes(B)), [
    "edge",
  ]);

// ── 큰 큐브(야우) ──────────────────────────────────────

/** 면 f의 가운데 칸(정가운데·안쪽 가운데)이 모두 color인가 */
function centerFaceIs(n: number, colors: Uint8Array, f: number, color: number) {
  const topo = cubeTopology(n);
  for (const p of piecesOfKind(n, "center", "innerCenter")) {
    for (const s of topo.pieces[p]?.stickers ?? []) {
      if (topo.stickers[s]?.face === f && colors[s] !== color) return false;
    }
  }
  return true;
}

/** 흰 가운데가 있는 면(맞은편이 노랑). 없으면 -1 */
function whiteCenterFace(n: number, colors: Uint8Array): number {
  for (let f = 0; f < 6; f++)
    if (
      centerFaceIs(n, colors, f, WHITE) &&
      centerFaceIs(n, colors, OPPOSITE_FACE[f as 0] as number, YELLOW)
    )
      return f;
  return -1;
}

function allCentersOk(n: number, colors: Uint8Array) {
  for (let f = 0; f < 6; f++) {
    const topo = cubeTopology(n);
    const s0 = piecesOfKind(n, "center", "innerCenter")
      .flatMap((p) => topo.pieces[p]?.stickers ?? [])
      .find((s) => topo.stickers[s]?.face === f);
    if (s0 === undefined || !centerFaceIs(n, colors, f, colors[s0] as number))
      return false;
  }
  return true;
}

/** 흰 면 쪽 십자 모서리 줄(옆면마다 한 줄) 가운데 맞은 줄 수, 가장 많이 맞는 방향 기준 */
function crossLinesOk(n: number, colors: Uint8Array, white: number): number {
  const sides = [0, 1, 2, 3, 4, 5].filter(
    (g) => g !== white && g !== OPPOSITE_FACE[white as 0],
  );
  const lines = sides.map((g) =>
    slab(n, `line${white}-${g}`, (f) => f.includes(white) && f.includes(g), [
      "edge",
      "wing",
    ]),
  );
  let best = 0;
  for (const fr of frames(n)) {
    if (fr[white] !== WHITE) continue;
    const count = lines.filter((pieces) => ok(n, colors, fr, pieces)).length;
    if (count > best) best = count;
  }
  return best;
}

/** 새 해법 목표가 됐나 */
export function methodGoalMet(
  n: number,
  state: PuzzleState,
  goal: MethodGoal,
): boolean {
  const colors = faceColors(n, state);
  const any = (pieces: readonly number[]) =>
    frames(n).some((fr) => ok(n, colors, fr, pieces));
  switch (goal) {
    case "roux-fb":
      return any(block(n, L));
    case "roux-sb":
      return any([...block(n, L), ...block(n, R)]);
    case "cmll":
      return rouxLast(n, state, () => true);
    case "lse-eo":
      return rouxLast(n, state, (c, fr) => lseOriented(n, c, fr));
    case "lse-ulur":
      return rouxLast(
        n,
        state,
        (c, fr) => lseOriented(n, c, fr) && ok(n, c, fr, ulur(n)),
      );
    case "eo":
      return edgesOriented(n, colors, centerFrame(n, colors));
    case "eoline":
    case "zz-left": {
      const fr = centerFrame(n, colors);
      if (!edgesOriented(n, colors, fr) || !ok(n, colors, fr, line(n)))
        return false;
      return goal === "eoline" || ok(n, colors, fr, block(n, L));
    }
    case "petrus-222":
      return any(
        slab(
          n,
          "p222",
          (f) => !f.includes(U) && !f.includes(R) && !f.includes(F),
        ),
      );
    case "petrus-223":
      return any(slab(n, "p223", (f) => !f.includes(U) && !f.includes(R)));
    case "yau-ud-centers":
      return whiteCenterFace(n, colors) >= 0;
    case "yau-cross3":
    case "yau-centers":
    case "yau-cross": {
      const white = whiteCenterFace(n, colors);
      if (white < 0) return false;
      if (goal !== "yau-cross3" && !allCentersOk(n, colors)) return false;
      return crossLinesOk(n, colors, white) >= (goal === "yau-cross" ? 4 : 3);
    }
  }
}
