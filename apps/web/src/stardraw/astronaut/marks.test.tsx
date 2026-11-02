import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { Seal } from "./marks";
import { SEAL_GLYPHS } from "./seal-glyphs";

describe("직인 글자", () => {
  test("우주국장·당첨은 글꼴 없이 글자 윤곽으로 칸마다 그린다", () => {
    for (const text of ["우주국장", "입상"]) {
      const html = renderToStaticMarkup(<Seal text={text} />);
      expect(html).not.toContain("<text");
      for (const c of text) expect(html).toContain(SEAL_GLYPHS[c]?.d);
    }
  });

  test("윤곽이 없는 글자가 섞이면 글꼴 글자로 대신한다", () => {
    const html = renderToStaticMarkup(<Seal text="확인" />);
    expect(html).toContain(">확인</text>");
  });

  test("인주 자국은 씨앗을 고정해 그릴 때마다 같다", () => {
    const html = renderToStaticMarkup(<Seal />);
    const seeds = [...html.matchAll(/seed="(\d+)"/g)].map((m) => m[1]);
    expect(seeds.length).toBeGreaterThan(0);
    expect(renderToStaticMarkup(<Seal />)).toBe(html);
  });
});
