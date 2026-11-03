import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import data from "../canopus-sky.json";
import { BureauLogo, WaxSeal } from "../components/BureauMarks";
import {
  CARINA_EDGES,
  CARINA_HEIGHT,
  CARINA_KEYS,
  CARINA_LINES,
  CARINA_SHAPE,
  CARINA_STARS,
} from "./carina";
import { Seal } from "./marks";
import { CardSecurity } from "./security";

const rad = (d: number) => (d * Math.PI) / 180;
/** 두 별 사이의 하늘 위 각거리(도) */
function sep(a: (typeof CARINA_STARS)[keyof typeof CARINA_STARS], b: typeof a) {
  const c =
    Math.sin(rad(a.dec)) * Math.sin(rad(b.dec)) +
    Math.cos(rad(a.dec)) * Math.cos(rad(b.dec)) * Math.cos(rad(a.ra - b.ra));
  return (Math.acos(Math.min(1, c)) * 180) / Math.PI;
}

describe("용골자리 하나의 정의(docs/36 11-39)", () => {
  test("별 값은 성도 자료(Bright Star Catalogue)와 같고, 잇는 별은 모두 정의 안에 있다", () => {
    for (const k of CARINA_KEYS) {
      const s = CARINA_STARS[k];
      expect(
        data.stars.some(
          (d) =>
            Math.abs(d.ra - s.ra) < 0.01 &&
            Math.abs(d.dec - s.dec) < 0.01 &&
            d.mag === s.mag,
        ),
      ).toBe(true);
    }
    const used = new Set(CARINA_LINES.flat());
    expect([...used].sort()).toEqual([...CARINA_KEYS].sort());
    expect(CARINA_EDGES).toHaveLength(8);
  });

  test("모양은 하늘에서 본 대로: 가로 0~1, 동쪽이 왼쪽이라 적경이 가장 작은 카노푸스가 오른쪽 끝", () => {
    const xs = CARINA_KEYS.map((k) => CARINA_SHAPE[k][0]);
    const ys = CARINA_KEYS.map((k) => CARINA_SHAPE[k][1]);
    expect(Math.min(...xs)).toBeCloseTo(0);
    expect(Math.max(...xs)).toBeCloseTo(1);
    expect(Math.min(...ys)).toBeCloseTo(0);
    expect(Math.max(...ys)).toBeCloseTo(CARINA_HEIGHT);
    expect(CARINA_SHAPE.alpha[0]).toBeCloseTo(1);
    // 별 사이 거리의 비율이 실제 각거리의 비율과 거의 같다(펴면서 모양이 일그러지지 않았다)
    const d = (a: keyof typeof CARINA_STARS, b: keyof typeof CARINA_STARS) =>
      Math.hypot(
        CARINA_SHAPE[a][0] - CARINA_SHAPE[b][0],
        CARINA_SHAPE[a][1] - CARINA_SHAPE[b][1],
      );
    const scale =
      d("alpha", "beta") / sep(CARINA_STARS.alpha, CARINA_STARS.beta);
    for (const [a, b] of CARINA_EDGES)
      expect(
        d(a, b) / sep(CARINA_STARS[a], CARINA_STARS[b]) / scale,
      ).toBeCloseTo(1, 1);
  });

  test("직인·실링왁스·로고는 같은 꺾은선과 별 수로 그린다", () => {
    for (const html of [
      renderToStaticMarkup(<Seal />),
      renderToStaticMarkup(<WaxSeal />),
      renderToStaticMarkup(<BureauLogo />),
    ]) {
      const lines = html.match(/<polyline [^>]*points="([^"]+)"/g) ?? [];
      // 실링왁스는 그림자와 윗면 두 벌
      expect(lines.length % CARINA_LINES.length).toBe(0);
      for (const l of lines)
        expect(l.match(/points="([^"]+)"/)?.[1]?.split(" ")).toHaveLength(
          CARINA_LINES[0]?.length ?? 0,
        );
    }
  });

  test("등록증 보안 무늬: 용골자리 셋이 같은 잇는 선이고, 그릴 때마다 같은 그림이다", () => {
    const html = renderToStaticMarkup(<CardSecurity />);
    const figureLines = html.match(/stroke="rgba\(200,220,255,0.16\)"/g) ?? [];
    expect(figureLines).toHaveLength(3 * CARINA_EDGES.length);
    expect(renderToStaticMarkup(<CardSecurity />)).toBe(html);
  });
});
