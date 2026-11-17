// 끝내기 역끝내기냐 큰 후수냐(docs/23 바둑): 크기가 다른 세 곳 안에서 끝까지 읽어, 정답이 하나뿐이고
// 「역끝내기 + 작은 후수」와 「큰 후수」를 견주는 셈이 그 판에서 맞는지 엔진으로 본다.
// 화면 판정 흐름은 endgame-compare-flow.test.ts가 본다(판마다 다시 읽어 무거워 나눴다).
import {
  areaOwners,
  type Board,
  groupOf,
  pointName,
  type Stone,
  solveEndgame,
  tryPlace,
} from "@game/baduk-engine";
import { describe, expect, it } from "vitest";
import { shapeKey } from "./puzzle-shape";
import { BADUK_PUZZLE_SETS, type BadukPuzzle } from "./puzzles";
import {
  PUZZLE_SIZE,
  puzzleState,
  solutionOf,
  spotMoveOf,
  spotSizesOf,
  spotsOf,
} from "./study";
import { compareStory } from "./study-explain";

type Endgame = Extract<BadukPuzzle, { kind: "endgame" }>;

const set = (BADUK_PUZZLE_SETS.find((s) => s.id === "endgame-compare")
  ?.puzzles ?? []) as Endgame[];
const rows = set.map((p) => [p.id, p] as const);
const name = (at: number) => pointName(at, PUZZLE_SIZE);

/** `mover`가 `at`에 두면 새로 단수가 되는 상대 돌이 있나 */
function makesAtari(board: Board, at: number, mover: Stone): boolean {
  const placed = tryPlace(board, at, mover);
  if (!placed.ok) return false;
  const enemy = mover === 1 ? 2 : 1;
  return placed.board.some(
    (c, q) =>
      c === enemy &&
      groupOf(placed.board, q).liberties.length === 1 &&
      groupOf(board, q).liberties.length > 1,
  );
}

/** 한 곳에서 백이 먼저 둘 가장 좋은 자리 */
function whiteMove(board: Board, spot: number[]): number {
  const m = solveEndgame(board, spot, 2).best.find((x) => x !== null);
  if (m === undefined || m === null) throw new Error("백이 둘 수가 없다");
  return m;
}

describe("역끝내기냐 큰 후수냐: 판 모양", () => {
  it("묶음에 문제가 여섯 개 있고, 역끝내기부터인 판과 큰 후수부터인 판이 둘 이상씩 섞였다", () => {
    expect(set).toHaveLength(6);
    const revFirst = set.filter((p) => compareStory(p).revWins).length;
    expect(revFirst).toBeGreaterThanOrEqual(2);
    expect(set.length - revFirst).toBeGreaterThanOrEqual(2);
  });

  it("정답 자리 둘레 모양이 서로 다른 것이 넷 이상이다(판 대칭으로 돌린 같은 모양은 하나로 센다)", () => {
    const keys = set.map((p) =>
      shapeKey(puzzleState(p).board, PUZZLE_SIZE, solutionOf(p)),
    );
    expect(new Set(keys).size).toBeGreaterThanOrEqual(4);
  });

  it.each(rows)(
    "%s: 누구 것도 아닌 빈 점은 세 곳에만 있고, 흑 땅·백 땅이 따로 있으며, 처음 판에 단수인 돌이 없다",
    (_id, p) => {
      const { board } = puzzleState(p);
      const owners = areaOwners(board);
      const neutral = board
        .map((c, i) => (c === 0 && owners[i] === 0 ? i : -1))
        .filter((i) => i >= 0);
      expect(spotsOf(p)).toHaveLength(3);
      expect(neutral).toEqual(
        spotsOf(p)
          .flat()
          .sort((a, b) => a - b),
      );
      expect(owners.filter((o) => o === 1).length).toBeGreaterThan(9);
      expect(owners.filter((o) => o === 2).length).toBeGreaterThan(9);
      const inAtari = board.flatMap((c, q) =>
        c && groupOf(board, q).liberties.length === 1 ? [name(q)] : [],
      );
      expect(inAtari).toEqual([]);
    },
  );

  it.each(rows)(
    "%s: 한 곳은 백이 두면 흑 돌이 새로 단수가 되고 흑이 두면 아닌 곳(역끝내기)이고, 두 곳은 누가 먼저 두어도 새 단수가 없는 후수다",
    (_id, p) => {
      const { board } = puzzleState(p);
      const kinds = spotsOf(p).map((spot) => {
        const black = makesAtari(board, spotMoveOf(board, spot), 1);
        const white = makesAtari(board, whiteMove(board, spot), 2);
        return black ? "흑의 선수" : white ? "역끝내기" : "후수";
      });
      expect([...kinds].sort()).toEqual(["역끝내기", "후수", "후수"]);
    },
  );

  it.each(rows)(
    "%s: 역끝내기는 큰 후수보다 작고, 세 곳 크기가 모두 같지는 않다",
    (_id, p) => {
      const c = compareStory(p);
      expect(c.rev.size).toBeLessThan(c.big.size);
      expect(new Set(spotSizesOf(p)).size).toBeGreaterThan(1);
    },
  );
});

describe("역끝내기냐 큰 후수냐: 정답과 셈", () => {
  it.each(rows)(
    "%s: 세 곳 안에서 끝까지 읽으면 흑의 가장 좋은 첫 수는 정답 하나뿐이고, 그림의 A·B·C 가운데 하나다",
    (_id, p) => {
      const state = puzzleState(p);
      // 읽기 도구(compareStory)가 처음 판에서 읽은 흑의 가장 좋은 첫 수. solveEndgame과 같은 읽기다(엔진 puzzle.test.ts)
      const best = compareStory(p).best();
      expect(best.map((m) => (m === null ? "쉬기" : name(m)))).toEqual([
        p.solution,
      ]);
      const marks = spotsOf(p).map((s) => spotMoveOf(state.board, s));
      expect(marks).toContain(solutionOf(p));
    },
  );

  it.each(rows)(
    "%s: 두 순서의 점수 차 차이는 (역끝내기 + 작은 후수) − 큰 후수이고 0이 아니며, 정답은 그 셈의 큰 쪽이다",
    (_id, p) => {
      const c = compareStory(p);
      const diff = c.revFirstScore - c.bigFirstScore;
      expect(diff).toBe(c.rev.size + c.small.size - c.big.size);
      expect(diff).not.toBe(0);
      expect(c.gap).toBe(Math.abs(diff));
      expect(c.revWins).toBe(diff > 0);
      expect(p.solution).toBe(name(diff > 0 ? c.rev.move : c.big.move));
    },
  );

  it.each(rows)(
    "%s: 역끝내기부터 막으면 큰 후수에 백이, 작은 후수에 흑이 먼저 두고, 큰 후수부터 두면 역끝내기 곳과 작은 후수에 백이 먼저 둔다(세 곳 모두 먼저 두는 쪽이 바뀐다)",
    (_id, p) => {
      const c = compareStory(p);
      /** 수순(흑의 첫 수부터 흑·백 번갈아)에서 곳마다 먼저 둔 쪽(흑 1, 백 2) */
      const firstBy = (moves: number[]) => {
        const out: Record<string, Stone> = {};
        moves.forEach((m, i) => {
          const s = [c.rev, c.big, c.small].find((x) => x.spot.includes(m));
          if (s && out[s.label] === undefined)
            out[s.label] = i % 2 === 0 ? 1 : 2;
        });
        return out;
      };
      expect(c.revFirst.moves[0]).toBe(c.rev.move);
      expect(firstBy(c.revFirst.moves)).toEqual({
        [c.rev.label]: 1,
        [c.big.label]: 2,
        [c.small.label]: 1,
      });
      const bigLine = c.bigFirst.moves;
      expect(bigLine[0]).toBe(c.big.move);
      expect(firstBy(bigLine)).toEqual({
        [c.rev.label]: 2,
        [c.big.label]: 1,
        [c.small.label]: 2,
      });
      // 백이 역끝내기 곳에 처음 둔 수에 흑은 해설의 받는 자리로 이어 받는다
      const i = bigLine.findIndex((m) => c.rev.spot.includes(m));
      expect(c.rev.theirs.replies).toContain(bigLine[i + 1]);
    },
  );
});
