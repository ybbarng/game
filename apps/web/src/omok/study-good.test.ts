// 「좋은 수 고르기」 묶음: 고르기 문제의 정답이 뜻(reason)에 맞는 자리 전부인지, 먼저 이기기 문제에 백의 위협이 있는지 엔진으로 본다.
import {
  legalMoves,
  pointAt,
  pointName,
  winningFirstMoves,
  xyOf,
} from "@game/omok-engine";
import { describe, expect, it } from "vitest";

import { OMOK_PUZZLE_SETS, type OmokPuzzle } from "./puzzles";
import {
  blockingMoves,
  blocksThree,
  buildsThree,
  explainSolved,
  judgeMove,
  puzzleState,
  variantOf,
} from "./study";
import { OMOK_OPENINGS } from "./tutorial";

type Pick = Extract<OmokPuzzle, { kind: "pick" }>;

const good = OMOK_PUZZLE_SETS.find((s) => s.id === "good")?.puzzles ?? [];
const picks = good.filter((p): p is Pick => p.kind === "pick");
const rows = <T extends { id: string }>(ps: T[]) =>
  ps.map((p) => [p.id, p] as const);
const sorted = (ps: string[]) => [...ps].sort();

/** H8을 가운데로 판을 돌리고 뒤집는 여덟 방향(화면 좌표, 위가 +) */
const SYMMETRIES: ((x: number, y: number) => [number, number])[] = [
  (x, y) => [x, y],
  (x, y) => [-y, x],
  (x, y) => [-x, -y],
  (x, y) => [y, -x],
  (x, y) => [-x, y],
  (x, y) => [x, -y],
  (x, y) => [y, x],
  (x, y) => [-y, -x],
];
const off = (name: string) => {
  const [x, y] = xyOf(pointAt(name));
  return [x - 7, 7 - y] as const;
};
const nameOf = ([x, y]: [number, number]) =>
  `${String.fromCharCode(65 + 7 + x)}${8 + y}`;

describe("좋은 수 고르기 묶음", () => {
  it("초반 넷, 막으며 키우기 셋, 먼저 이기기 셋", () => {
    expect(good).toHaveLength(10);
    expect(picks.filter((p) => p.reason === "opening")).toHaveLength(4);
    expect(picks.filter((p) => p.reason === "build")).toHaveLength(3);
    expect(
      good.filter((p) => p.kind === "attack" && p.race === true),
    ).toHaveLength(3);
  });

  it.each(rows(picks.filter((p) => p.reason === "opening")))(
    "%s: 정답은 이 백 자리에서의 화월(직접)·포월(간접) 두 자리를 판을 돌려 맞춘 것이다",
    (_id, p) => {
      expect(p.black).toEqual(["H8"]);
      const white = p.white[0] as string;
      const [wx, wy] = off(white);
      const direct = wx === 0 || wy === 0;
      // 출처 기준 방향: 직접은 백 H9, 간접은 백 I9. 맞은편 대칭 자리까지 둘
      const base = direct
        ? { white: OMOK_OPENINGS.kagetsu.white, thirds: ["I9", "G9"] }
        : { white: OMOK_OPENINGS.hogetsu.white, thirds: ["I7", "G9"] };
      expect(base.thirds).toContain(
        direct ? OMOK_OPENINGS.kagetsu.third : OMOK_OPENINGS.hogetsu.third,
      );
      const [bx, by] = off(base.white);
      const turn = SYMMETRIES.find((f) => {
        const [x, y] = f(bx, by);
        return x === wx && y === wy;
      });
      if (!turn) throw new Error("백 자리가 붙지 않았다");
      const expected = base.thirds.map((t) => nameOf(turn(...off(t))));
      expect(sorted([...p.answers])).toEqual(sorted(expected));
      const board = puzzleState(p).board;
      for (const a of p.answers)
        expect(legalMoves(board, 1, variantOf(p))).toContain(pointAt(a));
    },
  );

  it.each(rows(picks.filter((p) => p.reason === "build")))(
    "%s: 백에게 열린 셋이 있고 흑은 몰아 이길 길이 없으며, 막으면서 흑 셋도 생기는 자리는 정답뿐이다(막는 자리는 둘 이상)",
    (_id, p) => {
      const board = puzzleState(p).board;
      const v = variantOf(p);
      expect(winningFirstMoves(board, 2, v, 2).length).toBeGreaterThan(0);
      expect(winningFirstMoves(board, 1, v, 4)).toEqual([]);
      const blocking = blockingMoves(board, v);
      const best = blocking.filter((at) => buildsThree(board, at, v));
      expect(best.map(pointName)).toEqual([...p.answers]);
      expect(blocking.length).toBeGreaterThanOrEqual(2);
    },
  );

  it("좁혀 찾은 막는 자리(blockingMoves)는 둘 수 있는 모든 빈칸을 다 해 본 것과 같다", () => {
    const p = picks.find((q) => q.reason === "build");
    if (!p) throw new Error("막으며 키우기 문제가 없다");
    const board = puzzleState(p).board;
    const v = variantOf(p);
    const all = legalMoves(board, 1, v).filter((at) =>
      blocksThree(board, at, v),
    );
    expect(blockingMoves(board, v)).toEqual(all);
  });

  it.each(rows(good.filter((p) => p.kind === "attack")))(
    "%s: 백에게 막을 수 없는 넷을 만드는 수가 있다(흑이 그래도 먼저 이기는 것은 공격 문제 시험이 본다)",
    (_id, p) => {
      const board = puzzleState(p).board;
      expect(
        winningFirstMoves(board, 2, variantOf(p), 2).length,
      ).toBeGreaterThan(0);
    },
  );

  it.each(rows(picks))(
    "%s: 정답이면 푼 것, 다른 빈칸이면 틀린 것, 해설이 있다",
    (_id, p) => {
      const board = puzzleState(p).board;
      for (const a of p.answers)
        expect(judgeMove(p, board, pointAt(a), 0)).toBe("solved");
      const wrong = board.findIndex(
        (c, at) => c === 0 && !p.answers.map(pointAt).includes(at),
      );
      expect(judgeMove(p, board, wrong, 0)).toBe("wrong");
      expect(explainSolved(p).length).toBeGreaterThan(0);
    },
  );
});
