import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HDR_TIERS, hdrBandSrc, hdrGlintSrc } from "./emblemArt";
import { canShine, divisionPips, TierEmblem } from "./TierEmblem";
import { DIVISIONS, TIER_IDS } from "./table";

/** 티어 엠블럼(TierEmblem.tsx): 티어마다 그려지고, 구간 표시·빛 띠·HDR 층이 정한 티어에만 붙는지 */
describe("TierEmblem", () => {
  it("열 티어 모두 그림 하나로 그려지고 기본은 장식(읽어 주지 않음)", () => {
    for (const tier of TIER_IDS) {
      const html = renderToStaticMarkup(<TierEmblem tier={tier} />);
      expect(html).toContain(`data-cube-emblem="${tier}"`);
      expect(html).toContain('aria-hidden="true"');
      expect(html.match(/<svg/g)).toHaveLength(1);
    }
  });

  it("이름을 주면 이름이 있는 그림", () => {
    const html = renderToStaticMarkup(
      <TierEmblem tier="gold" label="골드 II" />,
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="골드 II"');
  });

  it("구간 IV~I은 켜진 표시 하나~넷이고, 28px 아래에서는 그리지 않는다", () => {
    expect(DIVISIONS.map(divisionPips)).toEqual([1, 2, 3, 4]);
    const big = renderToStaticMarkup(
      <TierEmblem tier="silver" division="III" size={48} />,
    );
    expect(big).toContain('data-cube-emblem-division="III"');
    expect(big).toContain('viewBox="0 0 64 74"');
    const small = renderToStaticMarkup(
      <TierEmblem tier="silver" division="III" size={18} />,
    );
    expect(small).not.toContain("data-cube-emblem-division");
    expect(small).toContain('viewBox="0 0 64 64"');
  });

  it("빛 띠는 플래티넘부터, HDR 층은 다이아몬드부터", () => {
    expect(TIER_IDS.filter(canShine)).toEqual([
      "platinum",
      "emerald",
      "diamond",
      "master",
      "grandmaster",
      "challenger",
    ]);
    for (const tier of TIER_IDS) {
      const html = renderToStaticMarkup(<TierEmblem tier={tier} />);
      expect(html.includes("emb-band")).toBe(canShine(tier));
      const hdr = (HDR_TIERS as readonly string[]).includes(tier);
      expect(html.includes("emb-hdr-layer")).toBe(hdr);
    }
  });

  it("HDR 층은 띠 그림 셋과 반짝임 그림 하나, `still`이면 반짝임만, `noHdr`면 없음", () => {
    const html = renderToStaticMarkup(<TierEmblem tier="master" />);
    expect(html).toContain(hdrGlintSrc("master"));
    for (const i of [0, 1, 2]) expect(html).toContain(hdrBandSrc("master", i));
    expect(html).toContain('loading="lazy"');

    const still = renderToStaticMarkup(<TierEmblem tier="master" still />);
    expect(still).toContain(hdrGlintSrc("master"));
    expect(still).not.toContain(hdrBandSrc("master", 0));

    const off = renderToStaticMarkup(<TierEmblem tier="master" noHdr />);
    expect(off).not.toContain("emb-hdr-layer");
    // HDR을 꺼도 SVG 반짝임 점은 남는다
    expect(off).toContain("emb-glint");
  });
});
