import {
  applyMove,
  type Board,
  CELLS,
  inCheck,
  type Kind,
  kingsFacing,
  type Move,
  other,
  PIECE_VALUE,
  pseudoTargets,
  type Side,
} from "@game/janggi-engine";

export interface DangerOptions {
  /** 빅장 금지 규칙: 두 궁이 마주 보게 되는 잡기·되받기는 둘 수 없다 */
  bikjangForbidden?: boolean;
}

/** 노림을 받는 기물: 자리와, 그 기물을 실제로 잡을 수 있는 상대 기물 자리 */
export interface Threat {
  at: number;
  attackers: number[];
}

/** 그 편이 이 수를 실제로 둘 수 있나(자기 궁이 드러나지 않고, 빅장 금지면 빅장이 되지 않게) */
function playable(
  board: Board,
  move: Move,
  side: Side,
  options: DangerOptions,
): Board | null {
  const next = applyMove(board, move);
  if (inCheck(next, side)) return null;
  if (options.bikjangForbidden && kingsFacing(next)) return null;
  return next;
}

/** `side` 편이 `at`을 실제로 잡을 수 있나 */
function canTake(
  board: Board,
  at: number,
  side: Side,
  options: DangerOptions,
): boolean {
  for (let from = 0; from < CELLS; from++) {
    const cell = board[from] ?? "";
    if (!cell.startsWith(side) || !pseudoTargets(board, from).includes(at))
      continue;
    if (playable(board, { from, to: at }, side, options)) return true;
  }
  return false;
}

/**
 * 잡힐 위험이 있는 `side` 편 기물. 상대가 그 기물을 실제로 잡아 본 판에서 따진다:
 * 잡는 기물이 더 싸거나(잡고 다시 잡혀도 상대가 이득), 내가 실제로 되받아 잡을 수 없으면 위험이다.
 * 잡으러 온 기물이 그 칸에 서고 원래 칸이 비는 것까지 반영하므로 포가 포를 못 잡는 규칙도 맞는다.
 * 궁은 장군 표시가 따로 있어 뺀다.
 * 한계: 한 번 잡고 한 번 되받는 데까지만 본다. 세 번 이상 이어지는 주고받기(지키는 기물이 둘 이상 겹친 판)는 따지지 않는다
 */
export function threatenedPieces(
  board: Board,
  side: Side,
  options: DangerOptions = {},
): Threat[] {
  const enemy = other(side);
  const threats: Threat[] = [];
  for (let at = 0; at < CELLS; at++) {
    const cell = board[at] ?? "";
    if (!cell.startsWith(side) || cell[1] === "K") continue;
    const value = PIECE_VALUE[cell[1] as Kind];
    const attackers: number[] = [];
    let danger = false;
    for (let from = 0; from < CELLS; from++) {
      const attacker = board[from] ?? "";
      if (
        !attacker.startsWith(enemy) ||
        !pseudoTargets(board, from).includes(at)
      )
        continue;
      const next = playable(board, { from, to: at }, enemy, options);
      if (!next) continue;
      attackers.push(from);
      const kind = attacker[1] as Kind;
      const cheaper = kind !== "K" && PIECE_VALUE[kind] < value;
      if (cheaper || !canTake(next, at, side, options)) danger = true;
    }
    if (danger) threats.push({ at, attackers });
  }
  return threats;
}

/** 잡힐 위험이 있는 `side` 편 기물 자리(화면의 빨간 점선 고리) */
export function piecesInDanger(
  board: Board,
  side: Side,
  options: DangerOptions = {},
): number[] {
  return threatenedPieces(board, side, options).map((t) => t.at);
}
