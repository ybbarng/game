// 3×3 처음 맞추기 단원(lessons-333.ts)의 시연·해 보기·따라 하기 모범 답이 경우별 정해진 길(beginner-path.ts)과 같은지 본다.
// 단원 글이 말하는 길과 규칙 자료가 어긋나면 여기서 잡힌다(규칙으로 푼 수 = 단원 모범 답).
import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { type PathStageId, runStage, stepMoves } from "./beginner-path";
import { COURSES } from "./index";
import { goalMet } from "./judge";
import type { Lesson } from "./types";

const LESSON_STAGE: Record<string, PathStageId> = {
  "333-white-cross": "cross",
  "333-first-corners-up": "corners",
  "333-second-layer": "second",
  "333-ll-cross": "yellow-cross",
  "333-ll-edges": "edges",
  "333-ll-corner-place": "corner-place",
  "333-ll-corner-twist": "corner-twist",
};

const course = COURSES.find((c) => c.id === "333-beginner");
const norm = (alg: string) => alg.trim().split(/\s+/).join(" ");

describe("단원 모범 답 = 경우별 정해진 길", () => {
  for (const lesson of (course?.lessons ?? []) as Lesson[]) {
    const stage = LESSON_STAGE[lesson.id];
    if (!stage) continue;
    lesson.steps.forEach((step, i) => {
      if (!step.alg || !step.setup || !("alg" in step.setup)) return;
      if (!["demo", "try", "turn"].includes(step.kind)) return;
      it(`${lesson.title} ${i + 1}번(${step.kind})`, () => {
        const start = applyMoves(
          3,
          solvedCube(3),
          parseMoves(3, (step.setup as { alg: string }).alg),
        );
        const r = runStage(stage, start);
        const path = norm(r.steps.map(stepMoves).join(" "));
        const want = norm(step.alg as string);
        // 따라 하기는 길의 앞부분, 시연·해 보기는 길 전체
        if (step.kind === "turn")
          expect(path.startsWith(want), path).toBe(true);
        else expect(path).toBe(want);
      });
    });
  }

  it("단원 글에 「될 때까지」·「최대」·「한두 번」 같은 끝없는 말이 없다", () => {
    const words = /때까지|최대|한두 번|알아서|적당히|잘 보고/;
    for (const lesson of (course?.lessons ?? []) as Lesson[]) {
      const texts = [
        lesson.summary,
        ...lesson.steps.flatMap((s) => [
          s.body,
          s.quiz?.question ?? "",
          s.quiz?.why ?? "",
          ...(s.quiz?.choices ?? []),
        ]),
      ];
      for (const t of texts) expect(t, `${lesson.id}: ${t}`).not.toMatch(words);
    }
  });

  it("전문 이름(퍼뮤·수네·섹시 무브·OLL·PLL)을 쓰지 않는다", () => {
    const words = /퍼뮤|수네|섹시|OLL|PLL|permutation/i;
    for (const lesson of (course?.lessons ?? []) as Lesson[])
      for (const s of lesson.steps)
        expect(
          [
            s.body,
            s.quiz?.question,
            s.quiz?.why,
            ...(s.quiz?.choices ?? []),
          ].join(" "),
          lesson.id,
        ).not.toMatch(words);
  });

  it("코너 시연: 아래 층에 흰 코너가 없고 흰-초록-빨강이 앞-왼쪽 위에 들어가 있다", () => {
    const lesson = course?.lessons.find((l) => l.id === "333-first-corners-up");
    const demo = lesson?.steps.find(
      (s) => s.kind === "demo" && s.body.includes("엉뚱한"),
    );
    const setup = demo?.setup as { alg: string };
    const s = applyMoves(3, solvedCube(3), parseMoves(3, setup.alg));
    expect(goalMet(3, s, "white-cross")).toBe(true);
    const r = runStage("corners", s);
    expect(r.steps.map((x) => x.caseId)).toEqual([
      "stuck",
      "bottom-right",
      "bottom-right",
    ]);
    // 흰-초록-빨강이 앞-왼쪽 위에 들어가 있고(y'로 앞-오른쪽 위에 쥔다), 넣으면 흰-주황-초록이 내려온다
    expect(r.steps.map((x) => x.piece)).toEqual([
      [0, 2, 1],
      [0, 2, 1],
      [0, 4, 2],
    ]);
    expect(r.steps[0]?.hold).toBe("y'");
  });
});
