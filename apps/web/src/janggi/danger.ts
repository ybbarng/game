import {
  applyMove,
  type Board,
  CELLS,
  inCheck,
  type Kind,
  other,
  PIECE_VALUE,
  pseudoTargets,
  type Side,
} from "@game/janggi-engine";

/** `side` 편이 `at`을 실제로(자기 궁을 드러내지 않고) 잡을 수 있나 */
function canTake(board: Board, at: number, side: Side): boolean {
  for (let from = 0; from < CELLS; from++) {
    const cell = board[from] ?? "";
    if (!cell.startsWith(side) || !pseudoTargets(board, from).includes(at))
      continue;
    if (!inCheck(applyMove(board, { from, to: at }), side)) return true;
  }
  return false;
}

/**
 * 잡힐 위험이 있는 `side` 편 기물 자리. 상대가 그 기물을 실제로 잡아 본 판에서 따진다:
 * 잡는 기물이 더 싸거나(잡고 다시 잡혀도 상대가 이득), 내가 자기 궁을 드러내지 않고 되받아 잡을 수 없으면 위험이다.
 * 잡는 수가 상대 자기 궁을 드러내면(규칙 위반) 건너뛴다. 잡으러 온 기물이 그 칸에 서고 원래 칸이 비는 것까지
 * 반영하므로 포가 포를 못 잡는 규칙도 맞는다. 궁은 장군 표시가 따로 있어 뺀다
 */
export function piecesInDanger(board: Board, side: Side): number[] {
  const enemy = other(side);
  const danger: number[] = [];
  for (let at = 0; at < CELLS; at++) {
    const cell = board[at] ?? "";
    if (!cell.startsWith(side) || cell[1] === "K") continue;
    const value = PIECE_VALUE[cell[1] as Kind];
    for (let from = 0; from < CELLS; from++) {
      const attacker = board[from] ?? "";
      if (
        !attacker.startsWith(enemy) ||
        !pseudoTargets(board, from).includes(at)
      )
        continue;
      const next = applyMove(board, { from, to: at });
      if (inCheck(next, enemy)) continue;
      const kind = attacker[1] as Kind;
      const cheaper = kind !== "K" && PIECE_VALUE[kind] < value;
      if (cheaper || !canTake(next, at, side)) {
        danger.push(at);
        break;
      }
    }
  }
  return danger;
}
