// @vitest-environment node
// 수 배우기 단원 글의 판에 관한 말을 엔진으로 확인한다(study-lessons.ts).
import {
  type Cell,
  emptyBoard,
  groupOf,
  neighbors,
  pointAt,
  pointName,
  starPoints,
  tryPlace,
} from "@game/baduk-engine";
import { describe, expect, it } from "vitest";
import { PUZZLE_SIZE, puzzleState } from "./study";
import {
  AREA_WALLS,
  BADUK_STUDY_LESSONS,
  BREAKER_LESSON_PUZZLE,
  BREAKER_RIGHT_PATH,
  BREAKER_WRONG_PATH,
  CORNER_POINTS,
  KO_LESSON_PUZZLE,
  LADDER_LESSON_PATH,
  LADDER_LESSON_PUZZLE,
  otherSide,
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
