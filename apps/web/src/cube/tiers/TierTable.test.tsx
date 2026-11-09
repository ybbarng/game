import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { type MyTier, tierOf } from "./rank";
import { TierLink } from "./TierTable";

/** 크기 `n`에서 Ao5 `ms`의 내 티어(실제 표로 매김) */
function mineAt(n: number, ms: number): MyTier {
  const place = tierOf(n, ms);
  if (!place) throw new Error("표에 없는 크기");
  return { n, ao5: ms, place };
}

/** 링크 안의 글자(엠블럼 SVG에는 글자가 없다) */
const linkText = (html: string) => html.replace(/<[^>]+>/g, "");

/** 작은 티어 표시(TierLink, 혼자 맞추기 기록 칸·결과 상자) */
describe("TierLink", () => {
  it("구간 없는 그랜드마스터·챌린저는 이름만, 구간 있는 티어는 이름과 구간", () => {
    // 3×3: 챌린저 6.5초 이하, 그랜드마스터 7.5초 이하, 마스터 II 8.7초 이하
    expect(
      linkText(renderToStaticMarkup(<TierLink mine={mineAt(3, 6_200)} />)),
    ).toBe("챌린저");
    expect(
      linkText(renderToStaticMarkup(<TierLink mine={mineAt(3, 7_400)} />)),
    ).toBe("그랜드마스터");
    expect(
      linkText(renderToStaticMarkup(<TierLink mine={mineAt(3, 8_600)} />)),
    ).toBe("마스터 II");
  });

  it("이름 앞에 그 티어 엠블럼, 누르면 그 크기 티어표", () => {
    const html = renderToStaticMarkup(<TierLink mine={mineAt(4, 30_000)} />);
    expect(html).toContain('data-cube-emblem="grandmaster"');
    expect(html).not.toContain("data-cube-emblem-division");
    expect(html).toContain('href="/cube/tiers?n=4"');
  });
});
