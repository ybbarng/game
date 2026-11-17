// 임시: 역끝내기·양선수 끝내기 판 찾기(커밋하지 않는다)
import { writeFileSync } from "node:fs";

import {
  areaOwners,
  type Board,
  type Cell,
  endgameSize,
  groupOf,
  neighbors,
  pointName,
  type Stone,
  solveEndgame,
  tryPlace,
} from "@game/baduk-engine";
import { it } from "vitest";

import { shapeKey } from "./puzzle-shape";

const N = 9;
const name = (p: number) => pointName(p, N);

let seed = Number(process.env.SEED ?? 12345);
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

function newAtari(board: Board, move: number, mover: Stone) {
  const placed = tryPlace(board, move, mover);
  const enemy: Stone = mover === 1 ? 2 : 1;
  let stones = 0;
  if (!placed.ok) return 0;
  const seen = new Set<number>();
  for (let p = 0; p < placed.board.length; p++) {
    if (placed.board[p] !== enemy || seen.has(p)) continue;
    const g = groupOf(placed.board, p);
    for (const s of g.stones) seen.add(s);
    if (g.liberties.length === 1 && groupOf(board, p).liberties.length > 1)
      stones += g.stones.length;
  }
  return stones;
}

function components(points: number[]): number[][] {
  const open = new Set(points);
  const out: number[][] = [];
  for (const s of points) {
    if (!open.has(s)) continue;
    const part: number[] = [];
    const stack = [s];
    open.delete(s);
    while (stack.length) {
      const p = stack.pop() as number;
      part.push(p);
      for (const q of neighbors(p, N))
        if (open.has(q)) {
          open.delete(q);
          stack.push(q);
        }
    }
    out.push(part.sort((a, b) => a - b));
  }
  return out.sort((a, b) => (a[0] as number) - (b[0] as number));
}

/** 경계 한 줄의 조각: 줄마다 [경계 칸, 흑 벽 구멍, 백 벽 구멍] */
type Row = [Cell, boolean, boolean];
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)] as T;
const GOTE: Row[][] = [[[0, false, false]]];
/** 백이 두면 흑이 받아야 하는 곳(흑에게는 역끝내기): 흑 한 점(흑 벽 구멍 옆)이 빈 점에 붙는다 */
const WHITE_SENTE: Row[][] = [
  [
    [2, false, false],
    [1, true, false],
    [0, false, false],
    [2, false, false],
  ],
  [
    [2, false, false],
    [1, true, false],
    [0, false, false],
  ],
];
/** 양선수: 빈 점 위는 약한 흑, 아래는 약한 백 */
const DOUBLE: Row[][] = [
  [
    [2, false, false],
    [1, true, false],
    [0, false, false],
    [2, false, true],
    [1, false, false],
  ],
  [
    [1, true, false],
    [0, false, false],
    [2, false, true],
  ],
  [
    [2, false, false],
    [1, true, false],
    [0, false, false],
    [2, false, true],
  ],
];

function makeBoard(mode: "reverse" | "double"): Cell[] | null {
  const units: Row[][] =
    mode === "reverse"
      ? [pick(WHITE_SENTE), pick(GOTE), pick(GOTE)]
      : [pick(DOUBLE), pick(GOTE), pick(GOTE)];
  // 섞고, 조각마다 위아래 뒤집기
  for (let i = units.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [units[i], units[j]] = [units[j] as Row[], units[i] as Row[]];
  }
  const rows: Row[] = [];
  const sep = (): Row => [rand() < 0.5 ? 1 : 2, false, false];
  if (rand() < 0.5) rows.push(sep());
  for (const u of units) {
    const unit = rand() < 0.5 ? [...u].reverse() : u;
    if (rows.length > 0 && rows[rows.length - 1]?.[0] === 0) rows.push(sep());
    else if (
      rows.length > 0 &&
      unit[0]?.[0] === 0 &&
      rows[rows.length - 1]?.[0] === 0
    )
      rows.push(sep());
    rows.push(...unit);
    if (rand() < 0.4) rows.push(sep());
  }
  while (rows.length < N) rows.push(sep());
  if (rows.length > N) return null;
  const b = pick([3, 4, 5]);
  const board: Cell[] = new Array(N * N).fill(0);
  rows.forEach(([e, holeB, holeW], y) => {
    board[y * N + b] = e;
    board[y * N + b - 1] = holeB || rand() < 0.04 ? 0 : 1;
    board[y * N + b + 1] = holeW || rand() < 0.04 ? 0 : 2;
    // 벽 안쪽 땅에 돌을 더해 벽을 두껍게(PERTURB일 때만)
    if (process.env.PERTURB && rand() < 0.2) board[y * N + b - 2] = 1;
    if (process.env.PERTURB && rand() < 0.2) board[y * N + b + 2] = 2;
  });
  return board;
}

type Found = {
  mode: "reverse" | "double";
  black: string[];
  white: string[];
  spots: string[][];
  solution: string;
  sizes: number[];
  key: string;
};

function examine(board: Cell[]): Found | null {
  for (let p = 0; p < board.length; p++)
    if (board[p] && groupOf(board, p).liberties.length < 2) return null;
  const owners = areaOwners(board);
  if (owners.filter((o) => o === 1).length < 10) return null;
  if (owners.filter((o) => o === 2).length < 10) return null;
  const neutral = board
    .map((c, i) => (c === 0 && owners[i] === 0 ? i : -1))
    .filter((i) => i >= 0);
  const spots = components(neutral);
  if (spots.length < 2 || spots.length > 3) return null;
  if (spots.some((s) => s.length > 3)) return null;
  const info = spots.map((spot) => {
    const bm = solveEndgame(board, spot, 1).best.find((m) => m !== null);
    const wm = solveEndgame(board, spot, 2).best.find((m) => m !== null);
    if (bm === undefined || bm === null || wm === undefined || wm === null)
      return null;
    return {
      spot,
      bm,
      blackSente: newAtari(board, bm, 1) > 0,
      whiteSente: newAtari(board, wm, 2) > 0,
      size: endgameSize(board, spot),
    };
  });
  if (info.some((x) => x === null || x.size <= 0)) return null;
  const all = info as NonNullable<(typeof info)[number]>[];
  const best = solveEndgame(board, spots.flat(), 1).best;
  if (best.length !== 1 || best[0] === null) return null;
  const sol = best[0] as number;
  const key = all.find((s) => s.bm === sol);
  if (!key) return null;
  const others = all.filter((s) => s !== key);
  if (others.some((s) => s.blackSente || s.whiteSente)) return null;
  const maxOther = Math.max(...others.map((s) => s.size));
  let mode: Found["mode"];
  if (key.whiteSente && !key.blackSente) {
    if (spots.length !== 3 || key.size > maxOther) return null;
    mode = "reverse";
  } else if (key.whiteSente && key.blackSente) {
    if (key.size > maxOther || spots.length !== 3) return null;
    mode = "double";
  } else return null;
  return {
    mode,
    black: board.flatMap((c, i) => (c === 1 ? [name(i)] : [])),
    white: board.flatMap((c, i) => (c === 2 ? [name(i)] : [])),
    spots: spots.map((s) => s.map(name)),
    solution: name(sol),
    sizes: all.map((s) => s.size),
    key: shapeKey(board, N, sol),
  };
}

it("debug", () => {
  const rows: Row[] = [
    [2, false, false],
    [0, false, false],
    [0, false, false],
    [1, false, false],
    [2, false, false],
    [1, true, false],
    [0, false, false],
    [2, false, false],
    [0, false, false],
  ];
  const b = 4;
  const board: Cell[] = new Array(N * N).fill(0);
  rows.forEach(([e, holeB, holeW], y) => {
    board[y * N + b] = e;
    board[y * N + b - 1] = holeB ? 0 : 1;
    board[y * N + b + 1] = holeW ? 0 : 2;
  });
  const owners = areaOwners(board);
  const neutral = board
    .map((c, i) => (c === 0 && owners[i] === 0 ? i : -1))
    .filter((i) => i >= 0);
  const spots = components(neutral);
  const lines: string[] = [];
  for (const spot of spots) {
    const bm = solveEndgame(board, spot, 1).best;
    const wm = solveEndgame(board, spot, 2).best;
    lines.push(
      `${spot.map(name)} size ${endgameSize(board, spot)} black ${bm.map((m) => (m === null ? "pass" : name(m)))} white ${wm.map((m) => (m === null ? "pass" : name(m)))}`,
    );
  }
  const all = solveEndgame(board, spots.flat(), 1);
  lines.push(
    `all ${all.score} ${all.best.map((m) => (m === null ? "pass" : name(m)))}`,
  );
  writeFileSync(process.env.DEBUG_OUT ?? "/dev/null", lines.join("\n"));
});

it("search", () => {
  const out: Found[] = [];
  const keys = {
    reverse: new Map<string, number>(),
    double: new Map<string, number>(),
  };
  const tries = Number(process.env.TRIES ?? 20000);
  for (let t = 0; t < tries; t++) {
    const board = makeBoard(
      process.env.MODE === "double"
        ? "double"
        : t % 2 === 0
          ? "reverse"
          : "double",
    );
    if (!board) continue;
    const found = examine(board);
    if (!found) continue;
    const m = keys[found.mode];
    const n = m.get(found.key) ?? 0;
    if (n >= 2) continue;
    m.set(found.key, n + 1);
    out.push(found);
  }
  writeFileSync(
    process.env.SEARCH_OUT ?? "/dev/null",
    JSON.stringify(out, null, 1),
  );
}, 600000);
