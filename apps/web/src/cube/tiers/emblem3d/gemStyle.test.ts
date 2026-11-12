import { describe, expect, it } from "vitest";

import { GEM_BOX_HALF, traceGem, type Vec3 } from "./gem";
import {
  type FacetCut,
  facetNormal,
  GEM_STYLE_LOOK,
  GEM_STYLES,
  gemStyleOf,
  jardinAt,
} from "./gemStyle";
import { LOOK } from "./scene";

const H = GEM_BOX_HALF;
const TOP: Vec3 = [0, 1, 0];
/** 등각으로 놓인 조각을 정면에서 볼 때 물체 좌표의 눈 방향(몸통 대각선) */
const VIEW: Vec3 = [-1, -1, -1];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const angle = (a: Vec3, b: Vec3) =>
  (Math.acos(
    Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / len(a) / len(b)),
  ) *
    180) /
  Math.PI;

const cutOf = (s: keyof typeof GEM_STYLE_LOOK): FacetCut =>
  GEM_STYLE_LOOK[s].cut;

/** 윗면 위 점 격자(가장자리까지) */
const grid: Vec3[] = [];
for (let i = 0; i < 15; i++)
  for (let j = 0; j < 15; j++)
    grid.push([(-0.95 + (1.9 * i) / 14) * H, H, (-0.95 + (1.9 * j) / 14) * H]);

/** 면 위 점마다 가장 많이 나가는 빛의 방향을 묶어(약 15° 칸) 몇 갈래로 나뉘는지 */
function spread(cut: FacetCut | undefined): number {
  const seen = new Set<string>();
  for (const p of grid) {
    const r = traceGem("box", p, VIEW, TOP, 1.577, 0, undefined, cut);
    // 다섯 번 안에 나가지 못하고 안에서 계속 되튄 빛도 한 갈래로 센다
    const best = r.exits.reduce<(typeof r.exits)[number] | null>(
      (a, e) => (a && a.weight >= e.weight ? a : e),
      null,
    );
    seen.add(
      best ? best.dir.map((x) => Math.round(x * 4) + 0).join(",") : "안",
    );
  }
  return seen.size;
}

describe("깎은 면(docs/47 14-7 다섯째 시안)", () => {
  it("법선은 길이 1이고, 테이블(가운데)은 깎지 않은 면 그대로다", () => {
    for (const s of GEM_STYLES)
      for (const p of grid) {
        const n = facetNormal(cutOf(s), p, TOP, H);
        expect(len(n)).toBeCloseTo(1, 6);
        expect(n[1]).toBeGreaterThan(0.6);
      }
    for (const s of ["a", "b", "c", "d"] as const)
      expect(facetNormal(cutOf(s), [0, H, 0], TOP, H)).toEqual(TOP);
    expect(facetNormal(cutOf("now"), [0.4, H, 0.4], TOP, H)).toEqual(TOP);
  });

  it("계단 컷은 바깥 띠일수록 더 기울고, 가까운 변 쪽으로 기운다", () => {
    const cut = cutOf("a");
    const tilts = cut.rings.map((r) =>
      angle(facetNormal(cut, [(r.from + 0.01) * H, H, 0], TOP, H), TOP),
    );
    for (let i = 1; i < tilts.length; i++)
      expect(tilts[i]).toBeGreaterThan(tilts[i - 1] as number);
    expect(tilts[0]).toBeCloseTo(cut.rings[0]?.tilt ?? 0, 4);
    // +x 변 가까이면 +x 쪽으로, -z 변 가까이면 -z 쪽으로
    expect(facetNormal(cut, [0.9 * H, H, 0.1 * H], TOP, H)[0]).toBeGreaterThan(
      0.5,
    );
    expect(facetNormal(cut, [0.1 * H, H, -0.9 * H], TOP, H)[2]).toBeLessThan(
      -0.5,
    );
  });

  it("브릴리언트는 같은 띠에서도 조각마다 기운 방향이 다르다", () => {
    const cut = cutOf("b");
    // 띠는 네모 거리(가로·세로 가운데 큰 쪽)로 나뉘므로 네모 둘레(0.65)를 따라 고른다
    const r = 0.65 * H;
    const dirs = new Set<string>();
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      const m = Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
      const n = facetNormal(
        cut,
        [(Math.cos(a) / m) * r, H, (Math.sin(a) / m) * r],
        TOP,
        H,
      );
      // -0.000과 0.000을 같게
      dirs.add(n.map((x) => (Math.abs(x) < 5e-4 ? 0 : x).toFixed(3)).join(","));
    }
    expect(dirs.size).toBe(8);
  });

  it("깎은 면은 면 자리마다 다른 곳을 비춘다(보석의 밝고 어두운 조각 무늬): 평평한 면보다 갈래가 훨씬 많다", () => {
    const flat = spread(undefined);
    // 2026-11-12 잰 값: 평평한 면 4갈래, 계단 컷 57, 브릴리언트 62(15×15 점)
    expect(flat).toBeLessThanOrEqual(4);
    const a = spread(cutOf("a"));
    expect(a).toBeGreaterThanOrEqual(flat * 10);
    expect(spread(cutOf("b"))).toBeGreaterThan(a);
  });

  it("깎아도 빛이 새거나 생기지 않는다(흡수 없으면 겉 반사 + 나간 빛 + 남은 빛 = 1)", () => {
    for (const s of ["a", "b", "c", "d"] as const)
      for (const p of grid) {
        const r = traceGem("box", p, VIEW, TOP, 1.577, 0, undefined, cutOf(s));
        const total =
          r.reflect + r.exits.reduce((t, e) => t + e.weight, 0) + r.left;
        expect(total).toBeCloseTo(1, 4);
      }
  });
});

describe("내포물(시안 d)", () => {
  /** 조각 하나 부피에서 고른 점들 */
  const pts: Vec3[] = [];
  for (let i = 0; i < 12; i++)
    for (let j = 0; j < 12; j++)
      for (let k = 0; k < 12; k++)
        pts.push([
          (-1 + (2 * i) / 11) * H,
          (-1 + (2 * j) / 11) * H,
          (-1 + (2 * k) / 11) * H,
        ]);

  it("같은 자리면 늘 같은 결(돌려도 흔들리지 않는다)", () => {
    const q: Vec3 = [0.13, -0.27, 0.31];
    expect(jardinAt(q)).toEqual(jardinAt(q));
  });

  it("결과 알갱이는 보석 부피의 일부에만 있다(맑음은 그대로)", () => {
    for (const seed of [
      [0, 0, 0],
      [5.3, 0, -5.3],
      [-5.3, 5.3, 5.3],
    ] as const) {
      let veil = 0;
      let speck = 0;
      for (const p of pts) {
        const j = jardinAt([p[0] + seed[0], p[1] + seed[1], p[2] + seed[2]]);
        if (j.veil > 0.5) veil++;
        if (j.speck > 0.5) speck++;
      }
      expect(veil / pts.length).toBeLessThan(0.3);
      expect(speck / pts.length).toBeLessThan(0.08);
    }
  });

  it("조각마다(씨앗이 다르면) 결이 다르다", () => {
    const at = (s: number) =>
      pts.slice(0, 200).map((p) => jardinAt([p[0] + s, p[1], p[2]]).veil);
    expect(at(0)).not.toEqual(at(5.3));
  });
});

describe("시안 값", () => {
  it("주소 ?gem= 을 읽는다(모르는 값은 null)", () => {
    expect(gemStyleOf("?gem=a")).toBe("a");
    expect(gemStyleOf("?tier=emerald&gem=now")).toBe("now");
    expect(gemStyleOf("?gem=z")).toBeNull();
    expect(gemStyleOf("")).toBeNull();
  });

  it("「넷째 시안」은 지금 에메랄드 값과 같다(견줄 기준이 바뀌지 않게)", () => {
    const now = GEM_STYLE_LOOK.now;
    const e = LOOK.emerald.gem;
    expect(e).toBeDefined();
    now.left.forEach((left, i) => {
      expect(-Math.log(left) / 0.92).toBeCloseTo(e?.absorb[i] as number, 6);
    });
    expect(now.cut.kind).toBe(0);
    expect(now.spread).toBe(e?.spread);
  });

  it("유리 시안(e~g)은 아주 옅고 매끈하다: 조각 한 변을 지나도 초록 96%·빨강 80% 넘게 남고, 깎은 면·분산·내포물이 없다", () => {
    for (const s of ["e", "f", "g"] as const) {
      const l = GEM_STYLE_LOOK[s];
      expect(l.left[1]).toBeGreaterThan(0.96);
      expect(l.left[0]).toBeGreaterThanOrEqual(0.8);
      expect(l.cut.kind).toBe(0);
      expect(l.spread).toBe(0);
      expect(l.jardin).toBe(false);
      expect(l.studio).toBe("glass");
    }
    // 축: f는 꿰뚫어 보는 몫을 줄여 정면은 맑고 되튄 가장자리만 짙게, g만 조각 사이 틈을 없앤다
    expect(GEM_STYLE_LOOK.f.cubeFill).toBeLessThan(GEM_STYLE_LOOK.e.cubeFill);
    expect(GEM_STYLE_LOOK.f.left[0]).toBeLessThan(GEM_STYLE_LOOK.e.left[0]);
    expect(GEM_STYLES.filter((s) => GEM_STYLE_LOOK[s].fused)).toEqual(["g"]);
  });

  it("c는 가장 진한 몸(조각 한 변을 지난 초록이 가장 적게 남는다), d만 내포물", () => {
    const g = (s: keyof typeof GEM_STYLE_LOOK) => GEM_STYLE_LOOK[s].left[1];
    for (const s of ["now", "a", "b", "d"] as const)
      expect(g("c")).toBeLessThan(g(s));
    expect(GEM_STYLES.filter((s) => GEM_STYLE_LOOK[s].jardin)).toEqual(["d"]);
  });
});
