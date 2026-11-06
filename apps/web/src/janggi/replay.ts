import {
  applyMove,
  type Board,
  KIND_NAMES,
  type Kind,
  type Move,
  PIECE_VALUE,
  pointAt,
  pointName,
  SIDE_NAMES,
  type Side,
} from "@game/janggi-engine";

/*
 * 배우기 판 그림의 「다음 수」 넘겨 보기와 따라 두기가 함께 쓰는 계산(판·화면을 모르는 순수 함수).
 * 수는 기보 글자("79-78"), 둔 편은 초부터 번갈아(`by: "turns"`) 또는 초 혼자(`by: "cho"`)다.
 */

export type ReplayBy = "turns" | "cho";

/** "79-78" → 수 */
export function parseMove(text: string): Move {
  const [from = "", to = ""] = text.split("-");
  return { from: pointAt(from), to: pointAt(to) };
}

/** `i`째(0부터) 수를 두는 편 */
export function sideAt(i: number, by: ReplayBy = "turns"): Side {
  return by === "cho" || i % 2 === 0 ? "c" : "h";
}

/** 수순을 처음부터 둔 판들: `[0]`은 처음 판, `[n]`은 n수 뒤 판 */
export function replayBoards(start: Board, moves: readonly string[]): Board[] {
  const boards: Board[] = [start];
  for (const text of moves)
    boards.push(applyMove(boards[boards.length - 1] as Board, parseMove(text)));
  return boards;
}

/** 한의 졸은 병이라 부른다(배우기 글과 같게) */
export function pieceName(cell: string): string {
  return cell === "hP" ? "병" : KIND_NAMES[cell[1] as Kind];
}

/** "한 차 11→41 · 초 차 잃음"처럼 넘긴 수를 말로. `before`는 그 수를 두기 전 판 */
export function moveText(before: Board, move: Move): string {
  const name = (cell: string) =>
    `${SIDE_NAMES[cell[0] as Side]} ${pieceName(cell)}`;
  const taken = before[move.to] ?? "";
  const capture = taken
    ? ` · ${name(taken)} ${taken[0] === "c" ? "잃음" : "잡음"}`
    : "";
  return `${name(before[move.from] ?? "")} ${pointName(move.from)}→${pointName(move.to)}${capture}`;
}

/** 지금까지 각 편이 잡은 기물(잡은 차례대로) */
export interface Tally {
  c: string[];
  h: string[];
}

/** `boards`의 처음부터 `frame`수까지 잡은 기물 */
export function tallyOf(
  boards: readonly Board[],
  moves: readonly string[],
  frame: number,
): Tally {
  const tally: Tally = { c: [], h: [] };
  for (let i = 0; i < Math.min(frame, moves.length); i++) {
    const before = boards[i] as Board;
    const m = parseMove(moves[i] as string);
    const mover = (before[m.from] ?? "")[0] as Side | undefined;
    const taken = before[m.to] ?? "";
    if (mover && taken) tally[mover].push(taken);
  }
  return tally;
}

export const pointsOf = (cells: readonly string[]) =>
  cells.reduce((sum, cell) => sum + PIECE_VALUE[cell[1] as Kind], 0);

/**
 * 주고받은 셈: "잡은 기물: 초 병(2) · 한 차(13) → 초 11점 손해".
 * 아무것도 잡지 않았으면 null
 */
export function tallyText(tally: Tally): string | null {
  if (tally.c.length === 0 && tally.h.length === 0) return null;
  const list = (cells: readonly string[]) =>
    cells.length === 0
      ? "없음"
      : cells
          .map((cell) => `${pieceName(cell)}(${PIECE_VALUE[cell[1] as Kind]})`)
          .join("·");
  const diff = pointsOf(tally.c) - pointsOf(tally.h);
  const verdict =
    diff === 0
      ? "점수가 같아 손해 없음"
      : `초 ${Math.abs(diff)}점 ${diff > 0 ? "이득" : "손해"}`;
  return `잡은 기물: 초 ${list(tally.c)} · 한 ${list(tally.h)} → ${verdict}`;
}
