import {
  type Action,
  applyMove,
  attacked,
  type Board,
  type ChessState,
  createChessScenario,
  forcesMateAfter,
  isCheckmate,
  KIND_NAMES,
  type Kind,
  kingOf,
  type Move,
  moveToSan,
  type Position,
  sameMove,
  sanToMove,
  squareName,
  viewOf,
} from "@game/chess-engine";
import { adviseWith } from "@/game/bot-runner";
import { obj, ro, subj, topic } from "@/lib/josa";

import { chessAdvisor } from "./advisor";
import type { ChessPuzzle } from "./puzzles";

/** 문제 장면에서 시작하는 판. 늘 백(나, 0번 자리)이 둘 차례다 */
export function puzzleState(puzzle: ChessPuzzle): ChessState {
  return createChessScenario({ fen: puzzle.fen, me: "w" });
}

/** 문제의 첫 정답 수 */
export function solutionMove(puzzle: ChessPuzzle): Move {
  const move = sanToMove(puzzleState(puzzle).position, puzzle.solution);
  if (!move) throw new Error(`둘 수 없는 정답: ${puzzle.id}`);
  return move;
}

/**
 * 내 수를 판정한다. 전술·끝내기 문제는 정답 수만 맞다.
 * 메이트 문제의 첫 수는 문제의 정답 수만, 가운데 수는 남은 수 안에 메이트가 되는 수, 마지막 수는 메이트면 어느 수든 정답
 */
export function judgeMove(
  puzzle: ChessPuzzle,
  state: ChessState,
  move: Move,
  step: number,
): "solved" | "next" | "wrong" {
  if (puzzle.kind !== "mate")
    return sameMove(move, solutionMove(puzzle)) ? "solved" : "wrong";
  const after = applyMove(state.position, move);
  if (isCheckmate(after)) return "solved";
  if (step >= puzzle.mateIn - 1) return "wrong";
  if (step === 0)
    return sameMove(move, solutionMove(puzzle)) ? "next" : "wrong";
  // 세 수 문제의 가운데 수: 남은 수 안에 메이트가 되면 어느 수든 맞다.
  return forcesMateAfter(after, puzzle.mateIn - step - 1) ? "next" : "wrong";
}

/** 상대(흑)의 받는 수: 고수(화면용 `chessAdvisor`)가 가장 오래 버티는 수를 고른다. 같은 문제는 늘 같은 수 */
export function defenseFor(state: ChessState) {
  return chessAdvisor.decide(viewOf(state, 1), { seed: 7 });
}

/** `defenseFor`와 같은 수를 웹 워커에서 센다(문제 화면이 멈추지 않게) */
export function defenseOffThread(state: ChessState): Promise<Action> {
  return adviseWith<Action>(
    { game: "chess", name: "advisor" },
    viewOf(state, 1),
    7,
    // 워커가 실패하면 같은 수를 화면 스레드에서 센다(문제 화면이 「받는 중」에 멈추지 않게)
    () => defenseFor(state),
  );
}

/** 이 칸을 노리는 백 기물 종류 */
function attackers(board: Board, at: number): Kind[] {
  const kinds = new Set<Kind>();
  board.forEach((cell, from) => {
    if (!cell.startsWith("w")) return;
    // 그 기물 하나만 남긴 판에서 노리는지 본다(가린 기물 없이 그 기물이 닿나).
    const alone = board.map((c, i) =>
      i === from || c === "" || c[0] === "b" ? c : "",
    );
    if (attacked(alone, at, "w")) kinds.add(cell[1] as Kind);
  });
  return [...kinds];
}

const names = (kinds: Kind[]) => kinds.map((k) => KIND_NAMES[k]).join("·");

/**
 * 메이트가 된 판을 말로 풀어 준다: 어느 기물이 체크했고, 킹이 갈 칸을 누가 막나.
 * 장면에서 엔진으로 만들어 문제 데이터와 어긋나지 않는다
 */
export function explainMate(pos: Position, move: Move): string[] {
  const after = applyMove(pos, move);
  const board = after.board;
  const king = kingOf(board, "b");
  const mover = board[move.to] as string;
  const lines = [
    `${obj(KIND_NAMES[mover[1] as Kind])} ${ro(squareName(move.to))}(${moveToSan(pos, move)}): 체크!`,
  ];
  const [kx, ky] = [king % 8, Math.floor(king / 8)];
  const blocked: string[] = [];
  const guarded = new Map<string, string[]>();
  for (const dx of [-1, 0, 1])
    for (const dy of [-1, 0, 1]) {
      if (dx === 0 && dy === 0) continue;
      const x = kx + dx;
      const y = ky + dy;
      if (x < 0 || x > 7 || y < 0 || y > 7) continue;
      const to = y * 8 + x;
      const cell = board[to] ?? "";
      if (cell.startsWith("b")) {
        blocked.push(squareName(to));
        continue;
      }
      // 킹이 그 칸으로 간 판에서 누가 노리나
      const moved = [...board];
      moved[to] = "bK";
      moved[king] = "";
      const who = names(attackers(moved, to));
      if (!who) continue;
      guarded.set(who, [...(guarded.get(who) ?? []), squareName(to)]);
    }
  if (blocked.length > 0)
    lines.push(
      `킹 둘레 ${topic(blocked.join("·"))} 흑 자기 기물이 막고 있어요.`,
    );
  for (const [who, squares] of guarded)
    lines.push(`킹이 피할 ${topic(squares.join("·"))} ${subj(who)} 노려요.`);
  lines.push("막거나 잡을 수도 없어 체크메이트예요.");
  return lines;
}

/**
 * 킹과 폰 끝내기 해설: 왜 이 킹 수만 이기고 폰부터 밀면 비기나.
 * 승패표(`@game/chess-ai`의 `kpk.ts`)로 판단해 문제 데이터와 어긋나지 않는다
 */
export function explainEndgame(pos: Position, move: Move): string[] {
  const after = applyMove(pos, move);
  const wk = kingOf(after.board, "w");
  const bk = kingOf(after.board, "b");
  const [wx, wy] = [wk % 8, Math.floor(wk / 8)];
  const [bx, by] = [bk % 8, Math.floor(bk / 8)];
  const pawn = pos.board.indexOf("wP");
  const lines = [
    `킹을 ${ro(squareName(move.to))}(${moveToSan(pos, move)}): 이 수만 이겨요.`,
  ];
  const facing =
    (wx === bx && Math.abs(wy - by) === 2) ||
    (wy === by && Math.abs(wx - bx) === 2);
  const farFacing =
    (wx === bx && Math.abs(wy - by) === 4) ||
    (wy === by && Math.abs(wx - bx) === 4);
  if (facing)
    lines.push(
      "킹끼리 한 칸 띄우고 마주 섰어요(맞서기). 흑 차례라 흑 킹이 비켜야 하고, 그 틈으로 백 킹이 나아가요.",
    );
  else if (farFacing)
    lines.push(
      "킹끼리 세 칸 띄우고 마주 섰어요(먼 맞서기). 흑 킹이 다가오면 백 킹도 마주 보며 다가가요. 그러면 한 칸 띄우고 마주 선 맞서기가 되고, 흑 킹이 비켜야 해요.",
    );
  else if (wy < Math.floor(pawn / 8))
    lines.push(
      "백 킹이 폰보다 앞 칸을 먼저 차지해요. 흑 킹은 폰 앞을 막지 못하고 밀려나요.",
    );
  else
    lines.push(
      "흑 킹이 막는 쪽을 피해 옆으로 돌아 나가요. 다음 수에 폰 앞 칸으로 들어가 흑 킹을 밀어내요.",
    );
  const push = sanToMove(pos, squareName(pawn - 8));
  if (push)
    lines.push(
      `폰부터 밀면(${moveToSan(pos, push)}) 흑 킹이 폰 앞을 막아 비겨요. 킹이 앞서고 폰은 뒤따라가요.`,
    );
  return lines;
}

/** 백의 바깥 패스 폰: 앞쪽 같은·옆 세로줄에 흑 폰이 없는 백 폰 가운데 흑 폰들에서 가장 먼 것 */
export function outsidePawnOf(board: Board): number | null {
  const black: number[] = [];
  const white: number[] = [];
  board.forEach((c, i) => {
    if (c === "bP") black.push(i);
    else if (c === "wP") white.push(i);
  });
  const passed = white.filter((p) =>
    black.every((b) => Math.abs((b % 8) - (p % 8)) > 1 || b >> 3 >= p >> 3),
  );
  const far = (p: number) =>
    Math.min(...black.map((b) => Math.abs((b % 8) - (p % 8))));
  return passed.sort((a, b) => far(b) - far(a))[0] ?? null;
}

/**
 * 바깥 패스 폰 해설: 흑 킹이 먼 패스 폰에 붙잡힌 사이 백 킹이 반대쪽 흑 폰으로 간다.
 * 판에서 만든다(어느 폰이 바깥 패스 폰인지, 흑 킹이 그 폰 바로 옆인지, 반대쪽 흑 폰은 어디인지).
 * 정답만 이기고 다른 수는 이기지 못한다는 것은 outside.test.ts가 끝까지 읽기로 확인한다
 */
export function explainOutside(pos: Position, move: Move): string[] {
  const outside = outsidePawnOf(pos.board);
  const bk = kingOf(pos.board, "b");
  const mover = pos.board[move.from] as string;
  const kind = KIND_NAMES[mover[1] as Kind];
  const lines = [
    `${obj(kind)} ${ro(squareName(move.to))}(${moveToSan(pos, move)}): 이 수만 이겨요.`,
  ];
  if (outside === null) return lines;
  const file = `${squareName(outside)[0]}폰`;
  // 흑 폰은 세로줄 차례로(f5·h7)
  const blackPawns = pos.board
    .map((c, i) => (c === "bP" ? squareName(i) : null))
    .filter((s): s is string => s !== null)
    .sort()
    .join("·");
  const beside =
    Math.max(
      Math.abs((bk % 8) - (outside % 8)),
      Math.abs((bk >> 3) - (outside >> 3)),
    ) <= 1;
  if (move.from === outside)
    lines.push(
      `흑 킹이 ${file} 바로 옆에 왔어요. 폰을 한 칸 더 밀면 흑 킹은 폰을 잡으러 한 걸음 더 가야 해요. 그만큼 백 킹이 반대쪽 흑 폰(${blackPawns})에 먼저 닿아요.`,
    );
  else if (beside)
    lines.push(
      `${obj(file)} 흑 킹에게 내줘요. 흑 킹이 판 가장자리 쪽에서 ${obj(file)} 잡는 사이, 백 킹은 반대쪽 흑 폰(${blackPawns})을 잡으러 가요.`,
    );
  else
    lines.push(
      `흑 킹은 ${subj(file)} 퀸이 되지 않게 막으러 판 가장자리 쪽으로 가야 해요. 그사이 백 킹은 반대쪽 흑 폰(${blackPawns})을 잡으러 가요.`,
    );
  lines.push("다른 수는 모두 비기거나 져요.");
  return lines;
}
