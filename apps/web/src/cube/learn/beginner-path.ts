// 3×3 처음 맞추기의 「경우별 정해진 길」(docs/47 16-10, 2026-11-10 사용자 「무한정 해야 하는데, 각 형태일 때 가장
// 효율적으로 잡는 방향을 제시」). 단계마다 지금 모양을 보고 경우 하나를 고르고, 그 경우의 쥐는 수와 공식·횟수를 낸다.
// 「될 때까지」가 없다: 경우마다 정해진 수를 치면 그 단계가 끝나거나 다른 경우 하나로 넘어간다.
// 단원 글(lessons-333.ts)·공식 연습(practice/beginner.ts)·시험(beginner-path.test.ts)이 이 자료를 함께 읽는다.
// 시험은 무작위로 섞은 큐브를 이 규칙만으로 처음부터 끝까지 맞춘다.
import { applyMoves, faceColors, parseMoves } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import type { GoalName } from "./types";

// ── 공식 ──────────────────────────────────────────────

/** 코너 돌리기(첫 층 코너·마지막 코너 방향) */
export const TWIST = "R' D' R D";
/** 코너 돌리기를 거꾸로(순서를 뒤집고 방향도 뒤집음) */
export const TWIST_BACK = "D' R' D R";
/** 둘째 층 앞에서 넣기 */
export const RIGHT = "U R U' R' U' F' U F";
/** 둘째 층 오른쪽에서 넣기(앞에서 넣기를 거울에 비춘 꼴) */
export const FROM_RIGHT = "U' F' U F U R U' R'";
/** 노란 십자 */
export const YELLOW_CROSS = "F R U R' U' F'";
/** 노란 십자를 거꾸로 */
export const YELLOW_CROSS_BACK = "F U R U' R' F'";
/** 옆면 맞추기: 뒤·오른쪽은 두고 앞·왼쪽 엣지를 바꾼다 */
export const EDGE_SWAP = "R U R' U R U2 R' U";
/** 코너 자리: 앞-오른쪽 위는 두고 남은 셋을 돌린다 */
export const CORNER_CYCLE = "U R U' L' U R' U' L";
/** 코너 자리를 거꾸로(남은 셋을 반대로 돌린다) */
export const CORNER_CYCLE_BACK = "L' U R U' L U R' U'";
/** 흰 십자: 아래층에서 흰색이 옆을 보는 엣지 올리기 */
export const CROSS_SIDE_UP = "F D' F' y F";

/** 같은 공식 k번 */
export const reps = (alg: string, k: number) =>
  Array.from({ length: k }, () => alg).join(" ");

// ── 단계와 경우 ───────────────────────────────────────

export type PathStageId =
  | "cross"
  | "corners"
  | "second"
  | "yellow-cross"
  | "edges"
  | "corner-place"
  | "corner-twist";

export interface PathCase {
  id: string;
  /** 모양(눈으로 보는 것) */
  shape: string;
  /** 쥐는 법(공식 앞에 할 일) */
  hold: string;
  /** 칠 공식(없으면 쥐기만) */
  alg: string;
  /** 횟수 */
  times: number;
  /** 같은 공식을 거꾸로 친다 */
  back?: boolean;
  /** 이 공식 뒤 넘어가는 경우(없으면 그 조각·단계가 끝남) */
  next?: string;
}

export interface PathStage {
  id: PathStageId;
  title: string;
  /** 흰 면 위(흰 십자·첫 층 코너) 또는 아래(나머지) */
  white: "up" | "down";
  /** 이 단계가 끝난 모양 */
  goal: GoalName;
  cases: PathCase[];
}

export const PATH_STAGES: PathStage[] = [
  {
    id: "cross",
    title: "흰 십자",
    white: "up",
    goal: "white-cross",
    cases: [
      {
        id: "down",
        shape: "아래층, 흰색이 아래",
        hold: "엣지의 짝 색과 같은 색 센터를 앞으로 쥐고(y), 아랫면을 돌려 엣지를 앞 아래로",
        alg: "F2",
        times: 1,
      },
      {
        id: "down-side",
        shape: "아래층, 흰색이 옆",
        hold: "같은 색 센터를 오른쪽으로 쥐고(y), 아랫면을 돌려 엣지를 오른쪽 아래로",
        alg: CROSS_SIDE_UP,
        times: 1,
      },
      {
        id: "middle",
        shape: "가운데 층, 짝 색이 같은 색 센터 옆",
        hold: "짝 색이 붙은 면을 앞으로 쥐고(y)",
        alg: "엣지가 오른쪽이면 F', 왼쪽이면 F",
        times: 1,
      },
      {
        id: "middle-other",
        shape: "가운데 층, 짝 색이 다른 색 센터 옆",
        hold: "짝 색이 붙은 면을 앞으로 쥐고(y)",
        alg: "엣지가 오른쪽이면 F D F', 왼쪽이면 F' D' F",
        times: 1,
        next: "down",
      },
      {
        id: "top-wrong",
        shape: "위층, 흰색이 위인데 옆 센터 색이 다름",
        hold: "그 엣지를 앞으로 쥐고(y)",
        alg: "F2",
        times: 1,
        next: "down",
      },
      {
        id: "top-side",
        shape: "위층, 흰색이 옆",
        hold: "그 엣지를 앞으로 쥐고(y)",
        alg: "F",
        times: 1,
        next: "middle",
      },
    ],
  },
  {
    id: "corners",
    title: "첫 층 코너",
    white: "up",
    goal: "first-layer",
    cases: [
      {
        id: "bottom-right",
        shape: "칸 밑, 흰색이 오른쪽",
        hold: "넣을 칸을 앞-오른쪽 위로 쥐고(y), 아랫면을 돌려 코너를 칸 밑으로",
        alg: TWIST,
        times: 1,
      },
      {
        id: "bottom-front",
        shape: "칸 밑, 흰색이 앞",
        hold: "넣을 칸을 앞-오른쪽 위로 쥐고(y), 아랫면을 돌려 코너를 칸 밑으로",
        alg: TWIST_BACK,
        times: 1,
        back: true,
      },
      {
        id: "bottom-down",
        shape: "칸 밑, 흰색이 아래",
        hold: "넣을 칸을 앞-오른쪽 위로 쥐고(y), 아랫면을 돌려 코너를 칸 밑으로",
        alg: TWIST,
        times: 3,
      },
      {
        id: "slot-right",
        shape: "제 칸에서 흰색이 오른쪽",
        hold: "그 칸을 앞-오른쪽 위로 쥐고(y)",
        alg: TWIST,
        times: 2,
      },
      {
        id: "slot-front",
        shape: "제 칸에서 흰색이 앞",
        hold: "그 칸을 앞-오른쪽 위로 쥐고(y)",
        alg: TWIST_BACK,
        times: 2,
        back: true,
      },
      {
        id: "stuck",
        shape: "다른 칸에 들어가 있음",
        hold: "코너가 든 칸을 앞-오른쪽 위로 쥐고(y)",
        alg: TWIST,
        times: 1,
        next: "bottom-right",
      },
    ],
  },
  {
    id: "second",
    title: "둘째 층 엣지",
    white: "down",
    goal: "second-layer",
    cases: [
      {
        id: "front",
        shape: "위 색이 오른쪽 센터 색",
        hold: "윗면을 돌려 엣지를 옆 색과 같은 색 센터 위로, 그 면을 앞으로 쥐고(y)",
        alg: RIGHT,
        times: 1,
      },
      {
        id: "left",
        shape: "위 색이 왼쪽 센터 색",
        hold: "윗면을 돌려 엣지를 옆 색과 같은 색 센터 위로, 그 면을 앞으로 쥔 뒤 y'로 한 번 더 돌려 쥐고(그 면이 오른쪽에 옴)",
        alg: FROM_RIGHT,
        times: 1,
      },
      {
        id: "stuck",
        shape: "위에 넣을 엣지가 없음(칸에 잘못 들어감)",
        hold: "잘못 든 칸을 앞-오른쪽으로 쥐고(y)",
        alg: RIGHT,
        times: 1,
        next: "front",
      },
    ],
  },
  {
    id: "yellow-cross",
    title: "노란 십자",
    white: "down",
    goal: "yellow-cross",
    cases: [
      {
        id: "line",
        shape: "일자",
        hold: "윗면을 돌려 일자를 가로로",
        alg: YELLOW_CROSS,
        times: 1,
      },
      {
        id: "ell",
        shape: "ㄱ자",
        hold: "윗면을 돌려 노란 두 칸을 뒤와 왼쪽으로",
        alg: YELLOW_CROSS_BACK,
        times: 1,
        back: true,
      },
      {
        id: "dot",
        shape: "점",
        hold: "그대로",
        alg: YELLOW_CROSS,
        times: 1,
        next: "ell",
      },
    ],
  },
  {
    id: "edges",
    title: "옆면 맞추기",
    white: "down",
    goal: "yellow-edges",
    cases: [
      {
        id: "next",
        shape: "맞은 엣지 둘이 이웃",
        hold: "윗면을 돌려 맞은 둘을 찾고, 그 둘을 뒤·오른쪽으로 쥐고(y)",
        alg: EDGE_SWAP,
        times: 1,
      },
      {
        id: "opposite",
        shape: "맞은 엣지 둘이 마주 봄",
        hold: "윗면을 돌려 맞은 둘을 찾고, 그 둘을 앞·뒤로 쥐고(y)",
        alg: EDGE_SWAP,
        times: 1,
        next: "next",
      },
      {
        id: "align",
        shape: "윗면만 돌리면 넷 다 맞음",
        hold: "윗면을 돌려 옆 색을 맞춤",
        alg: "",
        times: 0,
      },
    ],
  },
  {
    id: "corner-place",
    title: "코너 자리",
    white: "down",
    goal: "ll-corners-placed",
    cases: [
      {
        id: "diagonal",
        shape: "제자리 코너 하나, 앞-왼쪽 위 코너의 제자리가 뒤-오른쪽",
        hold: "제자리 코너를 앞-오른쪽 위로 쥐고(y)",
        alg: CORNER_CYCLE,
        times: 1,
      },
      {
        id: "behind",
        shape: "제자리 코너 하나, 앞-왼쪽 위 코너의 제자리가 뒤-왼쪽",
        hold: "제자리 코너를 앞-오른쪽 위로 쥐고(y)",
        alg: CORNER_CYCLE_BACK,
        times: 1,
        back: true,
      },
      {
        id: "none",
        shape: "제자리 코너 없음",
        hold: "그대로",
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
        hold: "윗면을 돌려 그 코너를 앞-오른쪽 위로",
        alg: TWIST,
        times: 2,
      },
      {
        id: "front",
        shape: "노란색이 앞",
        hold: "윗면을 돌려 그 코너를 앞-오른쪽 위로",
        alg: TWIST_BACK,
        times: 2,
        back: true,
      },
      {
        id: "align",
        shape: "노란색이 모두 위",
        hold: "윗면을 돌려 옆 색을 맞춤",
        alg: "",
        times: 0,
      },
    ],
  },
];

export function pathStage(id: PathStageId): PathStage {
  return PATH_STAGES.find((s) => s.id === id) as PathStage;
}

export function pathCase(stage: PathStageId, id: string): PathCase {
  const c = pathStage(stage).cases.find((x) => x.id === id);
  if (!c) throw new Error(`경우 없음: ${stage} ${id}`);
  return c;
}

// ── 모양 읽기 ─────────────────────────────────────────

type Face = "U" | "R" | "F" | "D" | "L" | "B";
const FACES: readonly Face[] = ["U", "R", "F", "D", "L", "B"];
/** 맞춘 큐브에서 그 면에 있던 색 번호(엔진 `faceColors` 값) */
const WHITE = 0;
const RED = 1;
const GREEN = 2;
const YELLOW = 3;
const ORANGE = 4;
const BLUE = 5;

// 스티커 번호(면 U R F D L B 차례, 면마다 9칸). cube-ai `cubie.ts`와 같은 자리
const EDGE_SLOTS: readonly (readonly [number, number])[] = [
  [5, 10],
  [7, 19],
  [3, 37],
  [1, 46],
  [32, 16],
  [28, 25],
  [30, 43],
  [34, 52],
  [23, 12],
  [21, 41],
  [50, 39],
  [48, 14],
];
const CORNER_SLOTS: readonly (readonly [number, number, number])[] = [
  [8, 9, 20],
  [6, 18, 38],
  [0, 36, 47],
  [2, 45, 11],
  [29, 26, 15],
  [27, 44, 24],
  [33, 53, 42],
  [35, 17, 51],
];

const faceOfSticker = (i: number) => FACES[Math.floor(i / 9)] as Face;

interface View {
  col: Uint8Array;
  /** 그 색 센터가 있는 면 */
  centerOf: (color: number) => Face;
  /** 그 면의 센터 색 */
  colorOf: (face: Face) => number;
}

function view(s: PuzzleState): View {
  const col = faceColors(3, s);
  return {
    col,
    centerOf: (c) => FACES.find((_, k) => col[k * 9 + 4] === c) as Face,
    colorOf: (f) => col[FACES.indexOf(f) * 9 + 4] as number,
  };
}

/** 조각(색 묶음)이 든 자리: 색마다 그 스티커가 보는 면 */
function find(
  v: View,
  colors: readonly number[],
): Map<number, Face> | undefined {
  const want = [...colors].sort().join();
  const slots: readonly (readonly number[])[] =
    colors.length === 2 ? EDGE_SLOTS : CORNER_SLOTS;
  for (const slot of slots) {
    const got = slot.map((i) => v.col[i] as number);
    if ([...got].sort().join() !== want) continue;
    const m = new Map<number, Face>();
    for (const [k, i] of slot.entries())
      m.set(got[k] as number, faceOfSticker(i));
    return m;
  }
  return undefined;
}

const facesOf = (m: Map<number, Face>) => new Set(m.values());
const sameSet = (a: Set<Face>, b: Face[]) =>
  a.size === b.length && b.every((f) => a.has(f));

/** 조각이 제자리·바른 방향(스티커마다 같은 색 센터 면을 봄) */
const pieceOk = (v: View, colors: readonly number[]) => {
  const m = find(v, colors);
  return !!m && [...m].every(([c, f]) => v.centerOf(c) === f);
};

export const play = (s: PuzzleState, alg: string) =>
  alg.trim() ? applyMoves(3, s, parseMoves(3, alg)) : s;

const Y4 = ["", "y", "y'", "y2"];
const D4 = ["", "D", "D'", "D2"];
const U4 = ["", "U", "U'", "U2"];
/** 윗면을 한 칸씩 돌려 가며 볼 때의 차례 */
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

const join = (...xs: string[]) => xs.filter(Boolean).join(" ");

// ── 단계마다 다음 한 걸음 ─────────────────────────────

export interface PathStep {
  stage: PathStageId;
  caseId: string;
  /** 쥐는 수(y·U·D, 없으면 "") */
  hold: string;
  /** 칠 수(공식 × 횟수, 없으면 "") */
  alg: string;
  /** 다루는 조각의 색(엔진 색 번호, 흰 십자·첫 층 코너·둘째 층만) */
  piece?: number[];
}

/** 여럿 가운데 어느 것부터 할지(단원은 「어느 것부터 해도 돼요」, 시험은 여러 차례로 확인) */
export type Pick = (count: number) => number;
const FIRST: Pick = () => 0;

const SIDE_COLORS = [GREEN, RED, BLUE, ORANGE];
const WHITE_CORNERS = [
  [WHITE, GREEN, RED],
  [WHITE, RED, BLUE],
  [WHITE, BLUE, ORANGE],
  [WHITE, ORANGE, GREEN],
];
const MIDDLE_EDGES = [
  [GREEN, RED],
  [RED, BLUE],
  [BLUE, ORANGE],
  [ORANGE, GREEN],
];

function step(
  stage: PathStageId,
  caseId: string,
  hold: string,
  alg?: string,
  piece?: number[],
): PathStep {
  const c = pathCase(stage, caseId);
  return {
    stage,
    caseId,
    hold,
    alg: alg ?? reps(c.alg, c.times),
    ...(piece ? { piece } : {}),
  };
}

function crossNext(s: PuzzleState, pick: Pick): PathStep | null {
  const v = view(s);
  const todo = SIDE_COLORS.filter((c) => !pieceOk(v, [WHITE, c]));
  if (todo.length === 0) return null;
  const c = todo[pick(todo.length)] as number;
  const e = find(v, [WHITE, c]) as Map<number, Face>;
  const wf = e.get(WHITE) as Face;
  const cf = e.get(c) as Face;
  const at = (t: PuzzleState, faces: Face[]) =>
    sameSet(facesOf(find(view(t), [WHITE, c]) as Map<number, Face>), faces);
  if (wf === "D" || cf === "D") {
    const side = cf === "D";
    const y = firstTurn(
      s,
      Y4,
      (t) => view(t).centerOf(c) === (side ? "R" : "F"),
    );
    const d = firstTurn(play(s, y), D4, (t) => at(t, ["D", side ? "R" : "F"]));
    return step("cross", side ? "down-side" : "down", join(y, d), undefined, [
      WHITE,
      c,
    ]);
  }
  if (wf !== "U" && cf !== "U") {
    const y = firstTurn(
      s,
      Y4,
      (t) => (find(view(t), [WHITE, c]) as Map<number, Face>).get(c) === "F",
    );
    const t = play(s, y);
    const right = at(t, ["F", "R"]);
    if (v.centerOf(c) === cf)
      return step("cross", "middle", y, right ? "F'" : "F", [WHITE, c]);
    return step("cross", "middle-other", y, right ? "F D F'" : "F' D' F", [
      WHITE,
      c,
    ]);
  }
  const y = firstTurn(s, Y4, (t) => at(t, ["U", "F"]));
  return step("cross", wf === "U" ? "top-wrong" : "top-side", y, undefined, [
    WHITE,
    c,
  ]);
}

function cornersNext(s: PuzzleState, pick: Pick): PathStep | null {
  const v = view(s);
  const todo = WHITE_CORNERS.filter((cc) => !pieceOk(v, cc));
  if (todo.length === 0) return null;
  // 아래층의 흰 코너부터(어느 것부터 해도 된다). 없으면 위층에서 제자리인데 돌아간 것이나 엉뚱한 자리에 든 것
  const low = todo.filter((cc) =>
    facesOf(find(v, cc) as Map<number, Face>).has("D"),
  );
  const pool = low.length > 0 ? low : todo;
  const cc = pool[pick(pool.length)] as number[];
  const where = facesOf(find(v, cc) as Map<number, Face>);
  const homeAtFR = (t: PuzzleState) => {
    const tv = view(t);
    return sameSet(
      new Set([tv.centerOf(cc[1] as number), tv.centerOf(cc[2] as number)]),
      ["F", "R"],
    );
  };
  const whiteFace = (t: PuzzleState) =>
    (find(view(t), cc) as Map<number, Face>).get(WHITE) as Face;
  if (where.has("D")) {
    const y = firstTurn(s, Y4, homeAtFR);
    const d = firstTurn(play(s, y), D4, (t) =>
      sameSet(facesOf(find(view(t), cc) as Map<number, Face>), ["D", "F", "R"]),
    );
    const w = whiteFace(play(s, join(y, d)));
    const id =
      w === "R" ? "bottom-right" : w === "F" ? "bottom-front" : "bottom-down";
    return step("corners", id, join(y, d), undefined, cc);
  }
  const home = sameSet(where, [
    "U",
    v.centerOf(cc[1] as number),
    v.centerOf(cc[2] as number),
  ]);
  if (home) {
    const y = firstTurn(s, Y4, homeAtFR);
    const w = whiteFace(play(s, y));
    return step(
      "corners",
      w === "R" ? "slot-right" : "slot-front",
      y,
      undefined,
      cc,
    );
  }
  const y = firstTurn(s, Y4, (t) =>
    sameSet(facesOf(find(view(t), cc) as Map<number, Face>), ["U", "F", "R"]),
  );
  return step("corners", "stuck", y, undefined, cc);
}

function secondNext(s: PuzzleState, pick: Pick): PathStep | null {
  const v = view(s);
  const todo = MIDDLE_EDGES.filter((p) => !pieceOk(v, p));
  if (todo.length === 0) return null;
  const top = todo.filter((p) =>
    facesOf(find(v, p) as Map<number, Face>).has("U"),
  );
  if (top.length > 0) {
    const p = top[pick(top.length)] as number[];
    const m = find(v, p) as Map<number, Face>;
    const side = p.find((c) => m.get(c) !== "U") as number;
    const up = p.find((c) => m.get(c) === "U") as number;
    const u = firstTurn(s, U4, (t) => {
      const tv = view(t);
      return (find(tv, p) as Map<number, Face>).get(side) === tv.centerOf(side);
    });
    // 그 면을 앞으로 쥐었을 때 위 색이 오른쪽 센터 색이면 앞에서, 왼쪽 센터 색이면 그 면을 오른쪽으로 쥐고 오른쪽에서
    const y = firstTurn(play(s, u), Y4, (t) => view(t).centerOf(side) === "F");
    const front = view(play(s, join(u, y))).centerOf(up) === "R";
    if (front) return step("second", "front", join(u, y), undefined, p);
    const yr = firstTurn(play(s, u), Y4, (t) => view(t).centerOf(side) === "R");
    return step("second", "left", join(u, yr), undefined, p);
  }
  const p = todo[pick(todo.length)] as number[];
  const y = firstTurn(s, Y4, (t) =>
    sameSet(facesOf(find(view(t), p) as Map<number, Face>), ["F", "R"]),
  );
  return step("second", "stuck", y, undefined, p);
}

/** 윗면 엣지 가운데 노란 칸이 위를 보는 쪽 */
function yellowUp(s: PuzzleState): Face[] {
  const col = faceColors(3, s);
  const out: Face[] = [];
  const at: [Face, number][] = [
    ["B", 1],
    ["L", 3],
    ["R", 5],
    ["F", 7],
  ];
  for (const [f, i] of at) if (col[i] === YELLOW) out.push(f);
  return out;
}

function yellowCrossNext(s: PuzzleState): PathStep | null {
  const up = yellowUp(s);
  if (up.length === 4) return null;
  if (up.length === 0) return step("yellow-cross", "dot", "");
  const has = (t: PuzzleState, a: Face, b: Face) => {
    const x = yellowUp(t);
    return x.length === 2 && x.includes(a) && x.includes(b);
  };
  const line =
    (up.includes("L") && up.includes("R")) ||
    (up.includes("F") && up.includes("B"));
  if (line)
    return step(
      "yellow-cross",
      "line",
      firstTurn(s, U4, (t) => has(t, "L", "R")),
    );
  return step(
    "yellow-cross",
    "ell",
    firstTurn(s, U4, (t) => has(t, "B", "L")),
  );
}

const SIDES: readonly Face[] = ["F", "R", "B", "L"];
const EDGE_SIDE: Record<string, number> = { F: 19, R: 10, B: 46, L: 37 };

/** 윗층 엣지의 옆 색이 그 면 센터와 같은 쪽 */
function edgesMatched(s: PuzzleState): Face[] {
  const v = view(s);
  return SIDES.filter((f) => v.col[EDGE_SIDE[f] as number] === v.colorOf(f));
}

const isPair = (m: Face[], a: Face, b: Face) =>
  m.length === 2 && m.includes(a) && m.includes(b);
const ADJ: [Face, Face][] = [
  ["F", "R"],
  ["R", "B"],
  ["B", "L"],
  ["L", "F"],
];

function edgesNext(s: PuzzleState): PathStep | null {
  if (edgesMatched(s).length === 4) return null;
  // 윗면을 한 칸씩 돌려 보며 처음으로 둘 이상 맞는 자리에서 멈춘다
  const u = U_AROUND.find((x) => edgesMatched(play(s, x)).length >= 2);
  if (u === undefined) throw new Error("맞은 엣지 둘이 있는 자리가 없다");
  const t = play(s, u);
  const m = edgesMatched(t);
  if (m.length === 4) return step("edges", "align", u, "");
  if (ADJ.some(([a, b]) => isPair(m, a, b))) {
    const y = firstTurn(t, Y4, (x) => isPair(edgesMatched(x), "B", "R"));
    return step("edges", "next", join(u, y));
  }
  const y = firstTurn(t, Y4, (x) => isPair(edgesMatched(x), "F", "B"));
  return step("edges", "opposite", join(u, y));
}

/** 윗층 코너 가운데 제자리(방향은 상관없이 세 색이 그 구석 세 센터 색과 같음)인 것의 자리 */
function placedCorners(s: PuzzleState): number[] {
  const v = view(s);
  return [0, 1, 2, 3].filter((k) => {
    const slot = CORNER_SLOTS[k] as readonly number[];
    const got = slot
      .map((i) => v.col[i] as number)
      .sort()
      .join();
    const want = slot
      .map((i) => v.colorOf(faceOfSticker(i)))
      .sort()
      .join();
    return got === want;
  });
}

/** 앞-왼쪽 위 코너의 제자리(윗면 구석) */
function homeOfFrontLeft(s: PuzzleState): Face[] {
  const v = view(s);
  const colors = (CORNER_SLOTS[1] as readonly number[]).map(
    (i) => v.col[i] as number,
  );
  return colors.map((c) => v.centerOf(c));
}

function cornerPlaceNext(s: PuzzleState): PathStep | null {
  const placed = placedCorners(s);
  if (placed.length === 4) return null;
  if (placed.length === 0) return step("corner-place", "none", "");
  if (placed.length !== 1)
    throw new Error(`제자리 코너가 ${placed.length}개다`);
  const y = firstTurn(s, Y4, (t) => placedCorners(t).includes(0));
  const home = new Set(homeOfFrontLeft(play(s, y)));
  const id = sameSet(home, ["U", "B", "R"]) ? "diagonal" : "behind";
  return step("corner-place", id, y);
}

/** 앞-오른쪽 위 코너의 노란색이 보는 면 */
const yellowAtFrontRight = (s: PuzzleState): Face => {
  const col = faceColors(3, s);
  const i = (CORNER_SLOTS[0] as readonly number[]).find(
    (x) => col[x] === YELLOW,
  ) as number;
  return faceOfSticker(i);
};

function cornerTwistNext(s: PuzzleState): PathStep | null {
  const twisted = (t: PuzzleState) => yellowAtFrontRight(t) !== "U";
  const any = U4.some((u) => twisted(play(s, u)));
  if (!any) {
    const u = firstTurn(s, U4, (t) => edgesMatched(t).length === 4);
    return u ? step("corner-twist", "align", u, "") : null;
  }
  const u = firstTurn(s, U_AROUND, twisted);
  const y = yellowAtFrontRight(play(s, u));
  return step("corner-twist", y === "R" ? "right" : "front", u);
}

/** 지금 모양에서 그 단계의 다음 한 걸음(끝났으면 null). 흰 면이 단계에 맞게 쥐어져 있어야 한다 */
export function nextStep(
  stage: PathStageId,
  s: PuzzleState,
  pick: Pick = FIRST,
): PathStep | null {
  switch (stage) {
    case "cross":
      return crossNext(s, pick);
    case "corners":
      return cornersNext(s, pick);
    case "second":
      return secondNext(s, pick);
    case "yellow-cross":
      return yellowCrossNext(s);
    case "edges":
      return edgesNext(s);
    case "corner-place":
      return cornerPlaceNext(s);
    case "corner-twist":
      return cornerTwistNext(s);
  }
}

export interface StageRun {
  state: PuzzleState;
  steps: PathStep[];
}

/** 그 단계를 규칙대로 끝까지(걸음 수 상한을 넘으면 던진다) */
export function runStage(
  stage: PathStageId,
  s: PuzzleState,
  pick: Pick = FIRST,
  limit = 12,
): StageRun {
  const steps: PathStep[] = [];
  let state = s;
  for (;;) {
    const st = nextStep(stage, state, pick);
    if (!st) return { state, steps };
    steps.push(st);
    if (steps.length > limit) throw new Error(`${stage} 단계가 끝나지 않는다`);
    state = play(state, join(st.hold, st.alg));
  }
}

/** 한 걸음을 수 하나의 문자열로 */
export const stepMoves = (st: PathStep) => join(st.hold, st.alg);

// ── 이름 ──────────────────────────────────────────────

const COLOR_NAME = ["흰", "빨강", "초록", "노랑", "주황", "파랑"];

/** 경우의 칠 것(「R' D' R D 두 번」, 「거꾸로 D' R' D R 한 번」) */
export function caseAction(c: PathCase): string {
  if (!c.alg) return c.hold;
  const times = ["", "한 번", "두 번", "세 번"][c.times] ?? `${c.times}번`;
  return `${c.back ? "거꾸로 " : ""}${c.alg} ${times}`;
}

/** 한 걸음의 짧은 이름(힌트 1): 「흰-빨강 엣지: 가운데 층, …」, 「코너 방향: 노란색이 앞」 */
export function stepLabel(st: PathStep): string {
  const stage = pathStage(st.stage);
  const c = pathCase(st.stage, st.caseId);
  if (st.piece) {
    const kind = st.piece.length === 3 ? "코너" : "엣지";
    const name = st.piece.map((x) => COLOR_NAME[x]).join("-");
    return `${name} ${kind}: ${c.shape}`;
  }
  return `${stage.title}: ${c.shape}`;
}
