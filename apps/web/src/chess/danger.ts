import {
  attacked,
  type Kind,
  PIECE_POINTS,
  type Position,
  pseudoMoves,
  type Side,
} from "@game/chess-engine";

/**
 * 잡힐 기물 표시(2026-11-03, 바둑 「단수 표시」와 짝): `side`의 기물 가운데 상대가 지금 잡으면 손해를 보는 기물.
 * - 지키는 내 기물이 없는데 상대가 노린다(공짜로 잡힌다)
 * - 지켜도, 노리는 상대 기물 가운데 이 기물보다 싼 것이 있다(예: 폰이 나이트를 노린다)
 * 킹은 체크 표시가 따로 있어 뺀다. 핀·주고받기 끝까지는 따지지 않는 눈앞 도움일 뿐이다(규칙과 상관없다)
 */
export function hangingPieces(pos: Position, side: Side): number[] {
  const enemy: Side = side === "w" ? "b" : "w";
  // 상대 차례인 판으로 바꿔 상대의 잡는 수를 모은다(칸마다 가장 싼 공격 기물).
  const cheapest = new Map<number, number>();
  for (const m of pseudoMoves({ ...pos, turn: enemy, ep: null }, true)) {
    const victim = pos.board[m.to] ?? "";
    if (victim[0] !== side || victim[1] === "K") continue;
    const by = PIECE_POINTS[(pos.board[m.from] ?? "")[1] as Kind] ?? 0;
    // 킹이 잡으러 오는 것은 0점이지만, 지켜진 칸에는 못 온다(아래 지킴 확인이 걸러 준다).
    const value = by === 0 ? 100 : by;
    cheapest.set(m.to, Math.min(cheapest.get(m.to) ?? 100, value));
  }
  const out: number[] = [];
  for (const [at, attacker] of cheapest) {
    const piece = PIECE_POINTS[(pos.board[at] ?? "")[1] as Kind] ?? 0;
    const defended = attacked(pos.board, at, side);
    if (!defended || attacker < piece) out.push(at);
  }
  return out.sort((a, b) => a - b);
}
