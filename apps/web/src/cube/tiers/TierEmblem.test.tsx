import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  coreScale,
  cubeFaces,
  FRAME_OUT,
  glintsFor,
  HDR_TIERS,
  hdrBandSrc,
  hdrFacetSrc,
  hdrGlintSrc,
  type Pt,
} from "./emblemArt";
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

  it("블럭 빛과 그늘은 칸 하나를 면마다 무늬로 깔아(요소가 크게 늘지 않게), 28px 아래는 블럭 세부가 없다", () => {
    const big = renderToStaticMarkup(<TierEmblem tier="diamond" size={64} />);
    // 칸 그림 하나, 면마다 무늬 하나
    expect(big.match(/id="[^"]+-cell"/g)).toHaveLength(1);
    expect(big.match(/<pattern /g)).toHaveLength(3);
    // 빛 띠를 따라 번쩍이는 블럭 무리 다섯
    expect(big.match(/emb-block-flash/g)).toHaveLength(5);
    // 금속(골드)도 같은 짜임, 블럭 결 그라데이션을 쓴다
    const gold = renderToStaticMarkup(<TierEmblem tier="gold" size={64} />);
    expect(gold).toContain("-brush)");
    expect(gold).not.toContain("emb-block-flash");
    // 요소 수(태그) 상한(2026-11-09 챌린저 253): 블럭 27개에 조각을 따로 그리면 이 선을 크게 넘는다
    for (const tier of TIER_IDS) {
      const html = renderToStaticMarkup(<TierEmblem tier={tier} size={64} />);
      expect(html.match(/<[a-zA-Z]/g)?.length ?? 0).toBeLessThan(270);
    }
    const small = renderToStaticMarkup(<TierEmblem tier="diamond" size={24} />);
    expect(small).not.toContain("<pattern");
    expect(small).not.toContain("emb-block-flash");
  });

  it("반짝임 점은 다이아몬드부터 28px 이상에서 늘 천천히 반짝이고, `still`·작은 표시는 멈춘다", () => {
    const on = (props: Parameters<typeof TierEmblem>[0]) =>
      renderToStaticMarkup(<TierEmblem {...props} />).includes("data-twinkle");
    expect(on({ tier: "diamond", size: 64 })).toBe(true);
    expect(on({ tier: "emerald", size: 64 })).toBe(false);
    expect(on({ tier: "diamond", size: 64, still: true })).toBe(false);
    expect(on({ tier: "challenger", size: 18 })).toBe(false);
  });

  it("HDR 층은 늘 켜 두는 면 모서리 그림과 띠 그림 셋·반짝임 그림 하나, `still`이면 띠가 없고, `noHdr`면 없음", () => {
    const html = renderToStaticMarkup(<TierEmblem tier="master" />);
    expect(html).toContain(hdrGlintSrc("master"));
    expect(html).toContain(hdrFacetSrc("master"));
    for (const i of [0, 1, 2]) expect(html).toContain(hdrBandSrc("master", i));
    expect(html).toContain('loading="lazy"');

    const still = renderToStaticMarkup(<TierEmblem tier="master" still />);
    expect(still).toContain(hdrGlintSrc("master"));
    expect(still).toContain(hdrFacetSrc("master"));
    expect(still).not.toContain(hdrBandSrc("master", 0));

    const off = renderToStaticMarkup(<TierEmblem tier="master" noHdr />);
    expect(off).not.toContain("emb-hdr-layer");
    // HDR을 꺼도 SVG 반짝임 점은 남는다
    expect(off).toContain("emb-glint");
  });
});

/** 모양 값(emblemArt.ts): SVG와 HDR 그림 스크립트가 함께 쓴다 */
describe("emblemArt", () => {
  it("위 티어일수록 몸이 작아지고(바깥 장식이 커질 자리), 틀은 엠블럼 안에 든다", () => {
    const scales = TIER_IDS.map(coreScale);
    for (let i = 1; i < scales.length; i++)
      expect(scales[i]).toBeLessThan(scales[i - 1] as number);
    for (const s of scales) expect(FRAME_OUT * s + 1.7).toBeLessThan(32);
  });

  it("반짝임은 HDR 티어에만 있고 모두 엠블럼(0~64) 안", () => {
    for (const tier of TIER_IDS) {
      const g = glintsFor(tier);
      const hdr = (HDR_TIERS as readonly string[]).includes(tier);
      expect(g.length > 0).toBe(hdr);
      for (const { x, y, r } of g) {
        expect(x - r).toBeGreaterThanOrEqual(0);
        expect(x + r).toBeLessThanOrEqual(64);
        expect(y - r).toBeGreaterThanOrEqual(0);
        expect(y + r).toBeLessThanOrEqual(64);
      }
    }
  });

  it("반짝임은 그늘진 왼면·오른면 안에 두지 않는다(블럭 하나만 튀지 않게)", () => {
    // 볼록 사각형 안쪽까지의 거리(안이면 양수)
    const inside = (
      q: readonly (readonly [number, number])[],
      x: number,
      y: number,
    ) => {
      let d = Number.POSITIVE_INFINITY;
      const cx = q.reduce((s, p) => s + p[0], 0) / q.length;
      const cy = q.reduce((s, p) => s + p[1], 0) / q.length;
      const side = (px: number, py: number, i: number) => {
        const [ax, ay] = q[i] as readonly [number, number];
        const [bx, by] = q[(i + 1) % q.length] as readonly [number, number];
        return (
          ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) /
          Math.hypot(bx - ax, by - ay)
        );
      };
      const sign = Math.sign(side(cx, cy, 0));
      for (let i = 0; i < q.length; i++) d = Math.min(d, sign * side(x, y, i));
      return d;
    };
    for (const tier of HDR_TIERS) {
      const [, left, right] = cubeFaces(tier) as [Pt[], Pt[], Pt[]];
      for (const { x, y } of glintsFor(tier)) {
        expect(inside(left, x, y)).toBeLessThan(0);
        expect(inside(right, x, y)).toBeLessThan(0);
      }
    }
  });
});
