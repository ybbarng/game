// @vitest-environment node
// 수 배우기 단원 글의 판에 관한 말을 엔진으로 확인한다(study-lessons.ts).
import {
  areaOwners,
  areaScore,
  type Cell,
  emptyBoard,
  groupOf,
  neighbors,
  pointAt,
  pointName,
  solveEndgame,
  starPoints,
  tryPlace,
} from "@game/baduk-engine";
import { describe, expect, it } from "vitest";
import {
  koLossOf,
  PUZZLE_SIZE,
  puzzleState,
  spotMoveOf,
  spotSizesOf,
  spotsOf,
} from "./study";
import {
  AREA_WALLS,
  BADUK_STUDY_LESSONS,
  BREAKER_LESSON_PUZZLE,
  BREAKER_RIGHT_PATH,
  BREAKER_WRONG_PATH,
  CORNER_POINTS,
  DOUBLE_STORY,
  ENDGAME_DOUBLE_PUZZLE,
  ENDGAME_REVERSE_PUZZLE,
  ENDGAME_SENTE_PUZZLE,
  ENDGAME_SIZE_PUZZLE,
  gainText,
  KO_CONNECT_LESSON_PUZZLE,
  KO_CONNECT_LOST,
  KO_CONNECT_THREATENED,
  KO_LESSON_PUZZLE,
  LADDER_LESSON_PATH,
  LADDER_LESSON_PUZZLE,
  ORDER_GAIN,
  otherSide,
  REVERSE_STORY,
  SENTE_REPLY,
  SENTE_SIZES,
  SENTE_THREATENED,
  spotStory,
} from "./study-lessons";

const SIZE = 19;

/** 흑 돌만 놓인 판에서 빈 자리 하나가 속한 빈 영역(이어진 빈 자리) */
function emptyRegion(board: Cell[], start: number): number[] {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const at = queue.pop() as number;
    for (const n of neighbors(at, SIZE))
      if (board[n] === 0 && !seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
  }
  return [...seen];
}

describe("포석 단원: 귀·변·가운데 그림", () => {
  it.each([
    ["귀", AREA_WALLS.corner, "B2", 6],
    ["변", AREA_WALLS.side, "K2", 9],
    ["가운데", AREA_WALLS.center, "K10", 12],
  ] as const)(
    "%s: 흑 돌만으로 빈 자리 아홉 곳을 둘러쌌고, 든 돌은 %s",
    (_where, walls, inside, count) => {
      const board = emptyBoard(SIZE);
      for (const name of walls) board[pointAt(name, SIZE)] = 1;
      expect(walls.length).toBe(count);
      expect(emptyRegion(board, pointAt(inside, SIZE))).toHaveLength(9);
    },
  );

  it("세 그림을 한 판에 함께 놓아도 서로 닿지 않는다", () => {
    const board = emptyBoard(SIZE);
    const all = [
      ...AREA_WALLS.corner,
      ...AREA_WALLS.side,
      ...AREA_WALLS.center,
    ];
    for (const name of all) board[pointAt(name, SIZE)] = 1;
    expect(new Set(all).size).toBe(all.length);
    for (const inside of ["B2", "K2", "K10"])
      expect(emptyRegion(board, pointAt(inside, SIZE))).toHaveLength(9);
  });

  it("귀의 세 자리: 화점은 판의 점, 소목은 셋째·넷째 줄, 삼삼은 셋째·셋째 줄이다", () => {
    const stars = starPoints(SIZE).map((p) => pointName(p, SIZE));
    expect(stars).toContain(CORNER_POINTS.star);
    // 왼쪽 위 귀: 가로는 A부터, 세로는 19부터 센다
    const lines = (name: string) => {
      const at = pointAt(name, SIZE);
      return [(at % SIZE) + 1, Math.floor(at / SIZE) + 1];
    };
    expect(lines(CORNER_POINTS.star)).toEqual([4, 4]);
    expect(lines(CORNER_POINTS.komoku).sort()).toEqual([3, 4]);
    expect(lines(CORNER_POINTS.sansan)).toEqual([3, 3]);
  });
});

describe("패 단원 그림", () => {
  it("백이 방금 패를 따냈고, 흑의 팻감은 백 두 점을 단수로 몬다", () => {
    const p = KO_LESSON_PUZZLE;
    const { board } = puzzleState(p);
    expect(board[pointAt(p.ko, PUZZLE_SIZE)]).toBe(0);
    const threat = tryPlace(board, pointAt(p.solution, PUZZLE_SIZE), 1);
    if (!threat.ok) throw new Error("팻감을 둘 수 없다");
    const target = groupOf(threat.board, pointAt(p.target, PUZZLE_SIZE));
    expect(target.stones).toHaveLength(2);
    expect(target.liberties.map((l) => pointName(l, PUZZLE_SIZE))).toEqual([
      p.reply,
    ]);
  });
});

describe("축 단원 그림", () => {
  it("긴 축: A·B는 노리는 돌의 두 활로다", () => {
    const p = LADDER_LESSON_PUZZLE;
    const { board } = puzzleState(p);
    const libs = groupOf(board, pointAt(p.target, PUZZLE_SIZE))
      .liberties.map((l) => pointName(l, PUZZLE_SIZE))
      .sort();
    expect(libs).toEqual([p.solution, otherSide(p)].sort());
  });

  it("축머리: □는 축머리 돌이고, B는 정답이 아닌 다른 쪽 활로다", () => {
    const p = BREAKER_LESSON_PUZZLE;
    const { board } = puzzleState(p);
    expect(board[pointAt(p.breaker ?? "", PUZZLE_SIZE)]).toBe(2);
    const libs = groupOf(board, pointAt(p.target, PUZZLE_SIZE))
      .liberties.map((l) => pointName(l, PUZZLE_SIZE))
      .sort();
    expect(libs).toEqual([p.solution, otherSide(p)].sort());
  });
});

describe("축 단원 그림의 점(·) 길", () => {
  const touches = (path: readonly string[], stone: string) =>
    path.some((n) =>
      neighbors(pointAt(n, PUZZLE_SIZE), PUZZLE_SIZE).includes(
        pointAt(stone, PUZZLE_SIZE),
      ),
    );

  it("길은 빈 자리이고, 긴 축은 판 끝 가까이까지 간다", () => {
    expect(LADDER_LESSON_PATH.length).toBeGreaterThanOrEqual(8);
    for (const n of [...LADDER_LESSON_PATH, ...BREAKER_WRONG_PATH])
      expect(n).toMatch(/^[A-HJ][1-9]$/);
    const last = pointAt(LADDER_LESSON_PATH.at(-1) as string, PUZZLE_SIZE);
    const [x, y] = [last % PUZZLE_SIZE, Math.floor(last / PUZZLE_SIZE)];
    // 마지막으로 뻗은 자리는 판 끝 줄이거나 그 바로 안쪽 줄이다
    expect([x, y].some((v) => v <= 1 || v >= PUZZLE_SIZE - 2)).toBe(true);
  });

  it("축머리 쪽 길은 끝이 축머리 바로 옆이고, 정답 쪽 길은 축머리에 닿지 않는다", () => {
    const breaker = BREAKER_LESSON_PUZZLE.breaker as string;
    const { board } = puzzleState(BREAKER_LESSON_PUZZLE);
    for (const n of [...BREAKER_WRONG_PATH, ...BREAKER_RIGHT_PATH])
      expect(board[pointAt(n, PUZZLE_SIZE)]).toBe(0);
    expect(touches([BREAKER_WRONG_PATH.at(-1) as string], breaker)).toBe(true);
    expect(touches(BREAKER_RIGHT_PATH, breaker)).toBe(false);
    expect(BREAKER_RIGHT_PATH.length).toBeGreaterThanOrEqual(3);
  });
});

describe("단원 글", () => {
  it("단원 id는 lesson-으로 시작하고 겹치지 않는다", () => {
    const ids = BADUK_STUDY_LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith("lesson-")).toBe(true);
  });

  it("설명 문장은 마침표로 끝난다", () => {
    for (const lesson of BADUK_STUDY_LESSONS)
      for (const step of lesson.steps) {
        if (step.kind === "explain")
          for (const line of step.body) expect(line).toMatch(/[.?]$/);
        if (step.kind === "quiz") expect(step.explain).toMatch(/\.$/);
      }
  });

  it("초보자 글에 판단을 넘기는 말(될 때까지, 알아서, 잘 보고)을 쓰지 않는다", () => {
    const text = JSON.stringify(BADUK_STUDY_LESSONS);
    expect(text).not.toMatch(/될 때까지|알아서|잘 보고/);
  });
});

describe("패로 버티기 단원: 패를 잇는 때 그림", () => {
  const p = KO_CONNECT_LESSON_PUZZLE;

  it("□ 돌은 패에 걸린 흑 한 점과 함께 잡히는 돌이고, 노리는 돌보다 많다", () => {
    expect(KO_CONNECT_LOST).toContain(p.setup[0]);
    expect(KO_CONNECT_LOST).toHaveLength(koLossOf(p));
    expect(KO_CONNECT_LOST.length).toBeGreaterThan(KO_CONNECT_THREATENED);
    expect(KO_CONNECT_THREATENED).toBe(1);
  });
});

describe("끝내기 단원", () => {
  const p = ENDGAME_SIZE_PUZZLE;
  const { board } = puzzleState(p);
  const A = spotStory(p, 0);
  const B = spotStory(p, 1);

  it("곳마다 「점수 차가 느는 만큼 + 주는 만큼」이 엔진이 센 크기다", () => {
    expect(A.up + A.down).toBe(spotSizesOf(p)[0]);
    expect(B.up + B.down).toBe(spotSizesOf(p)[1]);
  });

  it("그림은 왼쪽이 흑 집, 오른쪽이 백 집이다", () => {
    const owners = areaOwners(board);
    expect(owners[pointAt("A5", PUZZLE_SIZE)]).toBe(1);
    expect(owners[pointAt("J5", PUZZLE_SIZE)]).toBe(2);
  });

  it("B는 빈 점 하나로 흑·백 돌 모두에 닿고, 어느 편이 두어도 상대 돌이 새로 단수가 되지 않는다", () => {
    const b = pointAt(B.move, PUZZLE_SIZE);
    expect(spotsOf(p)[1]).toEqual([b]);
    const touching = new Set(
      [pointAt(B.move, PUZZLE_SIZE)].flatMap((q) =>
        [q - 9, q + 9, q - 1, q + 1]
          .filter((n) => n >= 0 && n < 81)
          .map((n) => board[n]),
      ),
    );
    expect(touching.has(1) && touching.has(2)).toBe(true);
    for (const c of [1, 2] as const) {
      const placed = tryPlace(board, b, c);
      if (!placed.ok) throw new Error("둘 수 없다");
      const foe = c === 1 ? 2 : 1;
      const fresh = placed.board.some(
        (x, q) =>
          x === foe &&
          groupOf(placed.board, q).liberties.length === 1 &&
          groupOf(board, q).liberties.length > 1,
      );
      expect(fresh).toBe(false);
    }
  });

  it("A는 흑이 따내면 흑 2점이 늘고 백 1점이 줄며, 백이 이으면 백 1점이 는다", () => {
    expect(A.black).toEqual({ black: 2, white: -1 });
    expect(A.white).toEqual({ black: 0, white: 1 });
  });

  it("두는 차례에 따른 점수 차 변화는 두 곳을 함께 끝까지 읽은 값과 같다", () => {
    const base = areaScore(board);
    const diff0 = base.black - base.white;
    const all = [...spotsOf(p)[0], ...spotsOf(p)[1]];
    expect(solveEndgame(board, all, 1).score - diff0).toBe(ORDER_GAIN.bigFirst);
    const small = tryPlace(board, pointAt(B.move, PUZZLE_SIZE), 1);
    if (!small.ok) throw new Error("둘 수 없다");
    const rest = all.filter((q) => small.board[q] === 0);
    expect(solveEndgame(small.board, rest, 2).score - diff0).toBe(
      ORDER_GAIN.smallFirst,
    );
  });

  it("B는 흑이 두면 흑이 1점, 백이 두면 백이 1점 느는 2점짜리다", () => {
    expect(B.black).toEqual({ black: 1, white: 0 });
    expect(B.white).toEqual({ black: 0, white: 1 });
    expect(B.size).toBe(2);
  });

  it("A 옆의 백 한 점은 단수라 흑이 두면 따내고, 백이 두면 이어 살린다. A가 B보다 크다", () => {
    const a = pointAt(A.move, PUZZLE_SIZE);
    const taken = tryPlace(board, a, 1);
    expect(taken.ok && taken.captured.length).toBe(1);
    const saved = tryPlace(board, a, 2);
    if (!saved.ok) throw new Error("백이 둘 수 없다");
    const libs = groupOf(saved.board, a).liberties.length;
    expect(libs).toBeGreaterThan(1);
    expect(A.size).toBeGreaterThan(B.size);
  });

  it("점수 변화 글", () => {
    expect(gainText({ black: 2, white: -1 })).toBe(
      "흑 점수는 2점 늘고, 백 점수는 1점 줄어요",
    );
    expect(gainText({ black: 0, white: 1 })).toBe("백 점수가 1점 늘어요");
  });

  it("선수 그림: 선수 곳에 두면 백 돌이 새로 단수가 되고, 후수 곳에 두면 새로 단수가 되는 백 돌이 없다. 선수가 크지 않다", () => {
    const s = ENDGAME_SENTE_PUZZLE;
    const start = puzzleState(s).board;
    expect(SENTE_THREATENED).toBeGreaterThan(0);
    const solution = pointAt(s.solution, PUZZLE_SIZE);
    const gote = spotsOf(s)
      .map((spot) => spotMoveOf(start, spot))
      .find((m) => m !== solution) as number;
    const placed = tryPlace(start, gote, 1);
    if (!placed.ok) throw new Error("둘 수 없다");
    const fresh = placed.board.some(
      (c, q) =>
        c === 2 &&
        groupOf(placed.board, q).liberties.length === 1 &&
        groupOf(start, q).liberties.length > 1,
    );
    expect(fresh).toBe(false);
    expect(SENTE_SIZES[0]).toBeLessThanOrEqual(SENTE_SIZES[1]);
    // 처음 판에 단수인 흑 돌이 없다(백이 받는 수가 흑 돌을 따내지 않는다)
    for (let q = 0; q < start.length; q++)
      if (start[q] === 1)
        expect(groupOf(start, q).liberties.length).toBeGreaterThan(1);

    // 백이 받는 자리는 새로 단수가 된 백 무리의 활로다
    const atari = tryPlace(start, solution, 1);
    if (!atari.ok) throw new Error("둘 수 없다");
    const reply = pointAt(SENTE_REPLY, PUZZLE_SIZE);
    expect(
      atari.board.some(
        (c, q) =>
          c === 2 &&
          groupOf(atari.board, q).liberties.length === 1 &&
          groupOf(atari.board, q).liberties[0] === reply,
      ),
    ).toBe(true);
  });

  /** 끝내기 곳 안에서 이 편이 가장 좋게 두는 첫 자리(문제 화면과 같은 읽기: 차례대로 첫 것) */
  const bestIn = (
    board: readonly Cell[],
    p: typeof ENDGAME_REVERSE_PUZZLE,
    turn: 1 | 2,
  ) => {
    const all = solveEndgame(board, spotsOf(p).flat(), turn).best;
    return all.filter((m): m is number => m !== null);
  };
  const place = (board: readonly Cell[], at: number, stone: 1 | 2) => {
    const r = tryPlace(board, at, stone);
    if (!r.ok) throw new Error(`${pointName(at, PUZZLE_SIZE)}에 둘 수 없다`);
    return r.board;
  };
  const spotOf = (p: typeof ENDGAME_REVERSE_PUZZLE, at: number) =>
    spotsOf(p).findIndex((s) => s.includes(at));

  it("역끝내기 그림: 백이 정답 곳에 두면 흑 돌이 단수가 되고, 흑이 두면 아니다. 다른 곳부터 두면 백이 선수로 두고 남은 곳까지 가져가 흑은 한 곳뿐, 먼저 막으면 흑이 두 곳", () => {
    const p = ENDGAME_REVERSE_PUZZLE;
    const s = REVERSE_STORY;
    const start = puzzleState(p).board;
    const key = pointAt(s.move, PUZZLE_SIZE);
    expect(s.white.stones).toBeGreaterThan(0);
    expect(s.black.stones).toBe(0);
    expect(s.others).toHaveLength(2);
    // 글의 셈 「흑 돌만큼 1점, 백 돌만큼 1점, 흑이 받는 자리는 흑 집이라 그대로, 1 + 1 = 2」
    expect(s.sizes).toEqual([2, 2, 2]);
    expect(spotsOf(p).find((x) => x.includes(key))).toEqual([key]);
    expect(areaOwners(start)[key]).toBe(0);
    const blackAtKey = tryPlace(start, key, 1);
    expect(blackAtKey.ok ? blackAtKey.captured : null).toEqual([]);
    expect(areaOwners(start)[pointAt(s.white.reply, PUZZLE_SIZE)]).toBe(1);
    for (const [i, spot] of spotsOf(p).entries()) {
      if (spot.includes(key)) continue;
      // 흑이 다른 곳 → 백은 정답 곳(선수) → 흑은 글의 받는 자리 → 백은 남은 곳
      const one = place(start, spotMoveOf(start, spot), 1);
      expect(bestIn(one, p, 2)).toContain(key);
      const two = place(one, key, 2);
      expect(bestIn(two, p, 1)).toContain(pointAt(s.white.reply, PUZZLE_SIZE));
      const three = place(two, pointAt(s.white.reply, PUZZLE_SIZE), 1);
      const third = spotsOf(p).findIndex(
        (_x, j) => j !== i && !_x.includes(key),
      );
      const whiteNext = bestIn(three, p, 2);
      expect(whiteNext.some((m) => spotOf(p, m) === third)).toBe(true);
    }
    // 흑이 먼저 막으면 백은 다른 곳 하나, 흑은 남은 곳
    const w = pointAt(s.line.white, PUZZLE_SIZE);
    const b = pointAt(s.line.black, PUZZLE_SIZE);
    expect(new Set([spotOf(p, key), spotOf(p, w), spotOf(p, b)]).size).toBe(3);
  });

  it("양선수 그림: 흑이 두면 백 돌이, 백이 두면 흑 돌이 단수가 되고, 글의 받는 자리가 그 무리의 활로다. 흑이 놓치면 백이 선수로 두고 남은 곳까지 둔다", () => {
    const p = ENDGAME_DOUBLE_PUZZLE;
    const s = DOUBLE_STORY;
    const start = puzzleState(p).board;
    const key = pointAt(s.move, PUZZLE_SIZE);
    expect(s.black.stones).toBeGreaterThan(0);
    expect(s.white.stones).toBeGreaterThan(0);
    // 흑이 먼저 두면 백은 글의 자리에 이어 받는다
    const mine = place(start, key, 1);
    expect(bestIn(mine, p, 2)).toEqual([pointAt(s.black.reply, PUZZLE_SIZE)]);
    // 흑이 다른 곳부터 두면 백이 양선수에 두고, 흑은 글의 자리에 받고, 백이 남은 곳에 둔다
    const other = spotsOf(p).findIndex((x) => !x.includes(key));
    const one = place(
      start,
      spotMoveOf(start, spotsOf(p)[other] as number[]),
      1,
    );
    expect(bestIn(one, p, 2)).toContain(key);
    const two = place(one, key, 2);
    expect(bestIn(two, p, 1)).toContain(pointAt(s.white.reply, PUZZLE_SIZE));
    const three = place(two, pointAt(s.white.reply, PUZZLE_SIZE), 1);
    const third = spotsOf(p).findIndex(
      (x, j) => j !== other && !x.includes(key),
    );
    expect(bestIn(three, p, 2).some((m) => spotOf(p, m) === third)).toBe(true);
  });

  it("퀴즈 보기는 서로 다르다", () => {
    const lesson = BADUK_STUDY_LESSONS.find((l) => l.id === "lesson-endgame");
    for (const step of lesson?.steps ?? [])
      if (step.kind === "quiz")
        expect(new Set(step.options).size).toBe(step.options.length);
  });
});
