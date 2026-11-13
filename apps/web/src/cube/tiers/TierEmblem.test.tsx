import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  coreScale,
  cubeFaces,
  FRAME_OUT,
  glintsFor,
  HDR_TIERS,
  type Pt,
} from "./emblemArt";
import { divisionPips, TierEmblem } from "./TierEmblem";
import { DIVISIONS, TIER_IDS } from "./table";

/** 평면 티어 엠블럼(TierEmblem.tsx, 마지막 대체): 티어마다 그려지고, 구간 표시가 정한 크기에만 붙는지 */
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

  it("블럭 빛과 그늘은 칸 하나를 면마다 무늬로 깔아(요소가 크게 늘지 않게), 28px 아래는 블럭 세부가 없다", () => {
    const big = renderToStaticMarkup(<TierEmblem tier="diamond" size={64} />);
    // 칸 그림 하나, 면마다 무늬 하나
    expect(big.match(/id="[^"]+-cell"/g)).toHaveLength(1);
    expect(big.match(/<pattern /g)).toHaveLength(3);
    // 금속(골드)도 같은 짜임, 블럭 결 그라데이션을 쓴다
    const gold = renderToStaticMarkup(<TierEmblem tier="gold" size={64} />);
    expect(gold).toContain("-brush)");
    // 요소 수(태그) 상한(2026-11-09 챌린저 253): 블럭 27개에 조각을 따로 그리면 이 선을 크게 넘는다
    for (const tier of TIER_IDS) {
      const html = renderToStaticMarkup(<TierEmblem tier={tier} size={64} />);
      expect(html.match(/<[a-zA-Z]/g)?.length ?? 0).toBeLessThan(270);
    }
    const small = renderToStaticMarkup(<TierEmblem tier="diamond" size={24} />);
    expect(small).not.toContain("<pattern");
  });

  it("움직이지 않는다(빛 띠·HDR 층 없음, 마지막 대체라 정지 그림처럼 멈춘 모습)", () => {
    for (const tier of TIER_IDS) {
      const html = renderToStaticMarkup(<TierEmblem tier={tier} size={64} />);
      expect(html).not.toMatch(/emb-band|emb-hdr|data-twinkle|<img/);
    }
  });
});

/** 모양 값(emblemArt.ts): 평면 엠블럼과 3D 엠블럼이 함께 쓴다 */
describe("emblemArt", () => {
  it("위 티어일수록 몸이 작아지고(바깥 장식이 커질 자리), 틀은 엠블럼 안에 든다", () => {
    const scales = TIER_IDS.map(coreScale);
    for (let i = 1; i < scales.length; i++)
      expect(scales[i]).toBeLessThan(scales[i - 1] as number);
    for (const s of scales) expect(FRAME_OUT * s + 1.7).toBeLessThan(32);
  });

  it("반짝임은 위 네 티어에만 있고 모두 엠블럼(0~64) 안", () => {
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
