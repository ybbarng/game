import { describe, expect, it } from "vitest";

import { backViewFor, backViewText, MIRROR_MIN_WIDTH } from "./back-view";
import { COURSES } from "./learn";

describe("뒷면 보기 고르기", () => {
  it("3D를 못 그리면 늘 펼친 그림", () => {
    for (const s of ["mirror", "net", "off"] as const)
      expect(backViewFor(s, 800, false)).toBe("net");
  });

  it("거울인데 자리가 좁으면 펼친 그림, 넓거나 아직 안 쟀으면 거울", () => {
    expect(backViewFor("mirror", MIRROR_MIN_WIDTH - 1, true)).toBe("net");
    expect(backViewFor("mirror", MIRROR_MIN_WIDTH, true)).toBe("mirror");
    expect(backViewFor("mirror", null, true)).toBe("mirror");
    expect(backViewFor("off", 200, true)).toBe("off");
    expect(backViewFor("net", 800, true)).toBe("net");
  });
});

describe("배우기 글의 낱말", () => {
  it("뒤쪽 칸을 고르라는 말만 거울로 바꾼다", () => {
    expect(
      backViewText("뒤쪽은 끌어서 둘러보거나 펼친 그림에서 눌러요.", "mirror"),
    ).toBe("뒤쪽은 끌어서 둘러보거나 거울에서 눌러요.");
    expect(
      backViewText("모두 찾아 눌러 보세요(뒤쪽은 펼친 그림에서).", "mirror"),
    ).toBe("모두 찾아 눌러 보세요(뒤쪽은 거울에서).");
    expect(backViewText("눌러 보세요(펼친 그림에서도 돼요).", "mirror")).toBe(
      "눌러 보세요(거울에서도 돼요).",
    );
    const read = "펼친 그림에서 면을 바로 보고 시계 방향으로 붙이는데";
    expect(backViewText(read, "mirror")).toBe(read);
    expect(backViewText("(뒤쪽은 펼친 그림에서)", "net")).toBe(
      "(뒤쪽은 펼친 그림에서)",
    );
  });

  it("거울일 때 찾기 단계 글에 「뒤쪽은 펼친 그림」이 남지 않는다", () => {
    for (const lesson of COURSES.flatMap((c) => c.lessons))
      for (const step of lesson.steps) {
        if (step.kind !== "find") continue;
        expect(backViewText(step.body, "mirror")).not.toMatch(
          /뒤쪽은[^.]*펼친 그림/,
        );
      }
  });
});
