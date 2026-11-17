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
  threatReplies,
  threatWinFirstMoves,
  threatWinLength,
  type Variant,
  winningFirstMoves,
  winPointsOf,
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

type Attack = Extract<OmokPuzzle, { kind: "attack" }>;

/**
 * 공격 문제에서 흑이 `left`수 안에 이기는 첫 수들. 보통은 사로만 몰아붙이고,
 * `threes` 문제는 열린 셋 같은 셋 위협도 쓴다(엔진 `vct.ts`)
 */
function firstWins(
  puzzle: Attack,
  board: readonly Cell[],
  left: number,
): number[] {
  const variant = variantOf(puzzle);
  return puzzle.threes
    ? threatWinFirstMoves(board, 1, variant, left)
    : winningFirstMoves(board, 1, variant, left);
}

/**
 * 내 수를 판정한다. `step`은 지금까지 둔 내 수.
 * - 공격: 다섯이면 푼 것. 첫 수는 정답 자리만, 그다음은 남은 수 안에 몰아 이기는 수면 맞다
 *   (사로만, `threes` 문제는 셋 위협도)
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
  // 첫 수는 정답 자리만 맞다(정답이 하나뿐인 것은 시험이 본다). 읽기 전에 거른다.
  if (step === 0 && move !== pointAt(puzzle.solution)) return "wrong";
  const left = puzzle.moves - step;
  const wins = firstWins(puzzle, board, left);
  if (!wins.includes(move)) return "wrong";
  if (fivePoints(board, 1, variant).includes(move)) return "solved";
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

/**
 * 공격 문제에서 백이 받는 수. 흑이 넷이면 다섯 자리를 막는다(`defenseFor`).
 * `threes` 문제에서 흑이 셋 위협을 두었으면, 막는 수 가운데 흑이 이기기까지 가장 오래 걸리는 수를 둔다
 * (같으면 백 넷으로 버티는 수보다 막는 수, 그다음 자리 번호 순). 그래서 바른 수순이 늘 정해진 수만큼 길다
 */
export function replyFor(
  puzzle: OmokPuzzle,
  board: readonly Cell[],
): number | null {
  const variant = variantOf(puzzle);
  if (
    puzzle.kind !== "attack" ||
    !puzzle.threes ||
    fivePoints(board, 1, variant).length > 0
  )
    return defenseFor(board, variant);
  // 막을 수 없는 자리가 둘 이상 갈라져 있어 막는 수가 없으면, 그 가운데 하나를 차지한다(어차피 진다).
  const replies = threatReplies(board, 1, variant);
  const tries = replies.length > 0 ? replies : winPointsOf(board, 1, variant);
  let best: { at: number; length: number; four: boolean } | null = null;
  for (const at of tries) {
    const after = placed(board, at, 2);
    const length =
      threatWinLength(after, 1, variant, puzzle.moves) ?? puzzle.moves + 1;
    const four = fivePoints(after, 2, variant).length > 0;
    if (
      best === null ||
      length > best.length ||
      (length === best.length && best.four && !four)
    )
      best = { at, length, four };
  }
  return best?.at ?? null;
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
        : firstWins(puzzle, board, left)[0];
    if (move === undefined) break;
    line.push(move);
    if (fivePoints(board, 1, variant).includes(move)) break;
    board = placed(board, move, 1);
    const block = replyFor(puzzle, board);
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
  const traps = trapsOf(puzzle);
  const lines: string[] = traps.map((t) =>
    puzzle.threes && t.reason === "3·3"
      ? `${pointName(t.at)}에 두면 열린 셋이 둘 생겨 이길 것 같지만 흑에게 3·3 금지라 둘 수 없어요.`
      : `${pointName(t.at)}에 두면 이길 것 같지만 흑에게 ${t.reason} 금지라 둘 수 없어요.`,
  );
  const trapAts = traps.map((t) => t.at);
  if (puzzle.race) {
    const theirs = winningFirstMoves(start, 2, variant, 2).map(pointName);
    lines.unshift(
      `백은 ${theirs.join("·")}에 두면 열린 넷이 되지만, 흑이 넷으로 몰면 백은 막기만 해야 해서 흑이 먼저 이겨요.`,
    );
  }
  let board = start;
  line.forEach((move, i) => {
    if (i % 2 === 0)
      lines.push(
        puzzle.threes
          ? describeThreat(
              board,
              move,
              line[i + 1],
              variant,
              i > 0 && trapAts.includes(move),
            )
          : describe(board, move, variant),
      );
    board = placed(board, move, i % 2 === 0 ? 1 : 2);
  });
  return lines;
}

/**
 * 셋 위협 문제에서 흑 한 수가 무엇을 만들었는지 한 줄로. `reply`는 그 뒤 백이 둔 자리.
 * `wasTrap`이면 처음에 3·3 금지였던 자리가 왜 이제 둘 수 있는지 앞에 짚는다
 */
function describeThreat(
  board: readonly Cell[],
  move: number,
  reply: number | undefined,
  variant: Variant,
  wasTrap: boolean,
): string {
  const lead = describeThreatMove(board, move, reply, variant);
  if (!wasTrap) return lead;
  const name = pointName(move);
  return `${name}: 처음에는 3·3 금지였지만, 백이 셋 하나를 막아 이제는 둘 수 있어요. ${lead.slice(name.length + 2)}`;
}

function describeThreatMove(
  board: readonly Cell[],
  move: number,
  reply: number | undefined,
  variant: Variant,
): string {
  const name = pointName(move);
  if (fivePoints(board, 1, variant).includes(move)) return `${name}: 다섯!`;
  const after = placed(board, move, 1);
  const theirs = fivePoints(board, 2, variant);
  const threats = fivePoints(after, 1, variant);
  const answer = reply === undefined ? "" : pointName(reply);
  const replyFour =
    reply !== undefined &&
    fivePoints(placed(after, reply, 2), 2, variant).length > 0;
  const whiteText = replyFour
    ? ` 백은 ${withJosa(answer, "으로", "로")} 넷을 만들어 버텨요.`
    : "";
  if (theirs.includes(move))
    return `${name}: 백의 넷을 막아요. 앞서 만든 셋은 그대로 살아 있어요.${whiteText}`;
  if (threats.length >= 2)
    return `${name}: 다섯 자리가 ${threats.map(pointName).join("·")} 두 곳이 되어 한 번에 다 막을 수 없어요.`;
  if (threats.length === 1) {
    const three = winPointsOf(
      placed(after, threats[0] as number, 2),
      1,
      variant,
    );
    return three.length > 0
      ? `${name}: 넷과 열린 셋을 한 번에 만들어요(4·3). 백은 넷을 ${pointName(threats[0] as number)}에서 막을 수밖에 없고, 흑은 남은 셋을 열린 넷으로 이어요.`
      : `${name}: 넷을 만들어요. 백은 ${withJosa(pointName(threats[0] as number), "을", "를")} 막을 수밖에 없어요.`;
  }
  const open = winPointsOf(after, 1, variant);
  if (replyFour)
    return `${name}: 셋을 만들어요. 그냥 두면 ${open.map(pointName).join("·")}에 두어 이겨요.${whiteText}`;
  // 다음 수가 한 줄에 다섯 자리 둘을 만드는 자리면 열린 넷, 아니면(넷과 셋이 갈라 생기는 자리) 4·3이다.
  const fours = open.filter(
    (w) => fivePoints(placed(after, w, 1), 1, variant).length >= 2,
  );
  const next =
    fours.length === open.length
      ? "열린 넷이 돼요"
      : "넷과 열린 셋이 한 번에 생겨요(4·3)";
  return `${name}: 열린 셋을 만들어요. 그냥 두면 다음에 ${open.map(pointName).join("·")}에 두어 ${next}. 그래서 백은 ${answer}에 두어 이 셋을 막아요.`;
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
    `${answers}: 백 열린 셋을 막으면서 흑 열린 셋도 만들어요. 다음에 ${next.map(pointName).join("·")}에 두면 열린 넷이라, 이번엔 백이 막아야 해요.`,
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
  const free = puzzle.threes
    ? threatWinFirstMoves(board, 1, "free", puzzle.moves)
    : winningFirstMoves(board, 1, "free", puzzle.moves);
  return free.flatMap((at) => {
    const reason = forbiddenReason(board, at, 1, "renju");
    return reason ? [{ at, reason }] : [];
  });
}
