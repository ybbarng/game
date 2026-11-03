/*
 * 사(넷)로 몰아붙이기 읽기(수 배우기 문제의 확인용, docs/20 7절).
 * 공격하는 쪽이 둘 때마다 사를 만들면 막는 쪽은 그 자리를 막을 수밖에 없다(다른 데 두면 다음에 다섯).
 * 그래서 막는 쪽의 응수가 한두 개로 좁혀져 끝까지 정확히 읽을 수 있다.
 * 막는 쪽이 먼저 다섯을 만들 수 있으면 몰아붙이기가 끊긴 것으로 본다.
 */
import {
  forbiddenReason,
  indexOf,
  other,
  type Stone,
  winningLine,
  xyOf,
} from "./board";
import { CELLS, SIZE, type Variant } from "./rules";

type Work = (0 | 1 | 2)[];

const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;

/** 금지가 아니면 둘 수 있다(이기는 다섯은 금지가 아니다) */
function canPlace(
  board: Work,
  at: number,
  stone: Stone,
  variant: Variant,
): boolean {
  return board[at] === 0 && forbiddenReason(board, at, stone, variant) === null;
}

/** 빈칸에 두어 보면 다섯이 되나 */
function makesFive(
  board: Work,
  at: number,
  stone: Stone,
  variant: Variant,
): boolean {
  if (board[at] !== 0) return false;
  board[at] = stone;
  const five = winningLine(board, at, variant) !== null;
  board[at] = 0;
  return five;
}

/** `stone` 돌에서 네 칸 안 같은 줄의 빈칸(다섯·사가 될 수 있는 자리 후보) */
function lineEmpties(board: Work, stone: Stone): number[] {
  const seen = new Uint8Array(CELLS);
  const found: number[] = [];
  for (let at = 0; at < CELLS; at++) {
    if (board[at] !== stone) continue;
    const [x, y] = xyOf(at);
    for (const [dx, dy] of DIRS)
      for (let k = -4; k <= 4; k++) {
        const nx = x + k * dx;
        const ny = y + k * dy;
        if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) continue;
        const n = indexOf(nx, ny);
        if (board[n] === 0 && !seen[n]) {
          seen[n] = 1;
          found.push(n);
        }
      }
  }
  return found.sort((a, b) => a - b);
}

/** 지금 `stone`이 두면 바로 다섯이 되는 빈칸들 */
export function fivePoints(
  board: readonly (0 | 1 | 2)[],
  stone: Stone,
  variant: Variant,
): number[] {
  const work = [...board] as Work;
  return lineEmpties(work, stone).filter((at) =>
    makesFive(work, at, stone, variant),
  );
}

/** 두면 사가 되는(다음에 다섯 자리가 생기는) 빈칸들. 금지 자리는 뺀다 */
export function fourMoves(
  board: readonly (0 | 1 | 2)[],
  stone: Stone,
  variant: Variant,
): number[] {
  const work = [...board] as Work;
  return fourCandidates(work, stone, variant);
}

/** `at`을 지나는 네 줄에서 네 칸 안의 빈칸 가운데 다섯 자리가 있나(방금 `at`에 둔 돌이 사를 만들었나) */
function fourThrough(
  board: Work,
  at: number,
  stone: Stone,
  variant: Variant,
): boolean {
  const [x, y] = xyOf(at);
  for (const [dx, dy] of DIRS)
    for (let k = -4; k <= 4; k++) {
      if (k === 0) continue;
      const nx = x + k * dx;
      const ny = y + k * dy;
      if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) continue;
      if (makesFive(board, indexOf(nx, ny), stone, variant)) return true;
    }
  return false;
}

function fourCandidates(board: Work, stone: Stone, variant: Variant): number[] {
  const found: number[] = [];
  for (const at of lineEmpties(board, stone)) {
    board[at] = stone;
    const four = fourThrough(board, at, stone, variant);
    board[at] = 0;
    // 금지 판정은 무거워 사가 되는 자리만 본다.
    if (four && canPlace(board, at, stone, variant)) found.push(at);
  }
  return found;
}

function fives(board: Work, stone: Stone, variant: Variant): number[] {
  return lineEmpties(board, stone).filter((at) =>
    makesFive(board, at, stone, variant),
  );
}

/**
 * `stone`이 둘 차례에 사로만 몰아 `moves`수(내 수만 센다, 마지막 다섯 포함) 안에 이기나.
 * 상대가 바로 다섯을 만들 수 있으면 먼저 그 자리를 막아야 하고, 그 막는 수도 내 수로 센다
 */
export function winsByFours(
  board: readonly (0 | 1 | 2)[],
  stone: Stone,
  variant: Variant,
  moves: number,
): boolean {
  return wins([...board] as Work, stone, variant, moves);
}

function wins(board: Work, stone: Stone, variant: Variant, n: number): boolean {
  if (n <= 0) return false;
  const mine = fives(board, stone, variant);
  if (mine.some((at) => canPlace(board, at, stone, variant))) return true;
  if (n === 1) return false;
  const theirs = fives(board, other(stone), variant);
  if (theirs.length >= 2) return false;
  const tries =
    theirs.length === 1
      ? theirs.filter((at) => canPlace(board, at, stone, variant))
      : fourCandidates(board, stone, variant);
  return tries.some((at) => winsAfter(board, stone, variant, at, n));
}

/** `stone`이 `at`에 둔 뒤(이 수를 하나로 센다) 남은 수 안에 이기나. 상대는 모든 막는 수를 해 본다 */
function winsAfter(
  board: Work,
  stone: Stone,
  variant: Variant,
  at: number,
  n: number,
): boolean {
  board[at] = stone;
  try {
    if (winningLine(board, at, variant) !== null) return true;
    const foe = other(stone);
    // 상대가 바로 다섯이면 진다.
    if (
      fives(board, foe, variant).some((p) => canPlace(board, p, foe, variant))
    )
      return false;
    const threats = fives(board, stone, variant).filter((p) =>
      canPlace(board, p, stone, variant),
    );
    // 사가 아니면 상대가 아무 데나 둘 수 있어 이 읽기 밖이다.
    if (threats.length === 0 || n < 2) return false;
    // 상대는 다섯 자리 하나를 막는다(금지라 못 막는 자리는 그대로 남는다).
    const blocks = threats.filter((p) => canPlace(board, p, foe, variant));
    if (blocks.length < threats.length) return true;
    return blocks.every((p) => {
      board[p] = foe;
      const ok = wins(board, stone, variant, n - 1);
      board[p] = 0;
      return ok;
    });
  } finally {
    board[at] = 0;
  }
}

/** 사로 몰아 `moves`수 안에 이기는 첫 수들(바로 다섯 포함) */
export function winningFirstMoves(
  board: readonly (0 | 1 | 2)[],
  stone: Stone,
  variant: Variant,
  moves: number,
): number[] {
  const work = [...board] as Work;
  const five = fives(work, stone, variant).filter((at) =>
    canPlace(work, at, stone, variant),
  );
  if (five.length > 0 || moves <= 1) return five;
  const theirs = fives(work, other(stone), variant);
  if (theirs.length >= 2) return [];
  const tries =
    theirs.length === 1
      ? theirs.filter((at) => canPlace(work, at, stone, variant))
      : fourCandidates(work, stone, variant);
  return tries.filter((at) => winsAfter(work, stone, variant, at, moves));
}

/**
 * 사로 몰 때 상대가 막는 수. 다섯 자리가 하나면 그곳, 둘 이상이면 앞 자리(어느 쪽을 막아도 진다).
 * 막을 자리가 없으면 null
 */
export function blockFor(
  board: readonly (0 | 1 | 2)[],
  attacker: Stone,
  variant: Variant,
): number | null {
  const work = [...board] as Work;
  const foe = other(attacker);
  const threats = fives(work, attacker, variant).filter((p) =>
    canPlace(work, p, attacker, variant),
  );
  return threats.find((p) => canPlace(work, p, foe, variant)) ?? null;
}

/**
 * 백(공격)의 사 몰아붙이기를 끊을 수 있는 흑 자리 후보: 백 돌과 같은 줄 네 칸 안의 빈칸과 흑이 사를 만드는 자리.
 * 그 밖의 자리는 백의 다섯 자리를 막지도, 백에게 막기를 강요하지도 못해 쉬는 것과 같다
 */
export function defenseCandidates(
  board: readonly (0 | 1 | 2)[],
  attacker: Stone = 2,
  variant: Variant = "standard",
): number[] {
  const work = [...board] as Work;
  const set = new Set(lineEmpties(work, attacker));
  for (const at of fourCandidates(work, other(attacker), variant)) set.add(at);
  return [...set].sort((a, b) => a - b);
}
