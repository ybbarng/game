// 4×4 야우의 경우별 정해진 길(docs/47 16-16·16-17): 옆 센터 넷(아래), 흰 십자 셋, 마지막 십자 엣지(파일 뒤쪽).
// 엣지 여덟은 축소법 처음 엣지 규칙(big-path.ts nextFirstEdge)을 그대로 쓴다. 축소법 센터도 big-path.ts.
// 옆 센터에는 「둘 넣기」(한 면의 위 두 칸이나 아래 두 칸이 모두 넣을 블럭이면 데려오기 R2 되돌리기)가 있다(16-17).
// 쥐기: 흰 면을 아래로, 비워 둔 흰 십자 자리를 오른쪽으로. 그러면 흰·노랑 센터와 흰 십자 엣지 셋(앞·왼쪽·뒤)을
// 건드리지 않는 수는 오른쪽 면(R), 윗면(U), 안쪽 가로층 둘(2U·2D)뿐이다. 옆 센터 블럭을 옮기는 것은 R·2U·2D다.
//
// 길: 오른쪽 면에 모았다가 보낸다. 오른쪽 면에 한 색 센터 블럭 넷을 모으고(공식 한 번에 꼭 하나 는다),
// 다 모이면 2U 2D'로 안쪽 두 층을 함께 돌려 그 면을 통째로 앞면에 보낸다(짝지어 돌리면 모은 면이 흩어지지 않는다).
// 차례는 왼쪽 면 색 → 앞면 색 → 오른쪽 면 색. 둘째 보내기 뒤 첫 색은 왼쪽 면, 둘째 색은 앞면에 닿아 제자리이고,
// 셋째 색을 오른쪽 면에 모으면 남은 넷(뒷면 색)은 저절로 뒷면에 있다. 맞은 뒤 따로 맞출 수가 없다.
//
// 넣기 한 번: 넣을 블럭이 든 두 칸을 그 높이의 안쪽 층(위 두 칸 2U, 아래 두 칸 2D)으로 오른쪽 면에 데려오고, R 또는 R'로 그 블럭을
// 오른쪽 면의 다른 높이 칸으로 옮긴 뒤 안쪽 층을 되돌린다. 옮기는 돌리기에서 다른 높이의 한 칸(데려온 칸의 대각선 칸)이 데려온 두 칸으로
// 올라가 함께 나가므로, 데려오기 전에 R을 돌려 그 칸에 아직 맞지 않은 블럭을 둔다. 다른 면의 센터 블럭은
// 데려온 면의 그 두 칸 말고는 그대로다(안쪽 층을 되돌리므로).
import { cubeTopology, faceColors, solvedCube } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import {
  DROP_FROM_UP,
  EDGE_FLIP,
  type Pick,
  playN,
  STORE_UP,
} from "./big-path";

// ── 면과 칸 ───────────────────────────────────────────

const U = 0;
const R = 1;
const F = 2;
const D = 3;
const L = 4;
const B = 5;
const WHITE = 0;

export type SideFace = "F" | "B" | "L";
const FACE_OF: Record<SideFace, number> = { F, B, L };

/** 스티커 번호(면 × 16 + 줄 × 4 + 칸). 옆면은 바깥에서 볼 때 왼쪽 위가 0이고, 오른쪽 면은 왼쪽 칸이 앞쪽이다 */
const at = (f: number, r: number, c: number) => f * 16 + r * 4 + c;
const CELLS = [
  [1, 1],
  [1, 2],
  [2, 1],
  [2, 2],
] as const;

const join = (...xs: string[]) =>
  xs.filter(Boolean).join(" ").trim().replace(/\s+/g, " ");
const inv = (m: string) =>
  m.endsWith("2") ? m : m.endsWith("'") ? m.slice(0, -1) : `${m}'`;

// ── 공식 ──────────────────────────────────────────────

/** 안쪽 두 층을 함께 돌려 오른쪽 면의 센터 블럭 넷을 통째로 앞면에(앞면 것은 왼쪽 면에) 보낸다 */
export const YAU_PARK = "2U 2D'";

/**
 * 그 면의 두 칸을 오른쪽 면에 데려오는 안쪽 층 수. 위 두 칸은 2U 층, 아래 두 칸은 2D 층.
 * 2U는 윗면에서 볼 때 시계 방향(앞 → 왼쪽), 2D는 아랫면에서 볼 때 시계 방향(앞 → 오른쪽)이다
 */
export const YAU_BRING: Record<"top" | "bottom", Record<SideFace, string>> = {
  top: { B: "2U", L: "2U2", F: "2U'" },
  bottom: { F: "2D", L: "2D2", B: "2D'" },
};

export type YauSideCaseId =
  | "top-front"
  | "top-back"
  | "bottom-front"
  | "bottom-back"
  | "top-two"
  | "bottom-two"
  | "park";

export interface YauSideCase {
  id: YauSideCaseId;
  /** 모양(눈으로 보는 것) */
  shape: string;
  /** 쥐는 법(공식 앞에 할 일) */
  hold: string;
  /** 칠 공식(「데려오기」는 YAU_BRING의 수, 「되돌리기」는 그 거꾸로) */
  alg: string;
}

export const YAU_SIDE_CASES: YauSideCase[] = [
  {
    id: "top-front",
    shape:
      "넣을 센터 블럭이 위 두 칸에 있고, 2U 층으로 데려오면 오른쪽 면 위-앞 칸에 옴",
    hold: "R을 돌려 오른쪽 면 아래-뒤 칸에 아직 맞지 않은 센터 블럭을",
    alg: "데려오기 R' 되돌리기",
  },
  {
    id: "top-back",
    shape:
      "넣을 센터 블럭이 위 두 칸에 있고, 2U 층으로 데려오면 오른쪽 면 위-뒤 칸에 옴",
    hold: "R을 돌려 오른쪽 면 아래-앞 칸에 아직 맞지 않은 센터 블럭을",
    alg: "데려오기 R 되돌리기",
  },
  {
    id: "bottom-front",
    shape:
      "넣을 센터 블럭이 아래 두 칸에 있고, 2D 층으로 데려오면 오른쪽 면 아래-앞 칸에 옴",
    hold: "R을 돌려 오른쪽 면 위-뒤 칸에 아직 맞지 않은 센터 블럭을",
    alg: "데려오기 R 되돌리기",
  },
  {
    id: "bottom-back",
    shape:
      "넣을 센터 블럭이 아래 두 칸에 있고, 2D 층으로 데려오면 오른쪽 면 아래-뒤 칸에 옴",
    hold: "R을 돌려 오른쪽 면 위-앞 칸에 아직 맞지 않은 센터 블럭을",
    alg: "데려오기 R' 되돌리기",
  },
  {
    id: "top-two",
    shape:
      "가져올 곳의 한 면 위 두 칸이 모두 넣을 센터 블럭이고, 오른쪽 면에 모으는 블럭이 아닌 센터 블럭 둘이 이웃함",
    hold: "R을 돌려 그 둘을 오른쪽 면 아래 두 칸에",
    alg: "데려오기 R2 되돌리기",
  },
  {
    id: "bottom-two",
    shape:
      "가져올 곳의 한 면 아래 두 칸이 모두 넣을 센터 블럭이고, 오른쪽 면에 모으는 블럭이 아닌 센터 블럭 둘이 이웃함",
    hold: "R을 돌려 그 둘을 오른쪽 면 위 두 칸에",
    alg: "데려오기 R2 되돌리기",
  },
  {
    id: "park",
    shape: "오른쪽 면의 센터 블럭 넷이 모두 모으는 색",
    hold: "그대로",
    alg: YAU_PARK,
  },
];

export function yauSideCase(id: YauSideCaseId): YauSideCase {
  const c = YAU_SIDE_CASES.find((x) => x.id === id);
  if (!c) throw new Error(`경우 없음: ${id}`);
  return c;
}

// ── 쥔 방향과 목표 색 ─────────────────────────────────

const ROTATIONS = (() => {
  const out: string[] = [];
  for (const a of ["", "x", "x'", "x2", "z", "z'"])
    for (const b of ["", "y", "y'", "y2"]) out.push(join(a, b));
  return out;
})();

/** 맞춘 큐브에 이 큐브 돌리기를 한 것의 면 색 */
function frameColors(turns: string): number[] {
  const c = faceColors(4, playN(4, solvedCube(4), turns));
  return [0, 1, 2, 3, 4, 5].map((f) => c[f * 16] as number);
}

/** 흰 면 쪽 십자 줄(아랫면과 그 옆면의 날개 둘) */
const LINE_WINGS: Record<number, number[]> = (() => {
  const topo = cubeTopology(4);
  const out: Record<number, number[]> = {};
  for (const side of [R, F, L, B])
    out[side] = topo.pieces
      .map((p, i) => ({ p, i }))
      .filter(
        ({ p }) =>
          p.kind === "wing" &&
          [D, side].every((f) =>
            p.stickers.some((st) => topo.stickers[st]?.face === f),
          ),
      )
      .map(({ i }) => i);
  return out;
})();

function lineOk(col: Uint8Array, fc: number[], side: number): boolean {
  const topo = cubeTopology(4);
  return (LINE_WINGS[side] ?? []).every((p) =>
    (topo.pieces[p]?.stickers ?? []).every(
      (st) => col[st] === fc[topo.stickers[st]?.face as number],
    ),
  );
}

/**
 * 지금 쥔 방향에서 면마다 맞출 색. 흰 면이 아래이고 흰 십자 엣지가 앞·왼쪽·뒤 자리에 있어야 한다
 * (오른쪽 자리는 비워 둔 곳). 옆면 색은 그 십자 엣지 블럭의 옆 색이다
 */
export function yauSideTargets(s: PuzzleState): number[] {
  const col = faceColors(4, s);
  for (const rot of ROTATIONS) {
    const fc = frameColors(rot);
    if (fc[D] !== WHITE) continue;
    if ([F, L, B].every((side) => lineOk(col, fc, side))) return fc;
  }
  throw new Error("흰 면 아래·흰 십자 엣지 셋(앞·왼쪽·뒤)으로 쥐지 않았다");
}

/** 그 면의 센터 블럭 가운데 그 색인 수 */
export function sideCount(s: PuzzleState, face: number, color: number) {
  const col = faceColors(4, s);
  return CELLS.filter(([r, c]) => col[at(face, r, c)] === color).length;
}

// ── 한 걸음 ───────────────────────────────────────────

export interface YauSideStep {
  caseId: YauSideCaseId;
  /** 쥐는 수(R 돌리기) */
  hold: string;
  /** 칠 공식(데려오기 R·R' 되돌리기, 또는 YAU_PARK) */
  alg: string;
  /** 오른쪽 면에 모으는 색 */
  color: number;
  /** 넣을 블럭이 있던 면(보내기는 없음) */
  from?: SideFace;
}

export const stepMovesYau = (st: YauSideStep) => join(st.hold, st.alg);

const FIRST: Pick = () => 0;

/**
 * 옆 센터 다음 한 걸음(다 맞았으면 null). 지금 모양만 보고 정한다:
 * 왼쪽·앞면이 제자리 색으로 다 맞았으면 셋째(오른쪽 면 색을 뒷면에서),
 * 앞면이 왼쪽 면 색으로 다 맞았으면 둘째(앞면 색을 뒷면·왼쪽 면에서), 아니면 첫째(왼쪽 면 색을 뒷면·왼쪽 면·앞면에서).
 * 오른쪽 면에 그 색이 넷 모였으면 보내기
 */
export function nextYauSideStep(
  s: PuzzleState,
  pick: Pick = FIRST,
  options: { two?: boolean } = { two: true },
): YauSideStep | null {
  const fc = yauSideTargets(s);
  const full = (face: number, color: number) => sideCount(s, face, color) === 4;
  if ([R, F, L, B].every((f) => full(f, fc[f] as number))) return null;
  let color: number;
  let sources: SideFace[];
  if (full(L, fc[L] as number) && full(F, fc[F] as number)) {
    color = fc[R] as number;
    sources = ["B"];
  } else if (full(F, fc[L] as number)) {
    color = fc[F] as number;
    sources = ["B", "L"];
  } else {
    color = fc[L] as number;
    sources = ["B", "L", "F"];
  }
  if (full(R, color)) return { caseId: "park", hold: "", alg: YAU_PARK, color };
  const col = faceColors(4, s);
  const spots: { face: SideFace; r: number; c: number }[] = [];
  for (const face of sources)
    for (const [r, c] of CELLS)
      if (col[at(FACE_OF[face], r, c)] === color) spots.push({ face, r, c });
  if (spots.length === 0) throw new Error("넣을 센터 블럭이 없다");
  // 둘 넣기: 한 면의 같은 높이 두 칸이 모두 그 색이고, R로 오른쪽 면 맞은편 두 칸을 그 색이 아닌 블럭으로 채울 수 있으면
  if (options.two)
    for (const face of sources)
      for (const r of [1, 2]) {
        if (!spots.some((x) => x.face === face && x.r === r && x.c === 1))
          continue;
        if (!spots.some((x) => x.face === face && x.r === r && x.c === 2))
          continue;
        const hold2 = ["", "R", "R'", "R2"].find((h) => {
          const cc = faceColors(4, playN(4, s, h));
          return [1, 2].every((cl) => cc[at(R, 3 - r, cl)] !== color);
        });
        if (hold2 === undefined) continue;
        const bring2 = YAU_BRING[r === 1 ? "top" : "bottom"][face];
        return {
          caseId: r === 1 ? "top-two" : "bottom-two",
          hold: hold2,
          alg: join(bring2, "R2", inv(bring2)),
          color,
          from: face,
        };
      }
  const { face, r, c } = spots[pick(spots.length)] as (typeof spots)[number];
  const top = r === 1;
  const bring = YAU_BRING[top ? "top" : "bottom"][face];
  // 안쪽 층은 칸의 왼쪽·오른쪽을 그대로 옮긴다: 데려오면 오른쪽 면의 같은 높이, 같은 쪽 칸(1 = 앞쪽)에 온다
  const turn = top === (c === 1) ? "R'" : "R";
  const hold = ["", "R", "R'", "R2"].find(
    (h) => faceColors(4, playN(4, s, h))[at(R, 3 - r, 3 - c)] !== color,
  );
  if (hold === undefined) throw new Error("비울 칸이 없다");
  return {
    caseId: `${top ? "top" : "bottom"}-${c === 1 ? "front" : "back"}`,
    hold,
    alg: join(bring, turn, inv(bring)),
    color,
    from: face,
  };
}

/** 옆 센터를 규칙대로 끝까지 */
export function runYauSideCenters(
  start: PuzzleState,
  pick: Pick = FIRST,
  options: { two?: boolean } = { two: true },
): { state: PuzzleState; steps: YauSideStep[] } {
  const steps: YauSideStep[] = [];
  let s = start;
  for (;;) {
    const st = nextYauSideStep(s, pick, options);
    if (!st) return { state: s, steps };
    steps.push(st);
    if (steps.length > 16) throw new Error("옆 센터가 끝나지 않는다");
    s = playN(4, s, stepMovesYau(st));
  }
}

export const YAU_FACES = { U, R, F, D, L, B } as const;

// ── 흰 십자 엣지 셋(2026-11-10, docs/47 16-17) ─────────
// 흰·노랑 센터만 맞은 4×4에서 흰 십자 엣지 셋(흰-초록·흰-빨강·흰-파랑)을 하나씩 넣는다. 옆 센터가 아직 섞였으니
// 흰 엣지의 제자리는 흰-초록 엣지를 기준으로 정한다: 흰 면 아래, 흰-초록을 앞에 두면 흰-빨강 왼쪽, 흰-파랑 뒤, 흰-주황 오른쪽(비움).
// 쥐기: 흰 면을 아래로, 넣을 자리를 앞으로(y). 흰-초록은 아직 없으면 지금 앞 자리에 넣는다.
// 쓰는 수: U·2U·2D(흰·노랑 센터와 아래 층 엣지에 닿지 않음), 앞면 F(넣을 자리라 비어 있음), 아직 빈 아래 자리의 면 반 바퀴.
// 경우(앞에서부터 처음 맞는 것):
// ① 날개가 아래-앞(넣을 자리)에 있음 → (다른 날개가 가운데 층 앞쪽이면 그 층 반 바퀴로 뒤쪽에 비킴) F → 가운데 층
// ② 날개가 아래 층의 다른 빈 자리에 있음 → 그 자리 면 반 바퀴 → 위 층
// ③ 짝지은 엣지 블럭이 위 층에서 흰색이 위 → U로 위-앞에, F2(끝)
// ④ 날개가 위 층에 있음 → (비키기) U로 위-앞에, F → 가운데 층
// ⑤ 두 날개가 가운데 층의 같은 층(둘 다 2U 층 또는 둘 다 2D 층) → 그 층을 돌려 한 날개를 앞-오른쪽에(다른 날개는 앞-왼쪽이 아니게), F2 → 다른 층
// ⑥ 두 날개가 가운데 층의 다른 층 → 2U·2D로 날개마다 흰색이 옆을 보게(앞-오른쪽이면 오른쪽 면, 앞-왼쪽이면 왼쪽 면) 두면 짝이 되고,
//    앞-오른쪽이면 F, 앞-왼쪽이면 F'(끝, 흰색이 아래를 봄)

const CROSS_COLORS = [2, 1, 5] as const; // 초록 → 빨강 → 파랑
/** 흰-초록을 앞에 둘 때 그 엣지 블럭의 자리(흰 면 아래) */
const CROSS_SLOT: Record<number, number> = { 2: F, 1: L, 5: B };

type LineInfo = { name: string; faces: [number, number]; wings: number[] };
const LINES4: LineInfo[] = (() => {
  const topo = cubeTopology(4);
  const pairs: [string, number, number][] = [
    ["UF", U, F],
    ["UR", U, R],
    ["UB", U, B],
    ["UL", U, L],
    ["DF", D, F],
    ["DR", D, R],
    ["DB", D, B],
    ["DL", D, L],
    ["FR", F, R],
    ["FL", F, L],
    ["BR", B, R],
    ["BL", B, L],
  ];
  return pairs.map(([name, a, b]) => ({
    name,
    faces: [a, b],
    wings: topo.pieces
      .map((p, i) => ({ p, i }))
      .filter(
        ({ p }) =>
          p.kind === "wing" &&
          [a, b].every((f) =>
            p.stickers.some((st) => topo.stickers[st]?.face === f),
          ),
      )
      // 가운데 층 줄은 위 날개(2U 층) 먼저
      .sort((x, y) => y.p.position[1] - x.p.position[1])
      .map(({ i }) => i),
  }));
})();

export interface WingAt {
  line: string;
  /** 가운데 층 줄에서 0 = 위(2U 층), 1 = 아래(2D 층) */
  level: number;
  /** 흰 스티커가 있는 면 */
  whiteFace: number;
}

/** 흰-그 색 날개 둘이 있는 곳 */
export function whiteWings(s: PuzzleState, color: number): WingAt[] {
  const topo = cubeTopology(4);
  const col = faceColors(4, s);
  const out: WingAt[] = [];
  for (const line of LINES4)
    line.wings.forEach((w, level) => {
      const sts = topo.pieces[w]?.stickers ?? [];
      const cs = sts.map((st) => col[st]);
      if (cs.includes(WHITE) && cs.includes(color)) {
        const ws = sts.find((st) => col[st] === WHITE) as number;
        out.push({
          line: line.name,
          level,
          whiteFace: topo.stickers[ws]?.face as number,
        });
      }
    });
  return out;
}

/** 그 색 흰 엣지 블럭이 아래 층 그 자리에 흰색 아래로 들었나 */
function crossPlaced(s: PuzzleState, color: number, slot: number): boolean {
  const name = `D${"URFDLB"[slot]}`;
  const ws = whiteWings(s, color);
  return (
    ws.length === 2 && ws.every((w) => w.line === name && w.whiteFace === D)
  );
}

const WHITE_DOWN = (() => {
  const out: string[] = [];
  for (const a of ["", "z2", "x", "x'", "z", "z'"])
    for (const b of ["", "y", "y'", "y2"]) out.push(join(a, b));
  return out;
})();
const whiteCenterDown = (s: PuzzleState) =>
  faceColors(4, s)[at(D, 1, 1)] === WHITE;

export type YauCrossCaseId =
  | "down-front"
  | "down-side"
  | "up-white-up"
  | "up"
  | "same-layer"
  | "pair";

export interface YauCrossCase {
  id: YauCrossCaseId;
  shape: string;
  hold: string;
  alg: string;
  next?: string;
}

export const YAU_CROSS_CASES: YauCrossCase[] = [
  {
    id: "down-front",
    shape: "넣을 엣지 블럭의 날개가 아래-앞(넣을 자리)에 있음",
    hold: "다른 날개가 가운데 층 앞쪽(앞-오른쪽·앞-왼쪽)이면 그 날개의 층을 반 바퀴(2U2·2D2) 돌려 뒤쪽에",
    alg: "F",
    next: "가운데 층",
  },
  {
    id: "down-side",
    shape: "날개가 아래 층의 다른 빈 자리(오른쪽·왼쪽·뒤)에 있음",
    hold: "그대로",
    alg: "그 자리 면 반 바퀴(R2·L2·B2)",
    next: "위 층",
  },
  {
    id: "up-white-up",
    shape: "날개 둘이 위 층 한 엣지 자리에 짝지어 있고 흰색이 위",
    hold: "U로 그 줄을 위-앞에",
    alg: "F2",
  },
  {
    id: "up",
    shape: "날개가 위 층에 있음",
    hold: "다른 날개가 가운데 층 앞쪽이면 그 층을 반 바퀴 돌려 뒤쪽에, U로 날개를 위-앞에",
    alg: "F",
    next: "가운데 층",
  },
  {
    id: "same-layer",
    shape: "두 날개가 가운데 층에서 같은 층(둘 다 2U 층, 또는 둘 다 2D 층)",
    hold: "그 층을 돌려 한 날개를 앞-오른쪽에(그러면 다른 날개가 앞-왼쪽에 오면, 다른 날개를 앞-오른쪽에)",
    alg: "F2",
    next: "다른 층",
  },
  {
    id: "pair",
    shape: "두 날개가 가운데 층에서 다른 층",
    hold: "2U로 위 날개를, 2D로 아래 날개를 흰색이 옆을 보는 앞쪽 자리에(앞-오른쪽이면 흰색이 오른쪽, 앞-왼쪽이면 왼쪽)",
    alg: "앞-오른쪽이면 F, 앞-왼쪽이면 F'",
  },
];

export interface YauCrossStep {
  caseId: YauCrossCaseId;
  hold: string;
  alg: string;
  /** 넣는 엣지 블럭의 흰색 아닌 색 */
  color: number;
}

export const stepMovesYauCross = (st: YauCrossStep) => join(st.hold, st.alg);

const turns4 = (m: string) => ["", m, `${m}'`, `${m}2`];
const layerOf = (level: number) => (level === 0 ? "2U" : "2D");
const isMid = (w: WingAt) => !w.line.startsWith("U") && !w.line.startsWith("D");

/** 흰 십자 셋의 다음 넣을 엣지 블럭과 쥐기(셋 다 들었으면 null) */
export function yauCrossTarget(
  s: PuzzleState,
): { color: number; rot: string } | null {
  const downs = WHITE_DOWN.filter((r) => whiteCenterDown(playN(4, s, r)));
  // 흰-초록이 들어 있으면 그 자리를 앞으로 둔 틀에서 빨강·파랑을 본다
  const base = downs.find((r) => crossPlaced(playN(4, s, r), 2, F));
  if (base === undefined) return { color: 2, rot: downs[0] as string };
  const t = playN(4, s, base);
  for (const color of CROSS_COLORS) {
    const slot = CROSS_SLOT[color] as number;
    if (crossPlaced(t, color, slot)) continue;
    // 넣을 자리를 앞으로: 흰-초록이 빨강이면 오른쪽, 파랑이면 뒤에 오게 쥔다
    const greenAt = slot === L ? R : B;
    const rot = downs.find((r) => crossPlaced(playN(4, s, r), 2, greenAt));
    return { color, rot: rot as string };
  }
  return null;
}

/** 흰 십자 셋 다음 한 걸음(셋 다 들었으면 null) */
export function nextYauCrossStep(
  s: PuzzleState,
  pick: Pick = FIRST,
): YauCrossStep | null {
  const target = yauCrossTarget(s);
  if (!target) return null;
  const { color, rot } = target;
  const t = playN(4, s, rot);
  const wings = whiteWings(t, color);
  const clear = (other: WingAt | undefined) =>
    other && isMid(other) && other.line.startsWith("F")
      ? `${layerOf(other.level)}2`
      : "";
  const front = wings.find((w) => w.line === "DF");
  if (front) {
    const other = wings.find((w) => w !== front);
    return {
      caseId: "down-front",
      hold: join(rot, clear(other)),
      alg: "F",
      color,
    };
  }
  // 위 층을 아래 층의 다른 빈 자리보다 먼저 본다(반 바퀴가 위 층의 날개를 아래로 내리지 않게)
  const ups = wings.filter((w) => w.line.startsWith("U"));
  if (ups.length > 0) {
    const [a, b] = ups;
    if (b && a?.line === b.line && a.whiteFace === U) {
      const u = turns4("U").find((m) =>
        whiteWings(playN(4, t, m), color).every((w) => w.line === "UF"),
      ) as string;
      return { caseId: "up-white-up", hold: join(rot, u), alg: "F2", color };
    }
    const w = ups[pick(ups.length)] as WingAt;
    const other = wings.find((x) => x !== w);
    const pre = clear(other);
    const t2 = playN(4, t, pre);
    const u = turns4("U").find((m) =>
      whiteWings(playN(4, t2, m), color).some((x) => x.line === "UF"),
    ) as string;
    return { caseId: "up", hold: join(rot, pre, u), alg: "F", color };
  }
  const downs = wings.filter((w) => w.line.startsWith("D"));
  const down = downs[pick(downs.length)];
  if (down)
    return {
      caseId: "down-side",
      hold: rot,
      alg: `${down.line[1]}2`,
      color,
    };
  const [a, b] = wings as [WingAt, WingAt];
  if (a.level === b.level) {
    const layer = layerOf(a.level);
    const m = turns4(layer).find((x) => {
      const ws = whiteWings(playN(4, t, x), color);
      return (
        ws.some((w) => w.line === "FR") && ws.every((w) => w.line !== "FL")
      );
    }) as string;
    return { caseId: "same-layer", hold: join(rot, m), alg: "F2", color };
  }
  // 날개마다 흰색이 옆을 보는 앞쪽 자리
  const sideOk = (w: WingAt) =>
    (w.line === "FR" && w.whiteFace === R) ||
    (w.line === "FL" && w.whiteFace === L);
  const turnFor = (level: number, base: PuzzleState) =>
    turns4(layerOf(level)).find((x) =>
      whiteWings(playN(4, base, x), color).some(
        (w) => w.level === level && isMid(w) && sideOk(w),
      ),
    ) as string;
  const mu = turnFor(0, t);
  const md = turnFor(1, playN(4, t, mu));
  const after = whiteWings(playN(4, t, join(mu, md)), color);
  const slot = after[0]?.line;
  if (!after.every((w) => w.line === slot && sideOk(w)))
    throw new Error("짝이 되지 않았다");
  return {
    caseId: "pair",
    hold: join(rot, mu, md),
    alg: slot === "FR" ? "F" : "F'",
    color,
  };
}

/** 흰 십자 셋을 규칙대로 끝까지 */
export function runYauCross(
  start: PuzzleState,
  pick: Pick = FIRST,
): {
  state: PuzzleState;
  steps: YauCrossStep[];
} {
  const steps: YauCrossStep[] = [];
  let s = start;
  for (;;) {
    const st = nextYauCrossStep(s, pick);
    if (!st) return { state: s, steps };
    steps.push(st);
    if (steps.length > 30) throw new Error("흰 십자 셋이 끝나지 않는다");
    s = playN(4, s, stepMovesYauCross(st));
  }
}

// ── 마지막 십자 엣지(2026-11-10, docs/47 16-17) ────────
// 센터가 다 맞고 흰 십자 엣지 셋이 든 4×4에서 흰-주황 엣지 블럭을 짝지어 넣는다. 이제 안쪽 층을 돌린 채 두면 센터가
// 깨지므로 축소법 엣지 짝처럼 안쪽 층은 돌렸다 꼭 되돌린다. 쓰는 공식은 모두 아래 층 엣지 블럭(흰 십자)을 제자리에 둔다.
// 경우(앞에서부터 처음 맞는 것):
// ① 날개 둘이 짝지어 엣지 하나가 됨 → 넣기(아래 넣기 경우)
// ② 날개가 아래-앞(비운 자리)에 있음 → 비운 자리를 앞으로(y), (위-앞에 다른 날개가 있으면 U) F2 → 위 층
// ③ 날개가 가운데 층에 없음(둘 다 위 층) → U로 하나를 위-뒤에, R U R' → 앞-오른쪽
// ④ 날개가 가운데 층에 있음 → 그 줄을 앞-오른쪽으로(y). 짝 날개가
//    위 층이면 U로 위-뒤에, L' U' L → 앞-왼쪽 / 다른 줄의 같은 층이면 축소법의 Dw 경우(아래)·Uw 경우(위) /
//    다른 층이면 엣지 뒤집기(R U R' F R' F' R) → 같은 층
// 넣기(비운 자리를 앞으로, y): 위 층에서 흰색이 위 → U로 위-앞에 F2 / 위 층에서 흰색이 옆 → U로 위-앞에 R U' R' F /
// 앞-오른쪽에서 흰색이 오른쪽 → F, 앞-왼쪽에서 흰색이 왼쪽 → F' / 그 밖의 가운데 층 → 위 층으로 올리기
// (앞-오른쪽 R U R', 앞-왼쪽 L' U' L, 뒤-오른쪽 R' U R, 뒤-왼쪽 L U' L') / 아래-앞에서 뒤집힘 → F2

const ORANGE = 4;
const DW: Record<string, string> = { FL: "Dw", BR: "Dw'", BL: "Dw2" };
const UW: Record<string, string> = { FL: "Uw'", BR: "Uw", BL: "Uw2" };
export const LIFT: Record<string, string> = {
  FR: "R U R'",
  FL: "L' U' L",
  BR: "R' U R",
  BL: "L U' L'",
};
export const INSERT_SIDE = "R U' R' F";

export type YauLastCaseId =
  | "ins-up-white-up"
  | "ins-up-side"
  | "ins-mid"
  | "ins-lift"
  | "ins-flipped"
  | "out-front"
  | "bring"
  | "drop-up"
  | "low"
  | "high"
  | "flip";

export interface YauLastStep {
  caseId: YauLastCaseId;
  hold: string;
  alg: string;
}
export const stepMovesYauLast = (st: YauLastStep) => join(st.hold, st.alg);

const centerAt = (s: PuzzleState, f: number) => faceColors(4, s)[at(f, 1, 1)];

/** 마지막 십자 엣지 다음 한 걸음(흰 십자가 다 들었으면 null) */
const Y_TO_FR: Record<string, string> = {
  FR: "",
  FL: "y'",
  BR: "y",
  BL: "y2",
};

export function nextYauLastCrossStep(
  s: PuzzleState,
  pick: Pick = FIRST,
): YauLastStep | null {
  const downs = WHITE_DOWN.filter((r) => whiteCenterDown(playN(4, s, r)));
  const front = downs.find((r) => centerAt(playN(4, s, r), F) === ORANGE);
  if (front === undefined) throw new Error("센터가 맞지 않았다");
  const t = playN(4, s, front);
  const wings = whiteWings(t, ORANGE);
  const [a, b] = wings as [WingAt, WingAt];
  if (a.line === b.line) {
    if (a.line === "DF" && a.whiteFace === D) return null;
    if (a.line === "DF")
      return { caseId: "ins-flipped", hold: front, alg: "F2" };
    if (a.line.startsWith("U")) {
      const u = turns4("U").find((m) =>
        whiteWings(playN(4, t, m), ORANGE).every((w) => w.line === "UF"),
      ) as string;
      return a.whiteFace === U
        ? { caseId: "ins-up-white-up", hold: join(front, u), alg: "F2" }
        : { caseId: "ins-up-side", hold: join(front, u), alg: INSERT_SIDE };
    }
    if (a.line === "FR" && a.whiteFace === R)
      return { caseId: "ins-mid", hold: front, alg: "F" };
    if (a.line === "FL" && a.whiteFace === L)
      return { caseId: "ins-mid", hold: front, alg: "F'" };
    return { caseId: "ins-lift", hold: front, alg: LIFT[a.line] as string };
  }
  const inFront = wings.find((w) => w.line === "DF");
  if (inFront) {
    const other = wings.find((w) => w !== inFront) as WingAt;
    const u = other.line === "UF" ? "U" : "";
    return { caseId: "out-front", hold: join(front, u), alg: "F2" };
  }
  const mids = wings.filter(isMid);
  const mid = mids[pick(mids.length)];
  if (!mid) {
    const u = turns4("U").find((m) =>
      whiteWings(playN(4, t, m), ORANGE).some((w) => w.line === "UB"),
    ) as string;
    return { caseId: "bring", hold: join(front, u), alg: STORE_UP };
  }
  // 고른 날개의 줄을 앞-오른쪽으로(y는 가운데 줄의 위 자리·아래 자리를 바꾸지 않는다)
  const key = (x: PuzzleState) => faceColors(4, x).join();
  const want = key(playN(4, t, Y_TO_FR[mid.line] as string));
  const rot = downs.find((r) => key(playN(4, s, r)) === want) as string;
  const t2 = playN(4, s, rot);
  const ws2 = whiteWings(t2, ORANGE);
  const here = ws2.find(
    (w) => w.line === "FR" && w.level === mid.level,
  ) as WingAt;
  const partner = ws2.find((w) => w !== here) as WingAt;
  if (partner.line.startsWith("U")) {
    const u = turns4("U").find((m) =>
      whiteWings(playN(4, t2, m), ORANGE).some((w) => w.line === "UB"),
    ) as string;
    return { caseId: "drop-up", hold: join(rot, u), alg: DROP_FROM_UP };
  }
  if (partner.level !== here.level)
    return { caseId: "flip", hold: rot, alg: EDGE_FLIP };
  const wide = (here.level === 1 ? DW : UW)[partner.line] as string;
  return {
    caseId: here.level === 1 ? "low" : "high",
    hold: rot,
    alg: join(wide, EDGE_FLIP, inv(wide)),
  };
}

export function runYauLastCross(
  start: PuzzleState,
  pick: Pick = FIRST,
): {
  state: PuzzleState;
  steps: YauLastStep[];
} {
  const steps: YauLastStep[] = [];
  let s = start;
  for (;;) {
    const st = nextYauLastCrossStep(s, pick);
    if (!st) return { state: s, steps };
    steps.push(st);
    if (steps.length > 12) throw new Error("마지막 십자 엣지가 끝나지 않는다");
    s = playN(4, s, stepMovesYauLast(st));
  }
}
