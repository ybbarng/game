// 신광사 해법 강의: 쥐는 기준 조각은 그림에서 노란 고리로 강조한다(2026-11-27 사용자, docs/47 16-33).
// 쪽 자료의 `focus`가 규칙 경로(`gripPieces`)가 그 시작 상태에서 고르는 기준 조각과 같은지 엔진으로 본다.
import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import type { StickerMarks } from "../bridge";
import { TWIST_FLOW, withFlowPick } from "./beginner-cases";
import { focusMarks, placeByName } from "./focus";
import { TWIST_FIRST_333 } from "./lessons-twist-first";
import { gripPieces, type TwistFirstStageId } from "./twist-first-path";

const STAGE: Record<string, TwistFirstStageId> = {
  "333-tf-cross": "cross",
  "333-tf-corners": "corners",
  "333-tf-second": "second",
  "333-tf-eo": "eo",
  "333-tf-ep": "ep",
  "333-tf-twist": "twist",
  "333-tf-place": "place",
};
const set = (xs: readonly string[]) =>
  xs.map((x) => placeByName(3, x)).sort((a, b) => a - b);

describe("쥐는 기준 조각 강조", () => {
  for (const lesson of TWIST_FIRST_333.lessons) {
    const stage = STAGE[lesson.id] as TwistFirstStageId;
    it(`${lesson.title}: 시연·해 보기는 기준 조각에 고리를 두르고, 쪽의 고리는 규칙이 고르는 기준 조각과 같다`, () => {
      const wrong: string[] = [];
      lesson.steps.forEach((step, i) => {
        if (!step.setup || !("alg" in step.setup)) return;
        const start = applyMoves(
          3,
          solvedCube(3),
          parseMoves(3, step.setup.alg),
        );
        const want = gripPieces(stage, start);
        const needed =
          (step.kind === "demo" || step.kind === "try") && want.length > 0;
        if (!step.focus && !needed) return;
        const got = JSON.stringify(set(step.focus ?? []));
        if (got !== JSON.stringify(set(want)))
          wrong.push(`${i + 1}번 쪽: ${step.focus ?? "없음"} ≠ ${want}`);
      });
      expect(wrong).toEqual([]);
    });
  }

  it("관계도에서 고른 모양의 시연도 그 모양의 기준 코너에 고리를 두른다", () => {
    const flowStep = TWIST_FIRST_333.lessons
      .flatMap((l) => l.steps)
      .find((s) => s.kind === "demo" && s.sheet === "tf-flow");
    if (!flowStep) throw new Error("관계도 시연 쪽이 없다");
    for (const node of TWIST_FLOW.filter((n) => n.to)) {
      const picked = withFlowPick(flowStep, node.id);
      const start = applyMoves(3, solvedCube(3), parseMoves(3, node.alg));
      expect([node.id, set(picked.focus ?? [])]).toEqual([
        node.id,
        set(gripPieces("twist", start)),
      ]);
    }
  });

  it("고리는 조각을 따라 돈다(코너 위치 기본형: 제자리 코너와 헤드라이트 둘, 쥐는 y 뒤에도 같은 조각)", () => {
    const start = applyMoves(3, solvedCube(3), parseMoves(3, "R U R' U'"));
    const marks = focusMarks(3, start, ["UFR"]) as StickerMarks;
    const after = applyMoves(3, start, parseMoves(3, "y"));
    // 스티커 정체마다 표시라, 돌린 뒤 UFR 정체가 든 자리를 찾으면 같은 셋이다
    const ringed = marks.flatMap((m, id) => (m === "focus" ? [id] : []));
    expect(ringed.length).toBe(3);
    const slots = ringed.map((id) => after.perm.indexOf(id));
    expect(new Set(slots).size).toBe(3);
  });

  it("모르는 자리 이름은 바로 알린다", () => {
    expect(() => focusMarks(3, solvedCube(3), ["UXF"])).toThrow(
      "자리 이름을 모른다",
    );
  });
});
