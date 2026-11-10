// 4×4 야우 옆 센터 넷의 경우별 정해진 길(docs/47 16-15 「남은 것」을 닫음). 축소법 센터는 big-path.ts.
// 쥐기: 흰 면을 아래로, 비워 둔 흰 십자 자리를 오른쪽으로. 그러면 흰·노랑 센터와 흰 십자 엣지 셋(앞·왼쪽·뒤)을
// 건드리지 않는 수는 오른쪽 면(R), 윗면(U), 안쪽 가로층 둘(2U·2D)뿐이다. 옆 센터 블럭을 옮기는 것은 R·2U·2D다.
//
// 길: 오른쪽 면을 작업대로 쓴다. 오른쪽 면에 한 색 센터 블럭 넷을 모으고(공식 한 번에 꼭 하나 는다),
// 다 모이면 2U 2D'로 안쪽 두 층을 함께 돌려 그 면을 통째로 앞면에 보낸다(짝지어 돌리면 모은 면이 흩어지지 않는다).
// 차례는 왼쪽 면 색 → 앞면 색 → 오른쪽 면 색. 둘째 보내기 뒤 첫 색은 왼쪽 면, 둘째 색은 앞면에 닿아 제자리이고,
// 셋째 색을 오른쪽 면에 모으면 남은 넷(뒷면 색)은 저절로 뒷면에 있다. 맞은 뒤 따로 맞출 수가 없다.
//
// 넣기 한 번: 넣을 블럭이 있는 줄을 그 줄의 안쪽 층(윗줄 2U, 아랫줄 2D)으로 오른쪽 면에 데려오고, R 또는 R'로 그 블럭을
// 오른쪽 면의 다른 줄로 옮긴 뒤 안쪽 층을 되돌린다. 옮기는 돌리기에서 다른 줄의 한 칸(데려온 칸의 대각선 칸)이 데려온 줄로
// 올라가 함께 나가므로, 데려오기 전에 R을 돌려 그 칸에 아직 맞지 않은 블럭을 둔다. 다른 면의 센터 블럭은
// 데려온 면의 그 줄 말고는 그대로다(안쪽 층을 되돌리므로).
import { cubeTopology, faceColors, solvedCube } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";

import { type Pick, playN } from "./big-path";

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
 * 그 면의 줄을 오른쪽 면에 데려오는 안쪽 층 수. 윗줄은 2U 층, 아랫줄은 2D 층.
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
      "넣을 센터 블럭이 윗줄에 있고, 2U 층으로 데려오면 오른쪽 면 위-앞 칸에 옴",
    hold: "R을 돌려 오른쪽 면 아래-뒤 칸에 아직 맞지 않은 센터 블럭을",
    alg: "데려오기 R' 되돌리기",
  },
  {
    id: "top-back",
    shape:
      "넣을 센터 블럭이 윗줄에 있고, 2U 층으로 데려오면 오른쪽 면 위-뒤 칸에 옴",
    hold: "R을 돌려 오른쪽 면 아래-앞 칸에 아직 맞지 않은 센터 블럭을",
    alg: "데려오기 R 되돌리기",
  },
  {
    id: "bottom-front",
    shape:
      "넣을 센터 블럭이 아랫줄에 있고, 2D 층으로 데려오면 오른쪽 면 아래-앞 칸에 옴",
    hold: "R을 돌려 오른쪽 면 위-뒤 칸에 아직 맞지 않은 센터 블럭을",
    alg: "데려오기 R 되돌리기",
  },
  {
    id: "bottom-back",
    shape:
      "넣을 센터 블럭이 아랫줄에 있고, 2D 층으로 데려오면 오른쪽 면 아래-뒤 칸에 옴",
    hold: "R을 돌려 오른쪽 면 위-앞 칸에 아직 맞지 않은 센터 블럭을",
    alg: "데려오기 R' 되돌리기",
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
  const { face, r, c } = spots[pick(spots.length)] as (typeof spots)[number];
  const top = r === 1;
  const bring = YAU_BRING[top ? "top" : "bottom"][face];
  // 안쪽 층은 칸의 왼쪽·오른쪽을 그대로 옮긴다: 데려오면 오른쪽 면의 같은 줄, 같은 칸(1 = 앞쪽)에 온다
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
): { state: PuzzleState; steps: YauSideStep[] } {
  const steps: YauSideStep[] = [];
  let s = start;
  for (;;) {
    const st = nextYauSideStep(s, pick);
    if (!st) return { state: s, steps };
    steps.push(st);
    if (steps.length > 16) throw new Error("옆 센터가 끝나지 않는다");
    s = playN(4, s, stepMovesYau(st));
  }
}

export const YAU_FACES = { U, R, F, D, L, B } as const;
