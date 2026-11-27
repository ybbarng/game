// 3×3 처음 맞추기와 코너 방향 먼저 마지막 층의 단계 첫머리 경우 그림(beginner-cases.ts)이 그 단계의 모든 경우를 빠짐없이
// 보이고, 그림마다 적힌 경우가 경우별 정해진 길(beginner-path.ts·twist-first-path.ts)이 그 상황에서 고르는 경우와 같은지
// 본다(docs/standing-rules.md 1절 「각 단계는 모든 경우를 가르친다」).
import {
  applyMoves,
  faceColors,
  parseMoves,
  solvedCube,
} from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import { BEGINNER_CASE_SHEETS, type CaseSheetStage } from "./beginner-cases";
import { pathStage, runStage } from "./beginner-path";
import { BEGINNER_333 } from "./lessons-333";
import { TWIST_FIRST_333 } from "./lessons-twist-first";
import { runTwistFirstStage, twistFirstStage } from "./twist-first-path";

const stateOf = (alg: string) =>
  applyMoves(3, solvedCube(3), parseMoves(3, alg));

/** 그 단계 규칙이 이 상황에서 고르는 첫 경우(끝났으면 "done") */
function firstCase(stage: CaseSheetStage, s: PuzzleState): string {
  const r =
    stage.path === "beginner"
      ? runStage(stage.id, s)
      : runTwistFirstStage(stage.id, s);
  return r.steps[0]?.caseId ?? "done";
}

const casesOf = (stage: CaseSheetStage) =>
  stage.path === "beginner"
    ? pathStage(stage.id).cases
    : twistFirstStage(stage.id).cases;

describe("단계마다 모든 경우 그림", () => {
  for (const [name, sheet] of Object.entries(BEGINNER_CASE_SHEETS)) {
    it(`${sheet.title}: 그림마다 적힌 경우가 정해진 길이 고르는 경우와 같다`, () => {
      const got = sheet.cases.map((c) =>
        firstCase(sheet.stage, stateOf(c.alg)),
      );
      expect(got, name).toEqual(sheet.cases.map((c) => c.id));
    });

    it(`${sheet.title}: 그 단계의 경우를 하나도 빠뜨리지 않는다`, () => {
      const ids = new Set(sheet.cases.map((c) => c.id));
      for (const c of casesOf(sheet.stage))
        expect(ids.has(c.id), `${name}: ${c.id}(${c.shape})`).toBe(true);
    });
  }

  it("코너 방향 먼저의 코너 방향 그림은 윗면 모양 여덟이 모두 다르다(위를 보는 둘인 모양 셋 포함)", () => {
    const sheet = BEGINNER_CASE_SHEETS["beginner-tf-twist"];
    // 노란 칸 자리(윗면 구석 + 옆면 윗줄 구석)를 윗면 돌리기 넷 가운데 가장 작은 것으로 본 모양 열쇠
    const keyOf = (alg: string) =>
      ["", "U", "U2", "U'"]
        .map((u) => {
          const col = faceColors(3, stateOf(`${alg} ${u}`));
          return [0, 2, 6, 8, 9, 11, 18, 20, 36, 38, 45, 47]
            .map((i) => (col[i] === 3 ? 1 : 0))
            .join("");
        })
        .sort()[0];
    expect(new Set(sheet.cases.map((c) => keyOf(c.alg))).size).toBe(8);
  });

  it("코너 방향 「노란색이 위인데 다른 코너가 돌아가 있음」은 정말 앞-오른쪽 위가 맞고 윗면을 돌려 다음 코너를 가져온다", () => {
    const c = BEGINNER_CASE_SHEETS["beginner-corner-twist"].cases.find((x) =>
      x.caption.startsWith("노란색이 위인데"),
    );
    const first = runStage("corner-twist", stateOf(c?.alg ?? "")).steps[0];
    expect(first?.hold).toMatch(/^U/);
  });

  it("단계 강마다 첫머리 네 쪽 안에 그 단계 그림이 있다", () => {
    const want: Record<string, string> = {
      "333-white-cross": "beginner-cross",
      "333-first-corners-up": "beginner-corners-look",
      "333-second-layer": "beginner-second",
      "333-ll-cross": "beginner-yellow-cross",
      "333-ll-edges": "beginner-edges",
      "333-ll-corner-place": "beginner-corner-place",
      "333-ll-corner-twist": "beginner-corner-twist",
      "333-tf-cross": "beginner-tf-cross",
      "333-tf-corners": "beginner-tf-corners",
      "333-tf-second": "beginner-tf-second",
      "333-tf-eo": "beginner-tf-eo",
      "333-tf-ep": "beginner-tf-ep",
      "333-tf-twist": "beginner-tf-twist",
      "333-tf-place": "beginner-tf-place",
    };
    const lessons = [...BEGINNER_333.lessons, ...TWIST_FIRST_333.lessons];
    for (const [id, sheet] of Object.entries(want)) {
      const lesson = lessons.find((l) => l.id === id);
      const at = lesson?.steps.findIndex((s) => s.sheet === sheet) ?? -1;
      expect(at, id).toBeGreaterThanOrEqual(0);
      // 신광사 흰 십자는 어디를 돌려도 되는지 보이는 돌리기 쪽 넷을 경우 그림보다 먼저 둔다(2026-11-27 사용자)
      expect(at, id).toBeLessThan(id === "333-tf-cross" ? 6 : 4);
    }
  });
});
