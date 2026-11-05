import type { PuzzleState } from "@game/puzzle-core";
import type { Axis, CubeMove } from "./move";
import { applyMove } from "./move";
import { faceColors, isSolved, rotatedSolved } from "./state";
import { CUBE_ROTATIONS, cubeTopology, OPPOSITE_FACE } from "./topology";

/**
 * 혼자 맞추기·대결의 진행 판정(docs/51 1-2, docs/47 「진행 판정」). 모두 순수 함수이고 지금 보이는 색만 본다.
 * 그래서 큐브를 어떻게 들든, 어느 색부터 맞추든 같은 값이 나온다. 대결 화면도 이미 주고받는 상태(둔 수)에서
 * 같은 함수로 계산한다(새로 보내는 정보가 없다).
 *
 * - 조각 점수: 방향까지 맞은 조각 1점, 자리만 맞은 조각 0.5점. 면 하나를 0·90·180·270° 돌린 경우 가운데
 *   가장 잘 맞는 쪽으로 센다(위층만 어긋난 큐브도 거의 다 맞은 것으로 보인다).
 *   기준 색: 홀수 크기는 면 정가운데 색, 짝수 크기는 큐브 전체 방향 24가지 가운데 가장 잘 맞는 방향.
 * - 큰 큐브(4×4부터): 센터를 맞춘 면 수 → 엣지 짝 수 → 조각 점수(코너 8 + 엣지 줄 12)를 차례로 쓴다.
 * - 이정표: 여러 해법의 대표 단계(층별·CFOP·루·ZZ·코너 먼저). 순서·색과 상관없이 지금 상태가 맞으면 켜진다.
 */

// ── 기준 색(프레임) ──────────────────────────────────────

/** frame[f] = 자리 면 f에 있어야 할 색 */
type Frame = Uint8Array;

const frameCache = new Map<number, Frame[]>();

/** 큐브 전체 방향 24가지마다의 기준 색 */
function allFrames(n: number): Frame[] {
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

/** 홀수 크기: 면 정가운데 색 하나. 짝수 크기: 24가지 모두(가장 잘 맞는 쪽을 고른다) */
function framesOf(n: number, colors: Uint8Array): Frame[] {
  if (n % 2 === 0) return allFrames(n);
  const nn = n * n;
  const mid = (nn - 1) / 2;
  return [
    Uint8Array.from({ length: 6 }, (_, f) => colors[f * nn + mid] as number),
  ];
}

// ── 조각 묶음 ──────────────────────────────────────────

/**
 * 점수에 세는 「조각」: 스티커 묶음. 3×3·2×2는 코너·엣지 조각 그대로, 큰 큐브는 코너와 엣지 한 줄(날개·가운데
 * 엣지 블럭을 합친 것)이다. 줄은 모두 한 색으로 묶였을 때만 맞은 것으로 친다.
 */
interface Unit {
  /** 스티커 자리들 */
  readonly stickers: readonly number[];
  /** 그 스티커가 있는 자리 면 */
  readonly faces: readonly number[];
  /** 닿은 면(서로 다른 것만, 작은 차례) */
  readonly sides: readonly number[];
}

const unitCache = new Map<number, Unit[]>();

function unitsOf(n: number): Unit[] {
  let hit = unitCache.get(n);
  if (hit) return hit;
  const topo = cubeTopology(n);
  const faceOf = (s: number) => topo.stickers[s]?.face as number;
  const out: Unit[] = [];
  const lines = new Map<string, number[]>();
  for (const p of topo.pieces) {
    if (p.kind === "corner" || (n === 3 && p.kind === "edge")) {
      const faces = p.stickers.map(faceOf);
      out.push({
        stickers: p.stickers,
        faces,
        sides: [...new Set(faces)].sort((a, b) => a - b),
      });
    } else if (p.kind === "edge" || p.kind === "wing") {
      const key = p.stickers
        .map(faceOf)
        .sort((a, b) => a - b)
        .join(",");
      lines.set(key, [...(lines.get(key) ?? []), ...p.stickers]);
    }
  }
  for (const stickers of lines.values()) {
    const faces = stickers.map(faceOf);
    out.push({
      stickers,
      faces,
      sides: [...new Set(faces)].sort((a, b) => a - b),
    });
  }
  hit = out;
  unitCache.set(n, hit);
  return hit;
}

/** 방향까지 맞았나: 모든 스티커가 그 자리 면의 기준 색 */
function unitOk(u: Unit, colors: Uint8Array, frame: Frame): boolean {
  for (let i = 0; i < u.stickers.length; i++)
    if (colors[u.stickers[i] as number] !== frame[u.faces[i] as number])
      return false;
  return true;
}

/**
 * 자리만 맞았나: 면마다 한 색으로 묶였고(큰 큐브의 엣지 줄), 그 색들이 자리 면들의 기준 색과 같다(차례는 상관없다)
 */
function unitPlaced(u: Unit, colors: Uint8Array, frame: Frame): boolean {
  const byFace = new Map<number, number>();
  for (let i = 0; i < u.stickers.length; i++) {
    const f = u.faces[i] as number;
    const c = colors[u.stickers[i] as number] as number;
    const seen = byFace.get(f);
    if (seen === undefined) byFace.set(f, c);
    else if (seen !== c) return false;
  }
  const have = [...byFace.values()].sort((a, b) => a - b);
  const want = u.sides.map((f) => frame[f] as number).sort((a, b) => a - b);
  return have.length === want.length && have.every((c, i) => c === want[i]);
}

// ── 바깥 면 돌리기(면 하나 어긋남 보정) ─────────────────────

const AXIS_OF: readonly Axis[] = ["y", "x", "z", "y", "x", "z"];

/** 자리 면 f의 바깥 한 층을 k번(시계) 돌리는 수 */
function outerTurn(n: number, f: number, k: 1 | 2 | 3): CubeMove {
  // 엔진의 층 번호는 1이 + 쪽(R·U·F), n이 − 쪽(L·D·B). 돌림 방향도 + 쪽에서 본 시계라 − 쪽 면은 거꾸로 센다
  const plus = f < 3;
  const layer = plus ? 1 : n;
  const turns = (plus ? k : 4 - k) as 1 | 2 | 3;
  return { axis: AXIS_OF[f] as Axis, from: layer, to: layer, turns };
}

/** 그대로 + 면 하나를 90·180·270° 돌린 상태들(맨 앞이 그대로) */
function withOneFaceTurned(n: number, state: PuzzleState): PuzzleState[] {
  const out = [state];
  for (let f = 0; f < 6; f++)
    for (const k of [1, 2, 3] as const)
      out.push(applyMove(n, state, outerTurn(n, f, k)));
  return out;
}

// ── 조각 점수 ──────────────────────────────────────────

export interface PieceScore {
  /** 점수(방향까지 1점, 자리만 0.5점). 다 맞지 않았으면 만점보다 0.5점 아래에서 멈춘다 */
  readonly score: number;
  /** 만점(조각 수: 3×3 20, 2×2 8, 큰 큐브 20) */
  readonly max: number;
  /** 제자리에 있는 조각(방향까지 맞은 것도 함께 센다) */
  readonly placed: number;
  /** 방향까지 맞은 조각 */
  readonly oriented: number;
}

function scoreIn(
  units: readonly Unit[],
  colors: Uint8Array,
  frame: Frame,
): { placed: number; oriented: number } {
  let placed = 0;
  let oriented = 0;
  for (const u of units) {
    if (unitOk(u, colors, frame)) {
      placed++;
      oriented++;
    } else if (unitPlaced(u, colors, frame)) placed++;
  }
  return { placed, oriented };
}

/** 조각 점수(docs/51 1-2). 큐브 전체 방향과 상관없다 */
export function pieceScore(n: number, state: PuzzleState): PieceScore {
  const units = unitsOf(n);
  const max = units.length;
  let best = { placed: -1, oriented: -1 };
  let bestValue = -1;
  for (const s of withOneFaceTurned(n, state)) {
    const colors = faceColors(n, s);
    for (const frame of framesOf(n, colors)) {
      const r = scoreIn(units, colors, frame);
      const v = r.placed + r.oriented;
      // 같은 점수면 방향까지 맞은 것이 많은 쪽(어느 방향에서 세든 같은 값이 나오게)
      if (v > bestValue || (v === bestValue && r.oriented > best.oriented)) {
        bestValue = v;
        best = r;
      }
    }
  }
  const raw = bestValue / 2;
  // 면 하나를 돌려 다 맞는 큐브(아직 다 맞지 않음)가 만점으로 보이지 않게
  const score = isSolved(n, state) ? max : Math.min(raw, max - 0.5);
  return { score, max, placed: best.placed, oriented: best.oriented };
}

// ── 큰 큐브: 센터·엣지 짝 ───────────────────────────────

/** 센터 블럭(정가운데·안쪽 센터)이 모두 한 색인 면 수(0~6). 3×3 이하는 늘 6 */
export function solvedCenterFaces(n: number, state: PuzzleState): number {
  if (n <= 3) return 6;
  const topo = cubeTopology(n);
  const colors = faceColors(n, state);
  const byFace = new Map<number, number | -1>();
  for (const p of topo.pieces) {
    if (p.kind !== "center" && p.kind !== "innerCenter") continue;
    for (const s of p.stickers) {
      const f = topo.stickers[s]?.face as number;
      const c = colors[s] as number;
      const seen = byFace.get(f);
      if (seen === undefined) byFace.set(f, c);
      else if (seen !== c) byFace.set(f, -1);
    }
  }
  let count = 0;
  for (const v of byFace.values()) if (v !== -1) count++;
  return count;
}

/** 두 면 모두 한 색으로 묶인 엣지 줄 수(0~12). 3×3 이하는 늘 12 */
export function pairedEdgeLines(n: number, state: PuzzleState): number {
  if (n <= 3) return 12;
  const colors = faceColors(n, state);
  let count = 0;
  for (const u of unitsOf(n)) {
    if (u.sides.length !== 2) continue;
    const byFace = new Map<number, number>();
    let ok = true;
    for (let i = 0; i < u.stickers.length && ok; i++) {
      const f = u.faces[i] as number;
      const c = colors[u.stickers[i] as number] as number;
      const seen = byFace.get(f);
      if (seen === undefined) byFace.set(f, c);
      else if (seen !== c) ok = false;
    }
    if (ok) count++;
  }
  return count;
}

export interface SolveProgress {
  /** 막대에 쓸 값(0~1). 맞춘 큐브만 1 */
  readonly value: number;
  readonly pieces: PieceScore;
  /** 큰 큐브: 센터를 맞춘 면 수(0~6) */
  readonly centers: number;
  /** 큰 큐브: 엣지 짝 수(0~12) */
  readonly pairs: number;
  /** 지금 보여 줄 숫자: 큰 큐브는 센터 → 엣지 짝 → 조각 차례로 넘어간다 */
  readonly focus: "centers" | "edges" | "pieces";
}

/**
 * 막대 하나로 보일 진행. 3×3 이하는 조각 점수 그대로, 큰 큐브는 센터·엣지 짝·조각 점수를 셋으로 나눠 더한다
 * (축소법 차례: 센터를 다 맞추고, 엣지를 짝짓고, 3×3처럼 맞춘다).
 */
export function solveProgress(n: number, state: PuzzleState): SolveProgress {
  const pieces = pieceScore(n, state);
  if (n <= 3)
    return {
      value: pieces.score / pieces.max,
      pieces,
      centers: 6,
      pairs: 12,
      focus: "pieces",
    };
  const centers = solvedCenterFaces(n, state);
  const pairs = pairedEdgeLines(n, state);
  const solved = isSolved(n, state);
  const value = solved
    ? 1
    : Math.min(
        (centers / 6 + pairs / 12 + pieces.score / pieces.max) / 3,
        0.99,
      );
  return {
    value,
    pieces,
    centers,
    pairs,
    focus: centers < 6 ? "centers" : pairs < 12 ? "edges" : "pieces",
  };
}

// ── 이정표 ────────────────────────────────────────────

export type MilestoneId =
  | "centers"
  | "edges"
  | "cross"
  | "f2l1"
  | "f2l2"
  | "f2l3"
  | "layer1"
  | "layer2"
  | "oll"
  | "ll"
  | "roux1"
  | "roux2"
  | "eoline"
  | "corners";

export interface MilestoneInfo {
  readonly id: MilestoneId;
  /** 칩 이름 */
  readonly label: string;
  /** 어느 해법의 단계인가(설명용) */
  readonly method: "reduction" | "layer" | "roux" | "zz" | "corners";
}

/**
 * 이정표 목록(차례는 해법 안의 차례). 칩·구간 기록은 지나간 시각 차례로 보인다.
 * F2L 4/4는 「둘째 층」과 같은 상태라 둘째 층 하나로 둔다. 「윗층」은 다 맞춘 상태라 맨 끝에 둔다.
 */
export const MILESTONES: readonly MilestoneInfo[] = [
  { id: "centers", label: "센터", method: "reduction" },
  { id: "edges", label: "엣지 짝", method: "reduction" },
  { id: "cross", label: "십자", method: "layer" },
  { id: "f2l1", label: "F2L 1/4", method: "layer" },
  { id: "f2l2", label: "F2L 2/4", method: "layer" },
  { id: "f2l3", label: "F2L 3/4", method: "layer" },
  { id: "layer1", label: "첫 층", method: "layer" },
  { id: "layer2", label: "둘째 층", method: "layer" },
  { id: "oll", label: "윗면", method: "layer" },
  { id: "roux1", label: "첫 블록", method: "roux" },
  { id: "roux2", label: "둘째 블록", method: "roux" },
  { id: "eoline", label: "EOLine", method: "zz" },
  { id: "corners", label: "코너 8", method: "corners" },
  // 다 맞춘 상태라 같은 순간에 켜진 것 가운데 늘 마지막
  { id: "ll", label: "윗층", method: "layer" },
];

const MILESTONE_LABEL = new Map(MILESTONES.map((m) => [m.id, m.label]));

export function milestoneLabel(id: string): string {
  return MILESTONE_LABEL.get(id as MilestoneId) ?? id;
}

export function isMilestoneId(id: string): id is MilestoneId {
  return MILESTONE_LABEL.has(id as MilestoneId);
}

/** 그 크기에서 켜질 수 있는 이정표(차례대로) */
export function milestonesFor(n: number): readonly MilestoneId[] {
  if (n === 2) return ["layer1", "oll", "ll"];
  if (n === 3)
    return MILESTONES.map((m) => m.id).filter(
      (id) => id !== "centers" && id !== "edges",
    );
  return ["centers", "edges", "ll"];
}

/** 3×3 조각 묶음(이정표 판정용) */
interface Pieces3 {
  /** 면 f가 닿은 엣지 조각 */
  edgesOn: number[][];
  /** 면 f가 닿은 코너 조각 */
  cornersOn: number[][];
  /** 두 면 사이 엣지(열쇠 "a,b" 작은 차례) */
  edgeBetween: Map<string, number>;
  /** 세 면 사이 코너(열쇠 "a,b,c" 작은 차례) */
  cornerBetween: Map<string, number>;
  units: Unit[];
}

let pieces3Cache: Pieces3 | null = null;

function pieces3(): Pieces3 {
  if (pieces3Cache) return pieces3Cache;
  const units = unitsOf(3);
  const edgesOn: number[][] = [[], [], [], [], [], []];
  const cornersOn: number[][] = [[], [], [], [], [], []];
  const edgeBetween = new Map<string, number>();
  const cornerBetween = new Map<string, number>();
  units.forEach((u, i) => {
    const key = u.sides.join(",");
    if (u.sides.length === 2) {
      edgeBetween.set(key, i);
      for (const f of u.sides) edgesOn[f]?.push(i);
    } else {
      cornerBetween.set(key, i);
      for (const f of u.sides) cornersOn[f]?.push(i);
    }
  });
  pieces3Cache = { edgesOn, cornersOn, edgeBetween, cornerBetween, units };
  return pieces3Cache;
}

const keyOf = (...faces: number[]) =>
  [...faces].sort((a, b) => a - b).join(",");

/** 면 a·b 둘 다에 수직인 두 면 */
function perpendicular(a: number, b: number): number[] {
  const axisA = a % 3;
  const axisB = b % 3;
  const c = 3 - axisA - axisB;
  return [c, c + 3];
}

/** 자리 면 f의 칸이 모두 color인가 */
function faceIs(colors: Uint8Array, f: number, color: number): boolean {
  for (let k = 0; k < 9; k++) if (colors[f * 9 + k] !== color) return false;
  return true;
}

/** 층별·CFOP 이정표(3×3, 가운데 색 기준) */
function layerMilestones(
  colors: Uint8Array,
  frame: Frame,
  out: Set<MilestoneId>,
): void {
  const p = pieces3();
  const ok = (i: number) => unitOk(p.units[i] as Unit, colors, frame);
  for (let f = 0; f < 6; f++) {
    if (!(p.edgesOn[f] as number[]).every(ok)) continue;
    out.add("cross");
    const top = OPPOSITE_FACE[f as 0] as number;
    let pairs = 0;
    let corners = 0;
    for (const c of p.cornersOn[f] as number[]) {
      if (!ok(c)) continue;
      corners++;
      const sides = (p.units[c] as Unit).sides.filter((x) => x !== f);
      const edge = p.edgeBetween.get(keyOf(...sides));
      if (edge !== undefined && ok(edge)) pairs++;
    }
    if (pairs >= 1) out.add("f2l1");
    if (pairs >= 2) out.add("f2l2");
    if (pairs >= 3) out.add("f2l3");
    if (corners === 4) out.add("layer1");
    if (pairs === 4) {
      out.add("layer2");
      if (faceIs(colors, top, frame[top] as number)) out.add("oll");
    }
  }
}

/** 면 s 쪽 1×2×3 블록(아래 d): 엣지 s-d, s-a, s-b, 코너 s-d-a, s-d-b (a·b는 s·d 둘 다에 수직) */
function blockPieces(s: number, d: number): number[] {
  const p = pieces3();
  const [a, b] = perpendicular(s, d) as [number, number];
  return [
    p.edgeBetween.get(keyOf(s, d)),
    p.edgeBetween.get(keyOf(s, a)),
    p.edgeBetween.get(keyOf(s, b)),
    p.cornerBetween.get(keyOf(s, d, a)),
    p.cornerBetween.get(keyOf(s, d, b)),
  ].filter((x): x is number => x !== undefined);
}

/**
 * 루 블록. 블록은 옆면(s) 층에만 있어 가운데 층(M)을 돌려도 블록은 그대로다. 그래서 가운데 층을 0~3번 돌린
 * 기준(가운데 색) 가운데 하나라도 맞으면 블록이 있는 것으로 본다. 둘째 블록은 맞은편(같은 아래 면, 같은 가운데 층)
 */
function rouxMilestones(state: PuzzleState, out: Set<MilestoneId>): void {
  const p = pieces3();
  for (const axis of ["x", "y", "z"] as const) {
    // 이 축의 바깥 면(옆면 후보): x는 R·L, y는 U·D, z는 F·B
    const sides = axis === "x" ? [1, 4] : axis === "y" ? [0, 3] : [2, 5];
    for (let k = 0; k < 4; k++) {
      const s =
        k === 0
          ? state
          : applyMove(3, state, {
              axis,
              from: 2,
              to: 2,
              turns: k as 1 | 2 | 3,
            });
      const colors = faceColors(3, s);
      const frame = framesOf(3, colors)[0] as Frame;
      const ok = (i: number) => unitOk(p.units[i] as Unit, colors, frame);
      for (let d = 0; d < 6; d++) {
        if (d % 3 === (sides[0] as number) % 3) continue;
        const first = sides.filter((side) => blockPieces(side, d).every(ok));
        if (first.length >= 1) out.add("roux1");
        if (first.length === 2) out.add("roux2");
      }
    }
  }
}

/**
 * 엣지 방향(EO, 축 a 기준): 축 a의 면(ZZ의 F·B)을 4분의 1 돌리지 않고 맞출 수 있는가. 엣지마다 「으뜸 스티커」를
 * 정한다: 다른 한 축(p)의 면에 닿은 스티커, 없으면 축 a 면의 스티커. 조각도 같은 규칙으로 색의 면을 보고 정하고,
 * 조각의 으뜸 스티커가 자리의 으뜸 칸에 있으면 방향이 맞다(Kociemba 엣지 방향과 같다).
 */
function edgesOriented(colors: Uint8Array, frame: Frame, a: number): boolean {
  const p = pieces3();
  const axisA = a % 3;
  const axisP = (axisA + 1) % 3;
  const home = new Map<number, number>();
  for (let f = 0; f < 6; f++) home.set(frame[f] as number, f);
  for (const u of p.units) {
    if (u.sides.length !== 2) continue;
    const slotPrime = (i: number) => (u.faces[i] as number) % 3 === axisP;
    const slotIdx = slotPrime(0)
      ? 0
      : slotPrime(1)
        ? 1
        : (u.faces[0] as number) % 3 === axisA
          ? 0
          : 1;
    const homeOf = (i: number) =>
      home.get(colors[u.stickers[i] as number] as number) ?? -1;
    const pieceP = (i: number) => homeOf(i) % 3 === axisP;
    const pieceIdx = pieceP(0)
      ? 0
      : pieceP(1)
        ? 1
        : homeOf(0) % 3 === axisA
          ? 0
          : 1;
    if (slotIdx !== pieceIdx) return false;
  }
  return true;
}

/** ZZ EOLine: 어느 축이든 엣지 방향이 맞고, 그 축에 수직인 면 d의 두 엣지(d-앞·d-뒤)가 맞음 */
function eolineMilestone(
  colors: Uint8Array,
  frame: Frame,
  out: Set<MilestoneId>,
): void {
  const p = pieces3();
  const ok = (i: number | undefined) =>
    i !== undefined && unitOk(p.units[i] as Unit, colors, frame);
  for (let a = 0; a < 3; a++) {
    let lineFace = -1;
    for (let d = 0; d < 6 && lineFace < 0; d++) {
      if (d % 3 === a) continue;
      if (
        ok(p.edgeBetween.get(keyOf(d, a))) &&
        ok(p.edgeBetween.get(keyOf(d, a + 3)))
      )
        lineFace = d;
    }
    if (lineFace >= 0 && edgesOriented(colors, frame, a)) {
      out.add("eoline");
      return;
    }
  }
}

/** 코너 먼저: 코너 8개가 서로 맞음(큐브 전체 방향 24가지 가운데 하나에 모두 맞으면) */
function cornersMilestone(
  n: number,
  colors: Uint8Array,
  out: Set<MilestoneId>,
): boolean {
  const corners = unitsOf(n).filter((u) => u.sides.length === 3);
  const ok = allFrames(n).some((fr) =>
    corners.every((u) => unitOk(u, colors, fr)),
  );
  if (ok) out.add("corners");
  return ok;
}

/** 2×2: 첫 층(어느 면이든 코너 넷이 한 방향에 맞음), 윗면(+ 맞은편 면이 한 색) */
function pocketMilestones(colors: Uint8Array, out: Set<MilestoneId>): void {
  const corners = unitsOf(2);
  for (const fr of allFrames(2)) {
    for (let f = 0; f < 6; f++) {
      const layer = corners.filter((u) => u.sides.includes(f));
      if (!layer.every((u) => unitOk(u, colors, fr))) continue;
      out.add("layer1");
      const top = OPPOSITE_FACE[f as 0] as number;
      let one = true;
      for (let k = 0; k < 4; k++)
        if (colors[top * 4 + k] !== fr[top]) one = false;
      if (one) out.add("oll");
    }
  }
}

/** 지금 상태에서 켜진 이정표(크기마다 `milestonesFor`의 차례대로) */
export function milestonesOf(n: number, state: PuzzleState): MilestoneId[] {
  const out = new Set<MilestoneId>();
  const colors = faceColors(n, state);
  if (isSolved(n, state)) for (const id of milestonesFor(n)) out.add(id);
  else if (n === 2) pocketMilestones(colors, out);
  else if (n === 3) {
    const frame = framesOf(3, colors)[0] as Frame;
    layerMilestones(colors, frame, out);
    rouxMilestones(state, out);
    eolineMilestone(colors, frame, out);
    cornersMilestone(3, colors, out);
  } else {
    if (solvedCenterFaces(n, state) === 6) out.add("centers");
    if (pairedEdgeLines(n, state) === 12) out.add("edges");
  }
  return milestonesFor(n).filter((id) => out.has(id));
}
