// 3×3 처음 맞추기 단계 첫머리의 경우 그림(beginner-cases.ts)이 그 단계의 모든 경우를 빠짐없이 보이고, 그림마다 적힌
// 경우가 경우별 정해진 길(beginner-path.ts)이 그 상황에서 고르는 경우와 같은지 본다(docs/standing-rules.md 1절 「각 단계는
// 모든 경우를 가르친다」).
import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { BEGINNER_CASE_SHEETS } from "./beginner-cases";
import { pathStage, runStage } from "./beginner-path";
import { BEGINNER_333 } from "./lessons-333";

const stateOf = (alg: string) =>
  applyMoves(3, solvedCube(3), parseMoves(3, alg));

describe("단계마다 모든 경우 그림", () => {
  for (const [name, sheet] of Object.entries(BEGINNER_CASE_SHEETS)) {
    it(`${sheet.title}: 그림마다 적힌 경우가 정해진 길이 고르는 경우와 같다`, () => {
      const got = sheet.cases.map((c) => {
        const r = runStage(sheet.stage, stateOf(c.alg));
        return r.steps[0]?.caseId ?? "done";
      });
      expect(got, name).toEqual(sheet.cases.map((c) => c.id));
    });

    it(`${sheet.title}: 그 단계의 경우를 하나도 빠뜨리지 않는다`, () => {
      const ids = new Set(sheet.cases.map((c) => c.id));
      for (const c of pathStage(sheet.stage).cases)
        expect(ids.has(c.id), `${name}: ${c.id}(${c.shape})`).toBe(true);
    });
  }

  it("단계 강마다 첫머리 네 쪽 안에 그 단계 그림이 있다", () => {
    const want: Record<string, string> = {
      "333-white-cross": "beginner-cross",
      "333-first-corners-up": "beginner-corners",
      "333-second-layer": "beginner-second",
      "333-ll-cross": "beginner-yellow-cross",
      "333-ll-edges": "beginner-edges",
      "333-ll-corner-place": "beginner-corner-place",
      "333-ll-corner-twist": "beginner-corner-twist",
    };
    for (const [id, sheet] of Object.entries(want)) {
      const lesson = BEGINNER_333.lessons.find((l) => l.id === id);
      const at = lesson?.steps.findIndex((s) => s.sheet === sheet) ?? -1;
      expect(at, id).toBeGreaterThanOrEqual(0);
      expect(at, id).toBeLessThan(4);
    }
  });
});
