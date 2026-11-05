import {
  type Axis,
  applyMoves,
  type CubeMove,
  faceColors,
  formatMove,
  parseMoves,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import {
  isLlStage,
  llCorrectIds,
  llShapeIds,
  llTargetIds,
  type PieceMark,
  type PieceUnit,
  searchTurns,
  splitByUnits,
  unitAt,
  slotStickers as unitSlotStickers,
  unitSolved,
  unitStickers,
  unitsForStage,
} from "../piece-marks";

/**
 * 첫 화면 연출의 보여 주기 변환(docs/47 0절 2026-11-04). 해법이 낸 수는 그대로 두고(컴퓨터 대결·배우기가
 * 같은 해법을 쓴다), 화면에 보일 수열만 새로 만든다. 순수 함수다.
 *
 * - 해법 속 큐브 돌리기(x·y·z)는 화면에서 빼고, 그 뒤 수를 그만큼 켤레로 바꿔 둔다(같은 조각을 같은 쪽으로
 *   돌린다). 대신 연출이 정한 자리에서만 돌려 쥔다:
 *   1. 위 단계(`up`, 십자·배우는 방식 첫 층): 시작 전에 그 층의 면을 위(U)로 들고, 끝나면 z2로 아래(D)로.
 *   2. 넣는 단계(첫 층 코너·둘째 층·F2L 짝·2×2 첫 층): 그 차례가 채우는 칸이 앞-오른쪽(아래층이면 DFR·FR,
 *      위 단계면 UFR)에 오게 y로 돌려 쥔다. 이미 거기면 돌리지 않는다(앞 차례의 방향을 이어받는다).
 *   3. 마지막으로 돌려 쥔 단계 끝에서 해법의 쥔 방향으로 돌아온다. 그래서 끝 상태가 해법과 같다.
 * - 그 밖의 단계(마지막 층, 4×4·5×5 축소, 루·ZZ)는 해법의 돌리기를 그대로 둔다(공식이 R·U 그대로 보인다).
 *   초보자 코너 방향(`ll-corner-twist`)도 돌려 쥐지 않아, 아래 두 층이 흐트러졌다 돌아오는 모습이 그대로 보인다. `mirror` 단계는 y2로 돌려 보이고
 *   끝나면 되돌린다(왼쪽에 쌓는 블록이 카메라 쪽 오른쪽에 보이게).
 * - `search`(3×3 초보자·프리드리히, 2026-11-05): 조각 하나(십자 엣지·첫 층 코너·둘째 층 엣지·F2L 짝)를 넣기 전에,
 *   그 조각이 지금 보이는 세 면(위·앞·오른쪽)에 없으면 사람이 찾듯 `SEARCH_ORDER`(y 세 번, 그다음 x2)대로 돌려
 *   처음 보이는 걸음에서 멈춘다(`piece-marks.ts`). 찾는 동안은 보이는 면만 본다. 그다음은 위 규칙 그대로다.
 *   넣을 곳·찾은 조각(넣기 전)과 맞춘 조각(넣은 뒤) 사건을 `marks`로 낸다. 넣는 동안에는 사건이 없다.
 *   - 이미 맞은 조각(사용자 2026-11-05 「'맞은 상태'도 돌려서 확인해줘」): 단계를 시작할 때 맞아 있던 조각은 그
 *     단계 처음에, 다른 조각을 넣다가 함께 맞은 조각은 그 조각을 넣은 바로 뒤에, 하나씩 그 칸을 앞(-오른쪽)으로
 *     y로 돌려 「맞춘 조각」으로 확인한다(`check`). 수는 두지 않고 되돌리지도 않는다. 사람이 단계를 시작하며
 *     맞은 것부터 훑고, 넣다가 맞은 것은 넣은 자리에서 알아차리는 차례다.
 *   - 마지막 층 단계(사용자 2026-11-05 「무엇을 맞추는 단계인지 하이라이트」): 단계 시작에 맞출 칸(넣을 곳), 공식
 *     토막마다 앞에 알아볼 모양(찾은 조각)·뒤에 새로 맞은 칸(맞춘 조각), 단계 끝에 맞춘 칸 전체를 빛낸다.
 *     판정은 상태만 본다(`piece-marks.ts` `llTargetIds` 등). 해법의 돌리기(U·y)는 그대로 보인다.
 * - `keepY`(배우는 방식 흰 십자): 해법의 y를 녹이지 않고 그대로 보인다. 넣을 자리를 y로 앞에 가져와 앞면(F)으로
 *   올리는 모습이 화면에도 그대로 나온다(사용자 2026-11-05 「항상 D면으로 내려서 옮겨서 올려」).
 * - 조각 하나의 차례(사용자 2026-11-05 「먼저 큐브 전체를 돌려서 맞출 공간을 정면에 둔 후에 면을 돌려서 대상 조각을
 *   앞으로 가져와서 넣어줘」): 둘러보기·되돌리기 → 큐브 돌리기(넣을 칸을 앞으로) → 반대 면(조각을 칸 밑으로) → 공식.
 *   해법(`taught.ts`·`cross-front.ts`)이 이 차례로 수를 내고, 이 변환은 큐브 돌리기를 층 돌리기 사이에 끼우지 않는다.
 *   `bring` 단계는 반대 면 수 뒤 공식 앞 자리를 `gaps`로 내어 연출이 잠깐 쉰다(`loop.ts` `order`).
 */

export interface HeroView {
  /** 첫 층 면을 위에 두고 보일 단계(차례대로 이어진다). 마지막 단계 끝에서 z2로 내린다 */
  up?: readonly string[];
  /** y2로 돌려 보일 단계 */
  mirror?: readonly string[];
  /** 조각마다 보이는 세 면에서 찾아 돌리고 강조 사건을 낸다(3×3) */
  search?: boolean;
  /** 해법의 y를 그대로 보일 단계(녹이지 않는다) */
  keepY?: readonly string[];
  /**
   * 흰 면 위에서 조각을 아랫면(D)으로 칸 밑에 두고 넣는 단계. 그 D 뒤 공식 앞에 쉬는 자리(`gaps`)를 낸다
   * (사용자 2026-11-05 「먼저 큐브 전체를 돌려서 맞출 공간을 정면에 둔 후에 면을 돌려서 대상 조각을 앞으로 가져와서 넣어줘」)
   */
  bring?: readonly string[];
}

export interface PresentInput {
  moves: readonly string[];
  stages: readonly { name: string; start: number; end: number }[];
  looks: readonly number[];
}

export type PresentOutput = {
  moves: string[];
  stages: { name: string; start: number; end: number }[];
  looks: number[];
  /** 찾는 돌리기(이 번호의 수) */
  searches: number[];
  /** 강조 사건: 이 번호의 수 앞에서(수 수와 같으면 다 맞춘 뒤) 차례대로 */
  marks: { at: number; mark: PieceMark }[];
  /** 아랫면으로 조각을 칸 밑에 둔 뒤 공식을 시작하는 수(`bring` 단계, 이 번호의 수 앞에서 쉰다) */
  gaps: number[];
};

/** 해법의 돌리기를 그대로 두는 단계(축소, 루·ZZ의 블록 단계) */
const KEEP = new Set([
  "centers-ud",
  "centers-rest",
  "edges",
  "last-edges",
  "fb",
  "sb",
  "cmll",
  "lse-eo",
  "lse-ulur",
  "lse-ep",
  "eoline",
  "zz-left",
  "zz-right",
]);

export type SlotKind = "corner" | "edge" | "pair";

/** 칸 하나에 조각을 넣는 단계와 그 칸 종류 */
export function insertKind(name: string): SlotKind | null {
  if (name === "corners" || name === "first-layer") return "corner";
  if (name === "middle") return "edge";
  if (name.startsWith("f2l-")) return "pair";
  return null;
}

// ---------- 큐브 전체 돌리기(3×3 정수 행렬, 좌표 x 오른쪽·y 위·z 앞) ----------

type Mat = readonly number[];
const I: Mat = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** + 쪽에서 볼 때 시계 방향 한 번: x는 앞→위, y는 앞→왼쪽, z는 위→오른쪽 */
const QUARTER: Record<Axis, Mat> = {
  x: [1, 0, 0, 0, 0, 1, 0, -1, 0],
  y: [0, 0, -1, 0, 1, 0, 1, 0, 0],
  z: [0, 1, 0, -1, 0, 0, 0, 0, 1],
};
const AXIS_INDEX: Record<Axis, number> = { x: 0, y: 1, z: 2 };
const AXES: readonly Axis[] = ["x", "y", "z"];

function mul(a: Mat, b: Mat): Mat {
  const out: number[] = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      let v = 0;
      for (let k = 0; k < 3; k++)
        v += (a[r * 3 + k] as number) * (b[k * 3 + c] as number);
      out.push(v);
    }
  return out;
}

const transpose = (a: Mat): Mat =>
  [0, 3, 6, 1, 4, 7, 2, 5, 8].map((i) => a[i] as number);
const same = (a: Mat, b: Mat) => a.every((v, i) => v === b[i]);

function rotationMat(axis: Axis, turns: number): Mat {
  let m = I;
  for (let i = 0; i < turns; i++) m = mul(QUARTER[axis], m);
  return m;
}

const isWhole = (n: number, m: CubeMove) => m.from === 1 && m.to === n;

/** 돌리기 표기 하나(y, x2, z' …)의 행렬 */
function tokenMat(token: string): Mat {
  const axis = token[0] as Axis;
  const turns = token.endsWith("2") ? 2 : token.endsWith("'") ? 3 : 1;
  return rotationMat(axis, turns);
}

const SINGLE = AXES.flatMap((a) => [a, `${a}'`, `${a}2`]);
/** 짧고 익숙한 것부터: 한 번 돌리기, 그다음 둘(y 먼저) */
const TOKEN_LISTS: readonly string[][] = [
  [],
  ...["y", "y'", "y2", "z2", "x2", "x", "x'", "z", "z'"].map((t) => [t]),
  ...SINGLE.flatMap((a) =>
    SINGLE.filter((b) => b[0] !== a[0]).map((b) => [a, b]),
  ),
];

/** 행렬 `m`만큼 돌리는 가장 짧은 표기(앞 것부터 둔다) */
function tokensFor(m: Mat): string[] {
  for (const list of TOKEN_LISTS) {
    let acc = I;
    for (const t of list) acc = mul(tokenMat(t), acc);
    if (same(acc, m)) return list;
  }
  throw new Error("돌리기 표기를 찾지 못했다");
}

/**
 * 화면 방향 `g`(해법 좌표 → 화면 좌표)에서 해법의 수 하나를 화면 이름으로. 축이 반대쪽을 가리키면
 * 층 번호를 뒤집고 방향을 거꾸로 센다(층 1은 + 쪽 바깥층, 시계 방향은 + 쪽에서 본다).
 */
export function conjugate(n: number, g: Mat, m: CubeMove): CubeMove {
  const a = AXIS_INDEX[m.axis];
  const col = [g[a] as number, g[3 + a] as number, g[6 + a] as number];
  const b = col.findIndex((v) => v !== 0);
  const axis = AXES[b] as Axis;
  if ((col[b] as number) > 0) return { ...m, axis };
  return {
    axis,
    from: n + 1 - m.to,
    to: n + 1 - m.from,
    turns: (4 - m.turns) as 1 | 2 | 3,
  };
}

// ---------- 칸 보기 ----------

const FACE = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 } as const;

function slotStickers(
  n: number,
  kind: SlotKind | "top-corner" | "top-edge",
): number[] {
  const nn = n * n;
  const at = (f: number, r: number, c: number) => f * nn + r * n + c;
  const m = Math.floor(n / 2);
  const dfr = [
    at(FACE.D, 0, n - 1),
    at(FACE.F, n - 1, n - 1),
    at(FACE.R, n - 1, 0),
  ];
  const fr = [at(FACE.F, m, n - 1), at(FACE.R, m, 0)];
  if (kind === "top-corner")
    return [at(FACE.U, n - 1, n - 1), at(FACE.F, 0, n - 1), at(FACE.R, 0, 0)];
  if (kind === "top-edge") return [at(FACE.U, n - 1, m), at(FACE.F, 0, m)];
  if (kind === "corner") return dfr;
  if (kind === "edge") return fr;
  return [...dfr, ...fr];
}

type Slot = SlotKind | "top-corner" | "top-edge";

/** 칸이 맞았나(센터 색 기준, 3×3 이상) */
function slotSolved(n: number, colors: Uint8Array, slot: Slot): boolean | null {
  if (n < 3) return null;
  const nn = n * n;
  const c = Math.floor(n / 2);
  return slotStickers(n, slot).every((i) => {
    const face = Math.floor(i / nn);
    return colors[i] === colors[face * nn + c * n + c];
  });
}

const Y_TURNS = ["", "y", "y2", "y'"];

function yViewState(n: number, state: PuzzleState, k: number): PuzzleState {
  const t = Y_TURNS[k] as string;
  return t ? applyMoves(n, state, parseMoves(n, t)) : state;
}

function yView(n: number, state: PuzzleState, k: number): Uint8Array {
  return faceColors(n, yViewState(n, state, k));
}

/**
 * 차례 하나(전후 화면 상태)가 채운 칸을 앞-오른쪽으로 데려오는 y 횟수(0~3). 새로 맞은 칸, 없으면
 * 내용이 바뀐 칸(2×2·꺼내기). 여럿이면 이미 앞-오른쪽인 것을 고른다.
 */
export function slotTurn(
  n: number,
  before: PuzzleState,
  after: PuzzleState,
  slot: Slot,
): number {
  const ks = [0, 1, 2, 3];
  const views = ks.map((k) => ({
    b: yView(n, before, k),
    a: yView(n, after, k),
  }));
  const pick = (list: number[]) => (list.includes(0) ? 0 : list[0]);
  if (n >= 3) {
    const fresh = ks.filter((k) => {
      const v = views[k] as { b: Uint8Array; a: Uint8Array };
      return !slotSolved(n, v.b, slot) && slotSolved(n, v.a, slot);
    });
    if (fresh.length) return pick(fresh) as number;
  }
  const idx = slotStickers(n, slot);
  const changed = ks.filter((k) => {
    const v = views[k] as { b: Uint8Array; a: Uint8Array };
    return idx.some((i) => v.b[i] !== v.a[i]);
  });
  return changed.length ? (pick(changed) as number) : 0;
}

/** 흰 스티커(색 0)가 가장 많은 면: 위 단계가 끝났을 때 그 층이 있는 면 */
function whiteFace(n: number, state: PuzzleState): number {
  const colors = faceColors(n, state);
  const nn = n * n;
  let best = 0;
  let bestCount = -1;
  for (let f = 0; f < 6; f++) {
    let count = 0;
    for (let i = 0; i < nn; i++) if (colors[f * nn + i] === 0) count++;
    if (count > bestCount) {
      best = f;
      bestCount = count;
    }
  }
  return best;
}

const NORMAL: readonly (readonly number[])[] = [
  [0, 1, 0],
  [1, 0, 0],
  [0, 0, 1],
  [0, -1, 0],
  [-1, 0, 0],
  [0, 0, -1],
];

/** 면 `face`를 위로 드는 가장 짧은 돌리기 */
function liftToUp(face: number): string[] {
  const v = NORMAL[face] as readonly number[];
  for (const list of TOKEN_LISTS) {
    if (list.length > 1) break;
    let acc = I;
    for (const t of list) acc = mul(tokenMat(t), acc);
    const y =
      (acc[3] as number) * (v[0] as number) +
      (acc[4] as number) * (v[1] as number) +
      (acc[5] as number) * (v[2] as number);
    if (y === 1) return list;
  }
  throw new Error("면을 위로 들 돌리기를 찾지 못했다");
}

// ---------- 변환 ----------

interface Out {
  m: CubeMove;
  look: boolean;
  stage: number;
  /** 찾는 돌리기(합치지 않는다) */
  search?: boolean;
  /** 이 수 앞에 낼 강조 사건(합치지 않는다) */
  events?: PieceMark[];
}

export function presentSolve(
  n: number,
  start: PuzzleState,
  solve: PresentInput,
  view: HeroView = {},
): PresentOutput {
  const up = view.up ?? [];
  const mirror = new Set(view.mirror ?? []);
  const lookSet = new Set(solve.looks);
  const parsed = solve.moves.map((t) => parseMoves(n, t));
  const out: Out[] = [];
  let g: Mat = I;
  let state = start;
  let carryLook = false;
  /** 다음 수 앞에 낼 강조 사건 */
  let pending: PieceMark[] = [];

  const push = (m: CubeMove, stage: number, look: boolean, search = false) => {
    const item: Out = { m, look: look || carryLook, stage };
    if (search) item.search = true;
    if (pending.length) {
      item.events = pending;
      pending = [];
    }
    out.push(item);
    carryLook = false;
    state = applyMoves(n, state, [m]);
  };
  /** 연출이 정한 돌리기를 둔다 */
  const turn = (
    tokens: readonly string[],
    stage: number,
    look = false,
    search = false,
  ) => {
    tokens.forEach((t, i) => {
      const [m] = parseMoves(n, t) as [CubeMove];
      push(m, stage, look && i === 0, search);
      g = mul(tokenMat(t), g);
    });
  };
  /** 해법 수 i 앞 상태(해법 좌표). 센터 기준으로 맞았는지만 보므로 화면 방향과 상관없다 */
  const rawStates: PuzzleState[] = [];
  if (view.search) {
    let s = start;
    rawStates.push(s);
    for (const ms of parsed) {
      s = applyMoves(n, s, ms);
      rawStates.push(s);
    }
  }
  /** 해법의 수 [from, to)를 둔다. `keep`이면 돌리기도 그대로 */
  const keepY = new Set(view.keepY ?? []);
  const play = (from: number, to: number, stage: number, keep: boolean) => {
    const yKept = keepY.has(solve.stages[stage]?.name ?? "");
    for (let i = from; i < to; i++) {
      const look = lookSet.has(i);
      if (look) carryLook = true;
      for (const m of parsed[i] ?? []) {
        if (!keep && isWhole(n, m)) {
          // 화면은 돌리지 않고 방향만 기억한다(뒤 수가 켤레로 바뀐다)
          g = mul(g, transpose(rotationMat(m.axis, m.turns)));
          continue;
        }
        if (yKept && !isWhole(n, m) && !same(g, I)) {
          // 해법의 y(와 앞서 확인하느라 돌린 y)를 층 돌리기 바로 앞에서 화면에 둔다: 화면 방향이 해법 방향과
          // 같아져 해법의 F가 화면에서도 앞면이다
          turn(tokensFor(transpose(g)), stage);
        }
        push(conjugate(n, g, m), stage, false);
      }
    }
  };
  /** [from, to)를 두지 않고 화면 상태만 미리 본다 */
  const peek = (from: number, to: number, keep: boolean): PuzzleState => {
    let gg = g;
    let st = state;
    for (let i = from; i < to; i++)
      for (const m of parsed[i] ?? []) {
        if (!keep && isWhole(n, m)) {
          gg = mul(gg, transpose(rotationMat(m.axis, m.turns)));
          continue;
        }
        st = applyMoves(n, st, [conjugate(n, gg, m)]);
      }
    return st;
  };

  /**
   * 묶음을 넣기 전(사용자 2026-11-05 「둘러보기 → 찾음 → 처음 방향으로 되돌리기 → 넣을 칸을 앞-오른쪽으로 →
   * 넣기」): 보이는 세 면에 없으면 찾는 차례대로 돌려(둘러보기) 처음 보이는 걸음에서 멈추고, 넣을 곳과 찾은 조각
   * 사건을 낸 뒤 둘러보기 전 방향으로 가장 짧게 되돌린다. 넣을 칸을 앞으로 가져오는 돌리기는 그 뒤에 따로 둔다.
   * 둘러보기와 되돌리기는 모두 찾는 돌리기(`searches`, 빠르게)다
   */
  const findUnits = (
    units: readonly PieceUnit[],
    from: number,
    stageStart: number,
    stage: number,
  ) => {
    const tokens = searchTurns(state, units) ?? [];
    const look = lookSet.has(from) && from !== stageStart;
    if (tokens.length) {
      turn(tokens, stage, look, true);
      if (look) lookSet.delete(from);
    }
    pending.push(
      {
        kind: "slot",
        stickers: units.flatMap((u) => unitSlotStickers(state, u)),
      },
      { kind: "found", stickers: units.flatMap(unitStickers) },
    );
    if (tokens.length) {
      const looked = tokens.reduce((acc, t) => mul(tokenMat(t), acc), I);
      turn(tokensFor(transpose(looked)), stage, false, true);
    }
  };
  /** 이미 맞춘 것을 지켜야 하는 묶음(앞 찾기 단계 것 포함). 묶음을 나눌 때 되돌리는 수까지 한 묶음에 둔다 */
  const guard: PieceUnit[] = [];
  /** 넣었거나 확인한 묶음(다시 확인하지 않는다) */
  const known = new Set<string>();
  const keyOf = (u: PieceUnit) => u.pieces.join();
  /** 묶음을 칸 `slot`으로 가져오는 y 횟수(0~3, 없으면 null) */
  const yToSlot = (u: PieceUnit, slot: Slot): number | null => {
    const at = slotStickers(n, slot);
    for (let k = 0; k < 4; k++)
      if (unitAt(yViewState(n, state, k), u, at)) return k;
    return null;
  };
  /**
   * 이미 맞은 묶음을 하나씩 확인한다: 가장 적게 돌려 오는 것부터 그 칸을 앞(-오른쪽)으로 y로 돌리고
   * 「맞춘 조각」으로 빛낸다. 수는 두지 않는다
   */
  const checkUnits = (
    list: readonly PieceUnit[],
    slot: Slot,
    stage: number,
  ) => {
    let left = list.filter((u) => !known.has(keyOf(u)));
    while (left.length) {
      let best = left[0] as PieceUnit;
      let bestK = yToSlot(best, slot) ?? 0;
      for (const u of left.slice(1)) {
        const k = yToSlot(u, slot) ?? 0;
        if ((k === 3 ? 1 : k) < (bestK === 3 ? 1 : bestK)) {
          best = u;
          bestK = k;
        }
      }
      if (bestK) turn([Y_TURNS[bestK] as string], stage);
      pending.push({
        kind: "placed",
        stickers: unitStickers(best),
        solo: true,
        check: true,
      });
      known.add(keyOf(best));
      left = left.filter((u) => u !== best);
    }
  };

  const upStages = solve.stages.filter((s) => up.includes(s.name));
  const firstUp = upStages[0];
  const lastUp = upStages.at(-1);
  let downChecked = upStages.length > 0;
  /** 연출이 돌려 쥐는 단계(위 단계·넣는 단계). 그 밖은 해법의 돌리기를 그대로 둔다 */
  const shaped = (name: string) =>
    !KEEP.has(name) && (up.includes(name) || insertKind(name) !== null);
  const lastShaped = solve.stages.findLastIndex((s) => shaped(s.name));

  /** U 층 돌리기(마지막 층에서 모양을 제자리로 옮기는 수)인가 */
  const isUTurn = (m: CubeMove) => m.axis === "y" && m.from === 1 && m.to === 1;
  /**
   * 마지막 층 단계: 맞출 칸(단계 시작) → 토막마다 알아볼 모양(공식 앞) → 새로 맞은 칸(공식 뒤) → 맞춘 칸 전체(단계 끝).
   * 해법의 수는 그대로 둔다
   */
  const playLl = (st: PresentInput["stages"][number], si: number) => {
    pending.push({
      kind: "slot",
      stickers: llTargetIds(state, st.name),
      solo: true,
    });
    const cuts = [
      st.start,
      ...solve.looks.filter((l) => l > st.start && l < st.end),
      st.end,
    ];
    for (let c = 0; c + 1 < cuts.length; c++) {
      const from = cuts[c] as number;
      const to = cuts[c + 1] as number;
      const formula = parsed
        .slice(from, to)
        .flat()
        .some((m) => !isWhole(n, m) && !isUTurn(m));
      if (formula) {
        const shape = llShapeIds(state, st.name, peek(from, to, true));
        if (shape.length)
          pending.push({ kind: "found", stickers: shape, solo: true });
      }
      const before = new Set(llCorrectIds(state, st.name));
      play(from, to, si, true);
      const fresh = llCorrectIds(state, st.name).filter(
        (id) => !before.has(id),
      );
      if (formula && fresh.length)
        pending.push({ kind: "placed", stickers: fresh });
    }
    pending.push({
      kind: "placed",
      stickers: llCorrectIds(state, st.name),
      solo: true,
    });
  };

  solve.stages.forEach((st, si) => {
    if (view.search && isLlStage(n, st.name) && st.end > st.start) {
      playLl(st, si);
      return;
    }
    if (!shaped(st.name)) {
      if (mirror.has(st.name)) {
        // 앞쪽 돌리기(흰 면 아래로 등)는 먼저 두고, 그다음 y2로 돌려 보인다
        let i = st.start;
        while (i < st.end && (parsed[i] ?? []).every((m) => isWhole(n, m))) i++;
        play(st.start, i, si, true);
        turn(["y2"], si);
        play(i, st.end, si, true);
        turn(["y2"], si);
      } else play(st.start, st.end, si, true);
      return;
    }
    if (st === firstUp && lastUp) {
      const face = whiteFace(n, peek(st.start, lastUp.end, false));
      // 해법의 y를 그대로 보이는 단계는 해법이 든 방향 그대로 든다(앞면이 화면에서도 앞면이게)
      let lead = I;
      for (let i = st.start; i < st.end; i++) {
        const ms = parsed[i] ?? [];
        if (!ms.every((m) => isWhole(n, m))) break;
        for (const m of ms) lead = mul(rotationMat(m.axis, m.turns), lead);
      }
      turn(keepY.has(st.name) ? tokensFor(lead) : liftToUp(face), si);
    }
    const kind = insertKind(st.name);
    if (kind && !downChecked) {
      // 위 단계 없이 바로 넣는 해법(2×2 공식 해법): 첫 층 면을 아래로
      downChecked = true;
      const face = whiteFace(n, peek(st.start, st.end, false));
      const lift = liftToUp(face);
      turn(
        tokensFor(
          mul(
            rotationMat("z", 2),
            lift.reduce((acc, t) => mul(tokenMat(t), acc), I),
          ),
        ),
        si,
      );
    }
    // 이 단계에 맞출 조각만 본다(해법의 수 꼴에는 기대지 않는다)
    const units = view.search ? unitsForStage(n, st.name) : null;
    if (units)
      for (const u of units)
        if (!guard.some((g) => g.pieces.join() === u.pieces.join()))
          guard.push(u);
    if (!kind && !units) play(st.start, st.end, si, false);
    else {
      const slot: Slot | null = !kind
        ? null
        : kind === "corner" && up.includes(st.name)
          ? "top-corner"
          : kind;
      // 이미 맞은 조각을 확인할 칸: 넣는 칸, 십자는 앞 위 엣지 칸
      const checkSlot: Slot = slot ?? "top-edge";
      if (units)
        checkUnits(
          units.filter((u) => unitSolved(state, u)),
          checkSlot,
          si,
        );
      const cuts = [
        st.start,
        ...solve.looks.filter((l) => l > st.start && l < st.end),
        st.end,
      ];
      // 살피는 자리마다 조각 하나를 넣는 단계(최적 십자처럼 한 번에 짠 수가 아니다)
      const perUnit = st.name !== "cross" || cuts.length > 2;
      for (let c = 0; c + 1 < cuts.length; c++) {
        const cutFrom = cuts[c] as number;
        const cutTo = cuts[c + 1] as number;
        const parts: { from: number; to: number; units: PieceUnit[] }[] = [];
        /** 넣다가 함께 맞은 묶음(넣은 뒤에 확인한다) */
        let incidental: PieceUnit[] = [];
        let prev = cutFrom;
        if (units) {
          const groups = splitByUnits(rawStates, cutFrom, cutTo, units, guard);
          if (perUnit) {
            // 토막 끝에 맞은 것이 넣은 조각, 그 전에 맞아 끝까지 남은 것은 함께 맞은 것
            const main = groups.find((g) => g.at === cutTo);
            incidental = groups
              .filter((g) => g !== main)
              .flatMap((g) => g.units);
            parts.push({ from: cutFrom, to: cutTo, units: main?.units ?? [] });
            prev = cutTo;
          }
          // 살피는 자리 사이에 새로 맞은 묶음이 여럿이면 맞은 걸음으로 더 나눈다(최적 십자 등)
          else
            for (const g of groups) {
              parts.push({ from: prev, to: g.at, units: g.units });
              prev = g.at;
            }
        }
        if (prev < cutTo) parts.push({ from: prev, to: cutTo, units: [] });
        for (const part of parts) {
          const { from, to } = part;
          if (part.units.length) findUnits(part.units, from, st.start, si);
          if (slot) {
            const k = slotTurn(n, state, peek(from, to, false), slot);
            const look = lookSet.has(from) && from !== st.start;
            if (k) {
              turn([Y_TURNS[k] as string], si, look);
              if (look) lookSet.delete(from);
            }
          }
          play(from, to, si, false);
          if (part.units.length) {
            pending.push({
              kind: "placed",
              stickers: part.units.flatMap(unitStickers),
            });
            for (const u of part.units) known.add(keyOf(u));
          }
        }
        if (incidental.length)
          checkUnits(
            incidental.filter((u) => unitSolved(state, u)),
            checkSlot,
            si,
          );
      }
    }
    if (st === lastUp) turn(["z2"], si);
    // 마지막으로 돌려 쥔 단계 끝에서 해법의 쥔 방향으로 돌아온다(마지막 층 공식이 R·U 그대로 보이게)
    if (si === lastShaped && !same(g, I)) turn(tokensFor(transpose(g)), si);
  });
  return finish(n, out, solve.stages, pending, new Set(view.bring ?? []));
}

const isRotationName = (move: string) => /^[xyz]/.test(move);

/**
 * `bring` 단계에서 「반대 면(D)으로 칸 밑에 두기 → 공식」의 경계. 토막 맨 앞(단계 시작·살피는 자리·강조 뒤)이나
 * 큐브 돌리기 바로 뒤의 D는 칸 밑에 두는 수다(십자·코너 공식은 D로 시작하지 않는다). 그 다음 수가 D도 큐브
 * 돌리기도 아니면 그 앞이 공식의 시작이다
 */
function bringGaps(
  moves: readonly string[],
  stages: PresentOutput["stages"],
  names: readonly string[],
  bring: ReadonlySet<string>,
  cuts: ReadonlySet<number>,
): number[] {
  const out: number[] = [];
  stages.forEach((st, si) => {
    if (!bring.has(names[si] ?? "")) return;
    for (let i = st.start + 1; i < st.end; i++) {
      const prev = moves[i - 1] as string;
      const cur = moves[i] as string;
      if (!prev.startsWith("D") || cur.startsWith("D") || isRotationName(cur))
        continue;
      const lead =
        i - 1 === st.start ||
        cuts.has(i - 1) ||
        isRotationName(moves[i - 2] as string);
      if (lead && !cuts.has(i)) out.push(i);
    }
  });
  return out;
}

/**
 * 이어진 같은 층 수·돌리기를 합치고(멈춤 자리는 앞에), 단계 경계를 다시 센다. 찾는 돌리기와 강조 사건이 붙은
 * 수는 앞 수와 합치지 않는다(찾는 걸음이 하나씩 보이고, 사건 자리가 흐트러지지 않게)
 */
function finish(
  n: number,
  out: readonly Out[],
  stages: PresentInput["stages"],
  tail: readonly PieceMark[],
  bring: ReadonlySet<string>,
): PresentOutput {
  const merged: Out[] = [];
  let carry = false;
  let carryEvents: PieceMark[] = [];
  /** 합쳐져 사라진 수의 멈춤·사건을 다음 수로 넘긴다 */
  const drop = (item: Out) => {
    carry = carry || item.look;
    if (item.events) carryEvents.push(...item.events);
  };
  for (const item of out) {
    const last = merged.at(-1);
    const m = item.m;
    const barrier =
      item.look || item.search || !!item.events?.length || !!last?.search;
    if (last && last.stage === item.stage && !barrier) {
      if (
        last.m.axis === m.axis &&
        last.m.from === m.from &&
        last.m.to === m.to
      ) {
        const turns = (last.m.turns + m.turns) % 4;
        merged.pop();
        if (turns)
          merged.push({ ...last, m: { ...m, turns: turns as 1 | 2 | 3 } });
        else drop(last);
        continue;
      }
      if (isWhole(n, last.m) && isWhole(n, m)) {
        // 돌리기 둘을 하나로(z2 y2 → x2)
        const mat = mul(
          rotationMat(m.axis, m.turns),
          rotationMat(last.m.axis, last.m.turns),
        );
        const tokens = tokensFor(mat);
        if (tokens.length < 2) {
          merged.pop();
          for (const t of tokens) {
            const [r] = parseMoves(n, t) as [CubeMove];
            const next: Out = { m: r, look: last.look, stage: item.stage };
            if (last.events) next.events = last.events;
            merged.push(next);
          }
          if (!tokens.length) drop(last);
          continue;
        }
      }
    }
    const next: Out = { ...item, look: item.look || carry };
    const events = [...carryEvents, ...(item.events ?? [])];
    if (events.length) next.events = events;
    else delete next.events;
    merged.push(next);
    carry = false;
    carryEvents = [];
  }
  const moves: string[] = [];
  const looks: number[] = [];
  const searches: number[] = [];
  const marks: PresentOutput["marks"] = [];
  const result: PresentOutput["stages"] = [];
  stages.forEach((st, si) => {
    const startAt = moves.length;
    for (const item of merged) {
      if (item.stage !== si) continue;
      if (item.look && moves.length > startAt) looks.push(moves.length);
      for (const mark of item.events ?? [])
        marks.push({ at: moves.length, mark });
      if (item.search) searches.push(moves.length);
      moves.push(formatMove(n, item.m));
    }
    result.push({ name: st.name, start: startAt, end: moves.length });
  });
  for (const mark of [...carryEvents, ...tail])
    marks.push({ at: moves.length, mark });
  const cuts = new Set([...looks, ...marks.map((m) => m.at)]);
  const gaps = bringGaps(
    moves,
    result,
    stages.map((s) => s.name),
    bring,
    cuts,
  );
  return { moves, stages: result, looks, searches, marks, gaps };
}
