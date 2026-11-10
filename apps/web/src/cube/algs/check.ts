// 공식 역할 확인(검사기). 상황(AlgCase)을 만든 큐브에 새 공식을 해 보고, 그 묶음의 목표가 되는지 본다.
// 상황은 훈련의 「가리기」와 같다: 맞춘 큐브(마지막 층·F2L·오르테가는 흰 면 아래로 쥠) + 상황 만드는 공식
// (없으면 대표 공식의 거꾸로). 판정은 센터 색 기준이라 공식 안의 x·y·z, 넓게·가운데 층이 섞여도 큐브 방향과 상관없다.
import {
  type CubeMove,
  cubeGroups,
  cubeTopology,
  applyMoves as engineApply,
  FACE_NAMES,
  faceColors,
  invertMoves,
  isSolved,
  NotationError,
  OPPOSITE_FACE,
  parseMoves,
  solvedCube,
  U,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import { ALG_SETS, type AlgSetInfo } from "../learn/alg-sets";
import { centersSolved, goalMet, unpairedEdgeLines } from "../learn/judge";
import type { AlgCase, AlgSet, GoalName } from "../learn/types";
import { moveCounts, tidyAlg } from "./transform";

const WHITE = U;

/** 흰 면을 아래로 쥐고 연습하는 묶음(훈련과 같다) */
const HELD: ReadonlySet<AlgSet> = new Set([
  "oll",
  "pll",
  "f2l",
  "2look-oll",
  "2look-pll",
  "ortega-oll",
  "ortega-pbl",
]);

const AUF = ["", "U", "U2", "U'"] as const;

export function setOf(c: AlgCase): AlgSetInfo {
  const s = ALG_SETS.find((x) => x.set === c.set);
  if (!s) throw new Error(`모르는 묶음 ${c.set}`);
  return s;
}

const apply = (n: number, s: PuzzleState, text: string) =>
  engineApply(n, s, parseMoves(n, text));

const startCache = new Map<string, PuzzleState>();

/** 상황의 시작 큐브(훈련 「가리기」와 같은 쥔 방향) */
export function caseStart(c: AlgCase): PuzzleState {
  const hit = startCache.get(c.id);
  if (hit) return hit;
  const n = setOf(c).size;
  const base = HELD.has(c.set) ? apply(n, solvedCube(n), "z2") : solvedCube(n);
  const setup = c.setup
    ? parseMoves(n, c.setup)
    : invertMoves(parseMoves(n, c.algs[0] as string));
  const s = engineApply(n, base, setup);
  startCache.set(c.id, s);
  return s;
}

// ── 조각 보기(3×3·5×5처럼 센터가 있는 크기) ─────────────────────

interface View {
  n: number;
  colors: Uint8Array;
  frame: number[];
  top: number;
  white: number;
}

function viewOf(n: number, s: PuzzleState): View {
  const colors = faceColors(n, s);
  const nn = n * n;
  const mid = (nn - 1) / 2;
  const frame = [0, 1, 2, 3, 4, 5].map((f) => colors[f * nn + mid] as number);
  const white = frame.indexOf(WHITE);
  return { n, colors, frame, white, top: OPPOSITE_FACE[white as 0] as number };
}

function pieceOk(v: View, piece: number): boolean {
  const topo = cubeTopology(v.n);
  return (topo.pieces[piece]?.stickers ?? []).every(
    (s) => v.colors[s] === v.frame[topo.stickers[s]?.face as number],
  );
}

/** 윗면 돌리기 넷 중 가장 적게 남는 윗층 코너·엣지 수 */
function lastLayerLeft(n: number, s: PuzzleState) {
  let best = { corners: 9, edges: 9 };
  for (const k of AUF) {
    const v0 = viewOf(n, s);
    const t = k ? apply(n, s, `${FACE_NAMES[v0.top]}${k.slice(1)}`) : s;
    const v = viewOf(n, t);
    const g = cubeGroups(n, v.white);
    const corners = g.lastLayerCorners.filter((p) => !pieceOk(v, p)).length;
    const edges = g.lastLayerEdges.filter((p) => !pieceOk(v, p)).length;
    if (corners + edges < best.corners + best.edges) best = { corners, edges };
  }
  return best;
}

const COUNT = ["", "하나", "둘", "셋", "넷", "다섯", "여섯", "일곱", "여덟"];
const count = (k: number) => COUNT[k] ?? String(k);

function leftMessage(corners: number, edges: number): string {
  if (corners + edges === 0) return "다 맞지 않음";
  const parts: string[] = [];
  if (corners > 0) parts.push(`코너 ${count(corners)}`);
  if (edges > 0) parts.push(`엣지 ${count(edges)}`);
  const last = corners > 0 && edges === 0 ? corners : edges;
  return `${parts.join("·")}${last === 1 ? "가" : "이"} 남음`;
}

/**
 * 윗면 돌리기 하나만 남았거나 다 맞음(훈련의 「ll」보다 좁다: 마지막 F' 하나 빠진 공식을 받지 않는다).
 * 2×2는 센터가 없어 위·아래 층 돌리기를 모두 봐준다(PBL)
 */
function llDone(n: number, s: PuzzleState): boolean {
  if (n % 2 === 1) {
    const f = FACE_NAMES[viewOf(n, s).top] as string;
    return AUF.some((k) =>
      isSolved(n, k ? apply(n, s, `${f}${k.slice(1)}`) : s),
    );
  }
  return AUF.some((a) =>
    AUF.some((b) => isSolved(n, apply(n, s, `${a} ${b.replace("U", "D")}`))),
  );
}

// ── 4×4 패리티 ─────────────────────────────────────────

const ORIENTS = ["", "x", "x2", "x'", "z", "z'"].flatMap((a) =>
  ["", "y", "y2", "y'"].map((b) => `${a} ${b}`.trim()),
);

/** 윗층(U에 닿은 조각)을 뺀 나머지가 맞도록 큐브 방향을 맞춘 상태. 없으면 null */
function alignBelowTop(n: number, s: PuzzleState): PuzzleState | null {
  const topo = cubeTopology(n);
  for (const r of ORIENTS) {
    const t = r ? apply(n, s, r) : s;
    const colors = faceColors(n, t);
    const ok = topo.pieces.every((p) => {
      const faces = p.stickers.map((i) => topo.stickers[i]?.face);
      if (faces.includes(U)) return true;
      return p.stickers.every((i) => colors[i] === topo.stickers[i]?.face);
    });
    if (ok) return t;
  }
  return null;
}

function permParity(p: number[]): number {
  const seen = new Set<number>();
  let cycles = 0;
  for (let i = 0; i < p.length; i++) {
    if (seen.has(i)) continue;
    cycles++;
    for (let j = i; !seen.has(j); j = p[j] as number) seen.add(j);
  }
  return (p.length - cycles) % 2;
}

/** 윗층 엣지 줄·코너 보기(아래가 맞게 방향을 맞춘 뒤). 줄은 묶여 있다고 본다 */
function topPieces(n: number, t: PuzzleState) {
  const topo = cubeTopology(n);
  const colors = faceColors(n, t);
  const sides = [1, 2, 4, 5];
  const edgeLines = new Map<number, number[]>();
  const corners: { slot: string; piece: string }[] = [];
  topo.pieces.forEach((p) => {
    const faces = p.stickers.map((i) => topo.stickers[i]?.face as number);
    if (!faces.includes(U)) return;
    if (p.kind === "edge" || p.kind === "wing") {
      const side = faces.find((f) => f !== U) as number;
      edgeLines.set(side, [...(edgeLines.get(side) ?? []), ...p.stickers]);
    } else if (p.kind === "corner") {
      const slot = faces
        .filter((f) => f !== U)
        .sort()
        .join();
      const piece = p.stickers
        .map((i) => colors[i] as number)
        .filter((c) => c !== U)
        .sort()
        .join();
      corners.push({ slot, piece });
    }
  });
  let flips = 0;
  const edgePerm: number[] = [];
  for (const side of sides) {
    const st = edgeLines.get(side) ?? [];
    const up = st.filter((i) => topo.stickers[i]?.face === U);
    const down = st.filter((i) => topo.stickers[i]?.face !== U);
    if (up.some((i) => colors[i] !== U)) flips++;
    const home = colors[down[0] as number] as number;
    edgePerm.push(sides.indexOf(home));
  }
  const slots = corners.map((c) => c.slot);
  const cornerPerm = corners.map((c) => slots.indexOf(c.piece));
  const topOneColor = topo.stickers.every(
    (s, i) => s.face !== U || colors[i] === U,
  );
  const validPerm = (p: number[]) =>
    p.every((x) => x >= 0) && new Set(p).size === p.length;
  return {
    flips,
    topOneColor,
    parityOk:
      validPerm(edgePerm) &&
      validPerm(cornerPerm) &&
      permParity(edgePerm) === permParity(cornerPerm),
  };
}

// ── 묶음마다 역할 ─────────────────────────────────────────

interface Role {
  /** 공식 앞 윗면 돌리기를 봐주나 */
  auf: boolean;
  met: (s: PuzzleState) => boolean;
  /** 아닐 때 까닭(상태로 짧게) */
  why: (s: PuzzleState, start: PuzzleState) => string;
}

const F2L_SLOTS = ["FR", "FL", "BR", "BL"] as const;

function roleOf(c: AlgCase): Role {
  const n = setOf(c).size;
  const met = (s: PuzzleState, g: Parameters<typeof goalMet>[2]) =>
    goalMet(n, s, g);
  const f2lFirst =
    (rest: (s: PuzzleState) => string) =>
    (s: PuzzleState): string =>
      met(s, "f2l") ? rest(s) : "F2L이 깨짐";
  const llPieces = (s: PuzzleState) => {
    if (!met(s, "oll")) return "윗면이 깨짐";
    const left = lastLayerLeft(n, s);
    return leftMessage(left.corners, left.edges);
  };
  switch (c.set) {
    case "oll":
      return {
        auf: true,
        met: (s) => met(s, "oll"),
        why: f2lFirst(() => "윗면이 다 노랑이 아님"),
      };
    case "pll":
      return { auf: true, met: (s) => llDone(n, s), why: f2lFirst(llPieces) };
    case "2look-oll":
      return c.group === "edges"
        ? {
            auf: true,
            met: (s) => met(s, "yellow-cross"),
            why: f2lFirst(() => "노란 십자가 아님"),
          }
        : {
            auf: true,
            met: (s) => met(s, "oll"),
            why: f2lFirst(() => "윗면이 다 노랑이 아님"),
          };
    case "2look-pll":
      return c.group === "corners"
        ? {
            auf: true,
            met: (s) => met(s, "yellow-corners"),
            why: f2lFirst((s) => {
              if (!met(s, "oll")) return "윗면이 깨짐";
              return leftMessage(lastLayerLeft(n, s).corners, 0);
            }),
          }
        : { auf: true, met: (s) => llDone(n, s), why: f2lFirst(llPieces) };
    case "f2l":
      return {
        auf: true,
        met: (s) => met(s, "f2l"),
        why: (s, start) => {
          if (!met(s, "cross")) return "십자가 깨짐";
          const broken = (x: PuzzleState) =>
            F2L_SLOTS.filter((k) => !met(x, `f2l-pair:${k}`));
          const before = broken(start);
          if (broken(s).some((k) => !before.includes(k)))
            return "다른 칸이 깨짐";
          return "짝이 안 들어감";
        },
      };
    case "ortega-oll":
      return {
        auf: true,
        met: (s) => met(s, "2x2-both-faces"),
        why: (s) =>
          met(s, "2x2-first-face") ? "노란 면이 아님" : "흰 면이 깨짐",
      };
    case "ortega-pbl":
      return { auf: true, met: (s) => llDone(n, s), why: () => "다 맞지 않음" };
    case "parity-4x4": {
      const pll = c.id === "parity-4x4-pll";
      const reduced = (s: PuzzleState) =>
        !centersSolved(n, s)
          ? "센터가 깨짐"
          : unpairedEdgeLines(n, s) > 0
            ? `묶이지 않은 엣지 ${unpairedEdgeLines(n, s)}줄`
            : null;
      const judge = (s: PuzzleState): string | null => {
        const r = reduced(s);
        if (r) return r;
        const t = alignBelowTop(n, s);
        if (!t) return "아래 두 층이 깨짐";
        const top = topPieces(n, t);
        if (!pll) return top.flips % 2 === 1 ? "뒤집힌 엣지가 홀수" : null;
        if (!top.topOneColor) return "윗면이 한 색이 아님";
        return top.parityOk ? null : "엣지 둘이 바뀌어 있음";
      };
      return {
        auf: true,
        met: (s) => judge(s) === null,
        why: (s) => judge(s) ?? "",
      };
    }
    case "edges-5x5":
      return {
        auf: true,
        met: (s) => met(s, "edges-paired"),
        why: (s) =>
          centersSolved(n, s)
            ? `묶이지 않은 엣지 ${unpairedEdgeLines(n, s)}줄`
            : "센터가 깨짐",
      };
    case "bld-op":
      return {
        auf: false,
        met: (s) => met(s, "solved"),
        why: () => "다 맞지 않음",
      };
  }
}

// ── 검사 ─────────────────────────────────────────────

export type CheckResult =
  | {
      ok: true;
      /** 화면에 보일 상태(「OLL 21 맞음」) */
      message: string;
      /** 앞에 붙여야 맞는 윗면 돌리기("" = 없음) */
      preAuf: string;
      /** 저장할 글(앞 윗면 돌리기를 붙여 다듬은 것) */
      text: string;
      htm: number;
      stm: number;
    }
  | {
      ok: false;
      message: string;
      /** 표기를 못 읽었으면 그 글자 위치(0부터) */
      errorAt?: number;
      htm?: number;
      stm?: number;
      /**
       * 같은 묶음의 다른 상황을 푸는 공식이면 그 상황. F2L은 다른 칸(FL·BL·BR)에서 푸는 것도 찾고
       * 그 칸을 slot에 준다(같은 상황을 다른 칸에서 풀 때도)
       */
      other?: { id: string; name: string; slot?: string };
    };

/** 상황 이름에서 괄호 설명을 뺀 짧은 이름 */
export function shortName(c: AlgCase): string {
  return c.name.replace(/\s*\(.*\)\s*$/, "");
}

function solvesWith(
  c: AlgCase,
  moves: readonly CubeMove[],
  start: PuzzleState = caseStart(c),
): string | null {
  const n = setOf(c).size;
  const role = roleOf(c);
  for (const pre of role.auf ? AUF : [""]) {
    const s = engineApply(n, pre ? apply(n, start, pre) : start, moves);
    if (role.met(s)) return pre;
  }
  return null;
}

/**
 * 이 큐브(그 상황의 쥔 방향, 흰 면 아래)에서 공식이 그 상황의 목표를 만드나(앞 윗면 돌리기는 봐준다).
 * 맞추는 도중의 큐브가 어느 상황인지 알아볼 때(spot.ts)
 */
export function solvesFrom(
  c: AlgCase,
  moves: readonly CubeMove[],
  start: PuzzleState,
): boolean {
  return solvesWith(c, moves, start) !== null;
}

/**
 * `solvesFrom`과 같은 판정에, 공식 앞에 둘 윗면 돌리기("", "U", "U2", "U'")를 돌려준다. 못 풀면 null.
 * Cubie 「공식 보기」가 「U 뒤 공식」처럼 쥐는 법을 알릴 때(mini/hint-pick.ts)
 */
export function aufBefore(
  c: AlgCase,
  moves: readonly CubeMove[],
  start: PuzzleState,
): string | null {
  return solvesWith(c, moves, start);
}

/**
 * F2L 상황을 다른 칸으로 옮긴 시작 큐브(큐브를 y·y2·y'로 돌려 쥠). 자료는 모두 FR 칸이라
 * 거울(좌우 대칭)로 만든 공식은 FL 칸을 푼다
 */
const SLOT_GRIPS = [
  { grip: "y", slot: "FL" },
  { grip: "y2", slot: "BL" },
  { grip: "y'", slot: "BR" },
] as const;

const slotStartCache = new Map<string, PuzzleState>();
function slotStart(c: AlgCase, grip: string): PuzzleState {
  const key = `${c.id}|${grip}`;
  const hit = slotStartCache.get(key);
  if (hit) return hit;
  const s = apply(setOf(c).size, caseStart(c), grip);
  slotStartCache.set(key, s);
  return s;
}

export interface SolvedCase {
  c: AlgCase;
  /** FR이 아닌 다른 칸에서 풀면 그 칸(F2L만) */
  slot?: string;
}

/**
 * 이 공식이 같은 묶음의 어느 상황을 푸나(자기 상황 빼고 첫 번째).
 * F2L은 FR 칸에서 못 찾으면 다른 칸(자기 상황 포함)에서도 찾는다
 */
export function findSolvedCase(
  c: AlgCase,
  moves: readonly CubeMove[],
): SolvedCase | null {
  const cases = setOf(c).cases;
  for (const other of cases) {
    if (other.id === c.id) continue;
    if (solvesWith(other, moves) !== null) return { c: other };
  }
  if (c.set !== "f2l") return null;
  for (const { grip, slot } of SLOT_GRIPS)
    for (const other of cases)
      if (solvesWith(other, moves, slotStart(other, grip)) !== null)
        return { c: other, slot };
  return null;
}

/** 공식 한 줄의 글자 수 상한(링크·입력칸·가져오기가 같이 쓴다). 넘으면 검사하지 않는다 */
export const MAX_ALG_LENGTH = 300;

export interface CheckOptions {
  /** 큐브 크기(없으면 묶음 크기) */
  n?: number;
  /**
   * 틀렸을 때 같은 묶음의 다른 상황을 푸는지 찾아보나(기본 true). 상황마다 네 번씩 해 봐서 무겁다.
   * 가져오기처럼 까닭만 필요하면 끈다
   */
  findOther?: boolean;
}

/**
 * 공식이 그 상황의 역할에 맞는지 본다.
 * 맞으면 앞에 붙일 윗면 돌리기와 저장할 글을, 아니면 까닭과(있으면) 대신 푸는 상황을 준다.
 */
export function checkAlg(
  c: AlgCase,
  input: string,
  opts: CheckOptions = {},
): CheckResult {
  const n = opts.n ?? setOf(c).size;
  const text = tidyAlg(input);
  if (text === "") return { ok: false, message: "공식이 비어 있음" };
  if (text.length > MAX_ALG_LENGTH) return { ok: false, message: "너무 김" };
  let moves: CubeMove[];
  try {
    moves = parseMoves(n, text);
  } catch (e) {
    if (e instanceof NotationError)
      return {
        ok: false,
        message: `표기 오류: ${e.token}(${e.index + 1}번째 글자)`,
        errorAt: e.index,
      };
    throw e;
  }
  const counts = moveCounts(n, moves);
  if (moves.length === 0) return { ok: false, message: "공식이 비어 있음" };
  const pre = solvesWith(c, moves);
  if (pre !== null) {
    return {
      ok: true,
      message: `${shortName(c)} 맞음${pre ? ` · 앞에 ${pre}` : ""}`,
      preAuf: pre,
      text: pre ? `${pre} ${text}` : text,
      ...counts,
    };
  }
  const start = caseStart(c);
  const after = engineApply(n, start, moves);
  const other = opts.findOther === false ? null : findSolvedCase(c, moves);
  return {
    ok: false,
    message: roleOf(c).why(after, start),
    ...counts,
    ...(other
      ? {
          other: {
            id: other.c.id,
            name: shortName(other.c),
            ...(other.slot ? { slot: other.slot } : {}),
          },
        }
      : {}),
  };
}

/**
 * 공식을 이 큐브에 그대로(앞 윗면 돌리기 없이) 해 보면 목표가 되나. 못 읽는 공식이면 아니다.
 * 배우기 단원에서 내 공식을 힌트로 보여도 될지 볼 때(단원 상황은 공식 모음과 쥔 방향이 다를 수 있다)
 */
export function fitsStart(
  n: number,
  start: PuzzleState,
  alg: string,
  goal: GoalName,
): boolean {
  try {
    return goalMet(n, engineApply(n, start, parseMoves(n, alg)), goal);
  } catch {
    return false;
  }
}

/** 상황 id → 상황 */
export function caseById(id: string): AlgCase | undefined {
  for (const s of ALG_SETS) {
    const c = s.cases.find((x) => x.id === id);
    if (c) return c;
  }
  return undefined;
}
