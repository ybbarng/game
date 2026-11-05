import { describe, expect, it } from "vitest";

import { backViewFor, backViewText, MIRROR_MIN_WIDTH } from "./back-view";
import { COURSES } from "./learn";

describe("뒷면 보기 고르기", () => {
  it("3D를 못 그리면 거울 없이(큐브 그림 둘이 여섯 면을 보인다)", () => {
    for (const s of ["mirror", "off"] as const)
      expect(backViewFor(s, 800, false)).toBe("off");
  });

  it("거울인데 자리가 좁으면 끔, 넓거나 아직 안 쟀으면 거울", () => {
    expect(backViewFor("mirror", MIRROR_MIN_WIDTH - 1, true)).toBe("off");
    expect(backViewFor("mirror", MIRROR_MIN_WIDTH, true)).toBe("mirror");
    expect(backViewFor("mirror", null, true)).toBe("mirror");
    expect(backViewFor("off", 800, true)).toBe("off");
  });
});

describe("배우기 글의 낱말", () => {
  it("거울이면 그대로, 껐으면 거울을 가리키는 말을 둘러보기로", () => {
    const pick = "뒤쪽은 끌어서 둘러보거나 거울에서 눌러요.";
    expect(backViewText(pick, "mirror")).toBe(pick);
    expect(backViewText(pick, "off")).toBe("뒤쪽은 끌어서 둘러보고 눌러요.");
    expect(backViewText("모두 찾아 눌러 보세요(뒤쪽은 거울에서).", "off")).toBe(
      "모두 찾아 눌러 보세요(뒤쪽은 끌어서 둘러보고).",
    );
    expect(backViewText("눌러 보세요(거울에서도 돼요).", "off")).toBe(
      "눌러 보세요(끌어서 둘러봐도 돼요).",
    );
  });

  it("배우기 글에 펼친 그림이 남지 않고, 껐을 때 거울도 남지 않는다", () => {
    for (const lesson of COURSES.flatMap((c) => c.lessons))
      for (const step of lesson.steps) {
        if (!("body" in step) || typeof step.body !== "string") continue;
        expect(step.body).not.toMatch(/펼친 그림|전개도/);
        if (step.kind === "find")
          expect(backViewText(step.body, "off")).not.toMatch(/거울/);
      }
  });
});
