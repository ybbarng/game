import { describe, expect, it } from "vitest";
import { courseMethod } from "./course-method";
import { BASICS, courseById, METHOD_COURSES } from "./courses";
import { MAP_METHODS } from "./solve-map";

const course = (id: string) => {
  const c = courseById(id);
  if (!c) throw new Error(id);
  return c;
};

describe("강 화면 이동 경로의 해법 이름(docs/47 16-31)", () => {
  it("해법 배우기의 모든 강의가 해법 이름을 갖는다", () => {
    const missing = METHOD_COURSES.filter((c) => !courseMethod(c)).map(
      (c) => c.id,
    );
    expect(missing).toEqual([]);
  });

  it("카드가 있는 해법은 해법 카드 이름을 그대로 쓰고 그 카드로 잇는다", () => {
    for (const c of METHOD_COURSES) {
      const m = courseMethod(c);
      if (!m?.id) continue;
      const card = MAP_METHODS.find((x) => x.id === m.id);
      expect(card?.title).toBe(m.title);
      expect(card?.course).toBe(c.id);
    }
  });

  it("3×3은 해법 이름만, 다른 크기는 크기를 앞에 붙인다", () => {
    expect(courseMethod(course("cfop"))?.label).toBe("CFOP 해법");
    expect(courseMethod(course("333-beginner"))?.label).toBe("초보자 해법");
    // 둘째 이름이 있는 해법은 함께 적고 「해법」을 두 번 쓰지 않는다(2026-11-27 사용자)
    expect(courseMethod(course("333-twist-first"))?.label).toBe(
      "초보자(코너 방향 먼저) · 신광사 해법",
    );
    expect(courseMethod(course("222-beginner"))?.label).toBe(
      "2×2 처음 맞추기 해법",
    );
    expect(courseMethod(course("444-yau"))?.label).toBe("4×4 야우 해법");
    expect(courseMethod(course("big-666-777"))?.label).toBe(
      "6×6·7×7 축소법 해법",
    );
  });

  it("큐브의 기초는 해법이 아니라 해법 이름이 없다", () => {
    expect(courseMethod(BASICS)).toBeUndefined();
  });
});
