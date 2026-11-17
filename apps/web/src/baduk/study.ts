import {
  type Action,
  areaScore,
  type BadukState,
  type Board,
  bestDefense,
  capturesWithin,
  createBadukScenario,
  endgameSize,
  groupOf,
  type LifeProblem,
  ladderDefense,
  ladderMoves,
  legalPoints,
  step as playStep,
  pointAt,
  type Stone,
  solveEndgame,
  tryPlace,
} from "@game/baduk-engine";

import { type BadukPuzzle, LADDER_THEMES } from "./puzzles";

type KoFight = Extract<BadukPuzzle, { kind: "kofight" }>;
type Endgame = Extract<BadukPuzzle, { kind: "endgame" }>;

/** 문제 판 크기: 모두 9줄 판이다 */
export const PUZZLE_SIZE = 9;

const at = (name: string) => pointAt(name, PUZZLE_SIZE);

/**
 * 문제 장면에서 시작하는 판. 늘 흑(나, 0번 자리)이 둔다.
 * 패로 버티기는 `setup`의 수를 실제로 두고 시작한다. 그래서 판 기록이 남아 같은 판 모양 금지(바로 되따내기 금지)가 걸린다
 */
export function puzzleState(puzzle: BadukPuzzle): BadukState {
  const scene = createBadukScenario({
    black: puzzle.black,
    white: puzzle.white,
    me: 1,
  });
  if (puzzle.kind !== "kofight") return scene;
  // setup의 마지막 수는 백이다: 수가 홀수 개면 백부터, 짝수 개면 흑부터 번갈아 둔다
  let state: BadukState = {
    ...scene,
    toPlay: (puzzle.setup.length % 2 === 1 ? 2 : 1) as Stone,
  };
  for (const name of puzzle.setup) {
    const seat = state.toPlay === 1 ? 0 : 1;
    const result = playStep(state, seat, { type: "place", at: at(name) });
    if (!result.ok) throw new Error(`${puzzle.id}: 둘 수 없는 자리 ${name}`);
    state = result.state;
  }
  return state;
}

/** 패로 버티기의 되따낼 자리 */
export const koPointOf = (puzzle: KoFight) => at(puzzle.ko);

/**
 * 패를 지면 잃는 흑 돌(팻감 받기·패 잇기): 흑이 받는 대신 다른 곳에 두었다고 보고(쉬기) 백이 패를 되따낼 때 따이는 돌과,
 * 그때 단수가 되어 흑이 어디에 두어도(쉬기 포함) 백이 다음 수에 따낼 수 있는 흑 돌. 처음 판의 자리로 돌려준다
 */
export function koLossStones(puzzle: KoFight): number[] {
  const start = puzzleState(puzzle);
  const passed = playStep(start, 0, { type: "pass" });
  if (!passed.ok) throw new Error(`${puzzle.id}: 쉴 수 없다`);
  const retaken = playStep(passed.state, 1, {
    type: "place",
    at: koPointOf(puzzle),
  });
  if (!retaken.ok) throw new Error(`${puzzle.id}: 백이 되따낼 수 없다`);
  const after = retaken.state;
  const lost = start.board
    .map((c, p) => (c === 1 && after.board[p] !== 1 ? p : -1))
    .filter((p) => p >= 0);
  const seen = new Set<number>();
  for (let p = 0; p < after.board.length; p++) {
    if (after.board[p] !== 1 || seen.has(p)) continue;
    const group = groupOf(after.board, p);
    for (const s of group.stones) seen.add(s);
    if (group.liberties.length !== 1) continue;
    // 흑이 어디에 두어도 백이 다음 수에 이 무리를 따낼 수 있나
    const replies: (number | null)[] = [...legalPoints(after), null];
    const saved = replies.some((m) => {
      let board = after.board;
      if (m !== null) {
        const tried = tryPlace(board, m, 1);
        if (!tried.ok) return false;
        board = tried.board;
      }
      if (board[p] !== 1) return false;
      const libs = groupOf(board, p).liberties;
      if (libs.length !== 1) return true;
      const capture = tryPlace(board, libs[0] as number, 2);
      return !capture.ok || capture.board[p] === 1;
    });
    if (!saved) lost.push(...group.stones);
  }
  return lost.sort((a, b) => a - b);
}

/** 패를 지면 잃는 흑 돌 수 */
export const koLossOf = (puzzle: KoFight) => koLossStones(puzzle).length;

/** 끝내기 곳(두세 곳)의 자리 번호. 문제마다 곳이 둘 이상이다 */
export const spotsOf = (
  puzzle: Endgame,
): [number[], number[], ...number[][]] => {
  const [a, b, ...rest] = puzzle.spots;
  if (!a || !b) throw new Error(`${puzzle.id}: 끝내기 곳이 둘보다 적다`);
  return [a.map(at), b.map(at), ...rest.map((s) => s.map(at))];
};

/**
 * 끝내기 읽을 범위: 두 곳의 자리 전부. 이미 둔 자리도 넘긴다(엔진은 빈 자리에만 두고,
 * 두 곳에 붙은 무리가 단수가 되면 잇거나 따내는 수를 더 본다). `state`는 부르는 쪽 모양을 맞추려고 받는다
 */
export function endgameArea(puzzle: Endgame, _state?: BadukState): number[] {
  return spotsOf(puzzle).flat();
}

/** 끝내기 한 곳에서 흑이 먼저 둘 때 가장 좋은 첫 수(그 곳 안에서만 읽는다). 그림의 A·B 자리 */
export function spotMoveOf(board: Board, spot: readonly number[]): number {
  const best = solveEndgame(board, spot, 1).best.find((m) => m !== null);
  if (best === undefined || best === null)
    throw new Error("끝내기 곳에 둘 수가 없다");
  return best;
}

/**
 * 끝내기 한 곳을 `first`가 먼저 두어 두 편이 그 곳 안에서 가장 좋게 마무리했을 때, 흑·백 점수가 처음 판보다 몇 점 늘었나.
 * 「흑이 먼저 두면 흑이 2점, 백이 먼저 두면 백이 2점 늘어 4점짜리」처럼 단원 글이 쓴다
 */
export function endgameGain(
  board: Board,
  spot: readonly number[],
  first: Stone,
): { black: number; white: number } {
  let now = board;
  let turn = first;
  let passes = 0;
  for (let i = 0; i < 40 && passes < 2; i++) {
    const move = solveEndgame(now, spot, turn, passes > 0).best[0] ?? null;
    if (move === null) passes++;
    else {
      const placed = tryPlace(now, move, turn);
      if (!placed.ok) throw new Error("끝내기 수를 둘 수 없다");
      now = placed.board;
      passes = 0;
    }
    turn = turn === 1 ? 2 : 1;
  }
  const before = areaScore(board);
  const after = areaScore(now);
  return {
    black: after.black - before.black,
    white: after.white - before.white,
  };
}

/** 끝내기 곳마다의 크기(처음 판에서, 곳마다 따로 읽는다) */
export function spotSizesOf(puzzle: Endgame): [number, number, ...number[]] {
  const { board } = puzzleState(puzzle);
  const [a, b, ...rest] = spotsOf(puzzle);
  return [
    endgameSize(board, a),
    endgameSize(board, b),
    ...rest.map((s) => endgameSize(board, s)),
  ];
}

/** 노리는(살릴) 무리의 돌 자리 */
export const targetOf = (puzzle: BadukPuzzle) => at(puzzle.target);

/** 첫 정답 자리 */
export const solutionOf = (puzzle: BadukPuzzle) => at(puzzle.solution);

/** 사활 문제의 읽는 범위 */
export function lifeProblem(
  puzzle: Extract<BadukPuzzle, { kind: "life" }>,
): LifeProblem {
  return { target: targetOf(puzzle), area: puzzle.area.map(at) };
}

/**
 * 내 수를 판정한다.
 * - 사활: 첫 수가 정답이면 푼 것이다
 * - 잡기: 노리는 돌을 따내면 푼 것이다. 첫 수는 정답 자리만, 그다음은 남은 수 안에 따내는 수면 맞다.
 *   긴 축·축머리는 그다음 수도 축(단수만 쳐서 잡는 길)으로 남은 수 안에 따내야 맞다
 * - 팻감 쓰기: 첫 수는 팻감, 백이 받은 뒤 둘째 수로 되따내면 푼 것이다
 * - 팻감 받기: 첫 수로 받으면 푼 것이다
 */
export function judgeMove(
  puzzle: BadukPuzzle,
  state: BadukState,
  move: number,
  step: number,
): "solved" | "next" | "wrong" {
  if (puzzle.kind === "life")
    return move === solutionOf(puzzle) ? "solved" : "wrong";
  if (puzzle.kind === "endgame") {
    if (step === 0) {
      if (move !== solutionOf(puzzle)) return "wrong";
      // 큰 곳부터는 한 수로 끝나고, 선수·역끝내기·양선수는 백이 둔 뒤 남은 곳까지 둔다
      return puzzle.mode === "bigger" ? "solved" : "next";
    }
    const best = solveEndgame(state.board, endgameArea(puzzle, state), 1).best;
    return best.includes(move) ? "solved" : "wrong";
  }
  if (puzzle.kind === "kofight") {
    if (puzzle.mode !== "threat")
      return move === solutionOf(puzzle) ? "solved" : "wrong";
    if (step === 0) return move === solutionOf(puzzle) ? "next" : "wrong";
    return move === koPointOf(puzzle) ? "solved" : "wrong";
  }
  const target = targetOf(puzzle);
  const placed = tryPlace(state.board, move, 1);
  if (!placed.ok) return "wrong";
  if (placed.board[target] !== 2) return "solved";
  if (step === 0) return move === solutionOf(puzzle) ? "next" : "wrong";
  if (LADDER_THEMES.includes(puzzle.theme)) {
    const n = ladderMoves(
      state.board,
      1,
      target,
      move,
      new Set(state.positions),
    );
    return n !== null && n <= puzzle.within - step ? "next" : "wrong";
  }
  return capturesWithin(state.board, 1, target, move, puzzle.within - step)
    ? "next"
    : "wrong";
}

/**
 * 상대(백)가 받는 수: 따내는 데 가장 오래 걸리게 버틴다. 버틸 수가 없으면 쉰다.
 * 같은 판 모양 금지를 지킨다(패를 바로 되따내지 않는다). 같은 판은 늘 같은 수.
 * 팻감 쓰기는 정해진 받는 수(`reply`)로 받는다
 */
export function defenseFor(
  puzzle: BadukPuzzle,
  state: BadukState,
  step: number,
): Action {
  if (puzzle.kind === "endgame") {
    // 백은 두 곳 안에서 가장 좋은 수로 받는다(같은 판은 늘 같은 수: 자리 차례대로 첫 것)
    const best = solveEndgame(state.board, endgameArea(puzzle, state), 2).best;
    const first = best.find((m) => m !== null);
    return first === undefined || first === null
      ? { type: "pass" }
      : { type: "place", at: first };
  }
  if (puzzle.kind === "kofight")
    return puzzle.reply
      ? { type: "place", at: at(puzzle.reply) }
      : { type: "pass" };
  if (puzzle.kind !== "capture") return { type: "pass" };
  if (LADDER_THEMES.includes(puzzle.theme)) {
    const d = ladderDefense(state.board, 1, targetOf(puzzle), state.positions);
    return d === null ? { type: "pass" } : { type: "place", at: d };
  }
  const left = Math.max(0, puzzle.within - step - 1);
  // 판 기록을 넘겨 패 되따내기(같은 판 모양)는 두지 않는다
  const d = bestDefense(
    state.board,
    1,
    targetOf(puzzle),
    left,
    state.positions,
  );
  return d === null ? { type: "pass" } : { type: "place", at: d };
}
