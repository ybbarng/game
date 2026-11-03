import {
  pointAt,
  pointName,
  stopsOf,
  winningFirstMoves,
} from "@game/omok-engine";
import { describe, expect, it } from "vitest";

import { OMOK_PUZZLE_SETS, type OmokPuzzle } from "./puzzles";
import { explainSolved, PUZZLE_RULES, puzzleState } from "./study";

// 막기 문제 확인은 판의 모든 빈칸마다 백의 몰아붙이기를 다시 읽는다(stopsOf, 처음 판에서 이긴 길을 먼저 해 봐 빠르다).

type Defend = Extract<OmokPuzzle, { kind: "defend" }>;

const V = PUZZLE_RULES.variant;
const defends = OMOK_PUZZLE_SETS.flatMap((s) => s.puzzles).filter(
  (p): p is Defend => p.kind === "defend",
);
const rows = <T extends { id: string }>(ps: T[]) =>
  ps.map((p) => [p.id, p] as const);
const names = (ps: number[]) => ps.map(pointName);

describe("막기 문제(백의 몰아붙이기 끊기)", () => {
  it.each(rows(defends))(
    "%s: 백은 사로 몰아 이길 수 있고 흑은 못 이긴다. 그 길을 끊는 자리는 정답뿐이다",
    (_id, p) => {
      const { board } = puzzleState(p);
      expect(winningFirstMoves(board, 1, V, 4)).toEqual([]);
      // 판의 모든 빈칸(흑 금지 자리 제외) 가운데 백의 길을 끊는 자리. null이면 백에게 길이 없다.
      const stops = stopsOf(board, 2, V, p.within);
      expect(stops && names(stops)).toEqual([...p.answers].sort(byIndex));
      expect(explainSolved(p).length).toBeGreaterThan(0);
    },
  );
});

/** 자리 번호 순서(`stopsOf`가 돌려주는 순서) */
function byIndex(a: string, b: string): number {
  return pointAt(a) - pointAt(b);
}
