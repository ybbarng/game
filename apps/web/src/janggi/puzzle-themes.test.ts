// 장기 전술 묶음 「묶인 기물」·「비켜 부르는 장군」이 그 주제의 모양인지 본다(docs/23 「장기 전술 묶음 더하기」).
// 정답이 하나뿐인지는 두 수 앞(여기)과 네 수 앞(study-deep-tactics.test.ts)을 읽어 본다.
// 해설이 말하는 「다시 잡히지 않고」·「다시 잡을 틈이 없어요」는 고수의 받는 수 하나가 아니라 한의 모든 받는 수로 본다.
import { negamax } from "@game/janggi-ai";
import {
  applyMove,
  type Board,
  inCheck,
  legalMoves,
  type Move,
  pointName,
  pseudoTargets,
} from "@game/janggi-engine";
import { describe, expect, it } from "vitest";

import { JANGGI_PUZZLE_SETS, type JanggiPuzzle } from "./puzzles";
import {
  discoveredCheck,
  explainDiscovered,
  explainPin,
  parseMove,
  pinnedTarget,
  puzzleState,
  safeAfterEveryReply,
} from "./study";

const all = JANGGI_PUZZLE_SETS.flatMap((s) => s.puzzles);
const rows = (kind: JanggiPuzzle["kind"]) =>
  all.filter((p) => p.kind === kind).map((p) => [p.id, p] as const);
const name = (m: Move) => `${pointName(m.from)}-${pointName(m.to)}`;

/** 두 수 앞까지 읽은 초 쪽 값(점수 ×100) */
const scoreOf = (board: Board, m: Move) =>
  -negamax(applyMove(board, m), "h", 2, -Infinity, Infinity, {
    bikjangScore: true,
  });

/** 정답이 가장 낫고 둘째로 나은 수보다 졸 하나 반(150점 ×2) 이상 낫다 */
function bestAndRunnerUp(board: Board) {
  const scored = legalMoves(board, "c")
    .map((m) => ({ m: name(m), s: scoreOf(board, m) }))
    .sort((a, b) => b.s - a.s);
  return { best: scored[0]?.m, gap: (scored[0]?.s ?? 0) - (scored[1]?.s ?? 0) };
}

describe("묶인 기물 문제", () => {
  it("문제가 여덟 개 있다", () => {
    expect(rows("pin")).toHaveLength(8);
  });

  it.each(rows("pin"))(
    "%s: 조용한 판에서, 정답 수가 묶인 한 큰 기물을 노린다",
    (_id, p) => {
      const board = puzzleState(p).board;
      const move = parseMove(p.solution);
      // 지금 잡을 수 있는 기물이 없는 판에서 낸다(잡는 수로 끝나는 문제가 아니다).
      expect(legalMoves(board, "c").filter((m) => board[m.to] !== "")).toEqual(
        [],
      );
      const pin = pinnedTarget(board, move);
      expect(pin).not.toBeNull();
      // 묶인 기물은 갈 곳이 있는데도(묶이지 않았다면 비킬 수 있는데도) 한이 둘 수 있는 수가 없다.
      const after = applyMove(board, move);
      const at = pin?.pinned ?? -1;
      expect(pseudoTargets(after, at).length).toBeGreaterThan(0);
      expect(legalMoves(after, "h").filter((m) => m.from === at)).toEqual([]);
      expect(explainPin(board, move)).toHaveLength(3);
    },
  );

  it.each(rows("pin"))(
    "%s: 한이 어떻게 받아도(쉬기 포함) 묶인 기물은 그 자리에 남고, 초가 잡아도 다시 잡히지 않는다",
    (_id, p) => {
      const board = puzzleState(p).board;
      const move = parseMove(p.solution);
      const pin = pinnedTarget(board, move);
      expect(
        safeAfterEveryReply(applyMove(board, move), pin?.pinned ?? -1),
      ).toBe(true);
      // 해설의 「다시 잡히지 않고 잡아요」는 이 조건일 때만 나온다.
      expect(explainPin(board, move)[2]).toMatch(/다시 잡히지 않고 잡아요/);
    },
  );

  it.each(rows("pin"))(
    "%s: 두 수 앞을 읽으면 정답이 다른 모든 수보다 졸 하나 반 이상 낫다",
    (_id, p) => {
      const { best, gap } = bestAndRunnerUp(puzzleState(p).board);
      expect(best).toBe(p.solution);
      expect(gap).toBeGreaterThanOrEqual(300);
    },
  );
});

describe("비켜 부르는 장군 문제", () => {
  it("문제가 여덟 개 있다", () => {
    expect(rows("discover")).toHaveLength(8);
  });

  it.each(rows("discover"))(
    "%s: 정답 수로 옮긴 기물은 장군을 부르지 않고, 그 기물이 막던 차가 장군을 부르며, 옮긴 기물은 큰 기물을 잡거나 노린다",
    (_id, p) => {
      const board = puzzleState(p).board;
      const move = parseMove(p.solution);
      const found = discoveredCheck(board, move);
      expect(found).not.toBeNull();
      const after = applyMove(board, move);
      expect(inCheck(after, "h")).toBe(true);
      const king = after.indexOf("hK");
      expect(pseudoTargets(after, move.to)).not.toContain(king);
      expect(after[found?.checker ?? -1]).toBe("cR");
      expect(explainDiscovered(board, move)).toHaveLength(3);
    },
  );

  it.each(rows("discover"))(
    "%s: 한이 어떻게 받아도, 잡은 기물은 다시 잡히지 않고 노린 기물은 그 자리에 남아 초가 잡을 수 있다",
    (_id, p) => {
      const board = puzzleState(p).board;
      const move = parseMove(p.solution);
      const found = discoveredCheck(board, move);
      const after = applyMove(board, move);
      const replies = legalMoves(after, "h").map((m) => applyMove(after, m));
      expect(replies.length).toBeGreaterThan(0);
      for (const next of replies) {
        if (found?.captured) expect(next[move.to]).toBe(board[move.from]);
        else {
          expect(next[found?.gain ?? -1]).toBe(after[found?.gain ?? -1]);
          expect(legalMoves(next, "c").some((m) => m.to === found?.gain)).toBe(
            true,
          );
        }
      }
    },
  );

  it.each(rows("discover"))(
    "%s: 두 수 앞을 읽으면 정답이 다른 모든 수보다 졸 하나 반 이상 낫다",
    (_id, p) => {
      const { best, gap } = bestAndRunnerUp(puzzleState(p).board);
      expect(best).toBe(p.solution);
      expect(gap).toBeGreaterThanOrEqual(300);
    },
  );
});
