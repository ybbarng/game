// 신광사 해법 강의: 쥐는 기준은 그림에서 노란 고리로 강조한다(2026-11-27 사용자, docs/47 16-33).
// 고리는 강 글이 말하는 쥐는 기준(자리 또는 조각)을 가리킨다(같은 날 「맞추고 싶은 위치가 FU 위치로 오게」). 쥐는 법은
// 「맞출 조각 → 들어갈 자리 → 그 자리가 기준 위치에 오게 쥐기 → 옮겨 넣기」 차례이고, 시연은 맞출 조각(`pick`)부터 고리를
// 옮긴다. 쪽 자료의 `focus`·`pick`이 규칙 경로(`gripPieces`·`gripPick`)가 그 시작 상태에서 고르는 것과 같은지 엔진으로 본다.
import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import type { PuzzleState } from "@game/puzzle-core";
import { describe, expect, it } from "vitest";

import type { StickerMarks } from "../bridge";
import {
  BEGINNER_CASE_SHEETS,
  caseFocus,
  TWIST_FLOW,
  withFlowPick,
} from "./beginner-cases";
import { focusMarks, isSlotFocus, placeByName } from "./focus";
import { TWIST_FIRST_333 } from "./lessons-twist-first";
import { setupFor } from "./notation";
import {
  gripPick,
  gripPieces,
  nextTwistFirstStep,
  type TwistFirstStageId,
} from "./twist-first-path";

const STAGE: Record<string, TwistFirstStageId> = {
  "333-tf-cross": "cross",
  "333-tf-corners": "corners",
  "333-tf-second": "second",
  "333-tf-eo": "eo",
  "333-tf-ep": "ep",
  "333-tf-twist": "twist",
  "333-tf-place": "place",
};
/** 면 글자 차례를 없앤 이름(자리 고리 「@」는 남긴다) */
const norm = (xs: readonly string[] | undefined) =>
  (xs ?? [])
    .map(
      (x) =>
        (isSlotFocus(x) ? "@" : "") + [...x.replace("@", "")].sort().join(""),
    )
    .sort();
const at = (alg: string) => applyMoves(3, solvedCube(3), parseMoves(3, alg));
/** 고리가 둘린 자리(지금 상태에서 그 스티커들이 든 자리 번호) */
const ringed = (marks: StickerMarks | null, now: PuzzleState) =>
  (marks ?? [])
    .flatMap((m, id) => (m === "focus" ? [now.perm.indexOf(id)] : []))
    .sort((a, b) => a - b);
const stickersOf = (name: string, now: PuzzleState) =>
  ringed(focusMarks(3, now, [name]), now);

describe("쥐는 기준(자리 또는 조각)", () => {
  // 강 글이 말하는 쥐는 기준: 흰 십자·첫 층 코너는 넣을 자리를 위-앞·앞-오른쪽 위에 오게(자리), 잘못 든 블럭을 뺄 때와
  // 둘째 층부터는 블럭이 어디에 오게(조각)
  const KIND: Record<string, "자리" | "조각"> = {
    "cross/down": "자리",
    "cross/front": "자리",
    "cross/middle": "조각",
    "cross/top": "조각",
    "corners/right": "자리",
    "corners/down": "자리",
    "corners/front": "자리",
    "corners/slot": "조각",
  };

  it("경우 표 그림마다 고리는 그 경우의 쥐는 기준이 자리면 자리, 조각이면 조각을 가리킨다", () => {
    const got: string[] = [];
    for (const sheet of Object.values(BEGINNER_CASE_SHEETS)) {
      if (sheet.stage.path !== "twist-first") continue;
      for (const c of sheet.cases) {
        const names = caseFocus(sheet, c);
        if (names.length === 0) continue;
        const kind = names.every(isSlotFocus)
          ? "자리"
          : names.some(isSlotFocus)
            ? "섞임"
            : "조각";
        got.push(`${sheet.stage.id}/${c.id} ${kind}`);
      }
    }
    const want = got.map((g) => {
      const [key] = g.split(" ");
      return `${key} ${KIND[key as string] ?? "조각"}`;
    });
    expect(got).toEqual(want);
    expect(got).toContain("cross/down 자리");
    expect(got).toContain("corners/right 자리");
  });

  it("흰 십자 아래-앞 흰색 아래: 고리는 흰-초록 엣지 블럭이 아니라 그 블럭이 들어갈 위-앞 자리", () => {
    const s = at("F2");
    expect(gripPieces("cross", s)).toEqual(["@UF"]);
    expect(gripPick("cross", s)).toEqual(["DF"]);
  });

  it("첫 층 코너 자리 밑: 고리는 코너 블럭이 아니라 들어갈 앞-오른쪽 위 자리", () => {
    // 코너 블럭 넣기의 거꾸로: 흰 코너 블럭이 아래-앞-오른쪽, 흰색이 오른쪽
    const s = at(setupFor("F' R F R'"));
    expect(gripPieces("corners", s)).toEqual(["@UFR"]);
    expect(norm(gripPick("corners", s))).toEqual(["DFR"]);
  });
});

describe("넣을 자리 고리는 자리에 남는다", () => {
  it("층을 돌려 든 조각이 바뀌어도 고리는 위-앞 자리에 남는다", () => {
    const start = at("F2");
    const after = applyMoves(3, start, parseMoves(3, "F2"));
    expect(ringed(focusMarks(3, start, ["@UF"], after), after)).toEqual(
      stickersOf("UF", after),
    );
    // 조각 고리는 조각을 따라가 아래-앞으로 내려간다
    expect(ringed(focusMarks(3, start, ["UF"], after), after)).toEqual(
      stickersOf("DF", after),
    );
  });

  it("큐브 전체를 돌리면 자리 고리도 따라간다(y로 쥐면 위-오른쪽 자리가 위-앞으로)", () => {
    // y로 쥐고 F2로 올리는 상황: 들어갈 자리는 위-오른쪽
    const start = at(setupFor("y F2"));
    expect(gripPieces("cross", start)).toEqual(["@UR"]);
    const held = applyMoves(3, start, parseMoves(3, "y"));
    expect(ringed(focusMarks(3, start, ["@UR"], held), held)).toEqual(
      stickersOf("UF", held),
    );
  });
});

describe("쪽 자료의 고리", () => {
  for (const lesson of TWIST_FIRST_333.lessons) {
    const stage = STAGE[lesson.id] as TwistFirstStageId;
    it(`${lesson.title}: 시연·해 보기의 고리는 규칙이 고르는 쥐는 기준과 같고, 자리가 기준인 시연은 맞출 조각부터 보인다`, () => {
      const wrong: string[] = [];
      lesson.steps.forEach((step, i) => {
        if (!step.setup || !("alg" in step.setup)) return;
        const start = at(step.setup.alg);
        const want = gripPieces(stage, start);
        const needed =
          (step.kind === "demo" || step.kind === "try") && want.length > 0;
        if (step.focus || needed) {
          if (JSON.stringify(norm(step.focus)) !== JSON.stringify(norm(want)))
            wrong.push(`${i + 1}번 쪽 고리: ${step.focus ?? "없음"} ≠ ${want}`);
        }
        // 맞출 조각: 자리가 기준인 시연에만, 규칙이 고른 조각
        const pick = step.kind === "demo" ? gripPick(stage, start) : [];
        if (JSON.stringify(norm(step.pick)) !== JSON.stringify(norm(pick)))
          wrong.push(
            `${i + 1}번 쪽 맞출 조각: ${step.pick ?? "없음"} ≠ ${pick}`,
          );
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
      expect([node.id, norm(picked.focus)]).toEqual([
        node.id,
        norm(gripPieces("twist", at(node.alg))),
      ]);
    }
  });

  it("조각 고리는 조각을 따라 돈다(코너 위치 기본형: 제자리 코너, 쥐는 y 뒤에도 같은 조각)", () => {
    const start = at("R U R' U'");
    const marks = focusMarks(3, start, ["UFR"]) as StickerMarks;
    const after = applyMoves(3, start, parseMoves(3, "y"));
    expect(ringed(marks, after)).toEqual(stickersOf("UFL", after));
  });

  it("모르는 자리 이름은 바로 알린다", () => {
    expect(() => focusMarks(3, solvedCube(3), ["UXF"])).toThrow(
      "자리 이름을 모른다",
    );
    expect(placeByName(3, "UXF")).toBe(-1);
  });

  it("흰 십자·첫 층 코너의 자리 고리는 쥔 뒤 늘 위-앞·앞-오른쪽 위에 온다", () => {
    for (const [stage, alg, want] of [
      ["cross", "y D F2", "UF"],
      ["corners", "y' D F' R F R'", "UFR"],
    ] as const) {
      const start = at(setupFor(alg));
      const st = nextTwistFirstStep(stage, start);
      if (!st) throw new Error("걸음이 없다");
      const held = applyMoves(3, start, parseMoves(3, st.hold));
      expect([
        stage,
        ringed(focusMarks(3, start, gripPieces(stage, start), held), held),
      ]).toEqual([stage, stickersOf(want, held)]);
    }
  });
});
