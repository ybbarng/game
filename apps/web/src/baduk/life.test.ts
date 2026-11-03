// @vitest-environment node
/*
 * 바둑 사활 문제(두 눈 만들기·눈 빼앗기·이름 있는 모양) 확인. 읽기가 길어 study.test.ts와 나눠 동시에 돈다
 */
import {
  groupOf,
  lifeKeyMoves,
  lifeWrongMovesFail,
  passAliveStones,
  pointAt,
  pointName,
} from "@game/baduk-engine";
import { describe, expect, it } from "vitest";

import {
  BADUK_PUZZLE_SETS,
  type BadukPuzzle,
  LIFE_SHAPE_NAMES,
} from "./puzzles";
import {
  explainSolved,
  judgeMove,
  lifeProblem,
  PUZZLE_SIZE,
  puzzleState,
  solutionOf,
  targetOf,
} from "./study";

type Life = Extract<BadukPuzzle, { kind: "life" }>;

const lives = BADUK_PUZZLE_SETS.flatMap((s) => s.puzzles).filter(
  (p): p is Life => p.kind === "life",
);
const shapes = lives.filter((p) => p.shape !== undefined);
const rows = <T extends { id: string }>(ps: T[]) =>
  ps.map((p) => [p.id, p] as const);
const name = (p: number) => pointName(p, PUZZLE_SIZE);

/**
 * 사활을 읽는 깊이(두 편 합): 빈 자리 수의 두 배와 조금.
 * 이름 있는 모양은 더 깊게 읽는다. 다섯·여섯 집을 잡으려면 백이 안에 든 흑 돌을 따낸 뒤 다시 급소에 두고 채워야 해서
 * 따내기까지 수가 길다(뭉친 다섯 집·오궁도화는 22수, 매화육궁은 32수가 있어야 따낸다)
 */
const SHAPE_DEPTH: Record<number, number> = { 3: 8, 4: 16, 5: 28, 6: 34 };
const lifeDepth = (p: Life) =>
  (p.shape && SHAPE_DEPTH[p.area.length]) ||
  Math.min(16, 2 * p.area.length + 2);

describe("사활 문제(두 눈 만들기·눈 빼앗기)", () => {
  it.each(rows(lives))(
    "%s: 처음에는 산 모양이 아니고, 정답은 하나뿐이며 다른 수는 반대 결과가 된다",
    (_id, p) => {
      const { board } = puzzleState(p);
      const problem = lifeProblem(p);
      const owner = board[problem.target] as 1 | 2;
      expect(passAliveStones(board, owner).has(problem.target)).toBe(false);
      const keys = lifeKeyMoves(board, problem, 1, lifeDepth(p));
      expect(keys.map(name)).toEqual([p.solution]);
      expect(lifeWrongMovesFail(board, problem, 1, lifeDepth(p), keys)).toBe(
        true,
      );
    },
  );

  it.each(rows(lives))("%s: 정답만 푼 것이고 해설이 나온다", (_id, p) => {
    const state = puzzleState(p);
    const other = p.area.find((a) => a !== p.solution) as string;
    expect(judgeMove(p, state, solutionOf(p), 0)).toBe("solved");
    expect(judgeMove(p, state, solutionOf({ ...p, solution: other }), 0)).toBe(
      "wrong",
    );
    expect(
      explainSolved(p, state.board, solutionOf(p), 1).length,
    ).toBeGreaterThanOrEqual(3);
  });
});

describe("이름 있는 모양", () => {
  it("묶음에 문제가 있고, 여러 모양을 다룬다", () => {
    expect(shapes.length).toBeGreaterThanOrEqual(8);
    expect(new Set(shapes.map((p) => p.shape)).size).toBeGreaterThanOrEqual(5);
  });

  it.each(rows(shapes))(
    "%s: 바깥을 둘러싼 돌은 모두 그대로 산 돌이고(벤슨), 안쪽 무리의 활로는 눈 자리뿐이다",
    (_id, p) => {
      const { board } = puzzleState(p);
      const owner = p.goal === "live" ? 1 : 2;
      const wall = owner === 1 ? p.white : p.black;
      const alive = passAliveStones(board, owner === 1 ? 2 : 1);
      expect(wall.filter((w) => !alive.has(pointAt(w, PUZZLE_SIZE)))).toEqual(
        [],
      );
      const inner = groupOf(board, targetOf(p));
      expect(inner.stones).toHaveLength(
        (owner === 1 ? p.black : p.white).length,
      );
      for (const l of inner.liberties) expect(p.area).toContain(name(l));
    },
  );

  it.each(rows(shapes))(
    "%s: 해설 첫 줄에 모양 이름과 급소가 있다",
    (_id, p) => {
      const state = puzzleState(p);
      const [first] = explainSolved(p, state.board, solutionOf(p), 1);
      expect(first).toContain(
        LIFE_SHAPE_NAMES[p.shape as keyof typeof LIFE_SHAPE_NAMES],
      );
      expect(first).toContain("급소");
    },
  );
});
