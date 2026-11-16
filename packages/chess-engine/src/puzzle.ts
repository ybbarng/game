import {
  applyMove,
  inCheck,
  legalMoves,
  type Move,
  type Position,
} from "./board";

/*
 * 메이트 문제를 풀고 검증하는 도우미(docs/23). 수 배우기의 문제 데이터를 단위 시험에서 엔진으로 확인하고,
 * 문제를 고를 때 "정답이 하나뿐인 장면"을 찾는 데 쓴다.
 */

/** 둘 차례인 편이 체크메이트인가(체크를 받았고 둘 수가 없다) */
export function isCheckmate(pos: Position): boolean {
  return inCheck(pos.board, pos.turn) && legalMoves(pos).length === 0;
}

/** 한 수 메이트가 되는 수들 */
export function mateInOneMoves(pos: Position): Move[] {
  return legalMoves(pos).filter((m) => isCheckmate(applyMove(pos, m)));
}

/**
 * 두 수 메이트의 첫 수들: 이 수 뒤 상대가 무엇을 두든 다음 수에 메이트가 있다.
 * 한 수 메이트인 수와, 상대가 둘 수가 없어 비기는(스테일메이트) 수는 뺀다
 */
export function mateInTwoMoves(pos: Position): Move[] {
  return legalMoves(pos).filter((first) => {
    const after = applyMove(pos, first);
    const replies = legalMoves(after);
    if (replies.length === 0) return false;
    return replies.every(
      (reply) => mateInOneMoves(applyMove(after, reply)).length > 0,
    );
  });
}

/**
 * 둘 차례인 편이 이 판에서 `n`수 안에 메이트를 만들 수 있나(상대가 무엇을 두든)
 */
export function forcesMate(pos: Position, n: number): boolean {
  if (n <= 0) return false;
  return legalMoves(pos).some((m) => forcesMateAfter(applyMove(pos, m), n - 1));
}

/**
 * 방금 둔 편이 이 판(상대 차례)에서 남은 `n`수 안에 메이트를 만드나(지금 메이트면 참).
 * 상대가 둘 수가 없는데 체크가 아니면(스테일메이트) 비기므로 거짓이다
 */
export function forcesMateAfter(after: Position, n: number): boolean {
  if (isCheckmate(after)) return true;
  if (n <= 0) return false;
  const replies = legalMoves(after);
  if (replies.length === 0) return false;
  return replies.every((reply) => {
    const next = applyMove(after, reply);
    return n === 1 ? mateInOneMoves(next).length > 0 : forcesMate(next, n);
  });
}

/**
 * `n`수 안 메이트의 첫 수들: 이 수 뒤 상대가 무엇을 두든 남은 수 안에 메이트가 된다.
 * 더 빠른 메이트가 되는 수도 함께 나온다(문제는 더 빠른 메이트가 없는 판만 고른다)
 */
export function mateInMoves(pos: Position, n: number): Move[] {
  return legalMoves(pos).filter((first) =>
    forcesMateAfter(applyMove(pos, first), n - 1),
  );
}

/**
 * 세 수 메이트의 첫 수들. 한 수·두 수 메이트가 되는 수는 뺀다.
 * 판에 기물이 많으면 무거우니 문제처럼 기물이 적은 판에서 쓴다
 */
export function mateInThreeMoves(pos: Position): Move[] {
  return mateInMoves(pos, 3).filter(
    (m) => !forcesMateAfter(applyMove(pos, m), 1),
  );
}
