// @vitest-environment node
// 긴 축·축머리 문제(docs/23 바둑): 축이 정말 끝까지 잡히는지, 축머리가 정말 축을 깨는지 엔진으로 본다.
import {
  groupOf,
  ladderMoves,
  neighbors,
  pointAt,
  pointName,
  step,
  tryPlace,
} from "@game/baduk-engine";
import { describe, expect, it } from "vitest";
import { BADUK_PUZZLE_SETS, type BadukPuzzle } from "./puzzles";
import {
  defenseFor,
  judgeMove,
  PUZZLE_SIZE,
  puzzleState,
  solutionOf,
  targetOf,
} from "./study";
import { explainSolved } from "./study-explain";

type Capture = Extract<BadukPuzzle, { kind: "capture" }>;

const setOf = (id: string) =>
  (BADUK_PUZZLE_SETS.find((s) => s.id === id)?.puzzles ?? []) as Capture[];
const longs = setOf("long-ladder");
const breakers = setOf("breaker");
const rows = (ps: Capture[]) => ps.map((p) => [p.id, p] as const);
const name = (at: number) => pointName(at, PUZZLE_SIZE);
const at = (n: string) => pointAt(n, PUZZLE_SIZE);

/** 노리는 돌의 두 활로: [정답, 다른 쪽] */
function sides(p: Capture) {
  const { board } = puzzleState(p);
  const libs = groupOf(board, targetOf(p)).liberties;
  expect(libs).toHaveLength(2);
  const other = libs.find((l) => l !== solutionOf(p)) as number;
  return { board, right: solutionOf(p), wrong: other };
}

/**
 * 정답대로 두고 백이 축에서 가장 오래 버티는 대로 받으며 끝까지 둔다.
 * 흑의 다음 수는 단수가 되는 두 수 가운데 축이 되는 것. 따낼 때까지 흑이 둔 수를 돌려준다
 */
function playOut(p: Capture): number {
  let state = puzzleState(p);
  const target = targetOf(p);
  let move = solutionOf(p);
  for (let i = 0; i < p.within; i++) {
    const verdict = judgeMove(p, state, move, i);
    expect(verdict, `${i + 1}수 ${name(move)}`).not.toBe("wrong");
    const before = state.board;
    const mine = step(state, 0, { type: "place", at: move });
    if (!mine.ok) throw new Error(mine.error);
    state = mine.state;
    if (verdict === "solved") {
      expect(state.board[target]).toBe(0);
      expect(
        explainSolved(p, before, move, i + 1).length,
      ).toBeGreaterThanOrEqual(2);
      return i + 1;
    }
    // 흑 수마다 백은 단수다(축)
    expect(groupOf(state.board, target).liberties).toHaveLength(1);
    const theirs = step(state, 1, defenseFor(p, state, i));
    if (!theirs.ok) throw new Error(theirs.error);
    state = theirs.state;
    // 흑의 다음 수: 축으로 가장 빨리 잡는 단수
    let best: { at: number; n: number } | null = null;
    for (const l of groupOf(state.board, target).liberties) {
      const n = ladderMoves(
        state.board,
        1,
        target,
        l,
        new Set(state.positions),
      );
      if (n !== null && (best === null || n < best.n)) best = { at: l, n };
    }
    if (!best) throw new Error(`${i + 1}수 뒤 축이 끊겼다`);
    move = best.at;
  }
  throw new Error("정해진 수 안에 따내지 못했다");
}

describe("긴 축", () => {
  it("묶음에 문제가 다섯 개 이상이다", () => {
    expect(longs.length).toBeGreaterThanOrEqual(5);
  });

  it.each(rows(longs))(
    "%s: 정답 쪽 단수만 축이 되고, 백이 가장 오래 버티면 정해진 수(아홉 수 넘게)가 든다",
    (_id, p) => {
      const { board, right, wrong } = sides(p);
      const target = targetOf(p);
      expect(ladderMoves(board, 1, target, right)).toBe(p.within);
      expect(p.within).toBeGreaterThanOrEqual(9);
      expect(ladderMoves(board, 1, target, wrong)).toBeNull();
    },
  );

  it.each(rows(longs))(
    "%s: 끝까지 두어 보면 정해진 수 안에 따내고, 첫 수로 다른 쪽 단수는 틀린 것이다",
    (_id, p) => {
      expect(playOut(p)).toBeLessThanOrEqual(p.within);
      const state = puzzleState(p);
      expect(judgeMove(p, state, sides(p).wrong, 0)).toBe("wrong");
    },
  );

  it.each(rows(longs))(
    "%s: 힌트대로다. 정답 쪽은 백이 뻗을 자리 옆에 흑 돌이 있고, 다른 쪽은 뻗으면 활로가 셋이다",
    (_id, p) => {
      const { board, right, wrong } = sides(p);
      const target = targetOf(p);
      const runTo = (attack: number) => {
        const a = tryPlace(board, attack, 1);
        if (!a.ok) throw new Error("단수를 칠 수 없다");
        const lib = groupOf(a.board, target).liberties[0] as number;
        const b = tryPlace(a.board, lib, 2);
        if (!b.ok) throw new Error("뻗을 수 없다");
        return { lib, board: a.board, after: b.board };
      };
      const good = runTo(right);
      expect(
        neighbors(good.lib, PUZZLE_SIZE).some(
          (n) => good.board[n] === 1 && n !== right,
        ),
      ).toBe(true);
      const bad = runTo(wrong);
      expect(
        groupOf(bad.after, target).liberties.length,
      ).toBeGreaterThanOrEqual(3);
    },
  );
});

describe("축머리", () => {
  it("묶음에 문제가 네 개 이상이다", () => {
    expect(breakers.length).toBeGreaterThanOrEqual(4);
  });

  it.each(rows(breakers))(
    "%s: 축머리 쪽 단수는 축이 깨지고, 축머리를 치우면 그쪽도 축이 된다. 정답 쪽은 축이 된다",
    (_id, p) => {
      const { board, right, wrong } = sides(p);
      const target = targetOf(p);
      const breaker = at(p.breaker ?? "");
      expect(board[breaker]).toBe(2);
      // 축머리는 노리는 돌과 떨어져 있다(붙어 있으면 축머리가 아니라 그냥 이웃 돌이다)
      const [bx, by] = [
        breaker % PUZZLE_SIZE,
        Math.floor(breaker / PUZZLE_SIZE),
      ];
      const [tx, ty] = [target % PUZZLE_SIZE, Math.floor(target / PUZZLE_SIZE)];
      expect(
        Math.max(Math.abs(bx - tx), Math.abs(by - ty)),
      ).toBeGreaterThanOrEqual(3);
      expect(ladderMoves(board, 1, target, wrong)).toBeNull();
      expect(ladderMoves(board, 1, target, right)).toBe(p.within);
      const without = [...board];
      without[breaker] = 0;
      expect(ladderMoves(without, 1, target, wrong)).not.toBeNull();
    },
  );

  it.each(rows(breakers))(
    "%s: 끝까지 두어 보면 정해진 수 안에 따내고, 축머리 쪽 단수는 틀린 것이다",
    (_id, p) => {
      expect(playOut(p)).toBeLessThanOrEqual(p.within);
      expect(judgeMove(p, puzzleState(p), sides(p).wrong, 0)).toBe("wrong");
    },
  );

  it.each(rows(breakers))(
    "%s: 축머리 쪽으로 몰면 백이 축머리와 이어져 빠져나간다(백이 받는 대로 두어 본다)",
    (_id, p) => {
      let state = puzzleState(p);
      const target = targetOf(p);
      const breaker = at(p.breaker ?? "");
      let move = sides(p).wrong;
      for (let i = 0; i < 20; i++) {
        const mine = step(state, 0, { type: "place", at: move });
        if (!mine.ok) throw new Error(mine.error);
        state = mine.state;
        expect(state.board[target]).toBe(2);
        const theirs = step(state, 1, defenseFor(p, state, i));
        if (!theirs.ok) throw new Error(theirs.error);
        state = theirs.state;
        const libs = groupOf(state.board, target).liberties;
        if (libs.length >= 3) {
          // 빠져나갔다: 축머리와 한 무리다
          expect(groupOf(state.board, target).stones).toContain(breaker);
          return;
        }
        // 흑은 축머리가 없다면 축이 되었을 쪽으로 계속 몬다
        const without = [...state.board];
        without[breaker] = 0;
        const next = libs.find(
          (l) => ladderMoves(without, 1, target, l) !== null,
        );
        if (next === undefined) throw new Error("단수를 칠 곳이 없다");
        move = next;
      }
      throw new Error("빠져나가지 않았다");
    },
  );
});
