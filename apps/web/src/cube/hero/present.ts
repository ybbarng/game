import {
  type Axis,
  applyMoves,
  type CubeMove,
  faceColors,
  formatMove,
  parseMoves,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

/**
 * 첫 화면 연출의 보여 주기 변환(docs/47 0절 2026-11-04). 해법이 낸 수는 그대로 두고(컴퓨터 대결·배우기가
 * 같은 해법을 쓴다), 화면에 보일 수열만 새로 만든다. 순수 함수다.
 *
 * - 해법 속 큐브 돌리기(x·y·z)는 화면에서 빼고, 그 뒤 수를 그만큼 켤레로 바꿔 둔다(같은 조각을 같은 쪽으로
 *   돌린다). 대신 연출이 정한 자리에서만 돌려 쥔다:
 *   1. 위 단계(`up`, 십자·배우는 방식 첫 층): 시작 전에 그 층의 면을 위(U)로 들고, 끝나면 z2로 아래(D)로.
 *   2. 넣는 단계(첫 층 꼭짓점·둘째 층·F2L 짝·2×2 첫 층): 그 차례가 채우는 칸이 앞-오른쪽(아래층이면 DFR·FR,
 *      위 단계면 UFR)에 오게 y로 돌려 쥔다. 이미 거기면 돌리지 않는다(앞 차례의 방향을 이어받는다).
 *   3. 마지막으로 돌려 쥔 단계 끝에서 해법의 쥔 방향으로 돌아온다. 그래서 끝 상태가 해법과 같다.
 * - 그 밖의 단계(마지막 층, 4×4·5×5 축소, 루·ZZ)는 해법의 돌리기를 그대로 둔다(공식이 R·U 그대로 보인다). `mirror` 단계는 y2로 돌려 보이고
 *   끝나면 되돌린다(왼쪽에 쌓는 블록이 카메라 쪽 오른쪽에 보이게).
 */

export interface HeroView {
  /** 첫 층 면을 위에 두고 보일 단계(차례대로 이어진다). 마지막 단계 끝에서 z2로 내린다 */
  up?: readonly string[];
  /** y2로 돌려 보일 단계 */
  mirror?: readonly string[];
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

function slotStickers(n: number, kind: SlotKind | "top-corner"): number[] {
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
  if (kind === "corner") return dfr;
  if (kind === "edge") return fr;
  return [...dfr, ...fr];
}

type Slot = SlotKind | "top-corner";

/** 칸이 맞았나(가운데 색 기준, 3×3 이상) */
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

function yView(n: number, state: PuzzleState, k: number): Uint8Array {
  const t = Y_TURNS[k] as string;
  return faceColors(n, t ? applyMoves(n, state, parseMoves(n, t)) : state);
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

  const push = (m: CubeMove, stage: number, look: boolean) => {
    out.push({ m, look: look || carryLook, stage });
    carryLook = false;
    state = applyMoves(n, state, [m]);
  };
  /** 연출이 정한 돌리기를 둔다 */
  const turn = (tokens: readonly string[], stage: number, look = false) => {
    tokens.forEach((t, i) => {
      const [m] = parseMoves(n, t) as [CubeMove];
      push(m, stage, look && i === 0);
      g = mul(tokenMat(t), g);
    });
  };
  /** 해법의 수 [from, to)를 둔다. `keep`이면 돌리기도 그대로 */
  const play = (from: number, to: number, stage: number, keep: boolean) => {
    for (let i = from; i < to; i++) {
      const look = lookSet.has(i);
      if (look) carryLook = true;
      for (const m of parsed[i] ?? []) {
        if (!keep && isWhole(n, m)) {
          // 화면은 돌리지 않고 방향만 기억한다(뒤 수가 켤레로 바뀐다)
          g = mul(g, transpose(rotationMat(m.axis, m.turns)));
          continue;
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

  const upStages = solve.stages.filter((s) => up.includes(s.name));
  const firstUp = upStages[0];
  const lastUp = upStages.at(-1);
  let downChecked = upStages.length > 0;
  /** 연출이 돌려 쥐는 단계(위 단계·넣는 단계). 그 밖은 해법의 돌리기를 그대로 둔다 */
  const shaped = (name: string) =>
    !KEEP.has(name) && (up.includes(name) || insertKind(name) !== null);
  const lastShaped = solve.stages.findLastIndex((s) => shaped(s.name));

  solve.stages.forEach((st, si) => {
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
      turn(liftToUp(face), si);
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
    if (!kind) play(st.start, st.end, si, false);
    else {
      const slot: Slot =
        kind === "corner" && up.includes(st.name) ? "top-corner" : kind;
      const cuts = [
        st.start,
        ...solve.looks.filter((l) => l > st.start && l < st.end),
        st.end,
      ];
      for (let c = 0; c + 1 < cuts.length; c++) {
        const from = cuts[c] as number;
        const to = cuts[c + 1] as number;
        const k = slotTurn(n, state, peek(from, to, false), slot);
        const look = lookSet.has(from) && from !== st.start;
        if (k) {
          turn([Y_TURNS[k] as string], si, look);
          if (look) lookSet.delete(from);
        }
        play(from, to, si, false);
      }
    }
    if (st === lastUp) turn(["z2"], si);
    // 마지막으로 돌려 쥔 단계 끝에서 해법의 쥔 방향으로 돌아온다(마지막 층 공식이 R·U 그대로 보이게)
    if (si === lastShaped && !same(g, I)) turn(tokensFor(transpose(g)), si);
  });
  return finish(n, out, solve.stages);
}

/** 이어진 같은 층 수·돌리기를 합치고(멈춤 자리는 앞에), 단계 경계를 다시 센다 */
function finish(
  n: number,
  out: readonly Out[],
  stages: PresentInput["stages"],
): PresentOutput {
  const merged: Out[] = [];
  let carry = false;
  for (const item of out) {
    const last = merged.at(-1);
    const m = item.m;
    if (last && last.stage === item.stage && !item.look) {
      if (
        last.m.axis === m.axis &&
        last.m.from === m.from &&
        last.m.to === m.to
      ) {
        const turns = (last.m.turns + m.turns) % 4;
        merged.pop();
        if (turns)
          merged.push({ ...last, m: { ...m, turns: turns as 1 | 2 | 3 } });
        else carry = carry || last.look;
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
            merged.push({ m: r, look: last.look, stage: item.stage });
          }
          if (!tokens.length) carry = carry || last.look;
          continue;
        }
      }
    }
    merged.push({ ...item, look: item.look || carry });
    carry = false;
  }
  const moves: string[] = [];
  const looks: number[] = [];
  const result: PresentOutput["stages"] = [];
  stages.forEach((st, si) => {
    const startAt = moves.length;
    for (const item of merged) {
      if (item.stage !== si) continue;
      if (item.look && moves.length > startAt) looks.push(moves.length);
      moves.push(formatMove(n, item.m));
    }
    result.push({ name: st.name, start: startAt, end: moves.length });
  });
  return { moves, stages: result, looks };
}
