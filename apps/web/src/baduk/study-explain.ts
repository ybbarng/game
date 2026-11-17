/*
 * 바둑 문제를 푼 뒤의 해설(docs/23 바둑). 장면과 둔 수에서 엔진으로 만든다. 문제마다 손으로 적지 않는다.
 * 같은 묶음 안에서 첫 문제는 그 묶음의 수(축·장문·환격 등)가 무엇인지 풀어 쓰고,
 * 뒤 문제는 개념을 되풀이하지 않고 그 문제만의 모양을 짚는다: 어느 쪽에서 치면 왜 빠져나가는지, 몇 점을 따내는지,
 * 장문 자리가 백이 나올 길과 어떻게 닿는지, 눈 자리가 몇 칸으로 나뉘는지, 끝내기 한 곳이 몇 점짜리인지.
 * 처음 보는 독자 검토에서 「해설이 문제마다 거의 같은 세 문장(이름만 바뀜)」이라는 지적을 받고 바꿨다(2026-11-17).
 * study-explain.test.ts가 묶음 안에서 같은 문장이 되풀이되지 않는지, 뒤 문제가 첫 문제의 개념 문장을 다시 쓰지 않는지 본다.
 */
import {
  type Board,
  captureMoves,
  endgameReader,
  groupOf,
  ladderMoves,
  neighbors,
  pointAt,
  pointName,
  type Stone,
  solveEndgame,
  tryPlace,
  xyOf,
} from "@game/baduk-engine";

import { copula, hasBatchim, obj, ro, subj, topic, wa } from "@/lib/josa";

import {
  BADUK_PUZZLE_SETS,
  type BadukPuzzle,
  LIFE_SHAPE_NAMES,
  type LifeShape,
} from "./puzzles";
import {
  koLossOf,
  PUZZLE_SIZE,
  puzzleState,
  solutionOf,
  spotMoveOf,
  spotSizesOf,
  spotsOf,
  targetOf,
} from "./study";

type Capture = Extract<BadukPuzzle, { kind: "capture" }>;
type KoFight = Extract<BadukPuzzle, { kind: "kofight" }>;
type Endgame = Extract<BadukPuzzle, { kind: "endgame" }>;
type Life = Extract<BadukPuzzle, { kind: "life" }>;

const at = (name: string) => pointAt(name, PUZZLE_SIZE);
const named = (p: number) => pointName(p, PUZZLE_SIZE);

/** 셀 낱말. 열까지는 한글, 그 위는 숫자로 쓴다(한 문제 안에서 꼴이 섞이지 않게) */
const COUNT = [
  "",
  "한",
  "두",
  "세",
  "네",
  "다섯",
  "여섯",
  "일곱",
  "여덟",
  "아홉",
  "열",
];
/** 「네 번」·「12번」 */
const times = (n: number) => (COUNT[n] ? `${COUNT[n]} 번` : `${n}번`);
/** 「한 점」·「12점」 */
const points = (n: number) => (COUNT[n] ? `${COUNT[n]} 점` : `${n}점`);
/** 「세 수」·「12수」 */
const movesText = (n: number) => (COUNT[n] ? `${COUNT[n]} 수` : `${n}수`);
/** 「두 칸」·「12칸」 */
const cells = (n: number) => (COUNT[n] ? `${COUNT[n]} 칸` : `${n}칸`);
/** 「세 곳」 */
const places = (n: number) => (COUNT[n] ? `${COUNT[n]} 곳` : `${n}곳`);
/** 활로 수: 「하나」·「둘」·「5개」 */
const LIB_WORDS = ["없음", "하나", "둘", "셋", "넷"];
const libsText = (n: number) => LIB_WORDS[n] ?? `${n}개`;
/** 끝내기 곳 이름(그림의 A·B·C) */
export const SPOT_LABELS = ["A", "B", "C", "D"] as const;

/** 이 문제가 묶음의 첫 문제인가(개념을 풀어 쓸 문제). 묶음에 없는 문제(단원 그림 등)도 첫 문제로 본다 */
export function isFirstInSet(puzzle: BadukPuzzle): boolean {
  for (const set of BADUK_PUZZLE_SETS) {
    const i = set.puzzles.findIndex((p) => p.id === puzzle.id);
    if (i >= 0) return i === 0;
  }
  return true;
}

const onEdge = (p: number) => {
  const [x, y] = xyOf(p, PUZZLE_SIZE);
  return x === 0 || y === 0 || x === PUZZLE_SIZE - 1 || y === PUZZLE_SIZE - 1;
};

/** 백이 `p`로 뻗었을 때 무리의 활로 수. 둘 수 없으면 null */
function libertiesAfterExtend(board: Board, p: number): number | null {
  const placed = tryPlace(board, p, 2);
  if (!placed.ok) return null;
  return groupOf(placed.board, p).liberties.length;
}

/** 빈 자리들을 이어진 덩이로 나눈다(큰 덩이부터, 덩이 안은 자리 차례) */
function emptyParts(board: Board, area: readonly number[]): number[][] {
  const open = new Set(area.filter((p) => board[p] === 0));
  const parts: number[][] = [];
  for (const start of open) {
    const part: number[] = [];
    const stack = [start];
    open.delete(start);
    while (stack.length > 0) {
      const p = stack.pop() as number;
      part.push(p);
      for (const q of neighbors(p, PUZZLE_SIZE))
        if (open.has(q)) {
          open.delete(q);
          stack.push(q);
        }
    }
    parts.push(part.sort((a, b) => a - b));
  }
  return parts.sort((a, b) => b.length - a.length || (a[0] ?? 0) - (b[0] ?? 0));
}

/** 「A9·C9 두 곳」(모두 한 칸)·「A9·A8 두 칸과 C9 한 칸」 */
function partsText(parts: readonly number[][]): string {
  const names = (p: readonly number[]) => p.map(named).join("·");
  if (parts.every((p) => p.length === 1))
    return `${names(parts.flat())} ${places(parts.length)}`;
  return parts
    .map((p) => `${names(p)} ${cells(p.length)}`)
    .reduce((a, b) => `${wa(a)} ${b}`);
}

/** 푼 문제의 해설. 장면과 둔 수에서 만든다. `before`는 마지막 수를 두기 전 판, `movesPlayed`는 흑이 둔 수 */
export function explainSolved(
  puzzle: BadukPuzzle,
  before: Board,
  move: number,
  movesPlayed: number,
): string[] {
  const first = isFirstInSet(puzzle);
  if (puzzle.kind === "life")
    return puzzle.shape
      ? explainShape(puzzle, puzzle.shape, first)
      : explainLife(puzzle, before, move, first);
  if (puzzle.kind === "kofight")
    return first ? koFightConcept(puzzle) : koFightFacts(puzzle);
  if (puzzle.kind === "endgame")
    return first ? endgameConcept(puzzle) : endgameFacts(puzzle);
  return first
    ? captureConcept(puzzle, before, movesPlayed)
    : captureFacts(puzzle, before, move);
}

// ── 잡기 ──────────────────────────────────────────────

/** 「두 수 만에 백 돌 3개를 따냈어요.」 조사는 끝 낱말에 맞춘다 */
function capturedLine(size: number, movesPlayed: number) {
  const stones = size > 1 ? `백 돌 ${size}개를` : "백 돌을";
  return `${movesText(movesPlayed)} 만에 ${stones} 따냈어요.`;
}

/** 묶음 첫 문제: 그 수가 무엇인지 풀어 쓴다 */
function captureConcept(
  puzzle: Capture,
  before: Board,
  movesPlayed: number,
): string[] {
  const size = groupOf(before, targetOf(puzzle)).stones.length;
  const firstMove = named(solutionOf(puzzle));
  const koExit = (() => {
    const placed = tryPlace(puzzleState(puzzle).board, solutionOf(puzzle), 1);
    const exit = placed.ok
      ? groupOf(placed.board, targetOf(puzzle)).liberties[0]
      : undefined;
    return exit === undefined ? null : named(exit);
  })();
  const lines: Record<Capture["theme"], string[]> = {
    atari: [
      `${firstMove}에서 단수를 쳐요. 백이 넓은 쪽으로 달아날 길을 먼저 막아요.`,
      "반대쪽에서 단수를 치면 백이 뻗어 활로가 늘어나요.",
    ],
    ladder: [
      `${firstMove}에서 단수를 시작해 계속 단수로 몰아요(축).`,
      "백은 한쪽으로만 뻗을 수 있고, 끝내 판 끝이나 흑 돌에 막혀 잡혀요.",
    ],
    net: [
      `${firstMove}에 둬요. 바로 단수 치지 않고 한 칸 떨어져 길을 막아요(장문).`,
      "백이 어느 쪽으로 뻗어도 다음 단수에 잡혀요.",
    ],
    snapback: [
      `${firstMove}에 둬요. 일부러 한 점을 내줘요(먹여치기). 백 무리는 단수가 돼요.`,
      `백이 이 돌을 따내도 활로가 하나뿐이라, 흑이 ${firstMove}에 다시 두어 되따내요(환격).`,
    ],
    ko: [
      `${firstMove}에 두어 패를 따내며 단수를 쳐요.`,
      koExit
        ? `백은 바로 되따낼 수 없고(같은 판 모양 금지), ${ro(koExit)} 뻗어도 활로가 하나뿐이라 다음 수에 따내요.`
        : "백은 바로 되따낼 수 없어요(같은 판 모양 금지).",
    ],
    "long-ladder": [
      `${firstMove}에서 단수를 쳐 백을 판 끝까지 몰았어요(긴 축).`,
      "반대쪽에서 단수를 치면 백이 뻗은 자리 옆에 흑 돌이 없어 활로가 셋이 되고 빠져나가요.",
    ],
    "blocked-net": [
      `${(puzzle.breakers ?? []).join("·")} 백 돌이 축머리예요. 어느 쪽에서 단수를 쳐도 백이 뻗다가 축머리와 이어져 축으로는 못 잡아요.`,
      `${firstMove}에 둬요. 바로 단수 치지 않고 한 칸 떨어져 길을 막아요(장문). 백이 달아나려고 뻗어도 흑이 막아 따내요.`,
    ],
    breaker: [
      `${puzzle.breaker ?? ""} 백 돌이 축머리예요. 그쪽으로 몰면 백이 이 돌과 이어져 활로가 늘고 빠져나가요.`,
      `${firstMove}에서 단수를 치면 백이 뻗어 가는 길에 축머리가 없어 잡혀요.`,
    ],
  };
  return [...lines[puzzle.theme], capturedLine(size, movesPlayed)];
}

/** 처음 판에서 노리는 무리의 활로 가운데 정답이 아닌 쪽(반대쪽 단수 자리) */
function wrongSides(puzzle: Capture): number[] {
  const { board } = puzzleState(puzzle);
  return groupOf(board, targetOf(puzzle)).liberties.filter(
    (l) => l !== solutionOf(puzzle),
  );
}

/**
 * 반대쪽에서 단수를 치면 어떻게 되나. 단수 방향은 백이 정답 자리로 뻗어 활로가 몇이 되는지(옆 백 돌과 이어지면 그것도),
 * 축은 그쪽에서 몰면 축이 되지 않는다는 것(축 읽기 `ladderMoves`로 확인한다)
 */
function wrongSideLine(puzzle: Capture): string | null {
  const { board } = puzzleState(puzzle);
  const target = targetOf(puzzle);
  const right = solutionOf(puzzle);
  const startSize = groupOf(board, target).stones.length;
  for (const w of wrongSides(puzzle)) {
    const hit = tryPlace(board, w, 1);
    if (!hit.ok) continue;
    const out = tryPlace(hit.board, right, 2);
    if (!out.ok) continue;
    const g = groupOf(out.board, right);
    const libs = g.liberties.length;
    if (puzzle.theme === "atari") {
      if (libs < 2) continue;
      const joined =
        g.stones.length > startSize + 1 ? "옆 백 돌과 이어져 " : "";
      return `반대쪽 ${named(w)}에서 치면 백이 ${ro(named(right))} 뻗어 ${joined}활로가 ${ro(libsText(libs))} 늘어요.`;
    }
    if (ladderMoves(board, 1, target, w) !== null) continue;
    return libs >= 3
      ? `반대쪽 ${named(w)}에서 치면 백이 ${ro(named(right))} 뻗어 활로가 ${ro(libsText(libs))} 늘고 빠져나가요.`
      : `반대쪽 ${named(w)}에서 치면 백이 ${ro(named(right))} 뻗고, 그 뒤로 어느 쪽에서 단수를 쳐도 축이 이어지지 않아 빠져나가요.`;
  }
  return null;
}

/** 뒤 문제: 그 문제만의 모양 */
function captureFacts(puzzle: Capture, before: Board, move: number): string[] {
  const { board: start } = puzzleState(puzzle);
  const target = targetOf(puzzle);
  const right = solutionOf(puzzle);
  const firstMove = named(right);
  const startSize = groupOf(start, target).stones.length;
  const finalGroup = groupOf(before, target);
  const size = finalGroup.stones.length;
  const out: string[] = [];
  const push = (line: string | null) => {
    if (line) out.push(line);
  };
  switch (puzzle.theme) {
    case "atari": {
      const hit = tryPlace(start, right, 1);
      const exit = hit.ok ? groupOf(hit.board, target).liberties[0] : null;
      if (hit.ok && exit !== undefined && exit !== null) {
        const libs = libertiesAfterExtend(hit.board, exit);
        const wall = onEdge(exit) ? "판 끝과 흑 돌" : "흑 돌";
        out.push(
          libs === null
            ? `${firstMove}에서 치면 남은 활로 ${topic(named(exit))} 흑 돌에 둘러싸여 백이 뻗을 수도 없어요.`
            : `${firstMove}에서 치면 백이 ${ro(named(exit))} 뻗어도 ${wall}에 막혀 활로가 ${libsText(libs)}뿐이에요.`,
        );
      }
      push(wrongSideLine(puzzle));
      if (size > startSize)
        out.push(
          `${named(move)}에 두어 뻗은 돌까지 백 돌 ${size}개를 따냈어요.`,
        );
      return out;
    }
    case "ladder":
    case "long-ladder": {
      const grown = size - startSize;
      const wall = finalGroup.stones.some(onEdge)
        ? "판 끝 줄에 닿아"
        : "흑 돌에 막혀";
      out.push(
        `${firstMove}에서 몰자 백은 ${times(grown)} 뻗었어요.`,
        `${wall} 더 뻗을 곳이 없어, ${named(move)}에 두어 백 돌 ${size}개를 따냈어요.`,
      );
      push(wrongSideLine(puzzle));
      return out;
    }
    case "breaker": {
      const breaker = puzzle.breaker ? at(puzzle.breaker) : null;
      const rightLen = ladderMoves(start, 1, target, right);
      if (breaker !== null)
        for (const w of wrongSides(puzzle)) {
          const without = [...start];
          without[breaker] = 0;
          const n = ladderMoves(without, 1, target, w);
          if (n === null) continue;
          out.push(
            `${named(w)}에서 몰면 백이 ${named(breaker)} 축머리와 이어져 빠져나가요. 그 돌이 없었다면 ${named(w)}에서도 ${movesText(n)} 만에 잡혔어요.`,
          );
          break;
        }
      out.push(
        rightLen === null
          ? `${firstMove} 쪽 길에는 축머리가 없어 잡혀요.`
          : `${firstMove} 쪽 길에는 축머리가 없어 ${movesText(rightLen)} 만에 백 돌 ${size}개를 따냈어요.`,
      );
      return out;
    }
    case "net":
    case "blocked-net":
      if (puzzle.theme === "blocked-net") push(breakerSidesLine(puzzle));
      out.push(...netLines(puzzle));
      return out;
    case "snapback":
      return snapbackFacts(puzzle, size);
    case "ko":
      return koCaptureFacts(puzzle);
  }
}

/** 축이 막히면 장문: 축머리마다 어느 쪽 축을 깨는지. 축머리를 치우면 그쪽 단수가 축이 된다 */
function breakerSidesLine(puzzle: Capture): string | null {
  const { board } = puzzleState(puzzle);
  const target = targetOf(puzzle);
  const libs = groupOf(board, target).liberties;
  const pairs: string[] = [];
  for (const name of puzzle.breakers ?? []) {
    const without = [...board];
    without[at(name)] = 0;
    const side = libs.find((l) => ladderMoves(without, 1, target, l) !== null);
    if (side === undefined) return null;
    pairs.push(`${named(side)}에서 치면 ${name} 축머리에`);
  }
  if (pairs.length !== 2) return null;
  return `${pairs.join(", ")} 백이 닿아 축이 깨져요.`;
}

/** 장문 자리와 백이 뻗을 길: 장문 수가 백 돌·활로와 어떻게 닿는지, 백이 뻗으면 흑이 어디로 막는지 */
function netLines(puzzle: Capture): string[] {
  const { board } = puzzleState(puzzle);
  const target = targetOf(puzzle);
  const right = solutionOf(puzzle);
  const libs = groupOf(board, target).liberties.sort((a, b) => a - b);
  const touching = libs.filter((l) =>
    neighbors(right, PUZZLE_SIZE).includes(l),
  );
  const [tx, ty] = xyOf(target, PUZZLE_SIZE);
  const [rx, ry] = xyOf(right, PUZZLE_SIZE);
  const diagonal = Math.abs(tx - rx) === 1 && Math.abs(ty - ry) === 1;
  const libNames = libs.map(named).join("·");
  const replies: { exit: number; answer: number }[] = [];
  const placed = tryPlace(board, right, 1);
  if (placed.ok)
    for (const l of groupOf(placed.board, target).liberties.sort(
      (a, b) => a - b,
    )) {
      const out1 = tryPlace(placed.board, l, 2);
      if (!out1.ok) continue;
      const answer = captureMoves(
        out1.board,
        1,
        target,
        Math.max(1, puzzle.within - 1),
      )[0];
      if (answer !== undefined) replies.push({ exit: l, answer });
    }
  const out: string[] = [];
  if (touching.length === libs.length)
    out.push(
      diagonal
        ? `${topic(named(right))} 백 돌과는 대각선으로 한 칸 떨어져 있고, 백이 뻗을 두 자리 ${libNames}에는 모두 붙어 있어요.`
        : `${topic(named(right))} 백이 뻗을 두 자리 ${libNames}에 모두 붙어 있어요.`,
    );
  else {
    // 활로에 붙지 않은 장문: 백이 뻗은 뒤 흑이 둘 자리를 미리 받쳐 준다
    const backed = replies.find((r) =>
      neighbors(right, PUZZLE_SIZE).includes(r.answer),
    );
    out.push(
      backed
        ? `${topic(named(right))} 백이 ${ro(named(backed.exit))} 뻗을 때 둘 ${named(backed.answer)}에 붙어, 그 돌을 미리 받쳐 주는 자리예요.`
        : `${topic(named(right))} 백이 뻗어 갈 길 앞을 미리 막는 자리예요.`,
    );
  }
  if (replies.length > 0)
    out.push(
      `백이 ${replies.map((r) => `${ro(named(r.exit))} 뻗으면 ${named(r.answer)}`).join(", ")}에 두어 ${movesText(puzzle.within)} 안에 따내요.`,
    );
  return out;
}

/** 환격 뒤 문제: 백이 따낸 뒤 무리가 몇 점이고 활로가 어디뿐인지, 몇 점을 되따냈는지 */
function snapbackFacts(puzzle: Capture, size: number): string[] {
  const { board } = puzzleState(puzzle);
  const target = targetOf(puzzle);
  const right = solutionOf(puzzle);
  const out: string[] = [];
  const thrown = tryPlace(board, right, 1);
  if (thrown.ok) {
    const lib = groupOf(thrown.board, right).liberties[0];
    const took = lib === undefined ? null : tryPlace(thrown.board, lib, 2);
    if (lib !== undefined && took?.ok) {
      const g = groupOf(took.board, target);
      out.push(
        `백이 ${named(lib)}에 두어 ${named(right)}의 흑 한 점을 따내도, 백 ${points(g.stones.length)}의 활로는 ${named(right)} 하나뿐이에요.`,
      );
    }
  }
  out.push(
    `${named(right)}에 다시 두어, 내준 흑 돌 하나 대신 백 돌 ${size}개를 되따냈어요.`,
  );
  return out;
}

/** 패 따내기 뒤 문제: 어느 돌을 따내며 몇 점을 단수로 모는지, 백이 어디로 뻗어도 안 되는지 */
function koCaptureFacts(puzzle: Capture): string[] {
  const { board } = puzzleState(puzzle);
  const target = targetOf(puzzle);
  const right = solutionOf(puzzle);
  const placed = tryPlace(board, right, 1);
  if (!placed.ok) return [];
  const taken = placed.captured.map(named).join("·");
  const g = groupOf(placed.board, target);
  const out = [
    `${named(right)}에 두어 ${taken} 백 돌을 따내며 △ 백 ${obj(points(g.stones.length))} 단수로 몰아요. 백이 ${taken}에 바로 되따내면 같은 판 모양이 되어 둘 수 없어요.`,
  ];
  const exit = g.liberties[0];
  if (exit !== undefined) {
    const libs = libertiesAfterExtend(placed.board, exit);
    out.push(
      libs === null
        ? `백은 ${named(exit)}에 둘 수도 없어 다음 수에 따내요.`
        : `백이 ${ro(named(exit))} 뻗어도 활로가 ${libsText(libs)}뿐이라 다음 수에 따내요.`,
    );
  }
  return out;
}

// ── 사활 ──────────────────────────────────────────────

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

/**
 * 급소에 흑·백이 두면 눈 자리가 어떻게 나뉘나. `owner`는 눈 자리 주인(사는 문제면 흑).
 * 주인이 두면 몇 칸씩 나뉘는지, 상대가 두면 몇 칸이 남는지 센다
 */
function eyeSplitLines(puzzle: Life, owner: Stone): string[] {
  const { board } = puzzleState(puzzle);
  const area = puzzle.area.map(at);
  const vital = solutionOf(puzzle);
  const enemyStone: Stone = owner === 1 ? 2 : 1;
  const mine = tryPlace(board, vital, owner);
  const theirs = tryPlace(board, vital, enemyStone);
  const who = owner === 1 ? "흑" : "백";
  const enemy = owner === 1 ? "백" : "흑";
  const out: string[] = [];
  if (mine.ok) {
    const parts = emptyParts(mine.board, area);
    const taken = [...mine.captured].sort((a, b) => a - b).map(named);
    const taking =
      taken.length > 0 ? `${taken.join("·")} ${enemy} 돌을 따내며 ` : "";
    if (parts.length >= 2) {
      const split = `${subj(who)} ${named(vital)}에 두면 ${taking}눈 자리가 ${ro(partsText(parts))} 나뉘`;
      out.push(
        owner === 1
          ? `${split}어요.`
          : `${split}니, 흑이 먼저 ${obj(named(vital))} 차지해요.`,
      );
    }
    // 눈 자리 안에 남은 상대 돌: 활로가 하나뿐이면 주인이 그 자리에 두어 따낼 수 있다
    const seen = new Set<number>();
    for (const p of area) {
      if (mine.board[p] !== enemyStone || seen.has(p)) continue;
      const g = groupOf(mine.board, p);
      for (const s of g.stones) seen.add(s);
      const [lib] = g.liberties;
      if (g.liberties.length !== 1 || lib === undefined) continue;
      const capture = tryPlace(mine.board, lib, owner);
      if (!capture.ok || capture.board[p] !== 0) continue;
      const names = [...g.stones].sort((a, b) => a - b).map(named);
      out.push(
        `눈 자리 안의 ${names.join("·")} ${enemy} 돌은 활로가 ${named(lib)} 하나뿐이라, ${subj(who)} ${named(lib)}에 두면 따내요.`,
      );
    }
  }
  if (theirs.ok) {
    const parts = emptyParts(theirs.board, area);
    const [rest] = parts;
    // 남은 눈 자리가 두 칸 이하 한 덩이면 두 눈으로 나눌 수 없다(세 칸 넘으면 이 말로는 모자라 쓰지 않는다)
    if (parts.length === 1 && rest !== undefined && rest.length <= 2)
      out.push(
        rest.length === 1
          ? `${subj(enemy)} 먼저 ${named(vital)}에 두면 남은 눈 자리가 ${named(rest[0] as number)} 한 칸뿐이라 눈이 하나예요.`
          : `${subj(enemy)} 먼저 ${named(vital)}에 두면 남은 눈 자리가 ${rest.map(named).join("·")} 두 칸뿐이라 두 눈으로 나눌 수 없어요.`,
      );
  }
  // 정답 말고 흑이 둘 수 있는 눈 자리는 모두 반대 결과다(life.test.ts `lifeWrongMovesFail`)
  const others = area
    .filter((p) => p !== vital && board[p] === 0 && tryPlace(board, p, 1).ok)
    .sort((a, b) => a - b)
    .map(named);
  const result = owner === 1 ? "흑이 잡혀요" : "백이 살아요";
  if (others.length > 0)
    out.push(
      others.length <= 2
        ? `${orText(others)}에 두면 ${result}.`
        : `${others.join("·")} 가운데 어디에 두어도 ${result}.`,
    );
  // 나뉘는 모양을 짚지 못한 판(눈 자리가 한 덩이로 남는 판)은 급소가 눈 자리 몇 칸의 어디인지부터 말한다
  if (out.length < 2)
    out.unshift(
      `${named(vital)}: ${who} 눈 자리 ${area
        .filter((p) => board[p] === 0)
        .sort((a, b) => a - b)
        .map(named)
        .join("·")} 가운데 급소예요.`,
    );
  return out;
}

/** 「C9나 B8」·「A9」 */
function orText(names: readonly string[]): string {
  const [a, b] = names;
  if (b === undefined) return a ?? "";
  return `${a}${hasBatchim(a ?? "") ? "이나" : "나"} ${b}`;
}

/** 같은 묶음에서 이 문제보다 앞에 같은 모양 문제가 있나 */
function shapeSeenBefore(puzzle: Life, shape: LifeShape): boolean {
  for (const set of BADUK_PUZZLE_SETS) {
    const i = set.puzzles.findIndex((p) => p.id === puzzle.id);
    if (i < 0) continue;
    return set.puzzles
      .slice(0, i)
      .some((p) => p.kind === "life" && p.shape === shape);
  }
  return false;
}

function explainShape(puzzle: Life, shape: LifeShape, first: boolean) {
  const text = SHAPE_TEXT[shape];
  const head = `${text.name}: ${text.vital}`;
  if (!first) {
    // 뒤 문제: 모양 이름과 급소(같은 모양이 묶음에 앞서 나왔으면 급소 자리만), 그리고 이 판에서 눈 자리가 어떻게 나뉘는지
    const owner: Stone = puzzle.goal === "live" ? 1 : 2;
    const vital = named(solutionOf(puzzle));
    const seen = shapeSeenBefore(puzzle, shape);
    const lead = seen
      ? `${text.name}: 앞에서 본 모양이고, 이 판의 급소는 ${copula(vital)}.`
      : `${head} 이 판에서는 ${copula(vital)}.`;
    return [lead, ...eyeSplitLines(puzzle, owner)];
  }
  const move = named(solutionOf(puzzle));
  const lines =
    puzzle.goal === "live"
      ? [
          head,
          `${move}에 두면 눈 자리가 떨어진 두 눈으로 나뉘어 살아요.`,
          "백이 먼저 이 급소를 차지하면 한 눈뿐이라 잡혀요.",
        ]
      : [
          head,
          `${move}에 두면 백은 눈을 둘로 나눌 수 없어요. 안을 채워 가면 끝내 따내요.`,
          "백이 먼저 이 급소를 차지하면 두 눈이 되어 살아요.",
        ];
  return text.note ? [...lines, text.note] : lines;
}

function explainLife(
  puzzle: Life,
  before: Board,
  move: number,
  first: boolean,
): string[] {
  if (!first) return eyeSplitLines(puzzle, puzzle.goal === "live" ? 1 : 2);
  const placed = tryPlace(before, move, 1);
  const took = placed.ok ? placed.captured.length : 0;
  if (puzzle.goal === "live")
    return [
      took > 0
        ? `${named(move)}에 두어 안쪽 백 돌을 따내며 눈 자리를 둘로 나눠요.`
        : `${named(move)}에 두어 눈 자리를 둘로 나눠요.`,
      "떨어진 두 눈이 있으면 백은 어느 눈에도 들어올 수 없어 잡히지 않아요.",
      "다른 자리에 두면 백이 먼저 그 자리를 차지해 한 눈뿐이 돼요.",
    ];
  return [
    `${named(move)}에 둬요. 백 눈 자리의 급소예요.`,
    "백은 눈을 둘로 나눌 수 없어 한 눈뿐이에요. 결국 따낼 수 있어요.",
    "다른 자리에 두면 백이 그 자리를 차지해 두 눈을 만들어요.",
  ];
}

// ── 패로 버티기 ──────────────────────────────────────────

function koFightConcept(puzzle: KoFight): string[] {
  const start = puzzleState(puzzle).board;
  const size = groupOf(start, targetOf(puzzle)).stones.length;
  const ko = puzzle.ko;
  if (puzzle.mode === "threat")
    return [
      `${topic(puzzle.solution)} 팻감이에요. 백 ${subj(points(size))} 단수가 되어, 백이 받지 않으면 따내요.`,
      `백이 ${puzzle.reply ?? ""}에 받아 판 모양이 달라졌어요. 그래서 ${ko}에 되따낼 수 있어요.`,
      "이제 백이 다시 따내려면 백도 먼저 팻감을 써야 해요.",
    ];
  const threat = puzzle.setup[puzzle.setup.length - 1] ?? "";
  const loss = koLossOf(puzzle);
  if (puzzle.mode === "connect")
    return [
      `백 ${topic(threat)} 팻감이에요. 흑 ${subj(points(size))} 단수가 됐어요.`,
      `패를 지면 흑 ${obj(points(loss))} 잃어요. 패에 걸린 한 점과, 백이 되따내면 함께 단수가 되어 살릴 수 없는 ${obj(points(loss - 1))} 더한 거예요.`,
      `노리는 돌(${points(size)})이 패를 지면 잃는 돌(${points(loss)})보다 적어요. 그래서 ${ko}에 이어 패를 끝내고, 노린 돌은 내줘요.`,
    ];
  return [
    `백 ${topic(threat)} 팻감이에요. 흑 ${subj(points(size))} 단수가 됐어요.`,
    `${puzzle.solution}에 두어 받았어요. 노리는 돌(${points(size)})이 패를 지면 잃는 돌(${points(loss)})보다 많아 받는 쪽이 나아요.`,
    `받았으니 백은 ${ko}에 되따낼 수 있어요. 그러면 이번엔 흑이 팻감을 쓸 차례예요.`,
  ];
}

/** 패로 버티기 뒤 문제: 이 판의 돌 수와 자리만 */
function koFightFacts(puzzle: KoFight): string[] {
  const start = puzzleState(puzzle).board;
  const target = targetOf(puzzle);
  const size = groupOf(start, target).stones.length;
  const ko = puzzle.ko;
  if (puzzle.mode === "threat") {
    const hit = tryPlace(start, solutionOf(puzzle), 1);
    const lib = hit.ok ? groupOf(hit.board, target).liberties[0] : undefined;
    return [
      lib === undefined
        ? `${puzzle.solution}에 두면 백 ${subj(points(size))} 단수가 돼요.`
        : `${puzzle.solution}에 두면 백 ${subj(points(size))} 단수가 되어, 받지 않으면 흑이 ${named(lib)}에 두어 따내요.`,
      `백이 ${puzzle.reply ?? ""}에 받은 사이 ${ko}에 되따냈어요.`,
    ];
  }
  const threat = puzzle.setup[puzzle.setup.length - 1] ?? "";
  const loss = koLossOf(puzzle);
  if (puzzle.mode === "connect")
    return [
      `백 ${threat}의 팻감이 노리는 흑 돌은 ${points(size)}, 패를 지면 잃는 흑 돌은 ${copula(points(loss))}.`,
      `패 자리 ${ko}에 이어 패를 끝내고, ${obj(points(loss))} 지키는 대신 ${topic(points(size))} 내줘요.`,
    ];
  return [
    `백 ${threat}의 팻감에 흑 ${subj(points(size))} 단수가 됐어요.`,
    `${puzzle.solution}에 두어 받아, 패를 지면 잃는 ${points(loss)}보다 많은 ${obj(points(size))} 살렸어요.`,
  ];
}

// ── 끝내기 ──────────────────────────────────────────────

/** 흑이 둔 수로 새로 단수가 된 상대 돌 수와 그 무리의 활로(받는 자리). `mover`가 두었다 */
function newAtari(
  board: Board,
  move: number,
  mover: Stone,
): { stones: number; replies: number[] } {
  const placed = tryPlace(board, move, mover);
  const enemy: Stone = mover === 1 ? 2 : 1;
  let stones = 0;
  const replies: number[] = [];
  if (!placed.ok) return { stones, replies };
  const seen = new Set<number>();
  for (let p = 0; p < placed.board.length; p++) {
    if (placed.board[p] !== enemy || seen.has(p)) continue;
    const g = groupOf(placed.board, p);
    for (const s of g.stones) seen.add(s);
    // 처음 판에서 이미 단수였던 돌은 빼고, 이 수로 새로 단수가 된 돌만 센다
    if (g.liberties.length === 1 && groupOf(board, p).liberties.length > 1) {
      stones += g.stones.length;
      replies.push(g.liberties[0] as number);
    }
  }
  return { stones, replies };
}

/** 끝내기 한 곳에 백이 먼저 둘 때 가장 좋은 첫 수 */
function whiteSpotMove(board: Board, spot: readonly number[]): number | null {
  const move = solveEndgame(board, spot, 2).best.find((m) => m !== null);
  return move ?? null;
}

/** 끝내기 곳마다 그림 이름·흑이 둘 자리·크기·흑의 선수인지·백의 선수인지 */
export function endgameSpots(puzzle: Endgame) {
  const { board } = puzzleState(puzzle);
  const sizes = spotSizesOf(puzzle);
  return spotsOf(puzzle).map((spot, i) => {
    const move = spotMoveOf(board, spot);
    const white = whiteSpotMove(board, spot);
    const mine = newAtari(board, move, 1);
    const theirs =
      white === null ? { stones: 0, replies: [] } : newAtari(board, white, 2);
    return {
      label: SPOT_LABELS[i] as string,
      spot,
      move,
      size: sizes[i] as number,
      /** 흑이 두면 백 돌이 새로 단수가 된다(흑의 선수) */
      blackSente: mine.stones > 0,
      /** 흑이 두면 새로 단수가 되는 백 돌 수와 백이 받는 자리 */
      mine,
      /** 백이 두면 흑 돌이 새로 단수가 된다(백의 선수) */
      whiteSente: theirs.stones > 0,
      theirs,
    };
  });
}

/** 「A(E5)」 */
const spotName = (s: { label: string; move: number }) =>
  `${s.label}(${named(s.move)})`;

/** 끝내기 한 곳이 어떤 곳인지: 따내는 곳인지, 빈 점 몇 개가 이어진 곳인지 */
function spotWhat(
  board: Board,
  s: { label: string; move: number; spot: readonly number[] },
): string {
  const black = tryPlace(board, s.move, 1);
  if (black.ok && black.captured.length > 0) {
    const taken = [...black.captured].sort((a, b) => a - b).map(named);
    // 백이 먼저 그 자리에 두면 단수인 돌을 이어 살린다(백이 고르는 수가 같은 자리일 때만 말한다)
    const saves = whiteSpotMove(board, s.spot) === s.move;
    return saves
      ? `${spotName(s)}에 흑이 두면 단수인 ${taken.join("·")} 백 돌을 따내고, 백이 먼저 두면 그 돌을 이어 살려요.`
      : `${spotName(s)}에 흑이 두면 단수인 ${taken.join("·")} 백 돌을 따내요.`;
  }
  const empty = s.spot.filter((p) => board[p] === 0);
  if (empty.length === 1)
    return `${topic(spotName(s))} 흑 돌과 백 돌 사이에 낀 빈 점 하나예요.`;
  return `${topic(spotName(s))} ${empty.map(named).join("·")} 빈 점 ${empty.length}개가 이어진 곳이에요.`;
}

function endgameConcept(puzzle: Endgame): string[] {
  // 역끝내기냐 큰 후수냐는 곳 읽기를 compareStory가 한 번에 한다
  if (puzzle.mode === "compare") return compareConcept(puzzle);
  const spots = endgameSpots(puzzle);
  const reply = (r: number[]) => r.map(named).join("·");
  const right = solutionOf(puzzle);
  const mine = spots.find((s) => s.spot.includes(right)) ?? spots[0];
  if (!mine) return [];
  const rest = spots.filter((s) => s !== mine);
  const other = rest[0];
  if (!other) return [];
  const sol = `${mine.label}(${puzzle.solution})`;
  switch (puzzle.mode) {
    case "bigger":
      return [
        `${spots.map((s) => `${topic(s.label)} ${s.size}점짜리`).join(", ")} 후수 끝내기예요.`,
        `큰 곳 ${sol}부터 둬요. 작은 ${other.label}부터 두면 백이 ${mine.label}에 먼저 둬요.`,
      ];
    case "sente": {
      const compare =
        mine.size < other.size
          ? `${other.label}(${other.size}점짜리)보다 작은 ${mine.size}점짜리지만`
          : `${wa(other.label)} 같은 ${mine.size}점짜리지만`;
      return [
        `${sol}에 두면 백 ${subj(points(mine.mine.stones))} 단수가 돼요. 백이 받지 않으면 흑이 따내니 백이 받아야 해요. 그래서 선수예요.`,
        `${compare}, 선수라 먼저 뒀어요. 백이 받은 사이 ${other.label}도 흑이 뒀어요.`,
        `${other.label}부터 두면 후수라 차례가 백에게 넘어가고, 백이 ${mine.label}에 먼저 둬요.`,
      ];
    }
    case "reverse": {
      const line = playLine(puzzle, mine.move);
      const others = rest.map((s) => s.label).join("·");
      return [
        `${sol}에 백이 두면 흑 ${subj(points(mine.theirs.stones))} 단수가 되어, 흑은 ${reply(mine.theirs.replies)}에 이어 받아야 해요. 백의 선수 자리예요.`,
        `흑이 먼저 ${mine.label}에 막는 수는 백 돌을 단수로 몰지 않아 후수예요. 그래도 백의 선수를 없애요. 이렇게 상대의 선수 자리를 먼저 막는 후수 끝내기가 역끝내기예요.`,
        `${others}부터 두면 백이 ${mine.label}에 선수로 두고, 흑이 ${reply(mine.theirs.replies)}에 받으면 다시 백 차례라 백이 남은 한 곳도 가져가요. ${mine.label}부터 막으면 백이 ${placeName(puzzle, line.white)}에 둔 뒤 흑이 ${placeName(puzzle, line.black)}까지 둬, 세 곳 가운데 두 곳을 흑이 가져요.`,
      ];
    }
    case "double": {
      const line = playLine(puzzle, mine.move);
      return [
        `${sol}에 흑이 두면 백 ${subj(points(mine.mine.stones))}, 백이 두면 흑 ${subj(points(mine.theirs.stones))} 단수가 돼요. 누가 두어도 상대가 꼭 받아야 하는 곳이라 양선수예요.`,
        `흑이 먼저 두면 백이 ${placeName(puzzle, line.white)}에 이어 받고, 다시 흑 차례라 ${placeName(puzzle, line.black)}도 흑이 둬, 세 곳 가운데 두 곳을 흑이 가져요.`,
        `다른 곳부터 두면 백이 ${mine.label}에 선수로 두고, 흑이 ${reply(mine.theirs.replies)}에 받으면 다시 백 차례라 백이 남은 한 곳도 가져가요.`,
      ];
    }
  }
}

/**
 * 글에 쓰는 자리 이름: 끝내기 곳이면 그림 이름을 붙여 「A(D9)」, 아니면(받는 자리 등) 좌표만.
 * 그림 이름 글자(A·B·C)와 좌표 글자(A4·C5)가 섞여 읽히지 않게 곳의 자리는 늘 이름을 붙인다
 */
export function placeName(puzzle: Endgame, coord: string): string {
  const at = pointAt(coord, PUZZLE_SIZE);
  const i = spotsOf(puzzle).findIndex((s) => s.includes(at));
  return i < 0 ? coord : `${SPOT_LABELS[i]}(${coord})`;
}

/** 흑이 `first`에 둔 뒤 백이 끝내기 곳 안에서 가장 좋게 받는 자리와, 그다음 흑이 두는 자리(문제 화면과 같은 읽기) */
export function playLine(
  puzzle: Endgame,
  first: number,
): { white: string; black: string } {
  const area = spotsOf(puzzle).flat();
  const start = puzzleState(puzzle).board;
  const one = tryPlace(start, first, 1);
  if (!one.ok) throw new Error(`${puzzle.id}: 첫 수를 둘 수 없다`);
  const w = solveEndgame(one.board, area, 2).best.find((m) => m !== null);
  if (w === undefined || w === null)
    throw new Error(`${puzzle.id}: 백이 받지 않는다`);
  const two = tryPlace(one.board, w, 2);
  if (!two.ok) throw new Error(`${puzzle.id}: 백 수를 둘 수 없다`);
  const b = solveEndgame(two.board, area, 1).best.find((m) => m !== null);
  if (b === undefined || b === null)
    throw new Error(`${puzzle.id}: 흑이 둘 곳이 없다`);
  return { white: named(w), black: named(b) };
}

type CompareStory = ReturnType<typeof readCompare>;
const compareCache = new Map<string, CompareStory>();

/**
 * 역끝내기냐 큰 후수냐: 역끝내기 곳(백의 선수 자리)·큰 후수·작은 후수와, 흑이 역끝내기부터 둘 때·큰 후수부터 둘 때
 * 두 편이 세 곳 안에서 끝까지 가장 좋게 두었을 때(문제 화면과 같은 읽기) 끝난 판의 점수 차.
 * 곳 하나는 누가 먼저 두느냐에 따라 점수 차가 그 크기만큼 달라진다. 두 순서는 세 곳 모두 먼저 두는 쪽이 서로 바뀌는 셈이라,
 * 점수 차의 차이가 (역끝내기 + 작은 후수) − 큰 후수다. 글은 이 셈과 곳마다 먼저 두는 쪽을 말하므로,
 * 판마다 맞는지 endgame-compare.test.ts·endgame-compare-line.test.ts가 엔진으로 본다. 끝까지 읽어 무거우니 문제마다 한 번만 센다
 */
export function compareStory(puzzle: Endgame): CompareStory {
  const known = compareCache.get(puzzle.id);
  if (known) return known;
  const story = readCompare(puzzle);
  compareCache.set(puzzle.id, story);
  return story;
}

function readCompare(puzzle: Endgame) {
  const spots = endgameSpots(puzzle);
  const rev = spots.find((s) => s.whiteSente && !s.blackSente);
  const gotes = spots.filter((s) => s !== rev).sort((a, b) => b.size - a.size);
  const [first, second] = gotes;
  if (
    !rev ||
    !first ||
    !second ||
    gotes.some((g) => g.whiteSente || g.blackSente)
  )
    throw new Error(`${puzzle.id}: 역끝내기 하나와 후수 둘이 아니다`);
  const area = spotsOf(puzzle).flat();
  const start = puzzleState(puzzle).board;
  // 한 읽기 도구로 처음 판의 첫 수마다 결과와 두 순서의 수순을 함께 읽는다(읽은 판을 다시 읽지 않는다)
  const reader = endgameReader(start, area);
  /** 흑이 `opening`에 둔 뒤 두 편이 끝까지 가장 좋게 둔 수순(흑의 첫 수 포함)과 끝난 판의 점수 차 */
  const lineFrom = (opening: number) => {
    const placed = tryPlace(start, opening, 1);
    if (!placed.ok) throw new Error(`${puzzle.id}: 첫 수를 둘 수 없다`);
    const read = reader.line(placed.board, 2);
    return { moves: [opening, ...read.moves], score: read.score };
  };
  const revFirst = lineFrom(rev.move);
  // 두 후수 크기가 같으면, 역끝내기부터 막은 뒤 백이 먼저 두는 곳을 큰 후수로 부른다(어느 쪽이든 셈은 같다)
  const reply = revFirst.moves[1];
  const [big, small] =
    first.size === second.size &&
    reply !== undefined &&
    second.spot.includes(reply)
      ? [second, first]
      : [first, second];
  const bigFirst = lineFrom(big.move);
  return {
    rev,
    big,
    small,
    /**
     * 처음 판에서 흑의 가장 좋은 첫 수들(`solveEndgame`의 `best`와 같다). 해설에는 쓰지 않아 물을 때 읽는다.
     * 두 순서의 수순을 읽은 판을 기억하고 있어 처음부터 따로 읽는 것보다 가볍다
     */
    best: () => reader.choose(start, 1).best,
    /** 흑이 역끝내기부터 둘 때 끝까지 둔 수순(흑의 첫 수부터 흑·백 번갈아)과 끝난 판의 점수 차(흑 − 백) */
    revFirst,
    /** 흑이 큰 후수부터 둘 때 끝까지 둔 수순과 끝난 판의 점수 차 */
    bigFirst,
    revFirstScore: revFirst.score,
    bigFirstScore: bigFirst.score,
    /** 역끝내기부터 두는 것이 정답인가 */
    revWins: revFirst.score > bigFirst.score,
    /** 두 순서의 점수 차 차이(늘 양수) */
    gap: Math.abs(revFirst.score - bigFirst.score),
  };
}

/** 곳 이름 둘을 그림 차례로 「A·C」 */
const both = (labels: string[]) => [...labels].sort().join("·");

function compareConcept(puzzle: Endgame): string[] {
  const c = compareStory(puzzle);
  const { rev, big, small } = c;
  const reply = rev.theirs.replies.map(named).join("·");
  const sum = rev.size + small.size;
  // 작은 후수가 역끝내기와 크기가 같은 판에서만 「두 배」라고 말한다
  // 작은 후수가 역끝내기와 크기가 같은 판에서만 「두 배」라고 말한다
  const twice =
    small.size === rev.size
      ? ` ${subj(small.label)} 역끝내기와 같은 ${rev.size}점짜리라, 역끝내기를 미루면 그 두 배인 ${sum}점을 내주는 셈이에요.`
      : "";
  const same =
    big.size === small.size
      ? ` ${topic(both([big.label, small.label]))} 크기가 같아 어느 쪽을 큰 후수로 봐도 셈은 같아요.`
      : "";
  return [
    `${spotName(rev)}에 백이 두면 흑 ${subj(points(rev.theirs.stones))} 단수가 되어 흑은 ${reply}에 이어 받아야 해요. 백의 선수 자리라, 흑이 먼저 막으면 역끝내기예요.`,
    `${topic(rev.label)} ${rev.size}점짜리, ${topic(spotName(big))} ${big.size}점짜리, ${topic(spotName(small))} ${small.size}점짜리예요. 역끝내기 ${subj(rev.label)} ${small.size > rev.size ? both([big.label, small.label]) : big.label}보다 작아요.${same}`,
    `${rev.label}부터 막으면 그 뒤 ${big.label}에는 백이, ${small.label}에는 흑이 먼저 둬요. ${big.label}부터 두면 그 뒤 ${both([rev.label, small.label])}에 모두 백이 먼저 둬요. 백이 ${rev.label}에 두면 흑이 ${reply}에 받아야 해서, 차례가 다시 백에게 가거든요.`,
    `끝내기 한 곳은 누가 먼저 두느냐에 따라 점수 차가 그 크기만큼 달라져요. ${rev.label}부터 두면 흑이 ${both([rev.label, small.label])}에 먼저 두고, ${big.label}부터 두면 흑이 ${big.label}에만 먼저 둬요. 그래서 ${rev.size} + ${small.size} = ${sum}점과 ${big.size}점을 견줘요.${twice}`,
    c.revWins
      ? `${sum}점이 더 커서 ${rev.label}부터 막았어요. ${big.label}부터 둘 때보다 점수 차가 ${c.gap}점 더 커요.`
      : `${big.size}점이 더 커서 ${big.label}부터 뒀어요. ${rev.label}부터 막을 때보다 점수 차가 ${c.gap}점 더 커요.`,
  ];
}

function compareFacts(puzzle: Endgame): string[] {
  const c = compareStory(puzzle);
  const { rev, big, small } = c;
  const reply = rev.theirs.replies.map(named).join("·");
  const sum = rev.size + small.size;
  return [
    `백이 ${spotName(rev)}에 두면 흑 ${subj(points(rev.theirs.stones))} 단수가 되어 흑은 ${reply}에 이어야 해요. 백의 선수 자리라, 흑이 먼저 막으면 역끝내기예요.`,
    `${spotName(rev)} ${rev.size}점과 ${spotName(small)} ${small.size}점을 더하면 ${sum}점, ${topic(spotName(big))} ${big.size}점짜리예요.`,
    // 작은 후수가 역끝내기와 크기가 같은 판에서만 「두 배」라고 말한다
    ...(small.size === rev.size
      ? [
          `${subj(spotName(small))} 역끝내기와 같은 ${rev.size}점짜리라, ${rev.label}부터 막지 않으면 그 두 배인 ${sum}점을 내주는 셈이에요.`,
        ]
      : []),
    c.revWins
      ? `그래서 ${spotName(rev)}부터 막아 ${both([rev.label, small.label])}에 흑이 먼저 뒀고, ${big.label}부터 둘 때보다 점수 차가 ${c.gap}점 더 커요.`
      : `그래서 ${spotName(big)}부터 뒀어요. ${both([rev.label, small.label])}에 백이 먼저 두어도 ${rev.label}부터 막을 때보다 점수 차가 ${c.gap}점 더 커요.`,
  ];
}

/** 끝내기 뒤 문제: 이 판의 크기·받는 자리·점수 차만 */
function endgameFacts(puzzle: Endgame): string[] {
  if (puzzle.mode === "compare") return compareFacts(puzzle);
  const { board } = puzzleState(puzzle);
  const spots = endgameSpots(puzzle);
  const right = solutionOf(puzzle);
  const mine = spots.find((s) => s.spot.includes(right)) ?? spots[0];
  if (!mine) return [];
  const rest = spots.filter((s) => s !== mine);
  const big = rest.reduce((a, b) => (b.size > a.size ? b : a), rest[0] ?? mine);
  const reply = (r: number[]) => r.map(named).join("·");
  switch (puzzle.mode) {
    case "bigger":
      return [
        `${spotWhat(board, mine)} 누가 먼저 두느냐에 따라 점수 차가 ${mine.size}점 달라져 ${mine.size}점짜리예요.`,
        `${topic(spotName(big))} ${big.size}점짜리라 ${subj(mine.label)} ${mine.size - big.size}점 더 커요.`,
      ];
    case "sente":
      return [
        `${spotName(mine)}에 두면 백 ${subj(points(mine.mine.stones))} 단수가 되어 백은 ${reply(mine.mine.replies)}에 이어야 해요.`,
        `${topic(spotName(big))} ${big.size}점짜리로 ${mine.size < big.size ? `${mine.size}점짜리 ${mine.label}보다 크지만` : `${wa(mine.label)} 크기가 같지만`}, 선수인 ${mine.label}부터 두면 백이 ${reply(mine.mine.replies)}에 받은 뒤 다시 흑 차례라 ${big.label}까지 흑이 둬요.`,
      ];
    case "reverse": {
      const line = playLine(puzzle, mine.move);
      return [
        `백이 ${spotName(mine)}에 두면 흑 ${subj(points(mine.theirs.stones))} 단수가 되어 흑은 ${reply(mine.theirs.replies)}에 이어야 해요.`,
        `흑이 ${mine.label}에 먼저 막자 백은 ${placeName(puzzle, line.white)}에 두고 흑이 ${placeName(puzzle, line.black)}까지 둬, 세 곳 가운데 두 곳을 흑이 가졌어요.`,
      ];
    }
    case "double": {
      const line = playLine(puzzle, mine.move);
      return [
        `${spotName(mine)}에 흑이 두면 백 ${subj(points(mine.mine.stones))} 단수가 되어 백이 ${reply(mine.mine.replies)}에, 백이 두면 흑 ${subj(points(mine.theirs.stones))} 단수가 되어 흑이 ${reply(mine.theirs.replies)}에 이어야 해요.`,
        `흑이 먼저 두어 백이 ${placeName(puzzle, line.white)}에 받은 뒤 ${placeName(puzzle, line.black)}까지 둬, 세 곳 가운데 두 곳을 흑이 가졌어요.`,
      ];
    }
  }
}
