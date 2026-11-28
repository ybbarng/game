import { describe, expect, it } from "vitest";
import { courseLabel, courseMethod } from "./course-method";
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
    expect(courseMethod(course("333-beginner"))?.label).toBe("초보자 해법");
    // 해법을 이름으로 부르는 곳은 공식 이름만, 별칭은 넣지 않는다(2026-11-28 사용자)
    expect(courseMethod(course("cfop"))?.label).toBe("CFOP 해법");
    expect(courseMethod(course("333-twist-first"))?.label).toBe(
      "초보자(코너 방향 먼저) 해법",
    );
    expect(courseMethod(course("222-beginner"))?.label).toBe(
      "2×2 처음 맞추기 해법",
    );
    expect(courseMethod(course("444-yau"))?.label).toBe("4×4 야우 해법");
    expect(courseMethod(course("big-666-777"))?.label).toBe(
      "6×6·7×7 축소법 해법",
    );
  });

  it("별칭(둘째 이름)은 해법을 부르는 이름에 들지 않는다: 해법 카드와 해법 화면 머리에만(docs/47 16-38)", () => {
    const named = MAP_METHODS.filter((m) => m.alias && m.course);
    expect(named.map((m) => m.alias)).toEqual([
      "신광사 해법",
      "프리드리히 해법",
    ]);
    for (const m of named) {
      const word = (m.alias as string).replace(/ 해법$/, "");
      expect(courseMethod(course(m.course as string))?.label).not.toContain(
        word,
      );
    }
  });

  it("CFOP 한눈에 첫 쪽은 둘째 이름 「프리드리히 해법」과 그 유래를 밝힌다(docs/47 16-38)", () => {
    expect(MAP_METHODS.find((m) => m.id === "cfop")?.alias).toBe(
      "프리드리히 해법",
    );
    const overview = course("cfop").lessons.find(
      (l) => l.id === "cfop-overview",
    );
    expect(overview?.steps[0]?.body).toContain(
      "제시카 프리드리히가 1997년 인터넷에 정리해 올리면서 널리 퍼져, 그 이름을 따 프리드리히 해법이라고도 해요.",
    );
  });

  it("강의 이름은 해법 이름과 같다(3×3이 아니면 크기를 앞에, 사용자 결정을 기다리는 다섯만 따로)", () => {
    // 해법마다 강의가 하나라 강의 이름(이어서 하기·강의 목록·다음에 할 것·첫 화면 「다음 해법」)이 해법 이름과 다르면
    // 같은 것을 두 이름으로 부른다(2026-11-28 사용자 「문제를 찾았으면 고쳐야지」, docs/47 16-38). 아래 다섯은 강의
    // 이름이 입문자에게 더 쉬워, 해법 이름을 강의 이름에 맞출지 사용자가 정한다(그때까지 지금 이름을 확인한다)
    const PENDING: Record<string, string> = {
      "333-beginner": "3×3 처음 맞추기",
      "333-twist-first": "코너 방향 먼저 맞추기",
      "333-2look": "마지막 층을 공식으로",
      "222-from333": "3×3을 아는 사람의 2×2",
      "bld-op": "블라인드(올드 포흐만)",
    };
    const got = METHOD_COURSES.map((c) => [
      c.id,
      c.title,
      PENDING[c.id] ?? courseMethod(c)?.name,
    ]);
    expect(got.filter(([, title, want]) => title !== want)).toEqual([]);
  });

  it("강의를 부르는 이름(이어서 하기·강의 끝 글·다음 강의 링크)은 해법 공식 이름, 기초는 강의 이름", () => {
    expect(courseLabel(course("cfop"))).toBe("CFOP 해법");
    expect(courseLabel(course("333-twist-first"))).toBe(
      "초보자(코너 방향 먼저) 해법",
    );
    expect(courseLabel(course("444-yau"))).toBe("4×4 야우 해법");
    expect(courseLabel(BASICS)).toBe("큐브의 기초");
  });

  it("큐브의 기초는 해법이 아니라 해법 이름이 없다", () => {
    expect(courseMethod(BASICS)).toBeUndefined();
  });
});
