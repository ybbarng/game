import {
  type Board,
  CELLS,
  type Kind,
  other,
  PIECE_VALUE,
  pseudoTargets,
  type Side,
} from "@game/janggi-engine";

/** `side` 편 기물 가운데 `at`을 잡을 수 있는 기물의 종류(궁이 잡히는지는 보지 않는다) */
function attackersOf(board: Board, at: number, side: Side): Kind[] {
  const kinds: Kind[] = [];
  for (let from = 0; from < CELLS; from++) {
    const cell = board[from] ?? "";
    if (cell.startsWith(side) && pseudoTargets(board, from).includes(at))
      kinds.push(cell[1] as Kind);
  }
  return kinds;
}

/**
 * 잡힐 위험이 있는 `side` 편 기물 자리: 상대가 잡을 수 있는데 지키는 기물이 없거나,
 * 더 작은 기물로 잡을 수 있으면 위험이다(잡고 다시 잡혀도 상대가 이득). 궁은 장군 표시가 따로 있어 뺀다.
 * 화면 도움일 뿐이라 궁이 드러나는 수(장군 피하기)까지는 따지지 않는다
 */
export function piecesInDanger(board: Board, side: Side): number[] {
  const enemy = other(side);
  const danger: number[] = [];
  for (let at = 0; at < CELLS; at++) {
    const cell = board[at] ?? "";
    if (!cell.startsWith(side) || cell[1] === "K") continue;
    const kind = cell[1] as Kind;
    const attackers = attackersOf(board, at, enemy);
    if (attackers.length === 0) continue;
    const cheapest = Math.min(
      ...attackers.map((k) => (k === "K" ? Infinity : PIECE_VALUE[k])),
    );
    if (cheapest < PIECE_VALUE[kind]) {
      danger.push(at);
      continue;
    }
    // 지키는 기물: 그 자리에 상대 기물이 있다고 보고 내 기물이 잡을 수 있나.
    // 같은 종류로 바꿔 두어야 포가 포를 못 잡는 규칙까지 맞는다.
    const probe = [...board];
    probe[at] = `${enemy}${kind}` as (typeof probe)[number];
    if (attackersOf(probe, at, side).length === 0) danger.push(at);
  }
  return danger;
}
