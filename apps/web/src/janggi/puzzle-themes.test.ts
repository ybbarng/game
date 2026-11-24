// 장기 전술 묶음 「묶인 기물」·「비켜 부르는 장군」이 그 주제의 모양인지 본다(docs/23 「장기 전술 묶음 더하기」).
// 정답이 하나뿐인지는 두 수 앞(여기)과 네 수 앞(study-deep-tactics.test.ts)을 읽어 본다.
// 해설이 말하는 「다시 잡히지 않고」·「다시 잡을 틈이 없어요」는 고수의 받는 수 하나가 아니라 한의 모든 받는 수로 본다.
// 맨 아래 묶음은 다른 전술 묶음(양수겸장·잡을까 말까·포 길 열기·멱 막기·잡힐 기물 지키기·장군 풀기·궁성 공격)도
// 한의 모든 받는 수(쉬기·빅장 포함)로 본다(docs/23 「장기 전술 묶음을 모든 받는 수로 다시 보기」).
import { negamax } from "@game/janggi-ai";
import {
  applyMove,
  type Board,
  inCheck,
  isCheckmate,
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
  forkHolds,
  parseMove,
  pinnedTarget,
  puzzleState,
  safeAfterEveryReply,
  worstGain,
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

/** 문제 데이터에 없는 판(조건 자체를 확인하는 시험용) */
const boardOf = (pieces: JanggiPuzzle["pieces"]) =>
  puzzleState({ id: "x", kind: "fork", pieces, solution: "" }).board;

describe("양수겸장이 모든 받는 수에 성립하는지 가리는 조건", () => {
  it("한이 마의 멱을 막으며 노림을 받던 차를 비키면 성립하지 않는다", () => {
    // 2026-11-25까지의 양수겸장 1번: 마 77-56이 궁과 차를 노리지만, 한은 차 48-46으로 멱을 막는다.
    const board = boardOf({
      "22": "hE",
      "35": "hK",
      "48": "hR",
      "77": "cN",
      "94": "cK",
      "96": "cR",
    });
    expect(forkHolds(board, parseMove("77-56"))).toBe(false);
  });

  it("한이 받는 수로 빅장을 만들 수 있으면 성립하지 않는다", () => {
    // 옛 양수겸장 7번: 궁이 16-15로 차를 잡으면 두 궁이 마주 봐 판이 점수로 끝난다.
    const board = boardOf({
      "12": "hC",
      "16": "hK",
      "21": "hC",
      "24": "hA",
      "45": "cR",
      "59": "cR",
      "86": "cC",
      "05": "cK",
    });
    expect(forkHolds(board, parseMove("45-15"))).toBe(false);
  });

  // 옛 양수겸장 3번: 마가 포 하나를 잡아도 한이 점수로 앞서, 궁을 옮겨 빅장을 만들고 이긴다.
  const OLD_FORK_3 = {
    "14": "hK",
    "38": "cN",
    "47": "hC",
    "58": "hC",
    "86": "cK",
    "05": "cP",
  } as const;

  it("초가 노린 기물을 잡아도 한이 점수로 앞서 빅장으로 빠져나가면 성립하지 않는다", () => {
    expect(forkHolds(boardOf(OLD_FORK_3), parseMove("38-26"))).toBe(false);
  });

  it("초 사가 하나 더 있어 잡은 뒤 초가 앞서면 성립한다", () => {
    const board = boardOf({ ...OLD_FORK_3, "04": "cA" });
    expect(forkHolds(board, parseMove("38-26"))).toBe(true);
  });
});

describe("장기 전술 묶음: 한의 모든 받는 수(쉬기·빅장 포함)로 보기", () => {
  /** 정답 뒤 한이 어떻게 받아도 초가 처음 판보다 얻는 기물 점수의 가장 나쁜 값 */
  const gainOf = (p: JanggiPuzzle) => {
    const board = puzzleState(p).board;
    return worstGain(board, applyMove(board, parseMove(p.solution)));
  };

  it.each(rows("fork"))(
    "%s: 양수겸장은 한이 어떻게 받아도 옮긴 기물이 기물을 잡아 이득이고, 빅장으로 빠져나갈 수 없다",
    (_id, p) => {
      expect(forkHolds(puzzleState(p).board, parseMove(p.solution))).toBe(true);
    },
  );

  it.each(rows("trade"))(
    "%s: 잡을까 말까의 정답 잡기는 한이 어떻게 받아도 이득이다",
    (_id, p) => {
      expect(gainOf(p)).toBeGreaterThan(0);
    },
  );

  it.each([...rows("defend"), ...rows("block"), ...rows("escape")])(
    "%s: 정답 뒤 한이 어떻게 받아도 초가 기물 점수를 잃지 않는다",
    (_id, p) => {
      expect(gainOf(p)).toBeGreaterThanOrEqual(0);
    },
  );

  it.each(rows("cannon"))(
    "%s: 포 길 열기의 정답 뒤 한이 어떻게 받아도 초가 잃지 않고, 포 장군이면(해설 「그사이 다른 기물을 얻어요」) 얻는다",
    (_id, p) => {
      const board = puzzleState(p).board;
      const after = applyMove(board, parseMove(p.solution));
      if (inCheck(after, "h")) expect(gainOf(p)).toBeGreaterThan(0);
      else expect(gainOf(p)).toBeGreaterThanOrEqual(0);
    },
  );

  it.each(rows("palace"))(
    "%s: 궁성 공격은 외통이거나, 한이 어떻게 받아도 이득이다",
    (_id, p) => {
      const board = puzzleState(p).board;
      if (isCheckmate(applyMove(board, parseMove(p.solution)), "h")) return;
      expect(gainOf(p)).toBeGreaterThan(0);
    },
  );

  it.each(rows("discover"))(
    "%s: 비켜 부르는 장군은 한이 어떻게 받아도(빅장 포함) 이득이다",
    (_id, p) => {
      expect(gainOf(p)).toBeGreaterThan(0);
    },
  );
});
