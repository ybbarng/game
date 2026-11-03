import type { RngState } from "@game/mighty-engine";
import {
  type Action,
  type Cell,
  forbiddenReason,
  hasForbidden,
  type OmokView,
  other,
  SIZE,
  type Stone,
  stoneOfSeat,
  type Variant,
  winningLine,
} from "@game/omok-engine";

import { nearbyEmpties, placeGain } from "./shape";

/** 컴퓨터 플레이어. 자기 자리 화면만 받는다(`KitBot`과 같은 모양) */
export interface OmokBot {
  readonly name: string;
  decide(view: OmokView, rng: RngState): Action;
}

export const WIN = 10_000_000;

const N = SIZE;

const LINE_DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;

/**
 * 금지 수(3·3, 4·4, 장목)일 수도 있나. 셋 모두 두 줄에 내 돌이 둘 이상씩 있거나 한 줄에 넷 이상 있어야 생긴다.
 * 엔진의 금지 판정이 무거워 이 값이 거짓이면 건너뛴다(답은 같다)
 */
export function mayBeForbidden(
  board: readonly Cell[],
  at: number,
  stone: Stone,
): boolean {
  const x0 = at % N;
  const y0 = (at - x0) / N;
  let busy = 0;
  for (const [dx, dy] of LINE_DIRS) {
    let count = 0;
    for (const sign of [1, -1])
      for (let k = 1; k <= 5; k++) {
        const x = x0 + sign * k * dx;
        const y = y0 + sign * k * dy;
        if (x < 0 || x >= N || y < 0 || y >= N) break;
        const v = board[y * N + x];
        if (v === stone) count++;
        else if (v !== 0) break;
      }
    if (count >= 4) return true;
    if (count >= 2 && ++busy >= 2) return true;
  }
  return false;
}

export function allowed(
  board: readonly Cell[],
  at: number,
  stone: Stone,
  variant: Variant,
): boolean {
  return (
    !hasForbidden(variant, stone) ||
    !mayBeForbidden(board, at, stone) ||
    forbiddenReason(board, at, stone, variant) === null
  );
}

/** `stone`이 지금 두면 바로 이기는 자리들 */
export function winningMoves(
  board: Cell[],
  stone: Stone,
  variant: Variant,
  candidates: readonly number[],
): number[] {
  const found: number[] = [];
  for (const at of candidates) {
    board[at] = stone;
    const wins = winningLine(board, at, variant) !== null;
    board[at] = 0;
    // 이기는 다섯은 금지 수가 아니다(엔진 `forbiddenReason`).
    if (wins) found.push(at);
  }
  return found;
}

/**
 * 후보 자리를 공격 값어치 + 막는 값어치(`defense`배)로 줄 세워 앞에서 `limit`개. 금지 자리는 뺀다.
 * 금지 판정이 무거워 앞 순위부터 필요한 만큼만 본다
 */
export function ranked(
  board: Cell[],
  stone: Stone,
  variant: Variant,
  defense: number,
  limit = Infinity,
): { at: number; score: number }[] {
  const sorted = nearbyEmpties(board)
    .map((at) => ({
      at,
      score:
        placeGain(board, at, stone) +
        defense * placeGain(board, at, other(stone)),
    }))
    .sort((a, b) => b.score - a.score);
  const picked: { at: number; score: number }[] = [];
  for (const move of sorted) {
    if (picked.length >= limit) break;
    if (allowed(board, move.at, stone, variant)) picked.push(move);
  }
  return picked;
}

/**
 * 반드시 둘 자리: 이기는 수가 있으면 그것, 상대가 다음에 이기는 자리가 있으면 그곳을 막는다.
 * 상대 이기는 자리가 둘 이상이면 하나만 막을 수 있다
 */
export function forced(
  board: Cell[],
  stone: Stone,
  variant: Variant,
): number | null {
  const near = nearbyEmpties(board);
  const win = winningMoves(board, stone, variant, near);
  if (win[0] !== undefined) return win[0];
  const threats = winningMoves(board, other(stone), variant, near).filter(
    (at) => allowed(board, at, stone, variant),
  );
  return threats[0] ?? null;
}

/** 판 끝·내 차례 아님 처리. 둘 차례면 null */
export function routine(view: OmokView): Action | null {
  if (view.phase === "roundEnd" && !view.continued[view.mySeat])
    return { type: "continue" };
  return null;
}

/** 둘 곳이 하나도 없을 때(판이 다 찼는데 결과가 안 난 경우는 없지만 안전하게) */
export function anyLegal(
  board: Cell[],
  stone: Stone,
  variant: Variant,
): number {
  for (let at = 0; at < board.length; at++)
    if (board[at] === 0 && allowed(board, at, stone, variant)) return at;
  return 0;
}

export function placeWith(
  pick: (
    board: Cell[],
    stone: Stone,
    variant: Variant,
    rng: RngState,
  ) => number,
): (view: OmokView, rng: RngState) => Action {
  return (view, rng) => {
    const done = routine(view);
    if (done) return done;
    const board = [...view.board];
    const stone = stoneOfSeat(view, view.mySeat);
    const variant = view.rules.variant;
    const must = forced(board, stone, variant);
    if (must !== null) return { type: "place", at: must };
    return { type: "place", at: pick(board, stone, variant, rng) };
  };
}
