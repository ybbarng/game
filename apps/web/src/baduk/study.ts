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
  pointName,
  type Stone,
  solveEndgame,
  tryPlace,
} from "@game/baduk-engine";

import {
  type BadukPuzzle,
  LADDER_THEMES,
  LIFE_SHAPE_NAMES,
  type LifeShape,
} from "./puzzles";

type KoFight = Extract<BadukPuzzle, { kind: "kofight" }>;
type Endgame = Extract<BadukPuzzle, { kind: "endgame" }>;

/** 문제 판 크기: 모두 9줄 판이다 */
export const PUZZLE_SIZE = 9;

const at = (name: string) => pointAt(name, PUZZLE_SIZE);
const named = (p: number) => pointName(p, PUZZLE_SIZE);

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
    if (!result.ok) throw new Error(`${puzzle.id}: ${name}를 둘 수 없다`);
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

/** 끝내기 두 곳의 자리 번호 */
export const spotsOf = (puzzle: Endgame): [number[], number[]] => [
  puzzle.spots[0].map(at),
  puzzle.spots[1].map(at),
];

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

/** 끝내기 두 곳의 크기(처음 판에서, 곳마다 따로 읽는다) */
export function spotSizesOf(puzzle: Endgame): [number, number] {
  const { board } = puzzleState(puzzle);
  const [a, b] = spotsOf(puzzle);
  return [endgameSize(board, a), endgameSize(board, b)];
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
      return puzzle.mode === "sente" ? "next" : "solved";
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

/** 이름 있는 눈 모양의 해설: 이름(풀이)과 급소, 덧붙일 말 */
const SHAPE_TEXT: Record<
  LifeShape,
  { name: string; vital: string; note?: string }
> = {
  "straight-three": {
    name: `${LIFE_SHAPE_NAMES["straight-three"]}(곧은 세 집)`,
    vital: "가운데가 급소예요.",
  },
  "bent-three": {
    name: `${LIFE_SHAPE_NAMES["bent-three"]}(구부러진 세 집)`,
    vital: "꺾인 자리가 급소예요.",
  },
  "pyramid-four": {
    name: LIFE_SHAPE_NAMES["pyramid-four"],
    vital: "세 집에 붙은 가운데가 급소예요.",
    note: "곧은 네 집(직사)·구부러진 네 집(곡사)은 상대가 한 곳을 막아도 다른 곳에 두면 두 눈이 되어 그대로 살고, 네모 네 집은 그대로 죽어요.",
  },
  "flower-five": {
    name: `${LIFE_SHAPE_NAMES["flower-five"]}(십자 다섯 집)`,
    vital: "네 집에 붙은 한가운데가 급소예요.",
  },
  "bulky-five": {
    name: LIFE_SHAPE_NAMES["bulky-five"],
    vital:
      "네모 네 집에 한 집이 붙은 모양이에요. 세 집에 붙은 자리가 급소예요.",
  },
  "rabbity-six": {
    name: `${LIFE_SHAPE_NAMES["rabbity-six"]}(꽃 여섯 집)`,
    vital: "네 집에 붙은 가운데가 급소예요.",
  },
};

const COUNT = ["", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟"];

/** 푼 문제의 해설. 장면과 둔 수에서 만든다 */
export function explainSolved(
  puzzle: BadukPuzzle,
  before: Board,
  move: number,
  movesPlayed: number,
): string[] {
  if (puzzle.kind === "life") {
    if (puzzle.shape) {
      const text = SHAPE_TEXT[puzzle.shape];
      const lines =
        puzzle.goal === "live"
          ? [
              `${text.name}: ${text.vital}`,
              `${named(move)}에 두면 눈 자리가 떨어진 두 눈 이상으로 나뉘어 살아요.`,
              "백이 먼저 이 급소를 차지하면 한 눈뿐이라 잡혀요.",
            ]
          : [
              `${text.name}: ${text.vital}`,
              `${named(move)}에 두면 백은 눈을 둘로 나눌 수 없어요. 안을 채워 가면 끝내 따내요.`,
              "백이 먼저 이 급소를 차지하면 두 눈이 되어 살아요.",
            ];
      return text.note ? [...lines, text.note] : lines;
    }
    const placed = tryPlace(before, move, 1);
    const took = placed.ok ? placed.captured.length : 0;
    if (puzzle.goal === "live")
      return [
        took > 0
          ? `${named(move)}: 안쪽 백 돌을 따내며 눈 자리를 둘로 나눠요.`
          : `${named(move)}: 눈 자리를 둘로 나눠요.`,
        "떨어진 두 눈이 있으면 백은 어느 눈에도 들어올 수 없어 잡히지 않아요.",
        "다른 자리에 두면 백이 먼저 그 자리를 차지해 한 눈뿐이 돼요.",
      ];
    return [
      `${named(move)}: 백 눈 자리의 급소에 둬요.`,
      "백은 눈을 둘로 나눌 수 없어 한 눈뿐이에요. 결국 따낼 수 있어요.",
      "다른 자리에 두면 백이 그 자리를 차지해 두 눈을 만들어요.",
    ];
  }
  if (puzzle.kind === "kofight") return explainKoFight(puzzle);
  if (puzzle.kind === "endgame") return explainEndgame(puzzle);
  const target = targetOf(puzzle);
  const size = groupOf(before, target).stones.length;
  const first = named(solutionOf(puzzle));
  const lines: Record<typeof puzzle.theme, string[]> = {
    atari: [
      `${first}에서 단수를 쳐요. 백이 넓은 쪽으로 달아날 길을 먼저 막아요.`,
      "반대쪽에서 단수를 치면 백이 뻗어 활로가 늘어나요.",
    ],
    ladder: [
      `${first}에서 단수를 시작해 계속 단수로 몰아요(축).`,
      "백은 한쪽으로만 뻗을 수 있고, 끝내 판 끝이나 흑 돌에 막혀 잡혀요.",
    ],
    net: [
      `${first}: 바로 단수 치지 않고 한 칸 떨어져 길을 막아요(장문).`,
      "백이 어느 쪽으로 나와도 다음 단수에 잡혀요.",
    ],
    snapback: [
      `${first}: 일부러 한 점을 내줘요(먹여치기). 백 무리는 단수가 돼요.`,
      `백이 이 돌을 따내도 활로가 하나뿐이라, 흑이 ${first}에 다시 두어 되따내요(환격).`,
    ],
    ko: [
      `${first}: 패를 따내며 단수를 쳐요.`,
      "백은 바로 되따낼 수 없어요(같은 판 모양 금지). 한 번 다른 곳에 두어야 해서 달아날 틈이 없어요.",
    ],
    "long-ladder": [
      `${first}에서 단수를 쳐 백을 판 끝까지 몰았어요(긴 축).`,
      "반대쪽에서 단수를 치면 백이 뻗은 자리 옆에 흑 돌이 없어 활로가 셋이 되고 빠져나가요.",
    ],
    "blocked-net": [
      `${(puzzle.breakers ?? []).join("·")} 백 돌이 축머리예요. 어느 쪽에서 단수를 쳐도 백이 뻗다가 축머리와 이어져 축으로는 못 잡아요.`,
      `${first}: 바로 단수 치지 않고 한 칸 떨어져 길을 막아요(장문). 백이 달아나려고 뻗어도 흑이 막아 따내요.`,
    ],
    breaker: [
      `${puzzle.breaker ?? ""} 백 돌이 축머리예요. 그쪽으로 몰면 백이 이 돌과 이어져 활로가 늘고 빠져나가요.`,
      `${first}에서 단수를 치면 백이 뻗어 가는 길에 축머리가 없어 잡혀요.`,
    ],
  };
  // 아홉 수부터는 숫자로. 「돌을」·「돌 2개를」처럼 조사는 끝 낱말에 맞춘다
  const count = COUNT[movesPlayed]
    ? `${COUNT[movesPlayed]} 수`
    : `${movesPlayed}수`;
  const stones = size > 1 ? `백 돌 ${size}개를` : "백 돌을";
  return [...lines[puzzle.theme], `${count} 만에 ${stones} 따냈어요.`];
}

/** 자리 이름 뒤 조사 「은/는」: 끝 숫자를 읽는 소리로 고른다(일·삼·육·칠·팔은 받침이 있다) */
export const eunNeun = (name: string) =>
  /[13678]$/.test(name) ? `${name}은` : `${name}는`;

/** 패로 버티기의 해설. 노림받은 무리의 돌 수는 처음 판에서 센다 */
function explainKoFight(puzzle: KoFight): string[] {
  const start = puzzleState(puzzle).board;
  const size = groupOf(start, targetOf(puzzle)).stones.length;
  const ko = puzzle.ko;
  if (puzzle.mode === "threat")
    return [
      `${eunNeun(puzzle.solution)} 팻감이에요. 백 ${COUNT[size]} 점이 단수가 되어, 백이 받지 않으면 따내요.`,
      `백이 ${puzzle.reply ?? ""}에 받아 판 모양이 달라졌어요. 그래서 ${ko}에 되따낼 수 있어요.`,
      "이제 백이 다시 따내려면 백도 먼저 팻감을 써야 해요.",
    ];
  const threat = puzzle.setup[puzzle.setup.length - 1] ?? "";
  const loss = koLossOf(puzzle);
  if (puzzle.mode === "connect")
    return [
      `백 ${eunNeun(threat)} 팻감이에요. 흑 ${COUNT[size]} 점이 단수가 됐어요.`,
      `패를 지면 흑 ${COUNT[loss]} 점을 잃어요. 패에 걸린 한 점에, 백이 되따내면 함께 단수가 되어 살릴 수 없는 ${COUNT[loss - 1]} 점을 더한 수예요.`,
      `노리는 돌(${COUNT[size]} 점)이 패를 지면 잃는 돌(${COUNT[loss]} 점)보다 적어요. 그래서 ${ko}에 이어 패를 끝내고, 노린 돌은 내줘요.`,
    ];
  return [
    `백 ${eunNeun(threat)} 팻감이에요. 흑 ${COUNT[size]} 점이 단수가 됐어요.`,
    `${puzzle.solution}에 두어 받았어요. 노리는 돌(${COUNT[size]} 점)이 패를 지면 잃는 돌(${COUNT[loss]} 점)보다 많아 받는 쪽이 나아요.`,
    `받았으니 백은 ${ko}에 되따낼 수 있어요. 그러면 이번엔 흑이 팻감을 쓸 차례예요.`,
  ];
}

/** 끝내기 해설. 크기는 처음 판에서 곳마다 엔진으로 센다 */
function explainEndgame(puzzle: Endgame): string[] {
  const start = puzzleState(puzzle);
  const spots = spotsOf(puzzle);
  const sizes = spotSizesOf(puzzle);
  const mine = spots[0].includes(solutionOf(puzzle)) ? 0 : 1;
  const other = mine === 0 ? 1 : 0;
  const label = ["A", "B"] as const;
  const sol = `${label[mine]}(${puzzle.solution})`;
  if (puzzle.mode === "bigger")
    return [
      `A는 ${sizes[0]}점짜리, B는 ${sizes[1]}점짜리 후수 끝내기예요.`,
      `큰 곳 ${sol}부터 둬요. 작은 ${label[other]}부터 두면 백이 ${label[mine]}에 먼저 둬요.`,
    ];
  const placed = tryPlace(start.board, solutionOf(puzzle), 1);
  let threatened = 0;
  if (placed.ok) {
    const seen = new Set<number>();
    for (let p = 0; p < placed.board.length; p++) {
      if (placed.board[p] !== 2 || seen.has(p)) continue;
      const g = groupOf(placed.board, p);
      for (const s of g.stones) seen.add(s);
      // 처음 판에서 이미 단수였던 돌은 빼고, 이 수로 새로 단수가 된 돌만 센다
      if (
        g.liberties.length === 1 &&
        groupOf(start.board, p).liberties.length > 1
      )
        threatened += g.stones.length;
    }
  }
  const compare =
    sizes[mine] < sizes[other]
      ? `${label[other]}(${sizes[other]}점짜리)보다 작은 ${sizes[mine]}점짜리지만`
      : `${label[other]}와 같은 ${sizes[mine]}점짜리지만`;
  return [
    `${sol}에 두면 백 ${COUNT[threatened]} 점이 단수가 돼요. 백이 받지 않으면 흑이 따내니 백이 받아야 해요. 그래서 선수예요.`,
    `${compare}, 선수라 먼저 뒀어요. 백이 받은 사이 ${label[other]}도 흑이 먼저 뒀어요.`,
    `${label[other]}부터 두면 후수라 차례가 백에게 넘어가고, 백이 ${label[mine]}에 먼저 둬요.`,
  ];
}
