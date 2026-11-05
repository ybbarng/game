import { describe, expect, it } from "vitest";

import { COURSES } from "./learn";
import { touchText } from "./touch-text";

describe("touchText", () => {
  it("키보드가 있으면 그대로 둔다", () => {
    expect(touchText("R을 쳐 보세요.", false)).toBe("R을 쳐 보세요.");
  });

  it("키보드가 없으면 치는 말을 돌리는 말로 바꾼다", () => {
    expect(
      touchText("U를 쳐서 ㄱ자를 옮긴 뒤 공식을 한 번 쳐 보세요.", true),
    ).toBe("U를 돌려서 ㄱ자를 옮긴 뒤 공식을 한 번 돌려 보세요.");
    expect(touchText("막히면 힌트의 키를 눌러요.", true)).toBe(
      "막히면 힌트를 봐요.",
    );
  });

  it("바꾼 배우기 글에 「쳐」가 남지 않는다(고쳐요·합쳐요 같은 낱말은 빼고)", () => {
    const left = COURSES.flatMap((c) => c.lessons)
      .flatMap((l) => l.steps)
      .map((s) => touchText(s.body, true))
      .filter((b) => /(^|[^고받걸거합])쳐/.test(b));
    expect(left).toEqual([]);
  });
});
