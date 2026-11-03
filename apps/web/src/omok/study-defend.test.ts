import {
  defenseCandidates,
  forbiddenReason,
  pointAt,
  pointName,
  winningFirstMoves,
  winsByFours,
} from "@game/omok-engine";
import { describe, expect, it } from "vitest";

import { OMOK_PUZZLE_SETS, type OmokPuzzle } from "./puzzles";
import { explainSolved, PUZZLE_RULES, puzzleState } from "./study";

// 막기 문제 확인은 빈칸마다 백의 몰아붙이기를 다시 읽어 무거워, 공격 문제(study.test.ts)와 따로 돈다.

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
      const board = [...puzzleState(p).board];
      expect(winsByFours(board, 2, V, p.within)).toBe(true);
      expect(winningFirstMoves(board, 1, V, 4)).toEqual([]);
      // 후보 밖의 자리는 백의 줄을 막지도, 백에게 막기를 강요하지도 못해 쉬는 것과 같다(위에서 백이 이긴다).
      const stops = defenseCandidates(board, 2, V).filter((at) => {
        if (forbiddenReason(board, at, 1, V) !== null) return false;
        board[at] = 1;
        const stopped = !winsByFours(board, 2, V, p.within);
        board[at] = 0;
        return stopped;
      });
      expect(names(stops)).toEqual([...p.answers].sort(byIndex));
      expect(explainSolved(p).length).toBeGreaterThan(0);
    },
  );
});

/** 자리 번호 순서(`defenseCandidates`가 돌려주는 순서) */
function byIndex(a: string, b: string): number {
  return pointAt(a) - pointAt(b);
}
