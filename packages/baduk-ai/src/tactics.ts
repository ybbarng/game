import type { FastBoard } from "./fast-board";

/*
 * 단수 읽기(michi의 fix_atari를 옮김). 무리 하나를 보고 "지금 둘 차례인 쪽이 둘 만한 수"를 고른다.
 * - 상대 무리가 단수면 따내는 자리.
 * - 내 무리가 단수면 맞따내기(붙은 상대 단수 무리 따내기)와 달아나기(두면 활로가 둘 이상, 축에 걸리지 않음).
 * - 축 읽기를 켜면 활로 둘인 상대 무리를 축·장문으로 잡는 수도 찾는다.
 * 축은 끝까지 읽는다(한 번에 판 하나씩 복사). 길이 막히지 않게 읽는 판 수에 상한을 둔다.
 */

/** 한 번 읽을 때 복사해 볼 판 수 상한(축이 판을 가로질러도 넉넉하다) */
const READ_LIMIT = 400;

/** 읽기 몫: 여러 무리를 읽을 때 함께 나눠 쓰면 한 번에 드는 시간이 묶인다 */
export interface Reader {
  budget: number;
  /** 지금 읽는 깊이(깊이마다 판 하나를 되풀이해 쓴다) */
  depth: number;
}

/** 판 크기마다, 깊이마다 되풀이해 쓰는 판(읽을 때마다 새로 만들면 느리다) */
const POOLS = new Map<number, FastBoard[]>();

function scratch(board: FastBoard, depth: number): FastBoard {
  let pool = POOLS.get(board.size);
  if (!pool) {
    pool = [];
    POOLS.set(board.size, pool);
  }
  let b = pool[depth];
  if (!b) {
    b = board.clone();
    pool[depth] = b;
  } else b.copyFrom(board);
  return b;
}

/**
 * 지금 둘 차례(`board.toPlay`)가 무리 `at`을 두고 둘 만한 수를 `out`에 더한다(겹치면 한 번만).
 * 그 무리가 단수(활로 하나)인지 돌려준다
 */
export function atariMoves(
  board: FastBoard,
  at: number,
  ladder: boolean,
  out: number[],
  reader: Reader = { budget: READ_LIMIT, depth: 0 },
): boolean {
  return fixAtari(board, at, ladder, ladder, out, reader);
}

function push(out: number[], m: number): void {
  if (!out.includes(m)) out.push(m);
}

function fixAtari(
  board: FastBoard,
  at: number,
  twoLib: boolean,
  ladder: boolean,
  out: number[],
  reader: Reader,
): boolean {
  const color = board.cells[at];
  if (!color) return false;
  const me = board.toPlay;
  const libs = board.liberties(at, 3);
  if (libs >= 3) return false;
  if (libs === 2) {
    if (!twoLib || color === me) return false;
    board.scanGroup(at);
    const l1 = board.groupLibs[0] as number;
    const l2 = board.groupLibs[1] as number;
    const kill = ladderAttack(board, at, l1, l2, reader);
    if (kill >= 0) push(out, kill);
    return false;
  }
  if (libs === 0) return false;
  const lib = board.lastLib;
  if (color !== me) {
    if (board.isLegal(lib)) push(out, lib);
    return true;
  }
  // 내 무리가 단수: 먼저 맞따내기(붙은 상대 단수 무리를 따낸다)
  board.scanGroup(at);
  const stones = Array.from(board.groupStones.subarray(0, board.groupSize));
  const enemy = me === 1 ? 2 : 1;
  for (const s of stones)
    for (let k = 0; k < 4; k++) {
      const q = board.neighbor(s, k);
      if (q < 0 || board.cells[q] !== enemy) continue;
      if (board.liberties(q, 2) === 1) {
        const l = board.lastLib;
        if (board.isLegal(l)) push(out, l);
      }
    }
  // 달아나기: 활로 자리에 두어 활로가 셋 이상이거나, 둘이어도 축에 걸리지 않으면
  if (!board.isLegal(lib)) return true;
  if (!ladder) {
    if (board.libertiesAfter(lib, 2) >= 2) push(out, lib);
    return true;
  }
  const after = scratch(board, reader.depth);
  after.play(lib);
  reader.budget--;
  const n = after.liberties(lib, 3);
  if (n >= 3) push(out, lib);
  else if (n === 2) {
    after.scanGroup(lib);
    const a = after.groupLibs[0] as number;
    const b = after.groupLibs[1] as number;
    reader.depth++;
    const caught = ladderAttack(after, lib, a, b, reader) >= 0;
    reader.depth--;
    if (!caught) push(out, lib);
  }
  return true;
}

/**
 * 공격하는 쪽 차례에, 활로가 `l1`·`l2` 둘인 무리 `at`을 단수로 몰아 끝내 따낼 수 있는 수(축·장문). 없으면 -1.
 * 받는 쪽이 맞따내기나 달아나기로 벗어나면 못 잡은 것이다
 */
function ladderAttack(
  board: FastBoard,
  at: number,
  l1: number,
  l2: number,
  reader: Reader,
): number {
  for (const l of [l1, l2]) {
    if (reader.budget <= 0) return -1;
    if (!board.isLegal(l)) continue;
    const next = scratch(board, reader.depth);
    next.play(l);
    reader.budget--;
    const saves: number[] = [];
    reader.depth++;
    const inAtari = fixAtari(next, at, false, true, saves, reader);
    reader.depth--;
    if (inAtari && saves.length === 0) return l;
  }
  return -1;
}

/** `at`에 두면 스스로 단수가 되나(따내는 수는 아니다) */
export function isSelfAtari(board: FastBoard, at: number): boolean {
  return board.libertiesAfter(at, 2) === 1;
}
