import { describe, expect, it } from "vitest";

import { ALG_SETS, COURSES, courseById } from ".";
import { practiceLinks } from "./practice";

const title = (set: string) =>
  ALG_SETS.find((s) => s.set === set)?.title ?? set;

describe("해법 익히기의 연습 칸", () => {
  it("공식 훈련 칸은 모두 있는 묶음이다", () => {
    for (const c of COURSES)
      for (const l of practiceLinks(c, title).filter((x) => x.kind === "train"))
        expect(ALG_SETS.map((s) => `/cube/train?set=${s.set}`)).toContain(
          l.href,
        );
  });

  it("초보자 해법은 십자 훈련을 잇는다", () => {
    const c = courseById("333-beginner");
    expect(c && practiceLinks(c, title)[0]?.href).toBe("/cube/train/cross");
  });

  it("CFOP는 십자 훈련, F2L 묶음, 내 공식을 잇는다", () => {
    const c = courseById("cfop");
    const hrefs = c ? practiceLinks(c, title).map((l) => l.href) : [];
    expect(hrefs[0]).toBe("/cube/train/cross");
    expect(hrefs).toContain("/cube/train?set=f2l");
    expect(hrefs.at(-1)).toBe("/cube/algs");
  });
});
