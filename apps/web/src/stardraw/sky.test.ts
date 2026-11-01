// @vitest-environment node
import { describe, expect, it } from "vitest";

import { SKY_LINES, SKY_STARS, starOf, tempColor } from "./sky";
import topology from "./sky-topology.json";

type Pt = [number, number];
const same = (p: Pt, q: Pt) => p[0] === q[0] && p[1] === q[1];

/** 판의 선분(북극 너머로 나가는 끝 y = -0.04는 그림 밖이라 뺀다) */
const boardSegments = (): [Pt, Pt][] =>
  SKY_LINES.flatMap((line) =>
    line.pts.slice(1).map((p, i) => [line.pts[i] as Pt, p as Pt] as [Pt, Pt]),
  ).filter(([a, b]) => a[1] !== -0.04 && b[1] !== -0.04);

describe("모양의 짜임(평면 매장·회전 순서 보존, docs/36 11-3)", () => {
  it("원래 하늘에서 만나지 않던 두 선분은 판에서도 만나지 않는다", () => {
    const segs = boardSegments();
    const allowed = (s: [Pt, Pt], t: [Pt, Pt]) =>
      (topology.meetInSky as unknown as [[Pt, Pt], [Pt, Pt]][]).some(
        ([u, v]) =>
          ((same(u[0], s[0]) && same(u[1], s[1])) ||
            (same(u[0], s[1]) && same(u[1], s[0]))) &&
          ((same(v[0], t[0]) && same(v[1], t[1])) ||
            (same(v[0], t[1]) && same(v[1], t[0]))),
      );
    const side = (p: Pt, a: Pt, b: Pt) =>
      (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const met: string[] = [];
    for (let i = 0; i < segs.length; i++)
      for (let j = i + 1; j < segs.length; j++) {
        const [A, B] = segs[i] as [Pt, Pt];
        const [C, D] = segs[j] as [Pt, Pt];
        if (same(A, C) || same(A, D) || same(B, C) || same(B, D)) continue;
        if (
          side(A, C, D) * side(B, C, D) < 0 &&
          side(C, A, B) * side(D, A, B) < 0 &&
          !allowed([A, B], [C, D]) &&
          !allowed([C, D], [A, B])
        )
          met.push(`${A}-${B} × ${C}-${D}`);
      }
    expect(met).toEqual([]);
  });

  it("한 별에서 뻗은 선들의 시계 방향 차례가 원래 하늘과 같다", () => {
    expect(topology.around.length).toBeGreaterThan(50);
    const cyclic = (list: Pt[]) => {
      const keys = list.map((p) => p.join(","));
      const k = keys.indexOf([...keys].sort()[0] as string);
      return [...keys.slice(k), ...keys.slice(0, k)].join(" ");
    };
    for (const { at, order } of topology.around as {
      at: Pt;
      order: Pt[];
    }[]) {
      const angle = (p: Pt) => Math.atan2(p[1] - at[1], p[0] - at[0]);
      const onBoard = [...order].sort((p, q) => angle(p) - angle(q));
      expect(cyclic(onBoard), `${at}`).toBe(cyclic(order));
    }
  });
});

describe("네모 하늘 데이터", () => {
  it("별 45개, 번호는 1~45 차례이고 밝은 순서다", () => {
    expect(SKY_STARS).toHaveLength(45);
    SKY_STARS.forEach((s, i) => {
      expect(s.n).toBe(i + 1);
      if (i > 0)
        expect(s.mag).toBeGreaterThanOrEqual(
          (SKY_STARS[i - 1] as (typeof SKY_STARS)[number]).mag,
        );
    });
    expect(starOf(1).ko).toBe("시리우스");
    expect(starOf(7).ko).toBe("베텔게우스");
    expect(starOf(45).ko).toBe("데네볼라");
  });

  it("모든 별에 이름·별자리·한 줄 문구가 있다", () => {
    for (const s of SKY_STARS) {
      expect(s.ko.length).toBeGreaterThan(0);
      expect(s.con).toMatch(/자리$/);
      expect(s.fact.length).toBeGreaterThan(10);
    }
  });

  it("별은 판 안에 있고, 손가락으로 누를 틈이 있다", () => {
    for (const s of SKY_STARS) {
      expect(s.x).toBeGreaterThanOrEqual(0.05);
      expect(s.x).toBeLessThanOrEqual(0.95);
      expect(s.y).toBeGreaterThanOrEqual(0.05);
      expect(s.y).toBeLessThanOrEqual(0.92);
    }
    let closest = Infinity;
    for (let i = 0; i < SKY_STARS.length; i++)
      for (let j = i + 1; j < SKY_STARS.length; j++) {
        const a = SKY_STARS[i] as (typeof SKY_STARS)[number];
        const b = SKY_STARS[j] as (typeof SKY_STARS)[number];
        closest = Math.min(closest, Math.hypot(a.x - b.x, a.y - b.y));
      }
    // 판 너비 360px에서 30px쯤
    expect(closest).toBeGreaterThan(0.08);
  });

  it("별자리 선은 판 안의 꺾은선이다", () => {
    expect(SKY_LINES.length).toBeGreaterThan(100);
    for (const line of SKY_LINES) {
      expect(line.pts.length).toBeGreaterThanOrEqual(2);
      for (const [x, y] of line.pts) {
        expect(x).toBeGreaterThan(-0.05);
        expect(x).toBeLessThan(1.05);
        expect(y).toBeGreaterThan(-0.05);
        expect(y).toBeLessThan(1.05);
      }
    }
  });

  it("번호 별은 자기 별자리 선의 꼭짓점 바로 그 자리에 있다", () => {
    for (const s of SKY_STARS) {
      const onLine = SKY_LINES.some(
        (line) =>
          line.con === s.con &&
          line.pts.some(([x, y]) => x === s.x && y === s.y),
      );
      expect(onLine, `${s.n} ${s.ko}`).toBe(true);
    }
  });

  it("붉은 별은 붉고 푸른 별은 푸르다", () => {
    const [r1, , b1] = tempColor(starOf(7).k);
    const [r2, , b2] = tempColor(starOf(5).k);
    expect(r1).toBeGreaterThan(b1);
    expect(b2).toBeGreaterThan(r2);
  });
});
