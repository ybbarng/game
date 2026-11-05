import {
  applyMoves,
  isSolved,
  parseMoves,
  randomCubeState,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";
import { TAUGHT_STAGES, type TaughtCase, taughtStagePlan } from "./taught-plan";

/**
 * 배우기 힌트용 단계 계획(taught-plan.ts). 무작위 상태에서 일곱 단계를 차례로 계획대로 두면 다 맞고,
 * 토막이 빈틈없이 이어지며 경우 자료가 단계와 맞는지 본다.
 */

const apply = (s: PuzzleState, moves: string[]) =>
  applyMoves(3, s, parseMoves(3, moves.join(" ")));

/** 공식의 거꾸로(그 공식이 풀어 내는 상황) */
const invert = (alg: string) =>
  alg
    .split(" ")
    .reverse()
    .map((m) => (m.endsWith("2") ? m : m.endsWith("'") ? m[0] : `${m}'`))
    .join(" ");

describe("taughtStagePlan", () => {
  it("일곱 단계 계획을 차례로 두면 다 맞고, 토막이 수를 빈틈없이 나눈다", () => {
    const kinds = new Map<string, Set<string>>();
    for (let seed = 1; seed <= 16; seed++) {
      let s = randomCubeState(3, seed);
      for (const stage of TAUGHT_STAGES) {
        const plan = taughtStagePlan(stage, s);
        let at = 0;
        for (const seg of plan.segments) {
          expect(seg.start).toBe(at);
          expect(seg.end).toBeGreaterThan(seg.start);
          at = seg.end;
          const set = kinds.get(stage) ?? new Set();
          set.add(caseKey(seg.info));
          kinds.set(stage, set);
        }
        expect(at).toBe(plan.moves.length);
        s = apply(s, plan.moves);
      }
      expect(isSolved(3, s), `씨앗 ${seed}`).toBe(true);
    }
    // 단계마다 나올 경우가 나온다(쥐기는 십자·둘째 층 앞에서만)
    expect(kinds.get("cross")).toContain("cross");
    expect(kinds.get("corners")).toContain("corner:bottom");
    expect(kinds.get("middle")).toContain("hold:down");
    expect(kinds.get("middle")).toContain("middle:right");
    expect(kinds.get("middle")).toContain("middle:front");
    expect(kinds.get("eo")).toContain("eo");
    expect(kinds.get("ll-corner-twist")).toContain("twist");
  });

  it("경우 자료가 레슨 상황과 맞는다", () => {
    const at = (setup: string) =>
      applyMoves(3, solvedCube(3), parseMoves(3, setup));
    // 흰-빨강 모서리가 아래층, 흰색이 아래(첫째 경우)
    expect(taughtStagePlan("cross", at("R2")).segments[0]?.info).toEqual({
      kind: "cross",
      colors: ["U", "R"],
      case: "down-white-down",
    });
    // 흰 면이 아래면 먼저 흰 면을 위로
    const held = taughtStagePlan("cross", at("x2 R2"));
    expect(held.segments[0]?.info).toEqual({ kind: "hold", white: "up" });
    // 흰-초록-빨강이 칸 밑, 흰색이 오른쪽(R' D' R D의 거꾸로로 만든 상황): 지름길 R' D' R, 되풀이면 한 번
    const right = taughtStagePlan("corners", at("D' R' D R"));
    expect(right.segments[0]?.info).toEqual({
      kind: "corner",
      colors: ["U", "F", "R"],
      from: "bottom",
      white: "right",
      reps: 0,
      shortcut: true,
    });
    expect(right.moves).toEqual(["R'", "D'", "R"]);
    const repeat = taughtStagePlan("corners", at("D' R' D R"), {
      cornerRepeat: true,
    });
    expect(repeat.segments[0]?.info).toEqual({
      kind: "corner",
      colors: ["U", "F", "R"],
      from: "bottom",
      white: "right",
      reps: 1,
      shortcut: false,
    });
    // 흰색이 앞이면 F D F', 아래면 R' D2 R D 뒤 R' D' R(거꾸로로 만든 상황)
    for (const [white, alg] of [
      ["front", "F D F'"],
      ["down", "R' D2 R D R' D' R"],
    ] as const) {
      const p = taughtStagePlan("corners", at(invert(alg)));
      expect(p.moves.join(" ")).toBe(alg);
      expect(p.segments[0]?.info).toMatchObject({ from: "bottom", white });
    }
    // 제 칸에서 돌아감: 흰색이 오른쪽이면 R' D' R D 뒤 R' D' R, 앞이면 F D F' D' 뒤 F D F'
    for (const [white, alg] of [
      ["right", "R' D' R D R' D' R"],
      ["front", "F D F' D' F D F'"],
    ] as const) {
      const p = taughtStagePlan("corners", at(invert(alg)));
      expect(p.moves.join(" ")).toBe(alg);
      expect(p.segments[0]?.info).toMatchObject({ from: "slot", white });
    }
    // 노란 점: 흰 면 아래로 쥐고(z2) 점 → 세 번
    const dot = taughtStagePlan(
      "eo",
      at("z2 F U R U' R' F' F U R U' R' F' U2 F U R U' R' F'"),
    );
    expect(dot.segments[0]?.info).toEqual({ kind: "eo", shape: "dot" });
  });
});

function caseKey(c: TaughtCase): string {
  switch (c.kind) {
    case "hold":
      return `hold:${c.white}`;
    case "corner":
      return `corner:${c.from}`;
    case "middle":
      return `middle:${c.side}`;
    default:
      return c.kind;
  }
}
