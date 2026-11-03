import {
  applyMove,
  type Board,
  KIND_NAMES,
  type Kind,
  type Move,
  other,
  PIECE_VALUE,
  pointName,
  type Side,
} from "@game/janggi-engine";

import { type DangerOptions, threatenedPieces } from "./danger";
import { hasBatchim, obj } from "./study";

const kindAt = (board: Board, at: number) => (board[at] as string)[1] as Kind;

/** "차(59)"처럼 기물 이름과 자리에 조사를 붙인다. 조사는 괄호 앞 기물 이름으로 고른다 */
function label(board: Board, at: number, josa: [string, string]): string {
  const name = KIND_NAMES[kindAt(board, at)];
  return `${name}(${pointName(at)})${hasBatchim(name) ? josa[0] : josa[1]}`;
}

/** 큰 기물부터 */
const byValue = (board: Board) => (a: { at: number }, b: { at: number }) =>
  PIECE_VALUE[kindAt(board, b.at)] - PIECE_VALUE[kindAt(board, a.at)];

/**
 * 다시 보기 해설에 덧붙일 처음 하는 사람용 짚기. 화면의 잡힐 위험 표시와 같은 계산(danger.ts)이라
 * 결정적이고 가볍다. 한 번 잡고 한 번 되받는 데까지만 본다.
 * - 잡은 기물
 * - 공짜로(또는 더 싼 기물로) 잡을 수 있던 상대 기물을 두고 다른 수를 뒀다
 * - 이 수 뒤 새로 잡힐 위험이 생긴 내 기물
 */
export function reviewNotes(
  board: Board,
  move: Move,
  side: Side,
  options: DangerOptions = {},
): string[] {
  const notes: string[] = [];
  const taken = board[move.to] ?? "";
  if (taken !== "") {
    const kind = taken[1] as Kind;
    notes.push(`${obj(KIND_NAMES[kind])} 잡았다(${PIECE_VALUE[kind]}점)`);
  }
  // 놓친 공짜: 두기 전 위험한 상대 기물이 있는데 아무것도 잡지 않았으면 가장 큰 것 하나
  const free = threatenedPieces(board, other(side), options).sort(
    byValue(board),
  )[0];
  if (free && taken === "")
    notes.push(
      `공짜로 잡을 수 있던 ${label(board, free.at, ["을", "를"])} 두고 다른 수를 뒀다`,
    );
  // 새 위험: 두기 전에는 안전했는데 이 수 뒤 잡힐 위험이 생긴 내 기물(가장 큰 것 하나).
  // 옮긴 기물은 출발 자리에서 위험했는지로 견준다.
  const before = new Set(
    threatenedPieces(board, side, options).map((t) => t.at),
  );
  const after = applyMove(board, move);
  const risky = threatenedPieces(after, side, options)
    .filter((t) => !before.has(t.at === move.to ? move.from : t.at))
    .sort(byValue(after))[0];
  if (risky)
    notes.push(
      `이 수 뒤 ${label(after, risky.at, ["이", "가"])} 잡힐 위험에 놓였다`,
    );
  return notes;
}
