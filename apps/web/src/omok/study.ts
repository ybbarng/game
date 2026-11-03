import {
  blockFor,
  type Cell,
  createOmokScenario,
  type Forbidden,
  fivePoints,
  forbiddenReason,
  legalMoves,
  type OmokState,
  pointAt,
  pointName,
  STANDARD_RULES,
  type Stone,
  type Variant,
  winningFirstMoves,
  xyOf,
} from "@game/omok-engine";

import type { OmokPuzzle } from "./puzzles";

/** 문제의 규칙. 모두 게임 기본값인 렌주(흑만 3·3·4·4·장목 금지, 2026-10-29 사용자)다 */
export function variantOf(puzzle: OmokPuzzle): Variant {
  return puzzle.variant ?? "renju";
}

/** 문제 장면에서 시작하는 판. 늘 흑(나, 0번 자리)이 둔다 */
export function puzzleState(puzzle: OmokPuzzle): OmokState {
  return createOmokScenario({
    rules: { ...STANDARD_RULES, variant: variantOf(puzzle) },
    black: puzzle.black,
    white: puzzle.white,
  });
}

/** 첫 정답 자리(힌트·정답 보기에 쓴다) */
export function solutionOf(puzzle: OmokPuzzle): number {
  return pointAt(
    puzzle.kind === "attack" ? puzzle.solution : (puzzle.answers[0] as string),
  );
}

const placed = (board: readonly Cell[], at: number, stone: Stone): Cell[] => {
  const next = [...board];
  next[at] = stone;
  return next;
};

/**
 * 내 수를 판정한다. `step`은 지금까지 둔 내 수.
 * - 공격: 다섯이면 푼 것. 첫 수는 정답 자리만, 그다음은 남은 수 안에 사로 몰아 이기는 수면 맞다
 * - 막기: 정답 자리면 푼 것
 */
export function judgeMove(
  puzzle: OmokPuzzle,
  board: readonly Cell[],
  move: number,
  step: number,
): "solved" | "next" | "wrong" {
  if (puzzle.kind === "defend")
    return puzzle.answers.map(pointAt).includes(move) ? "solved" : "wrong";
  const variant = variantOf(puzzle);
  const left = puzzle.moves - step;
  const wins = winningFirstMoves(board, 1, variant, left);
  if (!wins.includes(move)) return "wrong";
  if (fivePoints(board, 1, variant).includes(move)) return "solved";
  if (step === 0 && move !== pointAt(puzzle.solution)) return "wrong";
  return "next";
}

/**
 * 백이 받는 수: 흑의 다섯 자리를 막는다. 다섯 자리가 백에게 금지(3·3)라 막을 수 없으면,
 * 그 자리에서 가장 가까운 둘 수 있는 곳에 둔다(흑이 다음에 다섯). 흑의 다섯 자리가 없으면 null
 */
export function defenseFor(
  board: readonly Cell[],
  variant: Variant = "renju",
): number | null {
  const block = blockFor(board, 1, variant);
  if (block !== null) return block;
  const target = fivePoints(board, 1, variant)[0];
  if (target === undefined) return null;
  const [tx, ty] = xyOf(target);
  const near = (at: number) => {
    const [x, y] = xyOf(at);
    return Math.max(Math.abs(x - tx), Math.abs(y - ty)) * 1000 + at;
  };
  const legal = legalMoves(board, 2, variant).filter(
    (at) => !fivePoints(board, 1, variant).includes(at),
  );
  return legal.sort((a, b) => near(a) - near(b))[0] ?? null;
}

/** 공격 문제의 바른 수순(흑·백 번갈아). 해설과 시험에 쓴다 */
export function mainLine(puzzle: OmokPuzzle): number[] {
  if (puzzle.kind !== "attack") return [];
  const variant = variantOf(puzzle);
  let board = [...puzzleState(puzzle).board];
  const line: number[] = [];
  for (let left = puzzle.moves; left > 0; left--) {
    const move =
      line.length === 0
        ? pointAt(puzzle.solution)
        : winningFirstMoves(board, 1, variant, left)[0];
    if (move === undefined) break;
    line.push(move);
    if (fivePoints(board, 1, variant).includes(move)) break;
    board = placed(board, move, 1);
    const block = defenseFor(board, variant);
    if (block === null) break;
    line.push(block);
    board = placed(board, block, 2);
  }
  return line;
}

/** 막기 문제에서 흑이 두지 않으면 백이 사로 몰아 이기는 수순(백·흑 번갈아, 백 다섯까지) */
function whiteLine(
  start: readonly Cell[],
  within: number,
  variant: Variant,
): number[] {
  let board = [...start];
  const line: number[] = [];
  for (let left = within; left > 0; left--) {
    const move = winningFirstMoves(board, 2, variant, left)[0];
    if (move === undefined) break;
    line.push(move);
    if (fivePoints(board, 2, variant).includes(move)) break;
    board = placed(board, move, 2);
    const block = blockFor(board, 2, variant);
    if (block === null) break;
    line.push(block);
    board = placed(board, block, 1);
  }
  return line;
}

/** 흑 한 수가 무엇을 만들었는지 한 줄로 */
function describe(
  board: readonly Cell[],
  move: number,
  variant: Variant,
): string {
  const name = pointName(move);
  if (fivePoints(board, 1, variant).includes(move)) return `${name}: 다섯!`;
  const after = placed(board, move, 1);
  const threats = fivePoints(after, 1, variant);
  const blockable = threats.filter(
    (at) => forbiddenReason(after, at, 2, variant) === null,
  );
  const block = threats[0];
  if (block !== undefined && blockable.length === 0)
    return `${name}: 사(넷)를 만든다. 백이 막을 ${pointName(block)}은 백에게 3·3 금지라 막을 수 없다`;
  if (threats.length >= 2)
    return `${name}: 다섯 자리가 ${threats.map(pointName).join("·")} 두 곳이 되어 한 번에 다 막을 수 없다`;
  return `${name}: 사(넷)를 만든다. 백은 ${block === undefined ? "막을 곳" : pointName(block)}을 막을 수밖에 없다`;
}

/** 푼 문제의 해설. 장면에서 만든다 */
export function explainSolved(puzzle: OmokPuzzle): string[] {
  const start = [...puzzleState(puzzle).board];
  const variant = variantOf(puzzle);
  if (puzzle.kind === "defend") {
    const answer = puzzle.answers.map(pointAt);
    const threat = whiteLine(start, puzzle.within, variant);
    const first = threat[0];
    const steps = threat
      .map((at, i) => `${i % 2 === 0 ? "백" : "흑"} ${pointName(at)}`)
      .join(" → ");
    return [
      first === undefined
        ? "백이 사로 몰아붙여 이기는 길이 있었다"
        : `그냥 두면 ${steps}: 백이 사로 몰아붙여 다섯을 만든다`,
      first !== undefined && answer.includes(first)
        ? `${pointName(first)}: 백이 노리던 첫 자리를 먼저 차지해 그 길을 끊는다`
        : `${answer.map(pointName).join(" 또는 ")}: 그 길의 급소를 먼저 막아 끊는다`,
    ];
  }
  const line = mainLine(puzzle);
  // 렌주: 금지가 없다면 이겼을 흑 자리(함정)를 먼저 짚는다.
  const lines: string[] = trapsOf(puzzle).map(
    (t) =>
      `${pointName(t.at)}에 두면 이길 것 같지만 흑에게 ${t.reason} 금지라 둘 수 없다`,
  );
  let board = start;
  line.forEach((move, i) => {
    if (i % 2 === 0) lines.push(describe(board, move, variant));
    board = placed(board, move, i % 2 === 0 ? 1 : 2);
  });
  return lines;
}

/**
 * 렌주 문제의 함정: 금지가 없는 규칙(자유)이면 같은 수 안에 이기는 첫 수인데, 렌주에서는 흑에게 금지인 자리.
 * 함정이 없으면 빈 배열(「렌주 금수 피하기」 묶음만 함정이 있다)
 */
export function trapsOf(
  puzzle: OmokPuzzle,
): { at: number; reason: Forbidden }[] {
  if (puzzle.kind !== "attack" || variantOf(puzzle) !== "renju") return [];
  const { board } = puzzleState(puzzle);
  return winningFirstMoves(board, 1, "free", puzzle.moves).flatMap((at) => {
    const reason = forbiddenReason(board, at, 1, "renju");
    return reason ? [{ at, reason }] : [];
  });
}
