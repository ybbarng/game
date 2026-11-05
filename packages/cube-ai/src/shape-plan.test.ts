import {
  applyMove,
  applyMoves,
  parseMoves,
  shapeMatcher,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";
import { botPlan } from "./plan";
import { levelText } from "./skill";

const CHECKER = "R2 L2 U2 D2 F2 B2";
const CIC = "F L F U' R U F2 L2 U' L' B D' B' L2 U";

function play(n: number, start: PuzzleState, moves: readonly string[]) {
  let s = start;
  for (const m of moves)
    for (const x of parseMoves(n, m)) s = applyMove(n, s, x);
  return s;
}

function matcher(n: number, alg: string) {
  return shapeMatcher(n, applyMoves(n, solvedCube(n), parseMoves(n, alg)));
}

describe("모양 만들기 컴퓨터 계획", () => {
  it("맞춘 큐브에서는 그 공식을 두고 목표 모양에서 끝난다", () => {
    const n = 3;
    const plan = botPlan(levelText("pro"), n, solvedCube(n), 7, {
      shape: CHECKER,
    });
    expect(plan.moves.map((m) => m.move)).toEqual(CHECKER.split(" "));
    expect(plan.stages.map((s) => s.name)).toEqual(["shape"]);
    const end = play(
      n,
      solvedCube(n),
      plan.moves.map((m) => m.move),
    );
    expect(matcher(n, CHECKER).matches(end)).toBe(true);
  });

  it("섞인 큐브에서는 먼저 맞추고 공식을 한다(2×2)", () => {
    const n = 2;
    const start = applyMoves(
      n,
      solvedCube(n),
      parseMoves(n, "R U' F2 R' U R2 F'"),
    );
    const plan = botPlan(levelText("club"), n, start, 3, { shape: CIC });
    expect(plan.stages.at(-1)?.name).toBe("shape");
    expect(plan.stages.length).toBeGreaterThan(1);
    const moves = plan.moves.map((m) => m.move);
    const m = matcher(n, CIC);
    expect(m.matches(play(n, start, moves))).toBe(true);
    // 처음 목표 모양이 되는 수에서 끝난다
    expect(m.matches(play(n, start, moves.slice(0, -1)))).toBe(false);
  });

  it("같은 씨앗이면 같은 계획, 단계가 오를수록 빠르다", () => {
    const n = 3;
    const at = (level: Parameters<typeof levelText>[0], seed: number) =>
      botPlan(levelText(level), n, solvedCube(n), seed, { shape: CIC })
        .finishAt;
    expect(at("club", 5)).toBe(at("club", 5));
    const mean = (level: Parameters<typeof levelText>[0]) =>
      [1, 2, 3, 4, 5].reduce((s, k) => s + at(level, k), 0) / 5;
    const times = (["novice", "casual", "club", "fast", "pro"] as const).map(
      mean,
    );
    for (let i = 1; i < times.length; i++)
      expect(times[i]).toBeLessThan(times[i - 1] as number);
  });

  it("옛 단계 글은 모양 만들기를 받지 않는다", () => {
    expect(() =>
      botPlan("beginner", 3, solvedCube(3), 1, { shape: CHECKER }),
    ).toThrow(RangeError);
  });
});
