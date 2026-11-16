import {
  type Action,
  type BadukState,
  type Board,
  bestDefense,
  capturesWithin,
  createBadukScenario,
  groupOf,
  type LifeProblem,
  ladderDefense,
  ladderMoves,
  step as playStep,
  pointAt,
  pointName,
  type Stone,
  tryPlace,
} from "@game/baduk-engine";

import {
  type BadukPuzzle,
  LADDER_THEMES,
  LIFE_SHAPE_NAMES,
  type LifeShape,
} from "./puzzles";

type KoFight = Extract<BadukPuzzle, { kind: "kofight" }>;

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
  if (puzzle.kind === "kofight") {
    if (puzzle.mode === "answer")
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
    vital: "가운데가 급소다",
  },
  "bent-three": {
    name: `${LIFE_SHAPE_NAMES["bent-three"]}(구부러진 세 집)`,
    vital: "꺾인 자리가 급소다",
  },
  "pyramid-four": {
    name: LIFE_SHAPE_NAMES["pyramid-four"],
    vital: "세 집에 붙은 가운데가 급소다",
    note: "곧은 네 집(직사)·구부러진 네 집(곡사)은 상대가 한 곳을 막아도 다른 곳에 두면 두 눈이 되어 그대로 살고, 네모 네 집은 그대로 죽는다",
  },
  "flower-five": {
    name: `${LIFE_SHAPE_NAMES["flower-five"]}(십자 다섯 집)`,
    vital: "네 집에 붙은 한가운데가 급소다",
  },
  "bulky-five": {
    name: LIFE_SHAPE_NAMES["bulky-five"],
    vital: "네모 네 집에 한 집이 붙은 모양. 세 집에 붙은 자리가 급소다",
  },
  "rabbity-six": {
    name: `${LIFE_SHAPE_NAMES["rabbity-six"]}(꽃 여섯 집)`,
    vital: "네 집에 붙은 가운데가 급소다",
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
              `${named(move)}에 두면 눈 자리가 떨어진 두 눈 이상으로 나뉘어 산다`,
              "백이 먼저 이 급소를 차지하면 한 눈뿐이라 잡힌다",
            ]
          : [
              `${text.name}: ${text.vital}`,
              `${named(move)}에 두면 백은 눈을 둘로 나눌 수 없다. 안을 채워 가면 끝내 따낸다`,
              "백이 먼저 이 급소를 차지하면 두 눈이 되어 산다",
            ];
      return text.note ? [...lines, text.note] : lines;
    }
    const placed = tryPlace(before, move, 1);
    const took = placed.ok ? placed.captured.length : 0;
    if (puzzle.goal === "live")
      return [
        took > 0
          ? `${named(move)}: 안쪽 백 돌을 따내며 눈 자리를 둘로 나눈다`
          : `${named(move)}: 눈 자리를 둘로 나눈다`,
        "떨어진 두 눈이 있으면 백은 어느 눈에도 들어올 수 없어 잡히지 않는다",
        "다른 자리에 두면 백이 먼저 그 자리를 차지해 한 눈뿐이 된다",
      ];
    return [
      `${named(move)}: 백 눈 자리의 급소에 둔다`,
      "백은 눈을 둘로 나눌 수 없어 한 눈뿐이다. 결국 따낼 수 있다",
      "다른 자리에 두면 백이 그 자리를 차지해 두 눈을 만든다",
    ];
  }
  if (puzzle.kind === "kofight") return explainKoFight(puzzle);
  const target = targetOf(puzzle);
  const size = groupOf(before, target).stones.length;
  const first = named(solutionOf(puzzle));
  const lines: Record<typeof puzzle.theme, string[]> = {
    atari: [
      `${first}에서 단수: 백이 넓은 쪽으로 달아날 길을 먼저 막는다`,
      "반대쪽에서 단수를 치면 백이 뻗어 활로가 늘어난다",
    ],
    ladder: [
      `${first}에서 단수를 시작해 계속 단수로 몬다(축)`,
      "백은 한쪽으로만 뻗을 수 있고, 끝내 판 끝이나 흑 돌에 막혀 잡힌다",
    ],
    net: [
      `${first}: 바로 단수 치지 않고 한 칸 떨어져 길을 막는다(장문)`,
      "백이 어느 쪽으로 나와도 다음 단수에 잡힌다",
    ],
    snapback: [
      `${first}: 일부러 한 점을 내준다(먹여치기). 백 무리는 단수가 된다`,
      `백이 이 돌을 따내도 활로가 하나뿐이라, 흑이 ${first}에 다시 두어 되따낸다(환격)`,
    ],
    ko: [
      `${first}: 패를 따내며 단수를 친다`,
      "백은 바로 되따낼 수 없다(같은 판 모양 금지). 한 번 다른 곳에 두어야 해서 달아날 틈이 없다",
    ],
    "long-ladder": [
      `${first}에서 단수를 쳐 백을 판 끝까지 몰았어요(긴 축).`,
      "반대쪽에서 단수를 치면 백이 뻗은 자리 옆에 흑 돌이 없어 활로가 셋이 되고 빠져나가요.",
    ],
    breaker: [
      `${puzzle.breaker ?? ""} 백 돌이 축머리예요. 그쪽으로 몰면 백이 이 돌과 이어져 활로가 늘고 빠져나가요.`,
      `${first}에서 단수를 치면 백이 뻗어 가는 길에 축머리가 없어 잡혀요.`,
    ],
  };
  // 긴 축·축머리는 해요체·마침표로 쓴다(2026-11-17 단원 글과 맞춤). 아홉 수부터는 숫자로
  const count = COUNT[movesPlayed]
    ? `${COUNT[movesPlayed]} 수`
    : `${movesPlayed}수`;
  const tail = `${count} 만에 백 돌${size > 1 ? ` ${size}개` : ""}을 따냈`;
  return [
    ...lines[puzzle.theme],
    LADDER_THEMES.includes(puzzle.theme) ? `${tail}어요.` : `${tail}다`,
  ];
}

/** 패로 버티기의 해설. 노림받은 무리의 돌 수는 처음 판에서 센다 */
function explainKoFight(puzzle: KoFight): string[] {
  const start = puzzleState(puzzle).board;
  const size = groupOf(start, targetOf(puzzle)).stones.length;
  const ko = puzzle.ko;
  if (puzzle.mode === "threat")
    return [
      `${puzzle.solution}은 팻감이에요. 백 ${COUNT[size]} 점이 단수가 되어, 백이 받지 않으면 따내요.`,
      `백이 ${puzzle.reply ?? ""}에 받아 판 모양이 달라졌어요. 그래서 ${ko}에 되따낼 수 있어요.`,
      "이제 백이 다시 따내려면 백도 먼저 팻감을 써야 해요.",
    ];
  const threat = puzzle.setup[puzzle.setup.length - 1] ?? "";
  return [
    `백 ${threat}은 팻감이에요. 흑 ${COUNT[size]} 점이 단수가 됐어요.`,
    `${puzzle.solution}에 두어 받았어요. 노리는 돌(${COUNT[size]} 점)이 패에 걸린 돌(한 점)보다 많아 받는 쪽이 나아요.`,
    `받았으니 백은 ${ko}에 되따낼 수 있어요. 그러면 이번엔 흑이 팻감을 쓸 차례예요.`,
  ];
}
