// ZZ EO라인의 경우별 정해진 길(docs/47 16-15): 엣지 방향(나쁜 엣지 고치기) → 아래-앞·아래-뒤 엣지 블럭 놓기.
// 흰 면을 아래로 쥔(z2) 3×3에서 쓴다. 「될 때까지」가 없다: 나쁜 엣지는 F 한 번마다 둘 이상 줄거나(넷 이상일 때),
// 둘에서 넷으로 바뀐 뒤 다음 F에서 없어진다. 단원 글(lessons-zz.ts)이 이 경우를 쓰고 zz-path.test.ts가 무작위 상태로 본다.
import {
  applyMoves,
  cubeTopology,
  faceColors,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import { TWO_LOOK_OLL, TWO_LOOK_PLL } from "./algs-2look";

const U = 0;
const R = 1;
const F = 2;
const D = 3;
const L = 4;
const B = 5;
/** 엔진 색 번호: 흰0 빨1 초2 노3 주4 파5 */
const UD_COLORS = [0, 3];
const FB_COLORS = [2, 5];

export const play3 = (s: PuzzleState, alg: string) =>
  alg.trim() ? applyMoves(3, s, parseMoves(3, alg)) : s;
const join = (...xs: string[]) => xs.filter(Boolean).join(" ");

const TOPO = cubeTopology(3);
/** 엣지 자리: 조각 번호와 닿은 두 면 */
const EDGES = TOPO.pieces
  .map((p, i) => ({ p, i }))
  .filter(({ p }) => p.kind === "edge")
  .map(({ p, i }) => ({
    piece: i,
    faces: p.stickers.map((st) => TOPO.stickers[st]?.face as number),
    stickers: p.stickers,
  }));
const edgeAt = (faces: number[]) =>
  EDGES.find(
    (e) => e.faces.length === 2 && faces.every((f) => e.faces.includes(f)),
  ) as (typeof EDGES)[number];

/**
 * 좋은 엣지인가: 기준 칸(흰·노랑, 없으면 초록·파랑)이 기준 면(위·아래 층 자리면 위·아래, 가운데 층이면 앞·뒤)을 본다
 */
function goodAt(col: Uint8Array, e: (typeof EDGES)[number]): boolean {
  const colors = e.stickers.map((st) => col[st] as number);
  const refFaces = e.faces.includes(U) || e.faces.includes(D) ? [U, D] : [F, B];
  const k = colors.findIndex((c) => UD_COLORS.includes(c));
  const ref = k >= 0 ? k : colors.findIndex((c) => FB_COLORS.includes(c));
  return refFaces.includes(e.faces[ref] as number);
}

/** 나쁜 엣지의 자리(면 쌍) */
export function badEdges(s: PuzzleState): number[][] {
  const col = faceColors(3, s);
  return EDGES.filter((e) => !goodAt(col, e)).map((e) => e.faces);
}

const isBadAt = (s: PuzzleState, faces: number[]) =>
  !goodAt(faceColors(3, s), edgeAt(faces));

/** 앞면 네 자리와 그 자리를 채우는 층: 앞-오른쪽(R) → 앞-왼쪽(L) → 위-앞(U) → 아래-앞(D) */
const FRONT_SLOTS: { slot: number[]; turns: string[] }[] = [
  { slot: [F, R], turns: ["R", "R2", "R'"] },
  { slot: [F, L], turns: ["L", "L2", "L'"] },
  { slot: [U, F], turns: ["U", "U2", "U'"] },
  { slot: [D, F], turns: ["D", "D2", "D'"] },
];
const frontBad = (s: PuzzleState) =>
  FRONT_SLOTS.filter((x) => isBadAt(s, x.slot)).length;

export type ZzStepId =
  | "eo-four"
  | "eo-four-around"
  | "eo-four-around"
  | "eo-two-one"
  | "eo-two-none"
  | "eo-two-both"
  | "line-top"
  | "line-middle"
  | "line-bottom";

export interface ZzStep {
  caseId: ZzStepId;
  /** 공식 앞에 할 일 */
  hold: string;
  alg: string;
}

export const stepMovesZz = (st: ZzStep) => join(st.hold, st.alg);

/** 앞면 자리를 차례로 보며, 좋은 엣지가 있는 자리에 그 층 한 번 돌리기로 나쁜 엣지를 데려온다(많아야 want개가 될 때까지) */
function gather(
  s: PuzzleState,
  want: number,
): { moves: string; around: boolean } {
  let t = s;
  const moves: string[] = [];
  let around = false;
  for (const { slot, turns } of FRONT_SLOTS) {
    if (frontBad(t) >= want) break;
    if (isBadAt(t, slot)) continue;
    const kept = FRONT_SLOTS.filter((x) => isBadAt(t, x.slot));
    const ok = (u: PuzzleState) =>
      isBadAt(u, slot) && kept.every((x) => isBadAt(u, x.slot));
    // 그 자리의 층 한 번으로 데려온다
    let m = turns.find((x) => ok(play3(t, x)));
    // 안 되면 나쁜 엣지를 다른 층(X)으로 그 자리의 층에 옮기고, 그 층(Y)을 돌려 넣고, X를 되돌린다(예: L U' L')
    if (!m)
      for (const x of LAYER_TURNS) {
        if (x[0] === turns[0]?.[0]) continue;
        const y = turns.find((yy) => ok(play3(t, `${x} ${yy} ${undo(x)}`)));
        if (y) {
          m = `${x} ${y} ${undo(x)}`;
          around = true;
          break;
        }
      }
    if (!m) continue;
    moves.push(m);
    t = play3(t, m);
  }
  return { moves: join(...moves), around };
}

const LAYER_TURNS = ["U", "D", "R", "L"].flatMap((f) => [f, `${f}2`, `${f}'`]);
const undo = (m: string) =>
  m.endsWith("2") ? m : m.endsWith("'") ? m.slice(0, -1) : `${m}'`;

/** 엣지 방향의 다음 한 걸음(다 좋으면 null) */
export function nextEo(s: PuzzleState): ZzStep | null {
  const b = badEdges(s).length;
  if (b === 0) return null;
  if (b >= 4) {
    const g = gather(s, 4);
    return {
      caseId: g.around ? "eo-four-around" : "eo-four",
      hold: g.moves,
      alg: "F",
    };
  }
  const onFront = frontBad(s);
  if (onFront === 1) return { caseId: "eo-two-one", hold: "", alg: "F" };
  if (onFront === 0)
    return { caseId: "eo-two-none", hold: gather(s, 1).moves, alg: "F" };
  // 둘 다 앞면에: 앞면 자리 차례로 처음 나쁜 엣지를 그 층 한 번 돌려 뺀다(빈 자리에는 좋은 엣지가 들어온다)
  const first = FRONT_SLOTS.find((x) => isBadAt(s, x.slot)) as {
    turns: string[];
  };
  return { caseId: "eo-two-both", hold: first.turns[0] as string, alg: "F" };
}

/** 그 두 색 엣지 블럭이 든 자리 */
function whereIs(s: PuzzleState, colors: number[]): number[] {
  const col = faceColors(3, s);
  const want = [...colors].sort().join();
  const e = EDGES.find(
    (x) =>
      x.stickers
        .map((st) => col[st] as number)
        .sort()
        .join() === want,
  ) as (typeof EDGES)[number];
  return e.faces;
}
const same = (a: number[], b: number[]) =>
  a.length === b.length && a.every((f) => b.includes(f));

/** 가운데 층 자리를 위 층으로 올리는 수(앞-오른쪽 R, 뒤-오른쪽 R', 앞-왼쪽 L', 뒤-왼쪽 L) */
const MIDDLE_UP: [number[], string][] = [
  [[F, R], "R"],
  [[B, R], "R'"],
  [[F, L], "L'"],
  [[B, L], "L"],
];
/** 아래 층 옆 자리를 위 층으로(아래-오른쪽 R2, 아래-왼쪽 L2) */
const BOTTOM_UP: [number[], string][] = [
  [[D, R], "R2"],
  [[D, L], "L2"],
];

/**
 * 줄 엣지 하나(흰 면 아래, 흰-초록은 아래-앞, 흰-파랑은 아래-뒤). 위 층이면 U로 그 자리 위에 두고 F2(B2),
 * 가운데 층이면 R·L로 위 층에 올린 뒤 같은 법, 아래 층이면 흰-초록은 D로 바로, 흰-파랑은 R2·L2로 위 층에 올린다
 */
export function nextLine(s: PuzzleState): ZzStep | null {
  for (const [colors, home, top, face] of [
    [[0, 2], [D, F], [U, F], "F2"],
    [[0, 5], [D, B], [U, B], "B2"],
  ] as const) {
    const at = whereIs(s, [...colors]);
    if (same(at, [...home])) continue;
    const toTop = (t: PuzzleState) =>
      (["", "U", "U'", "U2"] as const).find((u) =>
        same(whereIs(play3(t, u), [...colors]), [...top]),
      ) as string;
    if (at.includes(U)) {
      return { caseId: "line-top", hold: toTop(s), alg: face };
    }
    const mid = MIDDLE_UP.find(([f]) => same(at, f));
    if (mid) {
      const t = play3(s, mid[1]);
      return {
        caseId: "line-middle",
        hold: join(mid[1], toTop(t)),
        alg: face,
      };
    }
    // 아래 층
    if (face === "F2") {
      const d = (["D", "D'", "D2"] as const).find((x) =>
        same(whereIs(play3(s, x), [...colors]), [...home]),
      ) as string;
      return { caseId: "line-bottom", hold: "", alg: d };
    }
    const up = BOTTOM_UP.find(([f]) => same(at, f));
    if (!up) throw new Error("줄 엣지 자리를 모른다");
    const t = play3(s, up[1]);
    return { caseId: "line-bottom", hold: join(up[1], toTop(t)), alg: face };
  }
  return null;
}

export function runZz(
  s: PuzzleState,
  next: (s: PuzzleState) => ZzStep | null,
  limit = 12,
): { state: PuzzleState; steps: ZzStep[] } {
  const steps: ZzStep[] = [];
  let state = s;
  for (;;) {
    const st = next(state);
    if (!st) return { state, steps };
    steps.push(st);
    if (steps.length > limit) throw new Error("ZZ 단계가 끝나지 않는다");
    state = play3(state, stepMovesZz(st));
  }
}

export { B, D, F, L, R, U };

// ── ZZ 블록(ZZF2L): 바닥 엣지 블럭 → 앞 칸 짝 → 뒤 칸 짝, 왼쪽 블록 다음 오른쪽 블록 ──────────────
// EO라인 뒤 흰 면 아래(z2)·초록 앞 그대로 쥐고 R·U·L만 쓴다(F·B는 엣지 방향을 깨고, D는 줄을 옮긴다).
// 짝 넣기의 원본은 오른쪽 앞 칸(앞-오른쪽) 표 하나(ZZ_PAIR_CASES)다. 뒤 칸은 앞↔뒤를 바꿔 읽고 수의 방향을 모두 반대로,
// 왼쪽 블록은 오른쪽↔왼쪽을 바꿔 읽고 R을 L로·방향을 모두 반대로 쓴다(mirrorPairAlg). 큐브를 돌려 쥐지 않는다.
// 엣지 방향이 맞았으니 위 층에 온 가운데 층 엣지 블럭은 늘 앞뒤 색(초록·파랑)이 위를 본다. 그래서 짝의 경우는
// 「코너 블럭의 흰색이 어디를 보나(위·칸의 앞뒤 면·블록 쪽 옆면) × 엣지 블럭이 위 층 어디에 있나(넷)」 열둘뿐이다.

/** 블록 칸: 앞-왼쪽·뒤-왼쪽·앞-오른쪽·뒤-오른쪽 */
export type ZzSlot = "FL" | "BL" | "FR" | "BR";

/** 코너 블럭의 흰색이 보는 쪽: 위, 칸의 앞뒤 면(앞 칸이면 앞), 블록 쪽 옆면(오른쪽 블록이면 오른쪽) */
export type PairWhite = "up" | "fb" | "side";
/** 엣지 블럭의 위 층 자리(칸 기준): 칸 쪽 앞뒤(앞 칸이면 위-앞), 블록 쪽(위-오른쪽), 맞은편 앞뒤(위-뒤), 맞은편 옆(위-왼쪽) */
export type PairEdge = "near" | "side" | "far" | "across";

export interface PairCase {
  white: PairWhite;
  edge: PairEdge;
  /** 오른쪽 앞 칸에서: 코너 블럭을 U로 칸 바로 위(위-앞-오른쪽)에 둔 뒤 치는 공식 */
  alg: string;
}

/**
 * 오른쪽 앞 칸(앞-오른쪽) 짝 넣기 열두 경우. 코너 블럭은 칸 바로 위에 있다.
 * 공식은 R·U만으로 가장 짧은 것 가운데 R 4분의 1 돌리기 짝(R … R')으로 읽히는 것을 골랐다(zz-path.test.ts가
 * 뒤 칸·아래-오른쪽 엣지 블럭·왼쪽 블록·줄·엣지 방향을 지키며 짝을 넣는지 본다).
 */
export const ZZ_PAIR_CASES: PairCase[] = [
  { white: "fb", edge: "side", alg: "U R U' R'" },
  { white: "side", edge: "far", alg: "R U R'" },
  { white: "fb", edge: "far", alg: "U' R U R' U2 R U' R'" },
  { white: "fb", edge: "across", alg: "U' R U2 R' U2 R U' R'" },
  { white: "fb", edge: "near", alg: "R U R' U2 R U' R' U R U' R'" },
  { white: "side", edge: "side", alg: "U' R U' R' U R U R'" },
  { white: "side", edge: "across", alg: "U2 R U' R' U' R U R'" },
  { white: "side", edge: "near", alg: "R' U2 R2 U R2 U R" },
  { white: "up", edge: "side", alg: "R U2 R' U' R U R'" },
  { white: "up", edge: "across", alg: "R U' R' U2 R U R'" },
  { white: "up", edge: "far", alg: "U R U2 R' U R U' R'" },
  { white: "up", edge: "near", alg: "U2 R2 U2 R' U' R U' R2" },
];

/** 오른쪽 앞 칸 공식을 다른 칸 공식으로: 뒤 칸은 방향을 모두 반대로, 왼쪽은 R을 L로 바꾸고 방향을 모두 반대로 */
export function mirrorPairAlg(alg: string, slot: ZzSlot): string {
  const back = slot[0] === "B";
  const left = slot[1] === "L";
  return alg
    .split(/\s+/)
    .filter(Boolean)
    .map((m) => {
      const face = left && m[0] === "R" ? "L" : (m[0] as string);
      const flip = back !== left;
      const t = `${face}${m.slice(1)}`;
      return flip ? undo(t) : t;
    })
    .join(" ");
}

/** 칸마다 쓰는 면 글자: 칸 바로 위 코너 자리, 앞뒤 면, 옆면, 위 층 엣지 네 자리(near·side·far·across), 꺼내기 공식 */
const SLOT_GEOM: Record<
  ZzSlot,
  {
    above: string;
    fb: string;
    side: string;
    edges: Record<PairEdge, string>;
    out: string;
    /** 꺼내기 공식이 칸으로 내리는 위 층 자리(코너, 엣지) */
    danger: [string, string];
    corner: number[];
    edge: number[];
  }
> = {
  FR: {
    above: "FRU",
    fb: "F",
    side: "R",
    edges: { near: "FU", side: "RU", far: "BU", across: "LU" },
    out: "R U R'",
    danger: ["FRU", "BU"],
    corner: [0, 2, 4],
    edge: [2, 4],
  },
  BR: {
    above: "BRU",
    fb: "B",
    side: "R",
    edges: { near: "BU", side: "RU", far: "FU", across: "LU" },
    out: "R' U' R",
    danger: ["BRU", "FU"],
    corner: [0, 5, 4],
    edge: [5, 4],
  },
  FL: {
    above: "FLU",
    fb: "F",
    side: "L",
    edges: { near: "FU", side: "LU", far: "BU", across: "RU" },
    out: "L' U' L",
    danger: ["FLU", "BU"],
    corner: [0, 2, 1],
    edge: [2, 1],
  },
  BL: {
    above: "BLU",
    fb: "B",
    side: "L",
    edges: { near: "BU", side: "LU", far: "FU", across: "RU" },
    out: "L U L'",
    danger: ["BLU", "FU"],
    corner: [0, 5, 1],
    edge: [5, 1],
  },
};

const FACE_LETTERS = "URFDLB";
const sortLetters = (s: string) => [...s].sort().join("");

/** 그 색 조각의 자리(면 글자 정렬)와 첫 색 칸이 보는 면 */
export function pieceAt(
  s: PuzzleState,
  colors: number[],
): { slot: string; ref: string } {
  const col = faceColors(3, s);
  for (const p of TOPO.pieces) {
    if (p.stickers.length !== colors.length) continue;
    const cs = p.stickers.map((st) => col[st] as number);
    if (!colors.every((c) => cs.includes(c))) continue;
    const faces = p.stickers.map(
      (st) => FACE_LETTERS[TOPO.stickers[st]?.face as number] as string,
    );
    return {
      slot: sortLetters(faces.join("")),
      ref: faces[cs.indexOf(colors[0] as number)] as string,
    };
  }
  throw new Error("조각을 못 찾음");
}

/** 그 색 조각이 제자리에 바르게 있나(센터 색과 칸 색이 모두 같다) */
export function pieceSolved(s: PuzzleState, colors: number[]): boolean {
  const col = faceColors(3, s);
  const centerColor = (f: number) => {
    const st = TOPO.pieces.find(
      (p) =>
        p.kind === "center" &&
        TOPO.stickers[p.stickers[0] as number]?.face === f,
    )?.stickers[0] as number;
    return col[st] as number;
  };
  for (const p of TOPO.pieces) {
    if (p.stickers.length !== colors.length) continue;
    const cs = p.stickers.map((st) => col[st] as number);
    if (!colors.every((c) => cs.includes(c))) continue;
    return p.stickers.every(
      (st) => col[st] === centerColor(TOPO.stickers[st]?.face as number),
    );
  }
  return false;
}

const inTop = (slot: string) => slot.includes("U");

export type ZzBlockCaseId =
  | "base-top"
  | "base-middle"
  | "base-right"
  | "pair-out-own"
  | "pair-out-other"
  | "pair-out-right"
  | `pair-${PairWhite}-${PairEdge}`;

export interface ZzBlockStep {
  caseId: ZzBlockCaseId;
  /** 어느 단계인가: 바닥 엣지 블럭(DL·DR) 또는 칸 */
  part: "DL" | "DR" | ZzSlot;
  hold: string;
  alg: string;
}

/** 블록 바닥 엣지 블럭: 왼쪽은 흰-빨강(아래-왼쪽), 오른쪽은 흰-주황(아래-오른쪽) */
const BASES = {
  DL: { colors: [0, 1], top: "LU", half: "L2" },
  DR: { colors: [0, 4], top: "RU", half: "R2" },
} as const;
/** 바닥 엣지 블럭을 위 층으로 올리는 수(자리 → 수) */
const BASE_LIFT: Record<string, string> = {
  FL: "L'",
  BL: "L",
  FR: "R",
  BR: "R'",
  DR: "R2",
};
const U_ALIGN = ["", "U", "U'", "U2"];

function nextBase(s: PuzzleState, part: "DL" | "DR"): ZzBlockStep | null {
  const b = BASES[part];
  if (pieceSolved(s, [...b.colors])) return null;
  const at = pieceAt(s, [...b.colors]).slot;
  const lift = inTop(at) ? "" : (BASE_LIFT[at] as string);
  if (!inTop(at) && !lift)
    throw new Error(`바닥 엣지 블럭 자리를 모른다: ${at}`);
  const t = play3(s, lift);
  const u = U_ALIGN.find(
    (x) => pieceAt(play3(t, x), [...b.colors]).slot === sortLetters(b.top),
  ) as string;
  return {
    caseId: inTop(at) ? "base-top" : at === "DR" ? "base-right" : "base-middle",
    part,
    hold: join(lift, u),
    alg: b.half,
  };
}

/** 칸 자리(코너 자리·엣지 자리) → 그 칸 */
function slotOfPosition(pos: string): ZzSlot | "DR" | null {
  for (const k of Object.keys(SLOT_GEOM) as ZzSlot[]) {
    const g = k.split("").concat();
    const corner = sortLetters(`D${g.join("")}`);
    const edge = sortLetters(g.join(""));
    if (pos === corner || pos === edge) return k;
  }
  return pos === "DR" ? "DR" : null;
}

/** 오른쪽 블록이 아직 없을 때(왼쪽 블록을 만들 때) 오른쪽의 조각을 R 한 번으로 위 층에 올리는 수 */
const RIGHT_LIFT = ["R", "R'", "R2"];

function nextPair(
  s: PuzzleState,
  slot: ZzSlot,
  rightFree: boolean,
): ZzBlockStep | null {
  const g = SLOT_GEOM[slot];
  const cSolved = pieceSolved(s, g.corner);
  const eSolved = pieceSolved(s, g.edge);
  if (cSolved && eSolved) return null;
  const c = pieceAt(s, g.corner);
  const e = pieceAt(s, g.edge);
  // ① 꺼내기: 위 층 밖에 있는 짝 조각(코너 블럭 먼저)
  if (!inTop(c.slot) || !inTop(e.slot)) {
    const out = !inTop(c.slot) ? c : e;
    const other = out === c ? e : c;
    const from = slotOfPosition(out.slot);
    if (!from) throw new Error(`꺼낼 자리를 모른다: ${out.slot}`);
    if (from === "DR" || (rightFree && from[1] === "R")) {
      // 오른쪽 블록이 아직 없으면 R 한 번으로 올린다. 위 층의 다른 짝 조각이 오른쪽 열에 있으면 먼저 U2로 비킨다
      const pre = inTop(other.slot) && other.slot.includes("R") ? "U2" : "";
      const t = play3(s, pre);
      const r = RIGHT_LIFT.find((x) =>
        inTop(pieceAt(play3(t, x), out === c ? g.corner : g.edge).slot),
      ) as string;
      return { caseId: "pair-out-right", part: slot, hold: pre, alg: r };
    }
    const trig = SLOT_GEOM[from as ZzSlot];
    const pre =
      inTop(other.slot) && trig.danger.includes(other.slot) ? "U2" : "";
    return {
      caseId: from === slot ? "pair-out-own" : "pair-out-other",
      part: slot,
      hold: pre,
      alg: trig.out,
    };
  }
  // ② 둘 다 위 층: U로 코너 블럭을 칸 바로 위에 두고 표의 공식
  const u = U_ALIGN.find(
    (x) => pieceAt(play3(s, x), g.corner).slot === sortLetters(g.above),
  ) as string;
  const t = play3(s, u);
  const ct = pieceAt(t, g.corner);
  const et = pieceAt(t, g.edge);
  const white: PairWhite =
    ct.ref === "U" ? "up" : ct.ref === g.fb ? "fb" : "side";
  const edge = (Object.keys(g.edges) as PairEdge[]).find(
    (k) => sortLetters(g.edges[k]) === et.slot,
  ) as PairEdge;
  const pc = ZZ_PAIR_CASES.find(
    (x) => x.white === white && x.edge === edge,
  ) as PairCase;
  return {
    caseId: `pair-${white}-${edge}`,
    part: slot,
    hold: u,
    alg: mirrorPairAlg(pc.alg, slot),
  };
}

/** ZZ 블록의 다음 한 걸음: 왼쪽 블록(바닥 → 앞 칸 → 뒤 칸) 다음 오른쪽 블록(같은 차례). 다 맞으면 null */
export function nextBlock(s: PuzzleState): ZzBlockStep | null {
  return (
    nextBase(s, "DL") ??
    nextPair(s, "FL", true) ??
    nextPair(s, "BL", true) ??
    nextBase(s, "DR") ??
    nextPair(s, "FR", false) ??
    nextPair(s, "BR", false)
  );
}

export const stepMovesBlock = (st: ZzBlockStep) => join(st.hold, st.alg);

export function runBlocks(
  s: PuzzleState,
  until: "left" | "all" = "all",
): { state: PuzzleState; steps: ZzBlockStep[] } {
  const steps: ZzBlockStep[] = [];
  let state = s;
  for (;;) {
    const st = nextBlock(state);
    if (!st || (until === "left" && (st.part === "DR" || st.part[1] === "R")))
      return { state, steps };
    steps.push(st);
    if (steps.length > 40) throw new Error("ZZ 블록이 끝나지 않는다");
    state = play3(state, stepMovesBlock(st));
  }
}

// ── ZZ 마지막 층(2026-11-10, docs/47 16-17) ───────────
// 블록 뒤 노란 십자가 늘 있으니 CFOP 2단계의 코너 단계(공식 일곱)와 2단계 PLL(코너 → 엣지)로 닫는다(algs-2look.ts의
// 공식과 쥐는 법 그대로). 단계마다 지금 모양에 맞는 공식은 하나이고, 쥐는 U·y는 그 공식이 끝내는 것 가운데 처음 것이다.
// ① 윗면: 위 층 코너의 노랑이 모두 위가 아니면 모양(H·파이·U·T·나비넥타이·안티수네·수네)의 공식, U로 쥐기
// ② PLL 코너: 헤드라이트가 네 옆면에 다 있지 않으면, 한 면에 있을 때 U로 그 면을 왼쪽에 두고 T퍼뮤, 없으면 Y퍼뮤
// ③ 위 층 코너를 U로 제자리에
// ④ PLL 엣지: 다 맞지 않았으면 맞은 옆면을 y로 뒤에 두고 Ua·Ub퍼뮤, 맞은 옆면이 없으면 H퍼뮤 또는 Z퍼뮤(y로 쥐고 공식 뒤 U')

const algOf2 = (id: string) =>
  [...TWO_LOOK_OLL, ...TWO_LOOK_PLL].find((c) => c.id === id)
    ?.algs[0] as string;
const LL_CORNER_ORDER = [21, 22, 23, 24, 25, 26, 27].map(
  (k) => `2look-oll-${k}`,
);
const YELLOW = 3;
const AUF = ["", "U", "U'", "U2"];
const YROT = ["", "y", "y'", "y2"];

export type ZzLlStage = "oll" | "pll-corners" | "align" | "pll-edges";
export interface ZzLlStep {
  stage: ZzLlStage;
  /** algs-2look.ts 공식 id(③은 "align") */
  caseId: string;
  hold: string;
  alg: string;
}
export const stepMovesLl = (st: ZzLlStep) => join(st.hold, st.alg);

const topYellow = (s: PuzzleState) => {
  const col = faceColors(3, s);
  return Array.from({ length: 9 }, (_, i) => col[i]).every((c) => c === YELLOW);
};
/** 옆면 넷 모두 윗줄 양 끝 코너 스티커가 같은 색(헤드라이트 넷) */
const cornersMatched = (s: PuzzleState) => {
  const col = faceColors(3, s);
  return [R, F, L, B].every((f) => col[f * 9] === col[f * 9 + 2]);
};
/** 위 층 코너가 제자리(옆면 윗줄 왼쪽 끝이 그 면 센터 색) */
const cornersHome = (s: PuzzleState) => {
  const col = faceColors(3, s);
  return [R, F, L, B].every((f) => col[f * 9] === col[f * 9 + 4]);
};
const allSolved = (s: PuzzleState) => {
  const col = faceColors(3, s);
  return [0, 1, 2, 3, 4, 5].every((f) =>
    Array.from({ length: 9 }, (_, i) => col[f * 9 + i]).every(
      (c) => c === col[f * 9 + 4],
    ),
  );
};

/** ZZ 마지막 층 다음 한 걸음(다 맞았으면 null). 노란 면이 위, 아래 두 층이 맞은 3×3 */
export function nextZzLl(s: PuzzleState): ZzLlStep | null {
  if (!topYellow(s)) {
    for (const id of LL_CORNER_ORDER)
      for (const u of AUF)
        if (topYellow(play3(s, join(u, algOf2(id)))))
          return { stage: "oll", caseId: id, hold: u, alg: algOf2(id) };
    throw new Error("윗면 공식이 없다(노란 십자가 없다)");
  }
  if (!cornersMatched(s)) {
    const t = algOf2("2look-pll-headlights");
    for (const u of AUF)
      if (cornersMatched(play3(s, join(u, t))))
        return {
          stage: "pll-corners",
          caseId: "2look-pll-headlights",
          hold: u,
          alg: t,
        };
    const yp = algOf2("2look-pll-diagonal");
    if (cornersMatched(play3(s, yp)))
      return {
        stage: "pll-corners",
        caseId: "2look-pll-diagonal",
        hold: "",
        alg: yp,
      };
    throw new Error("PLL 코너 공식이 없다");
  }
  if (!cornersHome(s)) {
    const u = AUF.find((x) => cornersHome(play3(s, x))) as string;
    return { stage: "align", caseId: "align", hold: "", alg: u };
  }
  if (allSolved(s)) return null;
  for (const id of [
    "2look-pll-ua",
    "2look-pll-ub",
    "2look-pll-h",
    "2look-pll-z",
  ]) {
    const alg = id === "2look-pll-z" ? `${algOf2(id)} U'` : algOf2(id);
    for (const y of YROT)
      if (allSolved(play3(s, join(y, alg))))
        return { stage: "pll-edges", caseId: id, hold: y, alg };
  }
  throw new Error("PLL 엣지 공식이 없다");
}

export function runZzLl(s: PuzzleState): {
  state: PuzzleState;
  steps: ZzLlStep[];
} {
  const steps: ZzLlStep[] = [];
  let state = s;
  for (;;) {
    const st = nextZzLl(state);
    if (!st) return { state, steps };
    steps.push(st);
    if (steps.length > 6) throw new Error("ZZ 마지막 층이 끝나지 않는다");
    state = play3(state, stepMovesLl(st));
  }
}

/** 섞인 3×3을 ZZ 단원 규칙으로 끝까지: z2 → EO라인(엣지 방향 → 줄) → 왼쪽 블록 → 오른쪽 블록 → 마지막 층. 단계마다 수 */
export function solveZzByRules(scramble: string): {
  eoline: string;
  left: string;
  right: string;
  ll: string;
} {
  let s = play3(solvedCube(3), `${scramble} z2`);
  const eo = runZz(s, nextEo);
  const line = runZz(eo.state, nextLine);
  s = line.state;
  const left = runBlocks(s, "left");
  const right = runBlocks(left.state, "all");
  const ll = runZzLl(right.state);
  const text = (xs: string[]) => xs.join(" ");
  return {
    eoline: text(["z2", ...[...eo.steps, ...line.steps].map(stepMovesZz)]),
    left: text(left.steps.map(stepMovesBlock)),
    right: text(right.steps.map(stepMovesBlock)),
    ll: text(ll.steps.map(stepMovesLl)),
  };
}
