// ZZ EO라인의 경우별 정해진 길(docs/47 16-15): 엣지 방향(나쁜 엣지 고치기) → 아래-앞·아래-뒤 엣지 블럭 놓기.
// 흰 면을 아래로 쥔(z2) 3×3에서 쓴다. 「될 때까지」가 없다: 나쁜 엣지는 F 한 번마다 둘 이상 줄거나(넷 이상일 때),
// 둘에서 넷으로 바뀐 뒤 다음 F에서 없어진다. 단원 글(lessons-zz.ts)이 이 경우를 쓰고 zz-path.test.ts가 무작위 상태로 본다.
import {
  applyMoves,
  cubeTopology,
  faceColors,
  parseMoves,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

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
