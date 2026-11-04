// 단계 지도(stage-map.ts): 시연 수가 단계 끝마다 그 단계 목표가 되는지, 지도 단원·단계 단원이 과정과 맞는지 엔진으로 본다.
import { applyMoves, parseMoves, solvedCube } from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import { COURSES } from "./index";
import { goalMet } from "./judge";
import { lessonPlace, mapLessonId, STAGE_SPECS } from "./stage-map";
import type { CubeSize } from "./types";

const courseOf = (id: string) => {
  const c = COURSES.find((x) => x.id === id);
  if (!c) throw new Error(id);
  return c;
};

describe("단계 지도", () => {
  const withDemo = Object.entries(STAGE_SPECS).filter(([, s]) => s.demo);

  it.each(withDemo)(
    "%s 시연: 단계 끝마다 그 목표, 시작 전에는 아님",
    (id, spec) => {
      const n = courseOf(id).size as CubeSize;
      const demo = spec.demo;
      if (!demo) throw new Error(id);
      expect(demo.moves).toHaveLength(spec.stages.length);
      let s = applyMoves(n, solvedCube(n), parseMoves(n, demo.scramble));
      spec.stages.forEach((stage, i) => {
        const goal = stage.goal;
        if (!goal) throw new Error(`${id} ${stage.title} 목표 없음`);
        expect(goalMet(n, s, goal), `${stage.title} 전`).toBe(false);
        s = applyMoves(n, s, parseMoves(n, demo.moves[i] as string));
        expect(goalMet(n, s, goal), `${stage.title} 끝`).toBe(true);
      });
      expect(goalMet(n, s, "solved")).toBe(true);
    },
  );

  it.each(Object.keys(STAGE_SPECS))(
    "%s: 단계 단원이 과정에 있고, 지도는 첫 단계 바로 앞",
    (id) => {
      const course = courseOf(id);
      const ids = course.lessons.map((l) => l.id);
      for (const st of course.stages ?? [])
        for (const l of st.lessons) expect(ids, l).toContain(l);
      const map = ids.indexOf(mapLessonId(id));
      expect(map).toBeGreaterThanOrEqual(0);
      const first = course.stages?.find((s) => s.lessons.length > 0)
        ?.lessons[0];
      expect(ids[map + 1]).toBe(first);
      // 지도 단원에 글만 있는 단계가 없다(시연 또는 고르기)
      const lesson = course.lessons[map];
      expect(lesson?.steps.every((s) => s.kind !== "text")).toBe(true);
      expect(lesson?.steps.some((s) => s.kind === "quiz")).toBe(true);
    },
  );

  it("3×3 초보자: 준비(조각·표기) → 지도 → 일곱 단계 → 마무리", () => {
    const c = courseOf("333-beginner");
    expect(c.stages?.map((s) => s.title)).toEqual([
      "흰 십자",
      "첫 층 꼭짓점",
      "둘째 층 모서리",
      "노란 십자",
      "옆면 맞추기",
      "꼭짓점 자리",
      "꼭짓점 방향",
    ]);
    const ids = c.lessons.map((l) => l.id);
    expect(ids.indexOf("333-beginner-map")).toBe(
      ids.indexOf("333-white-cross") - 1,
    );
    expect(lessonPlace(c, "333-notation")).toEqual({ kind: "prep" });
    expect(lessonPlace(c, "333-beginner-map")).toEqual({ kind: "map" });
    expect(lessonPlace(c, "333-ll-edges")).toEqual({ kind: "stage", index: 4 });
    expect(lessonPlace(c, "333-beginner-finale")).toEqual({ kind: "after" });
    // 단원 제목과 단계 이름이 같다
    for (const st of c.stages ?? [])
      expect(c.lessons.find((l) => l.id === st.lessons[0])?.title).toBe(
        st.title,
      );
  });

  it("고르기 답: 흰 십자 다음은 첫 층 꼭짓점, 마지막 단계 공식은 2단계에서", () => {
    const map = courseOf("333-beginner").lessons.find(
      (l) => l.id === "333-beginner-map",
    );
    const quizzes = (map?.steps ?? []).filter((s) => s.kind === "quiz");
    const answer = (i: number) => {
      const q = quizzes[i]?.quiz;
      return q?.choices[q.answer];
    };
    expect(answer(0)).toBe("첫 층 꼭짓점");
    expect(answer(1)).toBe("2단계(첫 층 꼭짓점)");
    expect(answer(2)).toBe("여섯 개");
    // 첫 층 꼭짓점과 꼭짓점 방향 단원이 같은 공식을 쓴다
    const lessons = courseOf("333-beginner").lessons;
    for (const id of ["333-first-corners-up", "333-ll-corner-twist"])
      expect(
        lessons
          .find((l) => l.id === id)
          ?.steps.some((s) => s.alg?.includes("R' D' R D")),
        id,
      ).toBe(true);
  });
});
