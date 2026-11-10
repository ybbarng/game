import {
  blockFor,
  type Cell,
  createOmokScenario,
  type Forbidden,
  fivePoints,
  forbiddenReason,
  fourMoves,
  indexOf,
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
  if (puzzle.kind !== "attack")
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

/**
 * 자리 이름 뒤 조사. 읽는 소리의 끝 숫자(일·삼·육·칠·팔·십은 받침이 있다)로 고른다.
 * 예: `withJosa("K8", "을", "를")` → "K8을", `withJosa("H9", "을", "를")` → "H9를"
 */
export function withJosa(name: string, hasFinal: string, noFinal: string) {
  const last = name.at(-1);
  return `${name}${last !== undefined && "013678".includes(last) ? hasFinal : noFinal}`;
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
    return `${name}: 넷을 만들어요. 백이 막을 ${withJosa(pointName(block), "은", "는")} 백에게 3·3 금지라 막을 수 없어요.`;
  if (threats.length >= 2)
    return `${name}: 다섯 자리가 ${threats.map(pointName).join("·")} 두 곳이 되어 한 번에 다 막을 수 없어요.`;
  return `${name}: 넷을 만들어요. 백은 ${block === undefined ? "막을 곳을" : withJosa(pointName(block), "을", "를")} 막을 수밖에 없어요.`;
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
        ? "백이 넷으로 몰아붙여 이기는 길이 있었어요."
        : `그냥 두면 ${steps}: 백이 넷으로 몰아붙여 다섯을 만들어요.`,
      first !== undefined && answer.includes(first)
        ? `${pointName(first)}: 백이 노리던 첫 자리를 먼저 차지해 그 길을 끊어요.`
        : `${answer.map(pointName).join(" 또는 ")}: 그 길에서 백이 꼭 지나야 하는 자리를 먼저 막아 끊어요.`,
    ];
  }
  if (puzzle.kind === "pick") return explainPick(puzzle, start, variant);
  const line = mainLine(puzzle);
  // 렌주: 금지가 없다면 이겼을 흑 자리(함정)를 먼저 짚는다.
  const lines: string[] = trapsOf(puzzle).map(
    (t) =>
      `${pointName(t.at)}에 두면 이길 것 같지만 흑에게 ${t.reason} 금지라 둘 수 없어요.`,
  );
  if (puzzle.race) {
    const theirs = winningFirstMoves(start, 2, variant, 2).map(pointName);
    lines.unshift(
      `백은 ${theirs.join("·")}에 두면 막을 수 없는 넷이 되지만, 흑이 넷으로 몰면 백은 막기만 해야 해서 흑이 먼저 이겨요.`,
    );
  }
  let board = start;
  line.forEach((move, i) => {
    if (i % 2 === 0) lines.push(describe(board, move, variant));
    board = placed(board, move, i % 2 === 0 ? 1 : 2);
  });
  return lines;
}

type Pick = Extract<OmokPuzzle, { kind: "pick" }>;

/** 흑이 `at`에 두면 백의 열린 셋을 막는가(백이 사로 몰아 3수 안에 이기지 못한다) */
export function blocksThree(
  board: readonly Cell[],
  at: number,
  variant: Variant,
): boolean {
  return winningFirstMoves(placed(board, at, 1), 2, variant, 3).length === 0;
}

/**
 * 백의 열린 셋을 막는 흑 자리 모두. 백이 막을 수 없는 넷을 만드는 자리(`winningFirstMoves` 2수)를 지나는
 * 네 줄의 네 칸 안, 그리고 흑이 사를 만드는 자리만 본다: 그 밖에 두면 그 넷이 그대로 통해 막지 못한다
 */
export function blockingMoves(
  board: readonly Cell[],
  variant: Variant,
): number[] {
  const near = new Set<number>(fourMoves(board, 1, variant));
  for (const w of winningFirstMoves(board, 2, variant, 2)) {
    const [x, y] = xyOf(w);
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ] as const)
      for (let k = -4; k <= 4; k++) {
        const nx = x + k * dx;
        const ny = y + k * dy;
        if (nx < 0 || nx >= 15 || ny < 0 || ny >= 15) continue;
        if (board[indexOf(nx, ny)] === 0) near.add(indexOf(nx, ny));
      }
  }
  return [...near]
    .sort((a, b) => a - b)
    .filter(
      (at) =>
        forbiddenReason(board, at, 1, variant) === null &&
        blocksThree(board, at, variant),
    );
}

/** 흑이 `at`에 두면 흑 열린 셋이 생기는가(다음 수에 막을 수 없는 넷을 둘 수 있다) */
export function buildsThree(
  board: readonly Cell[],
  at: number,
  variant: Variant,
): boolean {
  return winningFirstMoves(placed(board, at, 1), 1, variant, 2).length > 0;
}

/** 첫 돌 H8에서 백 둘째 수가 가로·세로로 붙었나(직접) */
function isDirect(white: string): boolean {
  const [x, y] = xyOf(pointAt(white));
  const [cx, cy] = xyOf(pointAt("H8"));
  return x === cx || y === cy;
}

function explainPick(
  puzzle: Pick,
  start: readonly Cell[],
  variant: Variant,
): string[] {
  const answers = puzzle.answers.join(" 또는 ");
  if (puzzle.reason === "opening") {
    const white = puzzle.white[0] as string;
    const direct = isDirect(white);
    return [
      `${answers}: ${direct ? "화월" : "포월"}이에요. 백이 ${direct ? "가로·세로로(직접)" : "대각선으로(간접)"} 붙었을 때(백 ${white}), 셋째 돌을 첫 돌의 대각선 옆이면서 백 돌과 가로나 세로 한 줄인 자리에 둔 모양이에요.`,
      "렌주 연구에서 흑이 이긴다고 밝혀진 첫 세 수 모양이에요.",
    ];
  }
  const { answer, others, next } = buildPoints(puzzle, start, variant);
  return [
    `${answers}: 백 열린 셋을 막으면서 흑 열린 셋도 만들어요. 다음에 ${next.map(pointName).join("·")}에 두면 막을 수 없는 넷이라, 이번엔 백이 막아야 해요.`,
    `다른 막는 자리(${others
      .filter((at) => at !== answer)
      .map(pointName)
      .join("·")})는 막기만 하고 흑 셋은 생기지 않아요.`,
  ];
}

/** 막으며 키우기 문제: 정답, 다른 막는 자리, 정답 뒤 흑이 막을 수 없는 넷을 두는 자리 */
function buildPoints(puzzle: Pick, start: readonly Cell[], variant: Variant) {
  const answer = pointAt(puzzle.answers[0] as string);
  const others = blockingMoves(start, variant).filter((at) => at !== answer);
  const next = winningFirstMoves(placed(start, answer, 1), 1, variant, 2);
  return { answer, others, next };
}

/**
 * 해설이 짚는 자리(판 위 표시). `main`은 정답, `other`는 해설이 말하는 다른 자리
 * (함정·상대의 노림·다른 막는 자리·바른 수순의 다음 수 등)
 */
export function explainMarks(puzzle: OmokPuzzle): {
  main: number[];
  other: number[];
} {
  const start = [...puzzleState(puzzle).board];
  const variant = variantOf(puzzle);
  if (puzzle.kind === "defend") {
    const main = puzzle.answers.map(pointAt);
    const threat = whiteLine(start, puzzle.within, variant).filter(
      (at, i) => i % 2 === 0 && !main.includes(at),
    );
    return { main, other: threat };
  }
  if (puzzle.kind === "pick") {
    if (puzzle.reason === "opening")
      return {
        main: puzzle.answers.map(pointAt),
        other: puzzle.white.map(pointAt),
      };
    const { answer, others, next } = buildPoints(puzzle, start, variant);
    return { main: [answer], other: [...others, ...next] };
  }
  const main = pointAt(puzzle.solution);
  const other = [
    ...trapsOf(puzzle).map((t) => t.at),
    ...(puzzle.race ? winningFirstMoves(start, 2, variant, 2) : []),
    ...mainLine(puzzle).filter((_at, i) => i > 0 && i % 2 === 0),
  ];
  return { main: [main], other };
}

/**
 * 렌주 문제의 함정: 금지가 없는 규칙(자유)이면 같은 수 안에 이기는 첫 수인데, 렌주에서는 흑에게 금지인 자리.
 * 함정이 없으면 빈 배열. 「렌주 금수 피하기」 묶음은 함정이 꼭 있고, 다른 묶음에도 있을 수 있다(예: open-four-10). 있으면 해설 첫머리에 짚는다
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
