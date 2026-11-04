// 배우기·훈련 자료의 이름(GOALS·MASKS·SCRAMBLE_RULES)을 엔진으로 판정하는 얇은 층(docs/47 2-3, 8-1).
// 모두 "지금 보이는 색"으로 본다. 홀수 크기는 면 정가운데 색이 기준이고(큐브를 어느 쪽으로 들든 같다),
// 짝수 크기는 가운데가 움직이므로 큐브 전체 방향 24가지 중 하나라도 맞으면 맞은 것으로 본다.
import {
  applyMove,
  applyMoves,
  CUBE_ROTATIONS,
  type CubeMove,
  createRngFromSeed,
  cubeGroups,
  cubeTopology,
  FACE_INDEX,
  FACE_NAMES,
  faceColors,
  formatMoves,
  invertMoves,
  isRotation,
  isSolved,
  maskFromPieces,
  OPPOSITE_FACE,
  parseMoves,
  pieceFaces,
  pieceName,
  piecesOfKind,
  randomCubeState,
  rotatedSolved,
  type Seed,
  type StickerMask,
  solvedCube,
  stageMask,
  U,
} from "@game/cube-engine";
import { nextInt, type RngState } from "@game/mighty-engine";
import type { PuzzleState } from "@game/puzzle-core";

import { EDGES_5X5 } from "./algs-big";
import type { AlgSetInfo } from "./index";
import { isMethodGoal, methodGoalMet } from "./judge-methods";
import type {
  AlgCase,
  CubeSize,
  GoalName,
  Lesson,
  LessonStep,
  MaskName,
  ScrambleRule,
} from "./types";

const WHITE = U; // 색 번호 = 맞춘 상태에서 있던 면(U 흰)
const YELLOW = OPPOSITE_FACE[U] as number;

// ── 기준 방향 ──────────────────────────────────────────────

const rotationFrames = new Map<number, Uint8Array[]>();

/** 큐브 전체 방향 24가지마다 "자리 면 → 있어야 할 색" */
function allFrames(n: number): Uint8Array[] {
  let hit = rotationFrames.get(n);
  if (!hit) {
    const nn = n * n;
    hit = CUBE_ROTATIONS.map((g) => {
      const c = faceColors(n, rotatedSolved(n, g));
      return Uint8Array.from({ length: 6 }, (_, f) => c[f * nn] as number);
    });
    rotationFrames.set(n, hit);
  }
  return hit;
}

/** 판정에 쓸 기준 방향들. 홀수 크기는 정가운데 색 하나로 정해진다 */
function framesOf(n: number, colors: Uint8Array): Uint8Array[] {
  if (n % 2 === 0) return allFrames(n);
  const nn = n * n;
  const mid = (nn - 1) / 2;
  return [
    Uint8Array.from({ length: 6 }, (_, f) => colors[f * nn + mid] as number),
  ];
}

interface View {
  n: number;
  colors: Uint8Array;
  frame: Uint8Array;
  /** 흰색이 있어야 할 자리 면 */
  white: number;
  top: number;
}

function pieceOk(v: View, piece: number): boolean {
  const topo = cubeTopology(v.n);
  return (topo.pieces[piece]?.stickers ?? []).every(
    (s) => v.colors[s] === v.frame[topo.stickers[s]?.face as number],
  );
}

const allOk = (v: View, pieces: readonly number[]) =>
  pieces.every((p) => pieceOk(v, p));

/** 자리 면 f의 칸이 모두 color인가 */
function faceIs(n: number, colors: Uint8Array, f: number, color: number) {
  const nn = n * n;
  for (let k = 0; k < nn; k++) if (colors[f * nn + k] !== color) return false;
  return true;
}

/** 마지막 층 모서리의 윗면 칸이 위 색인가 */
function topEdgesOriented(v: View, edges: readonly number[]): boolean {
  const topo = cubeTopology(v.n);
  return edges.every((p) =>
    (topo.pieces[p]?.stickers ?? []).every(
      (s) => topo.stickers[s]?.face !== v.top || v.colors[s] === v.frame[v.top],
    ),
  );
}

/** 자리 면 f를 k번 돌린 상태 */
function turnFace(n: number, state: PuzzleState, f: number, k: number) {
  if (k === 0) return state;
  const m = parseMoves(n, FACE_NAMES[f] as string)[0] as CubeMove;
  let s = state;
  for (let i = 0; i < k; i++) s = applyMove(n, s, m);
  return s;
}

// ── 큰 큐브 ──────────────────────────────────────────────

/** 면마다 가운데 조각(정가운데·안쪽 가운데) 칸이 한 색인가 */
export function centersSolved(n: number, state: PuzzleState): boolean {
  const topo = cubeTopology(n);
  const colors = faceColors(n, state);
  const byFace = new Map<number, number>();
  for (const p of piecesOfKind(n, "center", "innerCenter")) {
    for (const s of topo.pieces[p]?.stickers ?? []) {
      const f = topo.stickers[s]?.face as number;
      const c = colors[s] as number;
      const seen = byFace.get(f);
      if (seen === undefined) byFace.set(f, c);
      else if (seen !== c) return false;
    }
  }
  return true;
}

/** 모서리 자리(두 면 사이 한 줄)마다의 조각들. 열쇠는 닿은 두 면 */
function edgeLines(n: number): Map<string, number[]> {
  const topo = cubeTopology(n);
  const lines = new Map<string, number[]>();
  for (const p of piecesOfKind(n, "edge", "wing")) {
    const faces = (topo.pieces[p]?.stickers ?? [])
      .map((s) => topo.stickers[s]?.face as number)
      .sort((a, b) => a - b);
    const key = faces.join(",");
    lines.set(key, [...(lines.get(key) ?? []), p]);
  }
  return lines;
}

/** 모서리 한 줄이 두 면 모두 한 색으로 묶였나 */
function linePaired(n: number, colors: Uint8Array, pieces: number[]) {
  const topo = cubeTopology(n);
  const byFace = new Map<number, number>();
  for (const p of pieces) {
    for (const s of topo.pieces[p]?.stickers ?? []) {
      const f = topo.stickers[s]?.face as number;
      const seen = byFace.get(f);
      if (seen === undefined) byFace.set(f, colors[s] as number);
      else if (seen !== colors[s]) return false;
    }
  }
  return true;
}

/** 묶이지 않은 모서리 줄 수 */
export function unpairedEdgeLines(n: number, state: PuzzleState): number {
  const colors = faceColors(n, state);
  let count = 0;
  for (const pieces of edgeLines(n).values())
    if (!linePaired(n, colors, pieces)) count++;
  return count;
}

// ── 조각 하나 ──────────────────────────────────────────────

/** 조각 이름(엔진 pieceName, 예: UFR·UF·U) → 조각 자리 번호. 없으면 -1 */
export function pieceByName(n: number, name: string): number {
  const count = cubeTopology(n).pieces.length;
  for (let p = 0; p < count; p++) if (pieceName(n, p) === name) return p;
  return -1;
}

const PIECE_PREFIX = "piece:";

// ── 목표 판정 ──────────────────────────────────────────────

function frameGoal(goal: GoalName, v: View, state: PuzzleState): boolean {
  const { n } = v;
  const g = cubeGroups(n, v.white);
  switch (goal) {
    case "white-cross":
    case "cross":
      return allOk(v, g.cross);
    case "first-layer":
    case "2x2-first-layer":
      return allOk(v, g.cross) && allOk(v, g.firstLayerCorners);
    case "second-layer":
    case "f2l":
      return allOk(v, g.f2l);
    case "f2l-pair:FR":
    case "f2l-pair:FL":
    case "f2l-pair:BR":
    case "f2l-pair:BL": {
      const sides = [goal.at(-2), goal.at(-1)].map(
        (c) => FACE_INDEX[c as string] as number,
      );
      const topo = cubeTopology(n);
      const pair = g.f2lPairs.find((p) =>
        sides.every((f) =>
          (topo.pieces[p.corner]?.stickers ?? []).some(
            (s) => topo.stickers[s]?.face === f,
          ),
        ),
      );
      if (!pair) return false;
      return allOk(v, g.cross) && allOk(v, [pair.corner, ...pair.edges]);
    }
    case "yellow-cross":
      return allOk(v, g.f2l) && topEdgesOriented(v, g.lastLayerEdges);
    case "oll":
    case "2x2-top-face":
      return (
        allOk(v, g.f2l) && faceIs(n, v.colors, v.top, v.frame[v.top] as number)
      );
    case "yellow-corners": {
      if (!frameGoal("oll", v, state)) return false;
      for (let k = 0; k < 4; k++) {
        const s = turnFace(n, state, v.top, k);
        const tv = { ...v, colors: faceColors(n, s) };
        if (allOk(tv, g.lastLayerCorners)) return true;
      }
      return false;
    }
    default:
      return false;
  }
}

/** 목표가 됐나(GOALS 이름, 크기 n의 상태) */
export function goalMet(
  n: number,
  state: PuzzleState,
  goal: GoalName,
): boolean {
  if (isMethodGoal(goal)) return methodGoalMet(n, state, goal);
  const colors = faceColors(n, state);
  if (goal.startsWith(PIECE_PREFIX)) {
    // 조각 하나가 제자리·바른 방향(가운데 색 기준). 다른 조각은 보지 않는다
    // 그 조각이 지금 든 자리를 색으로 찾는다(큐브를 통째로 돌려도 같은 조각을 본다)
    const home = pieceByName(n, goal.slice(PIECE_PREFIX.length));
    if (home < 0) return false;
    const want = pieceFaces(n, home)
      .sort((a, b) => a - b)
      .join(",");
    const topo = cubeTopology(n);
    const slot = topo.pieces.findIndex(
      (pc) =>
        pc.stickers
          .map((s) => colors[s] as number)
          .sort((a, b) => a - b)
          .join(",") === want,
    );
    if (slot < 0) return false;
    return framesOf(n, colors).some((frame) =>
      pieceOk({ n, colors, frame, white: 0, top: 0 }, slot),
    );
  }
  switch (goal) {
    case "solved":
      // 엔진과 같은 기준: 큐브 전체 방향만 봐주고 층 돌리기는 봐주지 않는다(2×2 포함, #45 검토)
      return isSolved(n, state);
    case "ll": {
      // 윗면 돌리기 하나 남아도 된다: 어느 면이든 한 번 돌려 맞으면 된다
      for (let f = 0; f < 6; f++)
        for (let k = 0; k < 4; k++)
          if (isSolved(n, turnFace(n, state, f, k))) return true;
      return false;
    }
    case "2x2-first-face":
      return [0, 1, 2, 3, 4, 5].some((f) => faceIs(n, colors, f, WHITE));
    case "2x2-both-faces":
      return [0, 1, 2, 3, 4, 5].some(
        (f) =>
          faceIs(n, colors, f, WHITE) &&
          faceIs(n, colors, OPPOSITE_FACE[f as 0] as number, YELLOW),
      );
    case "centers":
      return centersSolved(n, state);
    case "edges-paired":
      return centersSolved(n, state) && unpairedEdgeLines(n, state) === 0;
    case "edge-pair:UF": {
      const pieces = edgeLines(n).get([U, FACE_INDEX.F].sort().join(","));
      return pieces !== undefined && linePaired(n, colors, pieces);
    }
    default:
      break;
  }
  for (const frame of framesOf(n, colors)) {
    const white = frame.indexOf(WHITE);
    const v: View = {
      n,
      colors,
      frame,
      white,
      top: OPPOSITE_FACE[white as 0] as number,
    };
    if (frameGoal(goal, v, state)) return true;
  }
  return false;
}

// ── 가리기 ──────────────────────────────────────────────

/** 자료의 마스크 이름 → 엔진 스티커 마스크. "all"은 가리지 않음(null) */
export function maskFor(
  n: number,
  name: MaskName | undefined,
): StickerMask | null {
  switch (name) {
    case undefined:
    case "all":
      return null;
    case "centers":
      return maskFromPieces(n, cubeGroups(n, U).centers);
    case "piece:UFR":
    case "piece:UF": {
      const p = pieceByName(n, name.slice(PIECE_PREFIX.length));
      return maskFromPieces(n, [
        ...(p < 0 ? [] : [p]),
        ...cubeGroups(n, U).centers,
      ]);
    }
    case "first-layer": {
      const g = cubeGroups(n, U);
      return maskFromPieces(n, [
        ...g.cross,
        ...g.firstLayerCorners,
        ...g.centers,
      ]);
    }
    case "roux-fb":
      return maskFromPieces(n, rouxPieces(n, "fb"));
    case "roux-blocks":
      return maskFromPieces(n, rouxPieces(n, "blocks"));
    case "cmll":
      return maskFromPieces(n, rouxPieces(n, "cmll"), "gray");
    case "eo-edges":
      return maskFromPieces(
        n,
        [...piecesOfKind(n, "edge", "wing"), ...cubeGroups(n, U).centers],
        "gray",
      );
    default:
      return stageMask(n, name);
  }
}

/** 닿은 면(맞춘 상태 기준)이 조건에 맞는 조각 */
function piecesWhere(n: number, pred: (faces: number[]) => boolean): number[] {
  return cubeTopology(n)
    .pieces.map((_, p) => p)
    .filter((p) => pred(pieceFaces(n, p)));
}

const FACE_R = FACE_INDEX.R as number;
const FACE_L = FACE_INDEX.L as number;
const FACE_D = FACE_INDEX.D as number;

/**
 * 루 조각 묶음(맞춘 상태 기준). 흰 면을 아래로 쥐면(z2) 오른쪽 빨강이 왼쪽으로 가니,
 * 첫 블록은 빨강 면에 닿고 노랑(z2 뒤 위)에 닿지 않는 조각이다. 가운데는 모두 넣는다.
 */
function rouxPieces(n: number, what: "fb" | "blocks" | "cmll"): number[] {
  const centers = cubeGroups(n, U).centers;
  const sides = what === "fb" ? [FACE_R] : [FACE_R, FACE_L];
  const blocks = piecesWhere(
    n,
    (f) => sides.some((s) => f.includes(s)) && !f.includes(FACE_D),
  );
  const corners =
    what === "cmll"
      ? piecesWhere(n, (f) => f.length === 3 && f.includes(FACE_D))
      : [];
  return [...new Set([...blocks, ...corners, ...centers])];
}

// ── 스스로 섞기 규칙 ──────────────────────────────────────

const RULE_SIZE: Record<ScrambleRule, CubeSize> = {
  "random-cross": 3,
  "cross-solved": 3,
  "first-layer-solved": 3,
  "second-layer-solved": 3,
  "f2l-solved": 3,
  "oll-solved": 3,
  "yellow-cross-solved": 3,
  "yellow-face-solved": 3,
  "corners-placed": 3,
  "f2l-one-slot": 3,
  "2x2-random": 2,
  "2x2-first-layer-solved": 2,
  "2x2-top-face-solved": 2,
  "4x4-random": 4,
  "4x4-centers-solved": 4,
  "4x4-reduced": 4,
  "5x5-random": 5,
  "5x5-centers-solved": 5,
  "5x5-two-edges-left": 5,
  "bld-random": 3,
  "roux-fb-solved": 3,
  "roux-blocks-solved": 3,
  "roux-cmll-solved": 3,
  "roux-eo-solved": 3,
  "roux-ulur-solved": 3,
  "zz-eoline-solved": 3,
  "4x4-yau-ud-centers": 4,
  "4x4-yau-cross3": 4,
  "4x4-yau-centers": 4,
  "4x4-yau-cross": 4,
};

export function ruleSize(rule: ScrambleRule): CubeSize {
  return RULE_SIZE[rule];
}

// 윗층만 바꾸는 공식(면 돌리기만 써서 큐브 방향이 바뀌지 않는다). 흰 면 아래로 쥔 큐브 기준
const PLL_ALGS = [
  "R U R' U' R' F R2 U' R' U' R U R' F'", // T
  "R U' R U R U R U' R' U' R2", // Ua
  "R2 U R U R' U' R' U' R' U R'", // Ub
  "F R U' R' U' R U R' F' R U R' U' R' F R F'", // Y
  "R' F R' B2 R F' R' B2 R2", // Aa
  "R U R' F' R U R' U' R' F R2 U' R'", // Jb
];
const FOUR_C = ["M' U2 M U2", "M U2 M' U2", "M2 U2 M2 U2"];
const SUNES = ["R U R' U R U2 R'", "R U2 R' U' R U' R'"];
const EDGE_CYCLES = [PLL_ALGS[1] as string, PLL_ALGS[2] as string];
const PLL_222 = [PLL_ALGS[4] as string, PLL_ALGS[3] as string];

function pick<T>(rng: RngState, list: readonly T[]): T {
  return list[nextInt(rng, list.length)] as T;
}

const uTurn = (k: number) => ["", "U", "U2", "U'"][k] as string;

/**
 * 공식 몇 개를 무작위 윗면 돌리기 사이에 이어 붙인다.
 * `conjugate`면 U·공식·U거꾸로로 끼워 윗층 꼭짓점 자리를 지킨다.
 */
function randomLastLayer(
  rng: RngState,
  algs: readonly string[],
  count: number,
  conjugate = false,
): string {
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const k = nextInt(rng, 4);
    const alg = pick(rng, algs);
    parts.push(
      conjugate
        ? `${uTurn(k)} ${alg} ${uTurn((4 - k) % 4)}`
        : `${uTurn(k)} ${alg}`,
    );
  }
  parts.push(uTurn(nextInt(rng, 4)));
  return parts.join(" ");
}

/** 바깥 면만 돌리는 무작위 수(큰 큐브에서 가운데·모서리 묶음을 지킨다) */
function randomOuterTurns(rng: RngState, count: number): string {
  const out: string[] = [];
  let prev = -1;
  for (let i = 0; i < count; i++) {
    let f = nextInt(rng, 6);
    if (f === prev) f = (f + 1) % 6;
    prev = f;
    out.push(`${FACE_NAMES[f]}${["", "2", "'"][nextInt(rng, 3)]}`);
  }
  return out.join(" ");
}

/** 두 묶음에서 번갈아 고른 수 `pairs`쌍 */
function randomTurns(
  rng: RngState,
  first: readonly string[],
  second: readonly string[],
  pairs: number,
): string {
  const out: string[] = [];
  for (let i = 0; i < pairs; i++) out.push(pick(rng, first), pick(rng, second));
  return out.join(" ");
}

/** 고른 면만 무작위로(같은 면을 잇달아 두지 않는다) */
function randomOuterFaces(rng: RngState, faces: string, count: number) {
  const out: string[] = [];
  let prev = "";
  for (let i = 0; i < count; i++) {
    let f = faces[nextInt(rng, faces.length)] as string;
    if (f === prev) f = faces[(faces.indexOf(f) + 1) % faces.length] as string;
    prev = f;
    out.push(`${f}${["", "2", "'"][nextInt(rng, 3)]}`);
  }
  return out.join(" ");
}

/** 고른 면들의 가운데 조각 */
function centersOn(n: number, faces: readonly (number | undefined)[]) {
  return piecesOfKind(n, "center", "innerCenter").filter((p) =>
    faces.includes(pieceFaces(n, p)[0]),
  );
}

/** 흰 면(U) 쪽 십자 모서리 줄 `count`개(앞·오른쪽·뒤·왼쪽 차례)의 조각 */
function whiteLines(n: number, count: number): number[] {
  const sides = ["F", "R", "B", "L"]
    .slice(0, count)
    .map((s) => FACE_INDEX[s] as number);
  return piecesOfKind(n, "edge", "wing").filter((p) => {
    const f = pieceFaces(n, p);
    return f.includes(U) && sides.some((s) => f.includes(s));
  });
}

function keepRandom(n: number, rng: RngState, keep: readonly number[]) {
  return randomCubeState(n, rng, { keep });
}

const held = (n: number, state: PuzzleState, hold: string) =>
  hold ? applyMoves(n, state, parseMoves(n, hold)) : state;

const fromAlg = (n: number, alg: string, start = solvedCube(n)) =>
  applyMoves(n, start, parseMoves(n, alg));

/** 규칙마다 "아직 안 된" 다음 단계. 섞은 결과가 우연히 이것까지 맞으면 다시 섞는다 */
const RULE_NEXT: Record<ScrambleRule, GoalName> = {
  "random-cross": "white-cross",
  "bld-random": "solved",
  "cross-solved": "first-layer",
  "first-layer-solved": "second-layer",
  "second-layer-solved": "yellow-cross",
  "f2l-solved": "oll",
  "oll-solved": "ll",
  "yellow-cross-solved": "oll",
  "yellow-face-solved": "yellow-corners",
  "corners-placed": "ll",
  "f2l-one-slot": "f2l-pair:FR",
  "2x2-random": "2x2-first-layer",
  "2x2-first-layer-solved": "2x2-top-face",
  "2x2-top-face-solved": "solved",
  "4x4-random": "centers",
  "4x4-centers-solved": "edges-paired",
  "4x4-reduced": "solved",
  "5x5-random": "centers",
  "5x5-centers-solved": "edges-paired",
  "5x5-two-edges-left": "edges-paired",
  "roux-fb-solved": "roux-sb",
  "roux-blocks-solved": "cmll",
  "roux-cmll-solved": "lse-eo",
  "roux-eo-solved": "lse-ulur",
  "roux-ulur-solved": "solved",
  "zz-eoline-solved": "zz-left",
  "4x4-yau-ud-centers": "yau-cross3",
  "4x4-yau-cross3": "yau-centers",
  "4x4-yau-centers": "yau-cross",
  "4x4-yau-cross": "edges-paired",
};

/** 스스로 섞기 규칙으로 상황을 만든다. 같은 씨앗이면 같은 상황이다 */
export function stateForRule(rule: ScrambleRule, seed: Seed): PuzzleState {
  const n = ruleSize(rule);
  const rng = createRngFromSeed(seed);
  let state = ruleOnce(rule, rng);
  // 이미 다음 단계까지 맞은 상황은 연습이 안 되니 다시 섞는다(같은 난수 흐름이라 결정적이다)
  for (let i = 0; i < 20 && goalMet(n, state, RULE_NEXT[rule]); i++)
    state = ruleOnce(rule, rng);
  return state;
}

function ruleOnce(rule: ScrambleRule, rng: RngState): PuzzleState {
  const n = ruleSize(rule);
  const g = cubeGroups(n, U);
  const z2 = (s: PuzzleState) => held(n, s, "z2");
  const z2Solved = () => z2(solvedCube(n));
  switch (rule) {
    case "random-cross":
    case "bld-random":
    case "2x2-random":
    case "4x4-random":
    case "5x5-random":
      return keepRandom(n, rng, []);
    case "cross-solved":
      return z2(keepRandom(n, rng, g.cross));
    case "first-layer-solved":
    case "2x2-first-layer-solved":
      return z2(keepRandom(n, rng, [...g.cross, ...g.firstLayerCorners]));
    case "second-layer-solved":
    case "f2l-solved":
      return z2(keepRandom(n, rng, g.f2l));
    case "f2l-one-slot": {
      // 흰 면을 아래로 쥐면(z2) 앞-오른쪽 칸에는 맞춘 상태의 위-앞-왼쪽 짝이 온다
      const topo = cubeTopology(n);
      const touches = (p: number, f: number) =>
        (topo.pieces[p]?.stickers ?? []).some(
          (s) => topo.stickers[s]?.face === f,
        );
      const pair = g.f2lPairs.find(
        (p) =>
          touches(p.corner, FACE_INDEX.F as number) &&
          touches(p.corner, FACE_INDEX.L as number),
      );
      const drop = new Set([pair?.corner, ...(pair?.edges ?? [])]);
      return z2(
        keepRandom(
          n,
          rng,
          g.f2l.filter((p) => !drop.has(p)),
        ),
      );
    }
    case "oll-solved":
    case "yellow-face-solved":
      return fromAlg(n, randomLastLayer(rng, PLL_ALGS, 4), z2Solved());
    case "yellow-cross-solved":
      return fromAlg(
        n,
        randomLastLayer(rng, [...SUNES, ...PLL_ALGS], 5),
        z2Solved(),
      );
    case "corners-placed":
      return fromAlg(n, randomLastLayer(rng, EDGE_CYCLES, 3, true), z2Solved());
    case "2x2-top-face-solved":
      return fromAlg(n, randomLastLayer(rng, PLL_222, 3), z2Solved());
    case "4x4-centers-solved":
    case "5x5-centers-solved":
      return keepRandom(n, rng, piecesOfKind(n, "center", "innerCenter"));
    case "4x4-reduced":
      return fromAlg(n, randomOuterTurns(rng, 30));
    case "roux-fb-solved":
      return z2(keepRandom(n, rng, rouxPieces(n, "fb")));
    case "roux-blocks-solved":
      return z2(keepRandom(n, rng, rouxPieces(n, "blocks")));
    case "roux-cmll-solved":
      return z2(keepRandom(n, rng, rouxPieces(n, "cmll")));
    case "roux-eo-solved":
      // M2와 U는 모서리 방향을 바꾸지 않는다
      return fromAlg(
        n,
        randomTurns(rng, ["M2"], ["U", "U2", "U'"], 12),
        z2Solved(),
      );
    case "roux-ulur-solved":
      // 가운데 줄 모서리만 바꾸는 묶음(U2 두 번, M은 되돌림)을 이어 붙인다
      return fromAlg(
        n,
        Array.from({ length: 4 }, () => pick(rng, FOUR_C)).join(" "),
        z2Solved(),
      );
    case "zz-eoline-solved":
      // R·U·L은 모서리 방향과 아래 앞·뒤 모서리를 건드리지 않는다
      return fromAlg(n, randomOuterFaces(rng, "RUL", 25), z2Solved());
    case "4x4-yau-ud-centers":
      return keepRandom(n, rng, centersOn(n, [FACE_INDEX.U, FACE_D]));
    case "4x4-yau-cross3":
      return z2(
        keepRandom(n, rng, [
          ...centersOn(n, [FACE_INDEX.U, FACE_D]),
          ...whiteLines(n, 3),
        ]),
      );
    case "4x4-yau-centers":
      return z2(
        keepRandom(n, rng, [
          ...piecesOfKind(n, "center", "innerCenter"),
          ...whiteLines(n, 3),
        ]),
      );
    case "4x4-yau-cross":
      return z2(
        keepRandom(n, rng, [
          ...piecesOfKind(n, "center", "innerCenter"),
          ...whiteLines(n, 4),
        ]),
      );
    case "5x5-two-edges-left": {
      const pairAlg =
        EDGES_5X5.find((c) => c.id === "edges-5x5-pair")?.algs[0] ?? "";
      const start = applyMoves(
        n,
        solvedCube(n),
        invertMoves(parseMoves(n, pairAlg)),
      );
      return fromAlg(n, randomOuterTurns(rng, 25), start);
    }
  }
}

// ── 단원 ──────────────────────────────────────────────

/** 단원 단계의 시작 상황 */
export function stepStart(
  lesson: Lesson,
  step: LessonStep,
  seed: Seed,
): PuzzleState {
  const n = lesson.size;
  const setup = step.setup;
  if (!setup) return solvedCube(n);
  if ("alg" in setup) return fromAlg(n, setup.alg);
  return stateForRule(setup.rule, seed);
}

/** 단계가 무작위 상황을 쓰나(「다른 상황」을 보여 줄 수 있나) */
export function stepIsRandom(step: LessonStep): boolean {
  return step.setup !== undefined && "rule" in step.setup;
}

/** 수 하나가 면 돌리기인가(큐브 전체 돌리기 x·y·z는 수로 세지 않는다) */
export function countsAsMove(n: number, m: CubeMove): boolean {
  return !isRotation(n, m);
}

// ── 훈련 ──────────────────────────────────────────────

export type TrainMode = "mask" | "normal";

/** 공식 묶음·상황의 통과 조건(결과 모양으로 채점한다) */
export function goalForCase(set: AlgSetInfo, c: AlgCase): GoalName {
  switch (set.set) {
    case "oll":
      return "oll";
    case "pll":
      return "ll";
    case "f2l":
      return "f2l";
    case "2look-oll":
      return c.group === "edges" ? "yellow-cross" : "oll";
    case "2look-pll":
      return c.group === "corners" ? "yellow-corners" : "ll";
    case "ortega-oll":
      return "2x2-both-faces";
    default:
      return "solved";
  }
}

/** 흰 면을 아래로 쥐고 무작위 윗면 돌리기를 붙이는 묶음(3×3 마지막 층·F2L, 2×2 오르테가) */
function heldSet(set: AlgSetInfo): boolean {
  return [
    "oll",
    "pll",
    "f2l",
    "2look-oll",
    "2look-pll",
    "ortega-oll",
    "ortega-pbl",
  ].includes(set.set);
}

/** 「보통」 모드에서 상황 밖 조각을 섞어 둘 바탕(흰 면 아래로 쥔 상태) */
function normalBase(set: AlgSetInfo, c: AlgCase, rng: RngState): PuzzleState {
  const n = set.size;
  const z2Solved = () => held(n, solvedCube(n), "z2");
  switch (set.set) {
    case "oll":
      return fromAlg(n, randomLastLayer(rng, PLL_ALGS, 4), z2Solved());
    case "f2l":
      return held(n, keepRandom(n, rng, cubeGroups(n, U).f2l), "z2");
    case "2look-oll":
      return c.group === "edges"
        ? fromAlg(
            n,
            randomLastLayer(rng, [...SUNES, ...PLL_ALGS], 5),
            z2Solved(),
          )
        : fromAlg(n, randomLastLayer(rng, PLL_ALGS, 4), z2Solved());
    case "2look-pll":
      return c.group === "corners"
        ? fromAlg(n, randomLastLayer(rng, EDGE_CYCLES, 3, true), z2Solved())
        : z2Solved();
    case "ortega-oll":
      return fromAlg(
        n,
        `${randomLastLayer(rng, PLL_222, 2)} x2 ${randomLastLayer(rng, PLL_222, 2)} x2`,
        z2Solved(),
      );
    default:
      return heldSet(set) ? z2Solved() : solvedCube(n);
  }
}

export interface TrainCase {
  n: number;
  state: PuzzleState;
  mask: StickerMask | null;
  goal: GoalName;
  /** 대표 공식 앞에 둘 윗면 돌리기(없으면 "") */
  preAuf: string;
  /** 모범 답: 윗면 돌리기 + 대표 공식(끝의 윗면 돌리기는 채점에서 봐준다) */
  answer: string;
}

/**
 * 훈련 상황 하나를 만든다(docs/47 2-3).
 * - 가리기: 맞춘 큐브 + 상황 + 묶음의 마스크
 * - 보통: 상황 밖 조각도 맞출 수 있는 범위에서 무작위 + 상황, 가리지 않음
 * 마지막 층 묶음은 공식 앞뒤에 무작위 윗면 돌리기(AUF)를 붙인다.
 */
export function makeTrainCase(
  set: AlgSetInfo,
  c: AlgCase,
  mode: TrainMode,
  seed: Seed,
): TrainCase {
  const n = set.size;
  const rng = createRngFromSeed(seed);
  const base =
    mode === "normal"
      ? normalBase(set, c, rng)
      : heldSet(set)
        ? held(n, solvedCube(n), "z2")
        : solvedCube(n);
  const alg = c.algs[0] as string;
  const auf = heldSet(set) && set.set !== "ortega-pbl";
  const after = auf ? nextInt(rng, 4) : 0;
  const before = auf ? nextInt(rng, 4) : 0;
  const caseMoves = c.setup
    ? parseMoves(n, c.setup)
    : invertMoves(parseMoves(n, alg));
  const setup = [
    ...parseMoves(n, uTurn(before)),
    ...caseMoves,
    ...parseMoves(n, uTurn(after)),
  ];
  const preAuf = uTurn((4 - after) % 4);
  return {
    n,
    state: applyMoves(n, base, setup),
    mask: mode === "mask" ? maskFor(n, set.mask) : null,
    goal: goalForCase(set, c),
    preAuf,
    answer: `${preAuf} ${alg}`.trim(),
  };
}

/** 공식 글 → 수(엔진 표기). 화면의 한 수씩 보기가 쓴다 */
export function movesOf(n: number, alg: string): CubeMove[] {
  return parseMoves(n, alg);
}

export function formatAlg(n: number, moves: readonly CubeMove[]): string {
  return formatMoves(n, moves);
}
