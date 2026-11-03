import {
  applyMove,
  type Kind,
  legalMoves,
  PIECE_POINTS,
  type Position,
  type Side,
} from "@game/chess-engine";

/**
 * 잡힐 기물 표시(2026-11-03, 바둑 「단수 표시」와 짝): `side`의 기물 가운데 상대가 지금 잡으면 손해를 보는 기물.
 * - 상대가 잡은 뒤 그 칸을 되받아 잡을 수 없다(공짜로 잡힌다)
 * - 되받아 잡을 수 있어도, 잡으러 오는 상대 기물이 이 기물보다 싸다(예: 폰이 나이트를 잡는다)
 * 킹은 체크 표시가 따로 있어 뺀다.
 *
 * 잡는 수와 되받는 수 모두 실제로 두어 본 판에서 규칙대로(합법 수로) 따진다(2026-11-03 헤드쿼터 검토, 장기 danger.ts와
 * 같은 바로잡음): 핀으로 묶인 상대 기물은 잡으러 오지 못하고, 잡으러 온 기물이 비운 칸으로 열린 줄(엑스레이)로 되받을 수
 * 있으며, 묶인 내 기물이나 상대가 노리는 칸으로 가야 하는 킹은 되받지 못한다. 주고받기를 끝까지(2대1 등) 읽지는 않는
 * 눈앞 도움이다(규칙과 상관없다)
 */
export function hangingPieces(pos: Position, side: Side): number[] {
  const enemy: Side = side === "w" ? "b" : "w";
  const asEnemy: Position = { ...pos, turn: enemy, ep: null };
  const out = new Set<number>();
  for (const m of legalMoves(asEnemy)) {
    const victim = pos.board[m.to] ?? "";
    if (victim[0] !== side || victim[1] === "K" || out.has(m.to)) continue;
    const piece = PIECE_POINTS[victim[1] as Kind] ?? 0;
    const by = PIECE_POINTS[(pos.board[m.from] ?? "")[1] as Kind] ?? 0;
    // 잡으러 온 기물이 그 칸에 서고 원래 칸은 빈 판에서, 내가 규칙대로 되받아 잡을 수 있는가
    const after = applyMove(asEnemy, m);
    const recapture = legalMoves(after).some((r) => r.to === m.to);
    if (!recapture || (by > 0 && by < piece)) out.add(m.to);
  }
  return [...out].sort((a, b) => a - b);
}
