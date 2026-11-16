/**
 * 4×4~7×7 축소법(reduction). 사람이 쓰는 차례를 그대로 따른다.
 * 6×6·7×7은 가운데 조각 묶음·날개 묶음이 둘씩이라, 날개는 묶음마다 홀짝을 따로 보고(짝수 크기는 가장 안쪽
 * 날개 둘을 먼저 짝 지은 뒤 바깥 날개를 붙인다), 패리티 공식은 안쪽 층 묶음 전부로 넓힌다(`macros.ts`).
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
  wingDepths,
  wingParity,
} from "./geometry";
import {
  centerMacros,
  edgeMacros,
  edgeParityMacros,
  type Macro,
  ollParityText,
  pllParityText,
} from "./macros";
import {
  applyMovesColors,
  applySource,
  type Colors,
  FACE_LETTERS,
  format,
  moves,
  outerSequences,
  simplify,
  sourceMap,
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
  "centers-ud": "흰·노랑 센터",
  "centers-rest": "나머지 센터",
  edges: "엣지 짝",
  "last-edges": "마지막 두 엣지",
  "oll-parity": "OLL 패리티",
  "pll-parity": "PLL 패리티",
  three: "3×3",
};

export const REDUCTION_SIZES: readonly number[] = [4, 5, 6, 7];

/**
 * 축소법이 막혔다. 고른 공식으로 더 나아질 수 없거나(`no-progress`), 되풀이 상한을 넘었다
 * (`too-long`). 지금까지 본 상태에서는 나오지 않았지만, 공식 고르기가 욕심쟁이(한 걸음씩 가장
 * 좋은 것)라 어떤 모양에서는 막힐 수 있다. 부르는 쪽(cube-ai)이 이 오류만 골라 잡아 큐브를
 * 돌려 쥐고 다시 풀 수 있게 이름과 단계를 담는다.
 */
export class ReductionStuckError extends Error {
  override readonly name = "ReductionStuckError";
  constructor(
    /** 막힌 단계 */
    readonly stage: ReductionStageId,
    readonly reason: "no-progress" | "too-long",
    detail: string,
  ) {
    super(`축소법 ${STAGE_NAMES[stage]} 단계에서 막혔다: ${detail}`);
  }
}

/**
 * 단계마다 공식을 되풀이하는 상한. 제품은 기본값을 쓴다. 지금 아는 섞기로는 축소법이 막히지
 * 않으므로, 시험이 상한을 줄여 진짜 축소법 길에서 `too-long`으로 막히게 할 때 넣는다(결정적).
 */
export interface ReductionLimits {
  /** 가운데 한 묶음(흰 면, 노란 면, 나머지)마다 공식 수. 기본 500 */
  centerSteps?: number;
  /** 모서리 짝 한 단계마다 공식 수. 기본 100 */
  edgeSteps?: number;
}

/** 푸는 법 고르기. `ReductionLimits`는 시험이 막힘을 일으킬 때만 넣는다 */
export interface ReductionOptions extends ReductionLimits {
  /**
   * 가운데·엣지 짝 네 단계까지만 풀고 패리티·3×3 단계는 두지 않는다. 사람 흉내(cube-ai `solveBigHuman`)는
   * 축소 뒤 3×3을 사람 해법으로 따로 풀어 그 두 단계를 쓰지 않는다. 앞 네 단계의 수는 끝까지 푼 해와 같다
   */
  pairsOnly?: boolean;
}

const CENTER_STEPS = 500;
const EDGE_STEPS = 100;

/**
 * 면 f의 가운데가 맞아야 할 색. 홀수 크기는 정가운데 조각 색, 짝수는 기본 방향(U흰 F초록).
 *
 * 4×4는 정가운데 조각이 없어 어떻게 쥐고 있든 흰 면을 위(U), 초록을 앞(F)으로 맞춘다. 사람은
 * 쥔 방향에서 가까운 면부터 맞추지만 여기서는 정규화를 그대로 둔다. 까닭: 사람 흉내(cube-ai
 * `big.ts`)는 축소가 끝난 뒤 3×3 단계에서 `whiteDown` 같은 큐브 돌리기(x·y·z) 수로 쥔 방향을
 * 맞추므로, 축소법이 어느 방향으로 맞추든 이어지는 해가 맞다. 쥔 방향마다 목표를 고르면 여섯
 * 면 × 네 방향 가운데 어느 것이 짧은지 매번 견줘야 해서 계산이 몇 배로 늘어난다.
 */
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
  /** 준비 수를 한 번에 돌리는 자리 표(`sourceMap`) */
  src: Int32Array;
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
    out.push({ code, moves: list, src: sourceMap(n, list) });
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
  stage: ReductionStageId,
  n: number,
  colors: Colors,
  target: readonly number[],
  weight: (face: number) => number,
  out: CubeMove[],
  maxSteps: number,
): Colors {
  const g = reductionGeometry(n);
  const { inserts, cycles } = centerMacros(n);
  const want = new Int8Array(6 * n * n);
  const w = new Float64Array(6 * n * n);
  for (const p of g.centers) {
    want[p] = target[faceOfSticker(n, p)] as number;
    w[p] = weight(faceOfSticker(n, p));
  }
  const faceOfColor = new Int8Array(6);
  target.forEach((c, f) => {
    faceOfColor[c] = f;
  });
  /** 자리 p(무게 있음)에 색 c가 놓이면 맞은편 면의 색인가 */
  const opposite = (p: number, c: number) =>
    (w[p] as number) > 0 && faceOfColor[c] === (faceOfSticker(n, p) + 3) % 6;
  /**
   * 공식마다 무게 있는 가운데 자리(`at`)와 돌린 뒤 그 자리에 오는 스티커의 원래 자리(`from`). 무게 0인 자리는
   * 이득에도 맞은편 셈에도 들지 않아 단계 동안 미리 뺀다. 무게 있는 자리가 없는 공식은 목록에서 뺀다(차례는 그대로)
   */
  const weighted = (macros: readonly Macro[]) =>
    macros.flatMap((macro) => {
      const at = macro.centers.filter((p) => (w[p] as number) > 0);
      if (!at.length) return [];
      return [
        {
          macro,
          setups: faceSetups(n, macro.centerFaces),
          at: Int32Array.from(at),
          from: Int32Array.from(at, (p) => macro.src[p] as number),
        },
      ];
    });
  const insertList = weighted(inserts);
  const cycleList = weighted(cycles);
  let cur = colors;
  for (let guard = 0; guard < maxSteps; guard++) {
    if (g.centers.every((p) => w[p] === 0 || cur[p] === want[p])) return cur;
    // 준비 수(면마다 0~3번 돌리기)를 돌린 색 배열. 번호 = Σ 돌린 횟수 × 4^면
    const setupColors: (Colors | undefined)[] = [];
    /**
     * `sideways`: 맞은 수는 그대로(이득 0)인데 맞은편 면 색에 놓인 조각이 줄어드는 공식을 고른다. 6×6·7×7에서
     * 맞은편 면끼리 바뀐 조각은 세 조각 돌리기 하나로 닿지 않아, 먼저 옆면으로 옮겨 두는 걸음이다
     */
    const consider = (
      list: ReturnType<typeof weighted>,
      prev: Pick | undefined,
      sideways = false,
    ) => {
      let best = prev;
      for (const { macro, setups, at, from } of list) {
        for (const s of setups) {
          let ca = setupColors[s.code];
          if (!ca) {
            ca = applySource(cur, s.src);
            setupColors[s.code] = ca;
          }
          let gain = 0;
          for (let i = 0; i < at.length; i++) {
            const p = at[i] as number;
            const t = want[p];
            const wp = w[p] as number;
            if (ca[from[i] as number] === t) gain += wp;
            if (ca[p] === t) gain -= wp;
          }
          let score = gain;
          if (sideways) {
            if (gain !== 0) continue;
            score = 0;
            for (let i = 0; i < at.length; i++) {
              const p = at[i] as number;
              if (opposite(p, ca[p] as number)) score++;
              if (opposite(p, ca[from[i] as number] as number)) score--;
            }
          }
          if (score <= 0) continue;
          const ratio = (s.moves.length + macro.moves.length) / score;
          if (!best || ratio < best.ratio)
            best = { setup: s.moves, macro, ratio };
        }
      }
      return best;
    };
    // 넣기 공식으로 수 셋에 하나 넘게 맞추면 그것으로, 아니면 세 조각 돌리기까지 본다
    let best = consider(insertList, undefined);
    if (!best || best.ratio > 3) best = consider(cycleList, best);
    // 6×6·7×7은 맞은편 면끼리 바뀐 조각이 세 조각 돌리기 하나로 닿지 않아 남는다: 먼저 옆면으로 옮겨 둔다
    if (!best && n >= 6) best = consider(cycleList, best, true);
    if (!best) {
      const wrong = g.centers.filter((p) => w[p] !== 0 && cur[p] !== want[p]);
      throw new ReductionStuckError(
        stage,
        "no-progress",
        `가운데를 더 맞출 공식을 찾지 못했다(${wrong.join(",")})`,
      );
    }
    const step = [...best.setup, ...best.macro.moves];
    out.push(...step);
    cur = applyMovesColors(n, cur, step);
  }
  throw new ReductionStuckError(
    stage,
    "too-long",
    "가운데 맞추기가 끝나지 않는다",
  );
}

function pairedCount(n: number, colors: Colors): number {
  const g = reductionGeometry(n);
  let count = 0;
  for (const s of g.slots)
    if (slotPaired(s, (p) => colors[p] as number)) count++;
  return count;
}

interface EdgeSetup {
  moves: CubeMove[];
  /** 준비 수를 돌린 뒤 자리 p의 색은 돌리기 전 `src[p]`의 색(`sourceMap`) */
  src: Int32Array;
}

const setupCache = new Map<string, EdgeSetup[]>();

/** 바깥층 준비 수(길이 `depth`까지)와 그 수열을 한 번에 돌리는 자리 표. 크기·길이마다 한 번 만든다 */
function setupsOf(n: number, depth: number): EdgeSetup[] {
  const key = `${n}:${depth}`;
  let hit = setupCache.get(key);
  if (!hit) {
    hit = outerSequences(n, depth).map((moves) => ({
      moves,
      src: sourceMap(n, moves),
    }));
    setupCache.set(key, hit);
  }
  return hit;
}

/**
 * 칸 점수를 빨리 세는 표: 칸마다 [기준 조각 스티커 둘씩, 나머지 조각 스티커 둘씩…].
 * 기준은 홀수 크기면 가운데 모서리 조각 하나, 짝수면 가장 안쪽 날개 둘(`EdgeSlot.anchor`).
 */
interface SlotTable {
  /** 칸 i의 스티커는 `stickers[start[i]]`부터 `count[i]`조각(조각마다 둘) */
  start: Int32Array;
  count: Int32Array;
  stickers: Int32Array;
  /** 기준 조각 수(1이나 2, 모든 칸이 같다) */
  anchors: number;
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
    for (const k of s.anchor)
      list.push(...(s.pieces[k] as readonly [number, number]));
    s.pieces.forEach((p, k) => {
      if (!s.anchor.includes(k)) list.push(...p);
    });
  });
  const t = {
    start,
    count,
    stickers: Int32Array.from(list),
    anchors: g.slots[0]?.anchor.length ?? 1,
  };
  slotTables.set(n, t);
  return t;
}

/** 칸 점수(`slotScore`와 같다) */
function fastSlotScore(t: SlotTable, slot: number, ca: Colors): number {
  const st = t.stickers;
  let k = t.start[slot] as number;
  const end = k + 2 * (t.count[slot] as number);
  const a = ca[st[k] as number];
  const b = ca[st[k + 1] as number];
  k += 2;
  let score = 0;
  if (t.anchors === 2) {
    if (ca[st[k] as number] !== a || ca[st[k + 1] as number] !== b) return 0;
    score = 1;
    k += 2;
  }
  for (; k < end; k += 2)
    if (ca[st[k] as number] === a && ca[st[k + 1] as number] === b) score++;
  return score;
}

/**
 * 공식마다 「돌린 뒤 그 공식이 건드리는 칸의 스티커가 원래 있던 자리」를 칸 점수 차례대로 펼친 표.
 * 공식 `mi`의 칸은 `slot[slotStart[mi]]`부터 `slotStart[mi + 1]` 앞까지, 칸 항목 `e`의 읽을 자리는
 * `reads[readStart[e]]`부터 `readStart[e + 1]` 앞까지(`fastSlotScore`의 스티커 차례에 `src`를 씌운 것)
 */
interface MacroReads {
  slotStart: Int32Array;
  slot: Int32Array;
  readStart: Int32Array;
  reads: Int32Array;
  /**
   * 칸 항목 `e`의 점수 상한 재료. 공식이 그 칸의 기준 조각을 다른 칸 하나(`from[e]`, 같은 칸일 수도 있다)의
   * 기준 조각에서 모두 같은 방향(또는 모두 뒤집혀) 옮겨 오면, 나머지 조각 가운데 그 칸의 조각을 같은 방향으로
   * 옮겨 온 것은 짝 맞음이 그대로다. 그래서 돌린 뒤 점수 ≤ `from` 칸의 지금 점수 + 새로 들어온 조각 수
   * (`extra[e]`, 기준이 둘인 짝수 크기는 기준이 안 맞으면 0 그대로). 그렇게 옮기지 않으면 `from[e]`은 -1(상한은 다 맞은 점수)
   */
  from: Int32Array;
  extra: Int32Array;
}

const readsCache = new WeakMap<readonly Macro[], MacroReads>();

function macroReads(
  t: SlotTable,
  slotOf: Int8Array,
  macros: readonly Macro[],
): MacroReads {
  const hit = readsCache.get(macros);
  if (hit) return hit;
  const st = t.stickers;
  const anchors = t.anchors;
  /** 칸 s의 조각(스티커 둘, 칸 차례 그대로) → 기준 조각이면 1, 나머지면 2 */
  const pieceKind = Array.from({ length: t.start.length }, (_, si) => {
    const kind = new Map<number, number>();
    const k0 = t.start[si] as number;
    for (let j = 0; j < (t.count[si] as number); j++) {
      const key =
        (st[k0 + 2 * j] as number) * 4096 + (st[k0 + 2 * j + 1] as number);
      kind.set(key, j < anchors ? 1 : 2);
    }
    return kind;
  });
  /** 조각 (q1, q2)가 칸 s'에서 어떤 조각인지: [s', 종류, 뒤집힘(0·1)], 칸의 조각이 아니면 null */
  const pieceAt = (q1: number, q2: number): [number, number, number] | null => {
    const s1 = slotOf[q1] as number;
    if (s1 < 0 || slotOf[q2] !== s1) return null;
    const kinds = pieceKind[s1] as Map<number, number>;
    const straight = kinds.get(q1 * 4096 + q2);
    if (straight) return [s1, straight, 0];
    const flipped = kinds.get(q2 * 4096 + q1);
    return flipped ? [s1, flipped, 1] : null;
  };
  const slotStart = new Int32Array(macros.length + 1);
  const slot: number[] = [];
  const readStart: number[] = [];
  const reads: number[] = [];
  const from: number[] = [];
  const extra: number[] = [];
  macros.forEach((m, i) => {
    slotStart[i] = slot.length;
    for (const si of m.slots) {
      slot.push(si);
      readStart.push(reads.length);
      const k0 = t.start[si] as number;
      const count = t.count[si] as number;
      const end = k0 + 2 * count;
      for (let k = k0; k < end; k++)
        reads.push(m.src[st[k] as number] as number);
      // 기준 조각이 모두 한 칸의 기준 조각에서 같은 뒤집힘으로 왔는가
      let source = -1;
      let flip = -1;
      for (let j = 0; j < anchors && flip !== -2; j++) {
        const at = pieceAt(
          m.src[st[k0 + 2 * j] as number] as number,
          m.src[st[k0 + 2 * j + 1] as number] as number,
        );
        const [s1, kind, f1] = at ?? [-1, 0, -1];
        if (kind !== 1 || (j > 0 && (s1 !== source || f1 !== flip))) flip = -2;
        else [source, flip] = [s1, f1];
      }
      if (flip === -2) {
        from.push(-1);
        extra.push(0);
        continue;
      }
      let added = 0;
      for (let j = anchors; j < count; j++) {
        const at = pieceAt(
          m.src[st[k0 + 2 * j] as number] as number,
          m.src[st[k0 + 2 * j + 1] as number] as number,
        );
        if (!at || at[0] !== source || at[1] !== 2 || at[2] !== flip) added++;
      }
      from.push(source);
      extra.push(added);
    }
  });
  slotStart[macros.length] = slot.length;
  readStart.push(reads.length);
  const out = {
    slotStart,
    slot: Int32Array.from(slot),
    readStart: Int32Array.from(readStart),
    reads: Int32Array.from(reads),
    from: Int32Array.from(from),
    extra: Int32Array.from(extra),
  };
  readsCache.set(macros, out);
  return out;
}

/** 공식을 돌린 뒤의 칸 점수(`fastSlotScore`와 같은 셈, 읽을 자리는 `reads[k..end)`) */
function readsScore(
  ca: Colors,
  reads: Int32Array,
  k0: number,
  end: number,
  anchors: number,
): number {
  let k = k0;
  const a = ca[reads[k] as number];
  const b = ca[reads[k + 1] as number];
  k += 2;
  let score = 0;
  if (anchors === 2) {
    if (ca[reads[k] as number] !== a || ca[reads[k + 1] as number] !== b)
      return 0;
    score = 1;
    k += 2;
  }
  for (; k < end; k += 2)
    if (ca[reads[k] as number] === a && ca[reads[k + 1] as number] === b)
      score++;
  return score;
}

/**
 * 짝을 다 지으려면 패리티 공식이 있어야 하는 날개 묶음. 홀수 크기는 홀짝이 홀인 묶음, 짝수 크기는 가장
 * 안쪽 묶음과 홀짝이 다른 묶음(4×4는 묶음이 하나라 없다. 그 홀짝은 3×3 단계의 OLL 패리티로 고친다)
 */
function parityDepths(n: number, colors: Colors): number[] {
  const depths = wingDepths(n);
  if (n % 2 === 1) return depths.filter((d) => wingParity(n, colors, d) === 1);
  const inner = depths.at(-1) as number;
  const want = wingParity(n, colors, inner);
  return depths.filter((d) => d !== inner && wingParity(n, colors, d) !== want);
}

const bySlotCache = new WeakMap<readonly Macro[], number[][]>();

/** 칸마다 그 칸을 건드리는 공식 번호(`macros` 안 차례) */
function macrosBySlot(macros: readonly Macro[], slotCount: number): number[][] {
  const hit = bySlotCache.get(macros);
  if (hit) return hit;
  const out: number[][] = Array.from({ length: slotCount }, () => []);
  macros.forEach((m, i) => {
    for (const s of m.slots) out[s]?.push(i);
  });
  bySlotCache.set(macros, out);
  return out;
}

/** 모서리 짝 단계: 짝 맞은 칸이 `goal`개가 될 때까지 */
function solveEdgePhase(
  stage: ReductionStageId,
  n: number,
  colors: Colors,
  goal: number,
  out: CubeMove[],
  maxSteps: number,
): Colors {
  const g = reductionGeometry(n);
  const t = slotTable(n);
  const { pairs, cycles } = edgeMacros(n);
  const both = [...pairs, ...cycles];
  let cur = colors;
  const before = new Int32Array(g.slots.length);
  /** 준비 수를 돌린 색(준비 수마다 새로 쓴다) */
  const ca: Colors = new Uint8Array(cur.length);
  /** 짝이 다 맞은 칸의 점수 */
  const full = (t.anchors === 2 ? 1 : 0) + (t.count[0] as number) - t.anchors;
  const search = (
    depth: number,
    macros: readonly Macro[],
    prev: Pick | undefined,
  ) => {
    let best = prev;
    const bySlot = macrosBySlot(macros, g.slots.length);
    const R = macroReads(t, g.slotOf, macros);
    /** 공식마다 마지막으로 본 준비 수 번호(한 준비 수에서 공식을 한 번만 본다) */
    const seenAt = new Int32Array(macros.length).fill(-1);
    const openSlots: number[] = [];
    const setups = setupsOf(n, depth);
    for (let si0 = 0; si0 < setups.length; si0++) {
      const setup = setups[si0] as EdgeSetup;
      if (depth === 3 && setup.moves.length < 3) continue;
      applySource(cur, setup.src, ca);
      openSlots.length = 0;
      for (let i = 0; i < before.length; i++) {
        before[i] = fastSlotScore(t, i, ca);
        if ((before[i] as number) < full) openSlots.push(i);
      }
      // 아직 안 맞은 칸을 건드리는 공식만 본다(다 맞은 칸만 건드리면 나아질 수 없다).
      // 공식은 그것이 건드리는 열린 칸 가운데 첫 칸에서 한 번만 본다
      for (let k = 0; k < openSlots.length; k++) {
        for (const mi of bySlot[openSlots[k] as number] ?? []) {
          if (seenAt[mi] === si0) continue;
          seenAt[mi] = si0;
          const macro = macros[mi] as Macro;
          const length = setup.moves.length + macro.moves.length;
          const e0 = R.slotStart[mi] as number;
          const e1 = R.slotStart[mi + 1] as number;
          // 이득 상한(`MacroReads.from`·`extra`). 상한으로도 나아지지 않거나 지금 고른 것보다 좋을 수 없으면 세지 않는다
          // (이득 ≤ 상한이고 나눗셈은 단조라 실제 비율도 그 이상이다: 고르는 답은 같다)
          let most = 0;
          for (let e = e0; e < e1; e++) {
            const src = R.from[e] as number;
            const b = src < 0 ? 0 : (before[src] as number);
            const cap =
              src < 0
                ? full
                : t.anchors === 2 && b === 0
                  ? 0
                  : Math.min(full, b + (R.extra[e] as number));
            most += cap - (before[R.slot[e] as number] as number);
          }
          if (most <= 0 || (best && length / most >= best.ratio)) continue;
          let gain = 0;
          for (let e = e0; e < e1; e++) {
            gain +=
              readsScore(
                ca,
                R.reads,
                R.readStart[e] as number,
                R.readStart[e + 1] as number,
                t.anchors,
              ) - (before[R.slot[e] as number] as number);
          }
          if (gain <= 0) continue;
          const ratio = length / gain;
          if (!best || ratio < best.ratio)
            best = { setup: setup.moves, macro, ratio };
        }
      }
    }
    return best;
  };
  for (let guard = 0; guard < maxSteps; guard++) {
    if (pairedCount(n, cur) >= goal) return cur;
    // 짝 짓기 공식이 수 다섯에 하나 넘게 맞추면 그것으로, 아니면 날개 세 개 돌리기까지 본다.
    let best = search(2, pairs, undefined);
    if (!best || best.ratio > 5) best = search(2, cycles, best);
    const fix = best ? [] : parityDepths(n, cur);
    if (fix.length) {
      // 날개 순열의 홀짝이 맞지 않으면 짝 지은 모양에 닿을 수 없다(짝 지은 모양은 묶음마다 늘 짝,
      // 짝수 크기는 묶음끼리 같다). 아직 안 맞은 칸 하나에서 그 묶음의 두 날개를 맞바꿔 홀짝을 바꾼다(모서리 패리티).
      outer: for (const setup of setupsOf(n, 2)) {
        applySource(cur, setup.src, ca);
        for (const macro of edgeParityMacros(n, fix[0])) {
          const unpaired = macro.slots.some(
            (si) => fastSlotScore(t, si, ca) < full,
          );
          if (unpaired) {
            best = { setup: setup.moves, macro, ratio: 0 };
            break outer;
          }
        }
      }
    }
    if (!best) best = search(3, both, undefined);
    if (!best) {
      throw new ReductionStuckError(
        stage,
        "no-progress",
        `모서리 짝을 더 맞출 공식을 찾지 못했다(${pairedCount(n, cur)}개 맞음)`,
      );
    }
    const step = [...best.setup, ...best.macro.moves];
    out.push(...step);
    cur = applyMovesColors(n, cur, step);
  }
  throw new ReductionStuckError(
    stage,
    "too-long",
    "모서리 짝 맞추기가 끝나지 않는다",
  );
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

/** n×n 스티커 문자열(Kociemba 순서)을 축소법으로 푼다. 4×4~7×7 */
export function solveReduction(facelets: string): ReductionSolution {
  const n = Math.round(Math.sqrt(facelets.length / 6));
  if (6 * n * n !== facelets.length) {
    throw new Error(`스티커 개수가 맞지 않는다: ${facelets.length}`);
  }
  return solveReductionColors(n, colorsFromFacelets(facelets));
}

/** cube-engine 상태를 축소법으로 푼다. 4×4~7×7 */
export function solveReductionState(
  n: number,
  state: PuzzleState,
  limits: ReductionOptions = {},
): ReductionSolution {
  return solveReductionColors(n, faceColors(n, state), limits);
}

export function solveReductionColors(
  n: number,
  colors: Colors,
  limits: ReductionOptions = {},
): ReductionSolution {
  if (!REDUCTION_SIZES.includes(n)) {
    throw new RangeError(`축소법은 4×4~7×7만 푼다: ${n}×${n}`);
  }
  const centerSteps = limits.centerSteps ?? CENTER_STEPS;
  const edgeSteps = limits.edgeSteps ?? EDGE_STEPS;
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
    const up = solveCenterPhase(
      "centers-ud",
      n,
      cur,
      target,
      (f) => (f === 0 ? 1 : 0),
      out,
      centerSteps,
    );
    return solveCenterPhase(
      "centers-ud",
      n,
      up,
      target,
      (f) => (f === 0 ? 1000 : f === 3 ? 1 : 0),
      out,
      centerSteps,
    );
  });
  run("centers-rest", (out) =>
    solveCenterPhase(
      "centers-rest",
      n,
      cur,
      target,
      (f) => (f === 0 || f === 3 ? 1000 : 1),
      out,
      centerSteps,
    ),
  );
  run("edges", (out) => solveEdgePhase("edges", n, cur, 10, out, edgeSteps));
  run("last-edges", (out) =>
    solveEdgePhase("last-edges", n, cur, 12, out, edgeSteps),
  );
  if (limits.pairsOnly) return { moves: format(n, all), stages };

  if (n % 2 === 0) {
    run("oll-parity", (out) => {
      if (!threeParity(toThreeFacelets(n, cur, faceOfColor)).oll) return cur;
      const list = moves(n, ollParityText(n));
      out.push(...list);
      return applyMovesColors(n, cur, list);
    });
    run("pll-parity", (out) => {
      if (!threeParity(toThreeFacelets(n, cur, faceOfColor)).pll) return cur;
      const list = moves(n, pllParityText(n));
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
