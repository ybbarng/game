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
    // 흰-초록-빨강이 칸 밑, 흰색이 오른쪽: 한 번(R' D' R D의 거꾸로로 만든 상황)
    expect(
      taughtStagePlan("corners", at("D' R' D R")).segments[0]?.info,
    ).toEqual({
      kind: "corner",
      colors: ["U", "F", "R"],
      from: "bottom",
      white: "right",
      reps: 1,
    });
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
