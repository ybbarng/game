// @vitest-environment node
// 패로 버티기 문제(팻감 쓰기·팻감 받기, docs/23 바둑): 같은 판 모양 금지·팻감·받기가 규칙대로인지 엔진으로 본다.
import {
  type BadukState,
  canCapture,
  groupOf,
  legalPoints,
  pointAt,
  pointName,
  step,
  tryPlace,
} from "@game/baduk-engine";
import { describe, expect, it } from "vitest";

import { BADUK_PUZZLE_SETS, type BadukPuzzle } from "./puzzles";
import {
  defenseFor,
  explainSolved,
  judgeMove,
  koPointOf,
  PUZZLE_SIZE,
  puzzleState,
  solutionOf,
  targetOf,
} from "./study";

type KoFight = Extract<BadukPuzzle, { kind: "kofight" }>;

const setOf = (id: string) =>
  (BADUK_PUZZLE_SETS.find((s) => s.id === id)?.puzzles ?? []) as KoFight[];
const threats = setOf("ko-threat");
const answers = setOf("ko-answer");
const rows = (ps: KoFight[]) => ps.map((p) => [p.id, p] as const);
const name = (at: number) => pointName(at, PUZZLE_SIZE);
const at = (n: string) => pointAt(n, PUZZLE_SIZE);

/** 둔다. 둘 수 없으면 시험을 멈춘다 */
function play(state: BadukState, at: number): BadukState {
  const seat = state.toPlay === 1 ? 0 : 1;
  const result = step(state, seat, { type: "place", at });
  if (!result.ok) throw new Error(`${name(at)}: ${result.error}`);
  return result.state;
}

/** 지금 둘 편이 이 자리에 둘 수 있나(같은 판 모양 금지 포함) */
const legal = (state: BadukState, at: number) =>
  legalPoints(state).includes(at);

/** 그 편이 두면 상대 무리(이미 단수인 것 빼고)가 새로 단수가 되는 자리 */
function atariMoves(state: BadukState): number[] {
  const foe = state.toPlay === 1 ? 2 : 1;
  return legalPoints(state).filter((at) => {
    const tried = tryPlace(state.board, at, state.toPlay);
    if (!tried.ok) return false;
    return tried.board.some(
      (cell, i) =>
        cell === foe &&
        groupOf(tried.board, i).liberties.length === 1 &&
        groupOf(state.board, i).liberties.length > 1,
    );
  });
}

/** 이 편이 이 자리에 두면 노리는 무리를 세 수 안에 못 잡게 되나(살리는 수) */
function saves(state: BadukState, at: number, target: number): boolean {
  const stone = state.toPlay;
  const tried = tryPlace(state.board, at, stone);
  if (!tried.ok || tried.board[target] !== stone) return false;
  return !canCapture(tried.board, stone === 1 ? 2 : 1, target, 3);
}

describe("팻감 쓰기", () => {
  it("묶음에 문제가 다섯 개 이상이다", () => {
    expect(threats.length).toBeGreaterThanOrEqual(5);
  });

  it.each(rows(threats))(
    "%s: 백이 방금 패를 따냈고, 흑은 같은 판 모양 금지로 바로 되따낼 수 없다",
    (_id, p) => {
      const state = puzzleState(p);
      const ko = koPointOf(p);
      expect(state.toPlay).toBe(1);
      // 돌 놓기만 보면 되따낼 수 있는 자리(백 한 점을 따낸다)지만 규칙이 막는다
      const retake = tryPlace(state.board, ko, 1);
      expect(retake.ok && retake.captured.length).toBe(1);
      expect(legal(state, ko)).toBe(false);
      expect(step(state, 0, { type: "place", at: ko }).ok).toBe(false);
    },
  );

  it.each(rows(threats))(
    "%s: 판에서 백을 새로 단수로 모는 수는 정답(팻감) 하나뿐이고, 그것이 노리는 백 무리는 두 점 넘는다",
    (_id, p) => {
      const state = puzzleState(p);
      expect(atariMoves(state).map(name)).toEqual([p.solution]);
      const after = play(state, solutionOf(p));
      const target = groupOf(after.board, targetOf(p));
      expect(target.liberties).toHaveLength(1);
      expect(target.stones.length).toBeGreaterThanOrEqual(2);
    },
  );

  it.each(rows(threats))(
    "%s: 백이 받지 않고 패를 이으면 흑이 노린 백 무리를 따낸다(패 한 점보다 크다)",
    (_id, p) => {
      const ko = koPointOf(p);
      const afterThreat = play(puzzleState(p), solutionOf(p));
      const connected = play(afterThreat, ko);
      const libs = groupOf(connected.board, targetOf(p)).liberties;
      expect(libs).toHaveLength(1);
      const took = play(connected, libs[0] as number);
      expect(took.board[targetOf(p)]).toBe(0);
      expect(took.prisoners[1] - connected.prisoners[1]).toBeGreaterThan(1);
    },
  );

  it.each(rows(threats))(
    "%s: 백이 살리는 수는 정해진 받는 수 하나뿐이고, 받은 뒤에는 흑이 되따낼 수 있다",
    (_id, p) => {
      const afterThreat = play(puzzleState(p), solutionOf(p));
      const target = targetOf(p);
      const rescues = legalPoints(afterThreat).filter((p) =>
        saves(afterThreat, p, target),
      );
      expect(rescues.map(name)).toEqual([p.reply]);
      const reply = defenseFor(p, afterThreat, 0);
      expect(reply.type === "place" && name(reply.at)).toBe(p.reply);
      const answered = play(afterThreat, (reply as { at: number }).at);
      const ko = koPointOf(p);
      expect(legal(answered, ko)).toBe(true);
      const back = play(answered, ko);
      expect(back.prisoners[1] - answered.prisoners[1]).toBe(1);
    },
  );

  it.each(rows(threats))(
    "%s: 화면 흐름: 팻감 → 백 받기 → 되따내기로 풀고, 다른 첫 수와 둘째 수는 틀린 것이다",
    (_id, p) => {
      const state = puzzleState(p);
      expect(judgeMove(p, state, solutionOf(p), 0)).toBe("next");
      const wrongFirst = legalPoints(state).find((q) => q !== solutionOf(p));
      expect(judgeMove(p, state, wrongFirst as number, 0)).toBe("wrong");
      const afterThreat = play(state, solutionOf(p));
      const reply = defenseFor(p, afterThreat, 0);
      const answered = play(afterThreat, (reply as { at: number }).at);
      const ko = koPointOf(p);
      const wrongSecond = legalPoints(answered).find((q) => q !== ko);
      expect(judgeMove(p, answered, wrongSecond as number, 1)).toBe("wrong");
      expect(judgeMove(p, answered, ko, 1)).toBe("solved");
      expect(explainSolved(p, answered.board, ko, 2)).toHaveLength(3);
    },
  );
});

describe("팻감 받기", () => {
  it("묶음에 문제가 다섯 개 이상이다", () => {
    expect(answers.length).toBeGreaterThanOrEqual(5);
  });

  it.each(rows(answers))(
    "%s: 흑이 패를 따냈을 때 백은 바로 되따낼 수 없었고, 팻감을 쓴 지금은 되따낼 수 있다",
    (_id, p) => {
      const scene = puzzleState({ ...p, setup: [] });
      const [take = "", threat = ""] = p.setup;
      const taken = play(scene, at(take));
      const ko = koPointOf(p);
      expect(taken.prisoners[1]).toBe(1);
      expect(legal(taken, ko)).toBe(false);
      const threatened = play(taken, at(threat));
      expect(threatened).toEqual(puzzleState(p));
      // 지금 흑이 다른 곳에 두면 백은 되따낼 수 있다(패가 살아 있다)
      const elsewhere = play(threatened, solutionOf(p));
      expect(legal(elsewhere, ko)).toBe(true);
    },
  );

  it.each(rows(answers))(
    "%s: 백 팻감은 흑 두 점 넘는 무리를 단수로 몰았고, 받지 않고 패를 이으면 백이 그 무리를 따낸다",
    (_id, p) => {
      const state = puzzleState(p);
      const target = groupOf(state.board, targetOf(p));
      expect(target.liberties).toHaveLength(1);
      expect(target.stones.length).toBeGreaterThanOrEqual(2);
      const connected = play(state, koPointOf(p));
      const took = play(connected, target.liberties[0] as number);
      expect(took.board[targetOf(p)]).toBe(0);
      expect(took.prisoners[2] - connected.prisoners[2]).toBe(
        target.stones.length,
      );
    },
  );

  it.each(rows(answers))(
    "%s: 흑 무리를 살리는 수는 정답 하나뿐이고, 그 수만 푼 것이다",
    (_id, p) => {
      const state = puzzleState(p);
      const target = targetOf(p);
      const rescues = legalPoints(state).filter((p) => saves(state, p, target));
      expect(rescues.map(name)).toEqual([p.solution]);
      expect(judgeMove(p, state, solutionOf(p), 0)).toBe("solved");
      expect(judgeMove(p, state, koPointOf(p), 0)).toBe("wrong");
      expect(explainSolved(p, state.board, solutionOf(p), 1)).toHaveLength(3);
    },
  );
});
