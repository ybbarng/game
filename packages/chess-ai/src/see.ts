/*
 * 정적 교환 계산(SEE): 한 칸에서 서로 잡고 되잡기를 끝까지 이어 갔을 때 처음 잡은 편이 얻는 값.
 * 양쪽 모두 가장 싼 기물부터 잡으러 들어가고, 손해면 언제든 멈출 수 있다고 본다.
 * 앞 기물이 잡으러 나가면 그 뒤에 줄지어 선 룩·비숍·퀸(엑스레이)도 보인다.
 * 초고수가 잡기만 보는 탐색에서 손해 보는 잡기를 건너뛰는 데 쓴다.
 */
import type { Board, Cell, Kind, Move, Side } from "@game/chess-engine";

import { VALUE } from "./search";

/** SEE에서 킹은 잡히면 안 되므로 아주 비싸게 본다 */
const SEE_VALUE: Record<Kind, number> = { ...VALUE, K: 20_000 };

const KNIGHT = [
  [1, 2],
  [2, 1],
  [-1, 2],
  [-2, 1],
  [1, -2],
  [2, -1],
  [-1, -2],
  [-2, -1],
] as const;
const DIAGONAL = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;
const ORTHOGONAL = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** 줄을 따라 처음 만나는 기물이 그 편의 `kind`면 그 칸, 아니면 -1 */
function rayHit(
  board: readonly Cell[],
  x: number,
  y: number,
  dirs: readonly (readonly [number, number])[],
  side: Side,
  kind: Kind,
): number {
  for (const [dx, dy] of dirs) {
    let nx = x + dx;
    let ny = y + dy;
    while (nx >= 0 && nx < 8 && ny >= 0 && ny < 8) {
      const at = ny * 8 + nx;
      const cell = board[at];
      if (cell !== "") {
        if (cell?.[0] === side && cell[1] === kind) return at;
        break;
      }
      nx += dx;
      ny += dy;
    }
  }
  return -1;
}

/** 이 칸을 노리는 그 편 기물 가운데 가장 싼 것의 칸. 없으면 -1 */
function cheapestAttacker(
  board: readonly Cell[],
  at: number,
  side: Side,
): number {
  const x = at % 8;
  const y = at >> 3;
  // 백 폰은 y가 줄어드는 쪽으로 가므로, 이 칸을 노리는 백 폰은 한 줄 아래(y+1)에 있다.
  const py = side === "w" ? y + 1 : y - 1;
  if (py >= 0 && py < 8) {
    const pawn = `${side}P`;
    if (x > 0 && board[py * 8 + x - 1] === pawn) return py * 8 + x - 1;
    if (x < 7 && board[py * 8 + x + 1] === pawn) return py * 8 + x + 1;
  }
  const knight = `${side}N`;
  for (const [dx, dy] of KNIGHT) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8 && board[ny * 8 + nx] === knight)
      return ny * 8 + nx;
  }
  let hit = rayHit(board, x, y, DIAGONAL, side, "B");
  if (hit >= 0) return hit;
  hit = rayHit(board, x, y, ORTHOGONAL, side, "R");
  if (hit >= 0) return hit;
  hit = rayHit(board, x, y, DIAGONAL, side, "Q");
  if (hit >= 0) return hit;
  hit = rayHit(board, x, y, ORTHOGONAL, side, "Q");
  if (hit >= 0) return hit;
  const king = `${side}K`;
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8 && board[ny * 8 + nx] === king)
        return ny * 8 + nx;
    }
  return -1;
}

/**
 * `move`(잡는 수)를 두고 그 칸에서 주고받기를 끝까지 했을 때 둔 편이 얻는 값(폰 100).
 * 앙파상은 폰 하나를 얻는 것으로 본다. 승급은 따지지 않는다(부르는 쪽이 따로 다룬다)
 */
export function see(board: Board, move: Move): number {
  const b = board.slice() as Cell[];
  const to = move.to;
  const mover = b[move.from] ?? "";
  if (mover === "") return 0;
  const victim = b[to] ?? "";
  // 빈칸을 폰이 대각선으로 잡으면 앙파상
  const first =
    victim !== ""
      ? SEE_VALUE[victim[1] as Kind]
      : mover[1] === "P" && move.from % 8 !== to % 8
        ? VALUE.P
        : 0;
  const gain: number[] = [first];
  b[to] = mover;
  b[move.from] = "";
  let side: Side = mover[0] === "w" ? "b" : "w";
  let d = 0;
  for (;;) {
    const from = cheapestAttacker(b, to, side);
    if (from < 0) break;
    d += 1;
    // 지금 그 칸에 선 기물을 잡는다
    gain[d] = SEE_VALUE[(b[to] as string)[1] as Kind] - (gain[d - 1] as number);
    // 잡아도 앞선 값을 뒤집지 못하면 더 볼 것 없다
    if (Math.max(-(gain[d - 1] as number), gain[d] as number) < 0) break;
    b[to] = b[from] as Cell;
    b[from] = "";
    side = side === "w" ? "b" : "w";
  }
  while (d > 0) {
    gain[d - 1] = -Math.max(-(gain[d - 1] as number), gain[d] as number);
    d -= 1;
  }
  return gain[0] as number;
}
