// 2×2 처음 맞추기와 「3×3을 아는 사람의 2×2」의 경우별 정해진 길(docs/47 16-11, 3×3은 beginner-path.ts 16-10).
// 단계마다 지금 모양을 보고 경우 하나를 고르고, 그 경우의 쥐는 수와 공식·횟수를 낸다. 「될 때까지」가 없다:
// 경우마다 정해진 수를 치면 그 단계가 끝나거나 다른 경우 하나로 넘어간다.
// 2×2는 센터가 없어서 제자리를 코너끼리 정한다. 첫 층은 흰색이 위를 보는 위 층 코너 하나를 「기준 코너」로 삼아
// 그 코너의 두 옆 색이 그 면의 색이라고 보고(맞은편 면은 맞은편 색), 뒤집은 뒤에는 아래 층 코너가 면 색을 정한다.
// 단원 글(lessons-222.ts, lessons-222-from333.ts)·단계 지도 시연(stage-map.ts)·시험(beginner-path-222.test.ts)이 이 자료를 읽는다.
import {
  applyMoves,
  faceColors,
  isSolved,
  parseMoves,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import {
  CORNER_CYCLE,
  CORNER_CYCLE_BACK,
  reps,
  TWIST,
  TWIST_BACK,
} from "./beginner-path";
import type { GoalName } from "./types";

// ── 공식 ──────────────────────────────────────────────

/** 윗면 공식(수네): 위 층 코너 셋의 방향을 돌린다 */
export const TOP_FACE = "R U R' U R U2 R'";
/** 윗면 공식을 거꾸로 */
export const TOP_FACE_BACK = "R U2 R' U' R U' R'";
/** 위 층 코너 바꾸기(A퍼뮤): 바른 짝을 뒤에 두면 앞 코너 둘의 자리를 바꾼다(윗면 돌리기 하나와 함께) */
export const TOP_SWAP = "R' F R' B2 R F' R' B2 R2";

export { CORNER_CYCLE, CORNER_CYCLE_BACK, reps, TWIST, TWIST_BACK };

// ── 단계와 경우 ───────────────────────────────────────

export type Path222StageId =
  | "first-layer"
  | "top-face"
  | "top-layer"
  | "corner-place"
  | "corner-twist";

export interface Path222Case {
  id: string;
  /** 모양(눈으로 보는 것) */
  shape: string;
  /** 쥐는 법(공식 앞에 할 일) */
  hold: string;
  /** 칠 공식(없으면 쥐기만) */
  alg: string;
  times: number;
  back?: boolean;
  /** 이 공식 뒤 넘어가는 경우(없으면 그 조각·단계가 끝남) */
  next?: string;
}

export interface Path222Stage {
  id: Path222StageId;
  title: string;
  white: "up" | "down";
  goal: GoalName;
  cases: Path222Case[];
}

const FIRST_LAYER_CASES: Path222Case[] = [
  {
    id: "start",
    shape: "흰색이 위를 보는 위 층 코너가 없음, 아래 층에 흰 코너가 있음",
    hold: "아랫면을 돌려 그 코너 블럭을 앞-오른쪽 아래로",
    alg: "흰색이 보는 쪽대로(아래 경우 셋과 같다)",
    times: 1,
  },
  {
    id: "start-top",
    shape: "흰 코너가 모두 위 층에 있고 흰색이 위를 보는 것이 없음",
    hold: "그 하나를 앞-오른쪽 위로 쥐고(y)",
    alg: "흰색이 오른쪽이면 R' D' R D 두 번, 앞이면 거꾸로 두 번",
    times: 1,
  },
  {
    id: "bottom-right",
    shape: "제자리 밑, 흰색이 오른쪽",
    hold: "제자리를 앞-오른쪽 위로 쥐고(y), 아랫면을 돌려 코너 블럭을 그 밑으로",
    alg: TWIST,
    times: 1,
  },
  {
    id: "bottom-front",
    shape: "제자리 밑, 흰색이 앞",
    hold: "제자리를 앞-오른쪽 위로 쥐고(y), 아랫면을 돌려 코너 블럭을 그 밑으로",
    alg: TWIST_BACK,
    times: 1,
    back: true,
  },
  {
    id: "bottom-down",
    shape: "제자리 밑, 흰색이 아래",
    hold: "제자리를 앞-오른쪽 위로 쥐고(y), 아랫면을 돌려 코너 블럭을 그 밑으로",
    alg: TWIST,
    times: 3,
  },
  {
    id: "slot-right",
    shape: "제자리에서 흰색이 오른쪽",
    hold: "그 자리를 앞-오른쪽 위로 쥐고(y)",
    alg: TWIST,
    times: 2,
  },
  {
    id: "slot-front",
    shape: "제자리에서 흰색이 앞",
    hold: "그 자리를 앞-오른쪽 위로 쥐고(y)",
    alg: TWIST_BACK,
    times: 2,
    back: true,
  },
  {
    id: "stuck",
    shape: "위 층의 엉뚱한 자리에 들어가 있음",
    hold: "그 자리를 앞-오른쪽 위로 쥐고(y)",
    alg: TWIST,
    times: 1,
    next: "bottom-right",
  },
];

export const PATH_222_STAGES: Path222Stage[] = [
  {
    id: "first-layer",
    title: "첫 층",
    white: "up",
    goal: "2x2-first-layer",
    cases: FIRST_LAYER_CASES,
  },
  {
    id: "top-face",
    title: "윗면",
    white: "down",
    goal: "2x2-top-face",
    cases: [
      {
        id: "one-front",
        shape:
          "노란색이 위를 보는 코너 블럭 하나, 그 코너 블럭을 앞-왼쪽 위에 두면 앞-오른쪽 위 코너 블럭의 노란색이 앞",
        hold: "윗면을 돌려 위를 보는 코너 블럭을 앞-왼쪽 위로",
        alg: TOP_FACE,
        times: 1,
      },
      {
        id: "one-right",
        shape:
          "노란색이 위를 보는 코너 블럭 하나, 그 코너 블럭을 앞-왼쪽 위에 두면 앞-오른쪽 위 코너 블럭의 노란색이 오른쪽",
        hold: "윗면을 돌려 위를 보는 코너 블럭을 뒤-오른쪽 위로",
        alg: TOP_FACE_BACK,
        times: 1,
        back: true,
      },
      {
        id: "none-sides",
        shape: "위를 보는 노란색 없음, 노란색이 두 옆면에 둘씩",
        hold: "윗면을 돌려 노란색 둘씩을 왼쪽과 오른쪽 면으로",
        alg: TOP_FACE,
        times: 2,
      },
      {
        id: "none",
        shape: "위를 보는 노란색 없음, 노란색 둘인 옆면이 하나",
        hold: "윗면을 돌려 노란색 둘인 면을 왼쪽으로",
        alg: TOP_FACE,
        times: 1,
        next: "one-front",
      },
      {
        id: "two",
        shape: "노란색이 위를 보는 코너 둘",
        hold: "윗면을 돌려 앞-왼쪽 위 코너 블럭의 노란색이 앞을 보게",
        alg: TOP_FACE,
        times: 1,
        next: "one-front",
      },
    ],
  },
  {
    id: "top-layer",
    title: "위 층 자리",
    white: "down",
    goal: "solved",
    cases: [
      {
        id: "one",
        shape: "바른 짝이 한 면",
        hold: "윗면을 돌려 바른 짝을 뒤로",
        alg: TOP_SWAP,
        times: 1,
        next: "align",
      },
      {
        id: "none",
        shape: "바른 짝이 없음",
        hold: "그대로",
        alg: TOP_SWAP,
        times: 1,
        next: "one",
      },
      {
        id: "align",
        shape: "네 면 모두 바른 짝",
        hold: "윗면을 돌려 위 층을 아래 층에 맞게",
        alg: "",
        times: 0,
      },
    ],
  },
  {
    id: "corner-place",
    title: "코너 자리",
    white: "down",
    goal: "2x2-corners-placed",
    cases: [
      {
        id: "diagonal",
        shape:
          "윗면을 돌려 제자리 코너가 꼭 하나, 앞-왼쪽 위 코너 블럭의 제자리가 뒤-오른쪽",
        hold: "윗면을 돌려 제자리가 하나인 곳에서, 그 코너 블럭을 앞-오른쪽 위로 쥐고(y)",
        alg: CORNER_CYCLE,
        times: 1,
      },
      {
        id: "behind",
        shape:
          "윗면을 돌려 제자리 코너가 꼭 하나, 앞-왼쪽 위 코너 블럭의 제자리가 뒤-왼쪽",
        hold: "윗면을 돌려 제자리가 하나인 곳에서, 그 코너 블럭을 앞-오른쪽 위로 쥐고(y)",
        alg: CORNER_CYCLE_BACK,
        times: 1,
        back: true,
      },
      {
        id: "none",
        shape: "윗면을 어떻게 돌려도 제자리 코너가 둘이거나 없음",
        hold: "윗면을 돌려 제자리가 없는 곳에서",
        alg: CORNER_CYCLE,
        times: 1,
        next: "diagonal",
      },
    ],
  },
  {
    id: "corner-twist",
    title: "코너 방향",
    white: "down",
    goal: "solved",
    cases: [
      {
        id: "right",
        shape: "노란색이 오른쪽",
        hold: "윗면을 돌려 그 코너 블럭을 앞-오른쪽 위로",
        alg: TWIST,
        times: 2,
      },
      {
        id: "front",
        shape: "노란색이 앞",
        hold: "윗면을 돌려 그 코너 블럭을 앞-오른쪽 위로",
        alg: TWIST_BACK,
        times: 2,
        back: true,
      },
      {
        id: "align",
        shape: "노란색이 모두 위",
        hold: "윗면을 돌려 위 층을 아래 층에 맞게",
        alg: "",
        times: 0,
      },
    ],
  },
];

export function path222Case(stage: Path222StageId, id: string): Path222Case {
  const c = PATH_222_STAGES.find((s) => s.id === stage)?.cases.find(
    (x) => x.id === id,
  );
  if (!c) throw new Error(`경우 없음: ${stage} ${id}`);
  return c;
}

// ── 모양 읽기 ─────────────────────────────────────────

type Face = "U" | "R" | "F" | "D" | "L" | "B";
const FACES: readonly Face[] = ["U", "R", "F", "D", "L", "B"];
const OPP: Record<Face, Face> = {
  U: "D",
  D: "U",
  R: "L",
  L: "R",
  F: "B",
  B: "F",
};
/** 맞은편 색(엔진 색 번호: 흰0 빨1 초2 노3 주4 파5) */
const oppColor = (c: number) => (c + 3) % 6;
const WHITE = 0;
const YELLOW = 3;

// 2×2 스티커 번호(면 U R F D L B 차례, 면마다 4칸). 엔진 cubeTopology(2) 조각 차례: UBL UBR UFL UFR DFR DBR DFL DBL
const CORNERS: readonly (readonly number[])[] = [
  [0, 16, 21],
  [1, 5, 20],
  [2, 8, 17],
  [3, 4, 9],
  [6, 11, 13],
  [7, 15, 22],
  [10, 12, 19],
  [14, 18, 23],
];
const UFR = 3;
const UFL = 2;
const UBR = 1;

const faceOf = (i: number) => FACES[Math.floor(i / 4)] as Face;

export const play = (s: PuzzleState, alg: string) =>
  alg.trim() ? applyMoves(2, s, parseMoves(2, alg)) : s;

const join = (...xs: string[]) => xs.filter(Boolean).join(" ");

const Y4 = ["", "y", "y'", "y2"];
const D4 = ["", "D", "D'", "D2"];
const U4 = ["", "U", "U'", "U2"];
const U_AROUND = ["", "U", "U2", "U'"];

function firstTurn(
  s: PuzzleState,
  turns: readonly string[],
  ok: (t: PuzzleState) => boolean,
): string {
  const t = turns.find((x) => ok(play(s, x)));
  if (t === undefined) throw new Error("쥘 방향을 찾지 못했다");
  return t;
}

/** 코너 자리마다: 색 → 그 색 스티커가 보는 면 */
function cornerAt(col: Uint8Array, slot: number): Map<number, Face> {
  const m = new Map<number, Face>();
  for (const i of CORNERS[slot] as readonly number[])
    m.set(col[i] as number, faceOf(i));
  return m;
}

/** 색 묶음(코너 하나)이 든 자리 */
function slotOf(col: Uint8Array, colors: readonly number[]): number {
  const want = [...colors].sort().join();
  return CORNERS.findIndex(
    (st) =>
      st
        .map((i) => col[i] as number)
        .sort()
        .join() === want,
  );
}

const facesAt = (slot: number) =>
  new Set((CORNERS[slot] as readonly number[]).map(faceOf));
const sameSet = (a: Set<Face>, b: Face[]) =>
  a.size === b.length && b.every((f) => a.has(f));

/** 코너 하나가 정하는 면 색(그 코너의 세 색이 닿은 세 면의 색, 맞은편 면은 맞은편 색) */
type Frame = Map<Face, number>;
function frameFrom(col: Uint8Array, slot: number): Frame {
  const f: Frame = new Map();
  for (const [c, face] of cornerAt(col, slot)) {
    f.set(face, c);
    f.set(OPP[face], oppColor(c));
  }
  return f;
}
const centerOf = (f: Frame, color: number) =>
  [...f].find(([, c]) => c === color)?.[0] as Face;

/** 조각이 제자리·바른 방향(스티커마다 그 색이 정한 면을 봄) */
function cornerOk(col: Uint8Array, f: Frame, colors: readonly number[]) {
  const slot = slotOf(col, colors);
  return [...cornerAt(col, slot)].every(([c, face]) => centerOf(f, c) === face);
}

const WHITE_CORNERS: number[][] = [
  [WHITE, 2, 1],
  [WHITE, 1, 5],
  [WHITE, 5, 4],
  [WHITE, 4, 2],
];

// ── 단계마다 다음 한 걸음 ─────────────────────────────

export interface Path222Step {
  stage: Path222StageId;
  caseId: string;
  hold: string;
  alg: string;
  /** 다루는 코너의 색(첫 층만) */
  piece?: number[];
}

export type Pick = (count: number) => number;
const FIRST: Pick = () => 0;

function step(
  stage: Path222StageId,
  caseId: string,
  hold: string,
  alg?: string,
  piece?: number[],
): Path222Step {
  const c = path222Case(stage, caseId);
  return {
    stage,
    caseId,
    hold,
    alg: alg ?? reps(c.alg, c.times),
    ...(piece ? { piece } : {}),
  };
}

/** 흰색이 위를 보는 위 층 코너(기준 후보)의 색 */
function whiteUpCorners(col: Uint8Array): number[][] {
  return [0, 1, 2, 3]
    .filter((k) => cornerAt(col, k).get(WHITE) === "U")
    .map((k) => [...cornerAt(col, k).keys()]);
}

/** 첫 층의 기준 코너: 흰색이 위를 보는 위 층 코너 가운데 그것을 기준으로 맞은 코너가 가장 많은 것(같으면 색 차례) */
function pickReference(col: Uint8Array): number[] | undefined {
  const cand = whiteUpCorners(col).sort((a, b) =>
    [...a]
      .sort()
      .join()
      .localeCompare([...b].sort().join()),
  );
  let best: number[] | undefined;
  let bestCount = -1;
  for (const ref of cand) {
    const f = frameFrom(col, slotOf(col, ref));
    const n = WHITE_CORNERS.filter((cc) => cornerOk(col, f, cc)).length;
    if (n > bestCount) {
      best = ref;
      bestCount = n;
    }
  }
  return best;
}

/** 아래 층 흰 코너를 앞-오른쪽 아래에 두었을 때 흰색이 보는 쪽으로 경우를 고른다 */
function bottomCase(col: Uint8Array, cc: number[]) {
  const w = cornerAt(col, slotOf(col, cc)).get(WHITE);
  return w === "R"
    ? "bottom-right"
    : w === "F"
      ? "bottom-front"
      : "bottom-down";
}

function firstLayerNext(s: PuzzleState, pick: Pick): Path222Step | null {
  const col = faceColors(2, s);
  const ref = pickReference(col);
  const lowOf = (c: Uint8Array) =>
    WHITE_CORNERS.filter((cc) => facesAt(slotOf(c, cc)).has("D"));
  if (!ref) {
    // 기준이 아직 없다: 아래 층 흰 코너 하나를 앞-오른쪽 아래로 옮겨 흰색이 위를 보게 올리면 그것이 기준
    const low = lowOf(col);
    if (low.length > 0) {
      const cc = low[pick(low.length)] as number[];
      const d = firstTurn(s, D4, (t) =>
        sameSet(facesAt(slotOf(faceColors(2, t), cc)), ["D", "F", "R"]),
      );
      const id = bottomCase(faceColors(2, play(s, d)), cc);
      const c = path222Case("first-layer", id);
      return step("first-layer", "start", d, reps(c.alg, c.times), cc);
    }
    const top = WHITE_CORNERS;
    const cc = top[pick(top.length)] as number[];
    const y = firstTurn(s, Y4, (t) =>
      sameSet(facesAt(slotOf(faceColors(2, t), cc)), ["U", "F", "R"]),
    );
    const w = cornerAt(faceColors(2, play(s, y)), UFR).get(WHITE);
    const alg = w === "R" ? reps(TWIST, 2) : reps(TWIST_BACK, 2);
    return step("first-layer", "start-top", y, alg, cc);
  }
  const frameIn = (t: PuzzleState) => {
    const c = faceColors(2, t);
    return frameFrom(c, slotOf(c, ref));
  };
  const f = frameIn(s);
  const todo = WHITE_CORNERS.filter((cc) => !cornerOk(col, f, cc));
  if (todo.length === 0) return null;
  const low = lowOf(col).filter((cc) => todo.includes(cc));
  const pool = low.length > 0 ? low : todo;
  const cc = pool[pick(pool.length)] as number[];
  const homeAtFR = (t: PuzzleState) => {
    const tf = frameIn(t);
    return sameSet(
      new Set([centerOf(tf, cc[1] as number), centerOf(tf, cc[2] as number)]),
      ["F", "R"],
    );
  };
  const where = facesAt(slotOf(col, cc));
  if (where.has("D")) {
    const y = firstTurn(s, Y4, homeAtFR);
    const d = firstTurn(play(s, y), D4, (t) =>
      sameSet(facesAt(slotOf(faceColors(2, t), cc)), ["D", "F", "R"]),
    );
    const id = bottomCase(faceColors(2, play(s, join(y, d))), cc);
    return step("first-layer", id, join(y, d), undefined, cc);
  }
  const home = sameSet(where, [
    "U",
    centerOf(f, cc[1] as number),
    centerOf(f, cc[2] as number),
  ]);
  if (home) {
    const y = firstTurn(s, Y4, homeAtFR);
    const w = cornerAt(faceColors(2, play(s, y)), UFR).get(WHITE);
    return step(
      "first-layer",
      w === "R" ? "slot-right" : "slot-front",
      y,
      undefined,
      cc,
    );
  }
  const y = firstTurn(s, Y4, (t) =>
    sameSet(facesAt(slotOf(faceColors(2, t), cc)), ["U", "F", "R"]),
  );
  return step("first-layer", "stuck", y, undefined, cc);
}

/** 위 층 코너마다 노란색이 보는 면 */
function yellowFaces(s: PuzzleState): Face[] {
  const col = faceColors(2, s);
  return [0, 1, 2, 3].map((k) => cornerAt(col, k).get(YELLOW) as Face);
}
const upCount = (s: PuzzleState) =>
  yellowFaces(s).filter((f) => f === "U").length;

function topFaceNext(s: PuzzleState): Path222Step | null {
  const n = upCount(s);
  if (n === 4) return null;
  // 자리 차례: 0 UBL, 1 UBR, 2 UFL, 3 UFR
  if (n === 1) {
    const u = firstTurn(s, U4, (t) => yellowFaces(t)[UFL] === "U");
    if (yellowFaces(play(s, u))[UFR] === "F")
      return step("top-face", "one-front", u);
    const u2 = firstTurn(s, U4, (t) => yellowFaces(t)[UBR] === "U");
    return step("top-face", "one-right", u2);
  }
  if (n === 0) {
    const sides = (t: PuzzleState) => {
      const y = yellowFaces(t);
      return y[0] === "L" && y[2] === "L" && y[1] === "R" && y[3] === "R";
    };
    if (U4.some((u) => sides(play(s, u))))
      return step("top-face", "none-sides", firstTurn(s, U4, sides));
    const left = (t: PuzzleState) => {
      const y = yellowFaces(t);
      return y[0] === "L" && y[2] === "L";
    };
    return step("top-face", "none", firstTurn(s, U4, left));
  }
  return step(
    "top-face",
    "two",
    firstTurn(s, U4, (t) => yellowFaces(t)[UFL] === "F"),
  );
}

/** 위 층에서 바른 짝(옆면 윗줄 두 칸이 같은 색)인 면 */
function pairedFaces(s: PuzzleState): Face[] {
  const col = faceColors(2, s);
  const top: Record<string, [number, number]> = {
    F: [8, 9],
    R: [4, 5],
    B: [20, 21],
    L: [16, 17],
  };
  return (Object.keys(top) as Face[]).filter(
    (f) => col[top[f]?.[0] as number] === col[top[f]?.[1] as number],
  );
}

function alignTop(s: PuzzleState): string | null {
  return U4.find((u) => isSolved(2, play(s, u))) ?? null;
}

function topLayerNext(s: PuzzleState): Path222Step | null {
  if (isSolved(2, s)) return null;
  const p = pairedFaces(s);
  if (p.length === 4) {
    const u = alignTop(s);
    if (u === null) throw new Error("윗면 돌리기로 맞지 않는다");
    return step("top-layer", "align", u, "");
  }
  if (p.length === 1)
    return step(
      "top-layer",
      "one",
      firstTurn(s, U4, (t) => pairedFaces(t).includes("B")),
    );
  if (p.length === 0) return step("top-layer", "none", "");
  throw new Error(`바른 짝이 ${p.length}면이다`);
}

/** 뒤집은 뒤 아래 층(앞-오른쪽 아래 코너)이 정하는 면 색 */
function bottomFrame(col: Uint8Array): Frame {
  return frameFrom(col, 4);
}

/** 위 층 코너 가운데 제자리(방향은 상관없이 세 색이 그 구석 세 면의 색과 같음)인 것의 자리 */
function placedCorners(s: PuzzleState): number[] {
  const col = faceColors(2, s);
  const f = bottomFrame(col);
  return [0, 1, 2, 3].filter((k) => {
    const got = [...cornerAt(col, k).keys()].sort().join();
    const want = [...facesAt(k)]
      .map((face) => f.get(face) as number)
      .sort()
      .join();
    return got === want;
  });
}

function cornerPlaceNext(s: PuzzleState): Path222Step | null {
  if (U4.some((u) => placedCorners(play(s, u)).length === 4)) return null;
  const one = U_AROUND.find((u) => placedCorners(play(s, u)).length === 1);
  if (one === undefined) {
    const zero = firstTurn(s, U_AROUND, (t) => placedCorners(t).length === 0);
    return step("corner-place", "none", zero);
  }
  const t = play(s, one);
  const y = firstTurn(t, Y4, (x) => placedCorners(x).includes(UFR));
  const held = play(t, y);
  const col = faceColors(2, held);
  const f = bottomFrame(col);
  const home = new Set(
    [...cornerAt(col, UFL).keys()].map((c) => centerOf(f, c)),
  );
  const id = sameSet(home, ["U", "B", "R"]) ? "diagonal" : "behind";
  return step("corner-place", id, join(one, y));
}

function cornerTwistNext(s: PuzzleState): Path222Step | null {
  const twisted = (t: PuzzleState) => yellowFaces(t)[UFR] !== "U";
  if (!U4.some((u) => twisted(play(s, u)))) {
    if (isSolved(2, s)) return null;
    const u = alignTop(s);
    if (u === null) throw new Error("윗면 돌리기로 맞지 않는다");
    return step("corner-twist", "align", u, "");
  }
  const u = firstTurn(s, U_AROUND, twisted);
  const y = yellowFaces(play(s, u))[UFR];
  return step("corner-twist", y === "R" ? "right" : "front", u);
}

/** 지금 모양에서 그 단계의 다음 한 걸음(끝났으면 null). 흰 면이 단계에 맞게 쥐어져 있어야 한다 */
export function nextStep222(
  stage: Path222StageId,
  s: PuzzleState,
  pick: Pick = FIRST,
): Path222Step | null {
  switch (stage) {
    case "first-layer":
      return firstLayerNext(s, pick);
    case "top-face":
      return topFaceNext(s);
    case "top-layer":
      return topLayerNext(s);
    case "corner-place":
      return cornerPlaceNext(s);
    case "corner-twist":
      return cornerTwistNext(s);
  }
}

export interface Stage222Run {
  state: PuzzleState;
  steps: Path222Step[];
}

/** 그 단계를 규칙대로 끝까지(걸음 수 상한을 넘으면 던진다) */
export function runStage222(
  stage: Path222StageId,
  s: PuzzleState,
  pick: Pick = FIRST,
  limit = 10,
): Stage222Run {
  const steps: Path222Step[] = [];
  let state = s;
  for (;;) {
    const st = nextStep222(stage, state, pick);
    if (!st) return { state, steps };
    steps.push(st);
    if (steps.length > limit) throw new Error(`${stage} 단계가 끝나지 않는다`);
    state = play(state, join(st.hold, st.alg));
  }
}

export const stepMoves222 = (st: Path222Step) => join(st.hold, st.alg);

/** 2×2 처음 맞추기(첫 층 → 윗면 → 위 층 자리)와 3×3을 아는 사람의 2×2(첫 층 → 코너 자리 → 코너 방향) */
export const BEGINNER_222_STAGES: Path222StageId[] = [
  "first-layer",
  "top-face",
  "top-layer",
];
export const FROM333_222_STAGES: Path222StageId[] = [
  "first-layer",
  "corner-place",
  "corner-twist",
];

/** 섞인 2×2를 단계마다 규칙대로 푼 수(첫 층 뒤 뒤집기 z2를 다음 단계 앞에 둔다) */
export function solve222(
  s: PuzzleState,
  stages: readonly Path222StageId[],
  pick: Pick = FIRST,
): { moves: string[]; state: PuzzleState; steps: Path222Step[][] } {
  const moves: string[] = [];
  const steps: Path222Step[][] = [];
  let state = s;
  for (const id of stages) {
    const stage = PATH_222_STAGES.find((x) => x.id === id) as Path222Stage;
    const flip = stage.white === "down" && id === stages[1] ? "z2" : "";
    state = play(state, flip);
    const r = runStage222(id, state, pick);
    state = r.state;
    steps.push(r.steps);
    moves.push([flip, ...r.steps.map(stepMoves222)].filter(Boolean).join(" "));
  }
  return { moves, state, steps };
}
