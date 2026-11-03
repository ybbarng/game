/**
 * 4×4·5×5 축소법(reduction). 사람이 쓰는 차례를 그대로 따른다.
 *
 * 1. 가운데: 흰 면(U) → 노란 면(D) → 나머지 넷. 처음엔 `s X s'`(안쪽 층 넣기)로 여러 조각을
 *    한꺼번에 옮기고, 마지막 몇 조각은 세 조각 돌리기(교환자)로 맞춘다.
 * 2. 모서리 짝: 같은 모서리의 날개(5×5는 날개 둘 + 가운데 조각)를 한 칸에 모은다.
 *    `s B s'`(안쪽 층으로 짝 맞추기 → 바깥층으로 칸 바꾸기 → 되돌리기)로 열 개까지, 마지막
 *    두 모서리는 뒤집기 공식을 낀 `s B s'`나 날개 세 개 돌리기. 5×5에서 날개 순열이 홀이면
 *    (한 모서리의 두 날개가 뒤바뀐 꼴) 모서리 패리티 공식을 한 번 쓴다.
 * 3. 패리티(4×4만): 3×3으로 볼 때 모서리 하나가 뒤집혀 있으면 OLL 패리티, 두 모서리가
 *    바뀌어 있으면 PLL 패리티 공식. 사람은 3×3을 풀다가 알아차리지만, 3×3 해법기가 이런 모양을
 *    받지 않으므로 3×3 단계 앞에서 고친다.
 * 4. 3×3: 바깥층만 쓰는 3×3으로 보고 `solve3x3`으로 푼다.
 *
 * 단계마다 "짧은 준비 수 + 공식" 가운데 맞은 조각이 가장 많이 늘어나는(수 하나당) 것을 골라
 * 되풀이한다. 같은 상태면 늘 같은 해가 나온다(무작위가 없다).
 */
import { type CubeMove, faceColors } from "@game/cube-engine";
import { solve3x3 } from "@game/cube-solver";
import type { PuzzleState } from "@game/puzzle-core";
import {
  faceOfSticker,
  reductionGeometry,
  slotPaired,
  wingParity,
} from "./geometry";
import {
  centerMacros,
  EDGE_PARITY_TEXT,
  edgeMacros,
  edgeParityMacros,
  type Macro,
  PLL_PARITY_TEXT,
} from "./macros";
import {
  applyMovesColors,
  type Colors,
  FACE_LETTERS,
  format,
  moves,
  outerSequences,
  simplify,
} from "./sim";
import { threeParity, toThreeFacelets } from "./three";

export type ReductionStageId =
  | "centers-ud"
  | "centers-rest"
  | "edges"
  | "last-edges"
  | "oll-parity"
  | "pll-parity"
  | "three";

export interface ReductionStage {
  id: ReductionStageId;
  /** 사람이 읽는 단계 이름 */
  name: string;
  /** 이 단계의 첫 수 번호(0부터, `moves`를 빈칸으로 나눈 차례) */
  from: number;
  /** 이 단계가 끝난 뒤의 수 번호(이 번호의 수는 들어가지 않는다) */
  to: number;
}

export interface ReductionSolution {
  /** WCA 표기, 빈칸으로 나눈다 */
  moves: string;
  /** 단계마다 수 범위. 수가 하나도 없는 단계도 남긴다(이미 맞아 있던 단계) */
  stages: ReductionStage[];
}

export const STAGE_NAMES: Readonly<Record<ReductionStageId, string>> = {
  "centers-ud": "흰·노랑 가운데",
  "centers-rest": "나머지 가운데",
  edges: "모서리 짝",
  "last-edges": "마지막 두 모서리",
  "oll-parity": "OLL 패리티",
  "pll-parity": "PLL 패리티",
  three: "3×3",
};

export const REDUCTION_SIZES: readonly number[] = [4, 5];

/** 면 f의 가운데가 맞아야 할 색. 홀수 크기는 정가운데 조각 색, 짝수는 기본 방향(U흰 F초록) */
function centerTargets(n: number, colors: Colors): number[] {
  const g = reductionGeometry(n);
  if (n % 2 === 0) return [0, 1, 2, 3, 4, 5];
  return g.fixedCenters.map((p) => colors[p] as number);
}

const FACE_TURN_SUFFIX = ["", "", "2", "'"];

interface FaceSetup {
  /** 면마다 돌린 횟수를 4진수로 묶은 번호(같은 준비 수는 같은 번호) */
  code: number;
  moves: CubeMove[];
}

const faceSetupCache = new Map<string, FaceSetup[]>();

/** 주어진 면들을 각각 0~3번 돌리는 준비 수 모두 */
function faceSetups(n: number, faces: readonly number[]): FaceSetup[] {
  const key = `${n}:${faces.join(",")}`;
  const hit = faceSetupCache.get(key);
  if (hit) return hit;
  const out: FaceSetup[] = [];
  for (let c = 0; c < 4 ** faces.length; c++) {
    let rest = c;
    let code = 0;
    const list: CubeMove[] = [];
    for (const f of faces) {
      const t = rest % 4;
      rest = Math.floor(rest / 4);
      if (t === 0) continue;
      code += t * 4 ** f;
      list.push(...moves(n, `${FACE_LETTERS[f]}${FACE_TURN_SUFFIX[t]}`));
    }
    out.push({ code, moves: list });
  }
  faceSetupCache.set(key, out);
  return out;
}

interface Pick {
  setup: readonly CubeMove[];
  macro: Macro;
  ratio: number;
}

/** 가운데 한 단계: 무게가 있는 자리가 다 맞을 때까지 고른 공식을 되풀이 */
function solveCenterPhase(
  n: number,
  colors: Colors,
  target: readonly number[],
  weight: (face: number) => number,
  out: CubeMove[],
): Colors {
  const g = reductionGeometry(n);
  const { inserts, cycles } = centerMacros(n);
  const want = new Int8Array(6 * n * n);
  const w = new Float64Array(6 * n * n);
  for (const p of g.centers) {
    want[p] = target[faceOfSticker(n, p)] as number;
    w[p] = weight(faceOfSticker(n, p));
  }
  let cur = colors;
  for (let guard = 0; guard < 500; guard++) {
    if (g.centers.every((p) => w[p] === 0 || cur[p] === want[p])) return cur;
    // 준비 수(면마다 0~3번 돌리기)를 돌린 색 배열. 번호 = Σ 돌린 횟수 × 4^면
    const setupColors: (Colors | undefined)[] = [];
    const consider = (macros: readonly Macro[], prev: Pick | undefined) => {
      let best = prev;
      for (const macro of macros) {
        if (!macro.centers.some((p) => (w[p] as number) > 0)) continue;
        for (const s of faceSetups(n, macro.centerFaces)) {
          let ca = setupColors[s.code];
          if (!ca) {
            ca = applyMovesColors(n, cur, s.moves);
            setupColors[s.code] = ca;
          }
          let gain = 0;
          for (const p of macro.centers) {
            const t = want[p];
            const wp = w[p] as number;
            if (ca[macro.src[p] as number] === t) gain += wp;
            if (ca[p] === t) gain -= wp;
          }
          if (gain <= 0) continue;
          const ratio = (s.moves.length + macro.moves.length) / gain;
          if (!best || ratio < best.ratio)
            best = { setup: s.moves, macro, ratio };
        }
      }
      return best;
    };
    // 넣기 공식으로 수 셋에 하나 넘게 맞추면 그것으로, 아니면 세 조각 돌리기까지 본다
    let best = consider(inserts, undefined);
    if (!best || best.ratio > 3) best = consider(cycles, best);
    if (!best) {
      const wrong = g.centers.filter((p) => w[p] !== 0 && cur[p] !== want[p]);
      throw new Error(
        `가운데를 더 맞출 공식을 찾지 못했다(${wrong.join(",")})`,
      );
    }
    const step = [...best.setup, ...best.macro.moves];
    out.push(...step);
    cur = applyMovesColors(n, cur, step);
  }
  throw new Error("가운데 맞추기가 끝나지 않는다");
}

function pairedCount(n: number, colors: Colors): number {
  const g = reductionGeometry(n);
  let count = 0;
  for (const s of g.slots)
    if (slotPaired(s, (p) => colors[p] as number)) count++;
  return count;
}

const setupCache = new Map<string, CubeMove[][]>();

function setupsOf(n: number, depth: number): CubeMove[][] {
  const key = `${n}:${depth}`;
  let hit = setupCache.get(key);
  if (!hit) {
    hit = outerSequences(n, depth);
    setupCache.set(key, hit);
  }
  return hit;
}

/**
 * 칸 점수를 빨리 세는 표: 칸마다 [기준 조각 스티커 둘, 나머지 조각 스티커 둘씩…].
 * 기준은 홀수 크기면 가운데 모서리 조각, 짝수면 첫 날개.
 */
interface SlotTable {
  /** 칸 i의 스티커는 `stickers[start[i]]`부터 `count[i]`조각(조각마다 둘) */
  start: Int32Array;
  count: Int32Array;
  stickers: Int32Array;
  odd: boolean;
}

const slotTables = new Map<number, SlotTable>();

function slotTable(n: number): SlotTable {
  const hit = slotTables.get(n);
  if (hit) return hit;
  const g = reductionGeometry(n);
  const start = new Int32Array(g.slots.length);
  const count = new Int32Array(g.slots.length);
  const list: number[] = [];
  g.slots.forEach((s, i) => {
    start[i] = list.length;
    count[i] = s.pieces.length;
    const anchor = s.midge < 0 ? 0 : s.midge;
    list.push(...(s.pieces[anchor] as readonly [number, number]));
    s.pieces.forEach((p, k) => {
      if (k !== anchor) list.push(...p);
    });
  });
  const t = {
    start,
    count,
    stickers: Int32Array.from(list),
    odd: n % 2 === 1,
  };
  slotTables.set(n, t);
  return t;
}

/** 칸 점수(`slotScore`와 같다). `src`가 있으면 그 공식을 돌린 뒤의 색으로 센다 */
function fastSlotScore(
  t: SlotTable,
  slot: number,
  ca: Colors,
  src: Int32Array | null,
): number {
  const st = t.stickers;
  let k = t.start[slot] as number;
  const end = k + 2 * (t.count[slot] as number);
  const at = (p: number) =>
    src ? (ca[src[p] as number] as number) : (ca[p] as number);
  const a = at(st[k] as number);
  const b = at(st[k + 1] as number);
  k += 2;
  let score = 0;
  for (; k < end; k += 2) {
    if (at(st[k] as number) === a && at(st[k + 1] as number) === b) score++;
    else if (!t.odd) return 0;
  }
  return t.odd ? score : 1;
}

const bySlotCache = new WeakMap<readonly Macro[], Macro[][]>();

/** 칸마다 그 칸을 건드리는 공식 목록 */
function macrosBySlot(macros: readonly Macro[], slotCount: number): Macro[][] {
  const hit = bySlotCache.get(macros);
  if (hit) return hit;
  const out: Macro[][] = Array.from({ length: slotCount }, () => []);
  for (const m of macros) for (const s of m.slots) out[s]?.push(m);
  bySlotCache.set(macros, out);
  return out;
}

/** 모서리 짝 단계: 짝 맞은 칸이 `goal`개가 될 때까지 */
function solveEdgePhase(
  n: number,
  colors: Colors,
  goal: number,
  out: CubeMove[],
): Colors {
  const g = reductionGeometry(n);
  const t = slotTable(n);
  const { pairs, cycles } = edgeMacros(n);
  const both = [...pairs, ...cycles];
  let cur = colors;
  const before = new Int32Array(g.slots.length);
  /** 짝이 다 맞은 칸의 점수 */
  const full = t.odd ? (t.count[0] as number) - 1 : 1;
  const search = (
    depth: number,
    macros: readonly Macro[],
    prev: Pick | undefined,
  ) => {
    let best = prev;
    const bySlot = macrosBySlot(macros, g.slots.length);
    const openSlots: number[] = [];
    for (const setup of setupsOf(n, depth)) {
      if (depth === 3 && setup.length < 3) continue;
      const ca = applyMovesColors(n, cur, setup);
      openSlots.length = 0;
      for (let i = 0; i < before.length; i++) {
        before[i] = fastSlotScore(t, i, ca, null);
        if ((before[i] as number) < full) openSlots.push(i);
      }
      // 아직 안 맞은 칸을 건드리는 공식만 본다(다 맞은 칸만 건드리면 나아질 수 없다)
      for (let k = 0; k < openSlots.length; k++) {
        for (const macro of bySlot[openSlots[k] as number] ?? []) {
          let seen = false;
          for (let j = 0; j < k; j++) {
            if (macro.slots.includes(openSlots[j] as number)) seen = true;
          }
          if (seen) continue;
          let gain = 0;
          for (const si of macro.slots) {
            gain +=
              fastSlotScore(t, si, ca, macro.src) - (before[si] as number);
          }
          if (gain <= 0) continue;
          const ratio = (setup.length + macro.moves.length) / gain;
          if (!best || ratio < best.ratio) best = { setup, macro, ratio };
        }
      }
    }
    return best;
  };
  for (let guard = 0; guard < 100; guard++) {
    if (pairedCount(n, cur) >= goal) return cur;
    // 짝 짓기 공식이 수 다섯에 하나 넘게 맞추면 그것으로, 아니면 날개 세 개 돌리기까지 본다.
    let best = search(2, pairs, undefined);
    if (!best || best.ratio > 5) best = search(2, cycles, best);
    if (!best && t.odd && wingParity(n, cur) === 1) {
      // 날개 순열이 홀이면 짝 지은 모양에 닿을 수 없다(짝 지은 모양은 늘 짝). 아직 안 맞은
      // 칸 하나의 두 날개를 맞바꿔 홀짝을 바꾼다(모서리 패리티).
      outer: for (const setup of setupsOf(n, 2)) {
        const ca = applyMovesColors(n, cur, setup);
        for (const macro of edgeParityMacros(n)) {
          const unpaired = macro.slots.some(
            (si) => fastSlotScore(t, si, ca, null) < full,
          );
          if (unpaired) {
            best = { setup, macro, ratio: 0 };
            break outer;
          }
        }
      }
    }
    if (!best) best = search(3, both, undefined);
    if (!best) {
      throw new Error(
        `모서리 짝을 더 맞출 공식을 찾지 못했다(${pairedCount(n, cur)}개 맞음)`,
      );
    }
    const step = [...best.setup, ...best.macro.moves];
    out.push(...step);
    cur = applyMovesColors(n, cur, step);
  }
  throw new Error("모서리 짝 맞추기가 끝나지 않는다");
}

/** 스티커 문자열(Kociemba 순서, 글자는 면 이름) → 색 배열 */
export function colorsFromFacelets(facelets: string): Colors {
  const out = new Uint8Array(facelets.length);
  for (let i = 0; i < facelets.length; i++) {
    const f = FACE_LETTERS.indexOf(
      facelets[i] as (typeof FACE_LETTERS)[number],
    );
    if (f < 0) throw new Error(`알 수 없는 스티커 글자: ${facelets[i]}`);
    out[i] = f;
  }
  return out;
}

/** n×n 스티커 문자열(Kociemba 순서)을 축소법으로 푼다. 4×4·5×5만 */
export function solveReduction(facelets: string): ReductionSolution {
  const n = Math.round(Math.sqrt(facelets.length / 6));
  if (6 * n * n !== facelets.length) {
    throw new Error(`스티커 개수가 맞지 않는다: ${facelets.length}`);
  }
  return solveReductionColors(n, colorsFromFacelets(facelets));
}

/** cube-engine 상태를 축소법으로 푼다. 4×4·5×5만 */
export function solveReductionState(
  n: number,
  state: PuzzleState,
): ReductionSolution {
  return solveReductionColors(n, faceColors(n, state));
}

export function solveReductionColors(
  n: number,
  colors: Colors,
): ReductionSolution {
  if (!REDUCTION_SIZES.includes(n)) {
    throw new RangeError(`축소법은 4×4·5×5만 푼다: ${n}×${n}`);
  }
  const target = centerTargets(n, colors);
  const faceOfColor = new Array<number>(6).fill(-1);
  target.forEach((c, f) => {
    faceOfColor[c] = f;
  });
  const all: CubeMove[] = [];
  const stages: ReductionStage[] = [];
  let cur = colors;
  const run = (id: ReductionStageId, body: (out: CubeMove[]) => Colors) => {
    const out: CubeMove[] = [];
    cur = body(out);
    const list = simplify(out);
    stages.push({
      id,
      name: STAGE_NAMES[id],
      from: all.length,
      to: all.length + list.length,
    });
    all.push(...list);
  };

  run("centers-ud", (out) => {
    const up = solveCenterPhase(n, cur, target, (f) => (f === 0 ? 1 : 0), out);
    return solveCenterPhase(
      n,
      up,
      target,
      (f) => (f === 0 ? 1000 : f === 3 ? 1 : 0),
      out,
    );
  });
  run("centers-rest", (out) =>
    solveCenterPhase(
      n,
      cur,
      target,
      (f) => (f === 0 || f === 3 ? 1000 : 1),
      out,
    ),
  );
  run("edges", (out) => solveEdgePhase(n, cur, 10, out));
  run("last-edges", (out) => solveEdgePhase(n, cur, 12, out));

  if (n % 2 === 0) {
    run("oll-parity", (out) => {
      if (!threeParity(toThreeFacelets(n, cur, faceOfColor)).oll) return cur;
      const list = moves(n, EDGE_PARITY_TEXT);
      out.push(...list);
      return applyMovesColors(n, cur, list);
    });
    run("pll-parity", (out) => {
      if (!threeParity(toThreeFacelets(n, cur, faceOfColor)).pll) return cur;
      const list = moves(n, PLL_PARITY_TEXT);
      out.push(...list);
      return applyMovesColors(n, cur, list);
    });
  }

  run("three", (out) => {
    const three = toThreeFacelets(n, cur, faceOfColor);
    const list = moves(n, solve3x3(three));
    out.push(...list);
    return applyMovesColors(n, cur, list);
  });

  return { moves: format(n, all), stages };
}
