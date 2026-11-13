import { describe, expect, it } from "vitest";

import { GEM_BOX_HALF, traceGem, type Vec3 } from "./gem";
import {
  type FacetCut,
  facetNormal,
  GEM_STYLE_LOOK,
  GEM_TIERS,
  styleOfTier,
  TIER_STYLE,
} from "./gemStyle";

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

const SOFT: FacetCut = GEM_STYLE_LOOK.soft.cut;

/** 윗면 위 점 격자(가장자리까지) */
const grid: Vec3[] = [];
for (let i = 0; i < 15; i++)
  for (let j = 0; j < 15; j++)
    grid.push([(-0.95 + (1.9 * i) / 14) * H, H, (-0.95 + (1.9 * j) / 14) * H]);

/** 면 위 점마다 가장 많이 나가는 빛의 방향을 묶어(약 15° 칸) 몇 갈래로 나뉘는지 */
function spread(cut: FacetCut | undefined): number {
  const seen = new Set<string>();
  for (const p of grid) {
    const r = traceGem("box", p, VIEW, TOP, 2.417, 0, undefined, cut);
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

describe("화려함 사다리(docs/47 14-7 열째 시안 확정)", () => {
  it("티어마다 생김새: 에메랄드 차분한 보석, 다이아몬드 얕은 계단, 마스터·챌린저 결정 구조, 그랜드마스터 계단 컷", () => {
    expect(TIER_STYLE).toEqual({
      emerald: "calm",
      diamond: "soft",
      master: "o1",
      grandmaster: "n",
      challenger: "o1",
    });
    for (const t of GEM_TIERS) expect(styleOfTier(t)).toBe(TIER_STYLE[t]);
    // 금속 티어는 생김새가 없다(그대로 금속)
    for (const t of ["iron", "bronze", "silver", "gold", "platinum"])
      expect(styleOfTier(t)).toBeNull();
  });

  it("낮은 티어일수록 덜 꾸민다: 에메랄드는 깎은 면·결정·실제 모양 없음, 다이아몬드는 얕은 깎은 면과 약한 불꽃만", () => {
    const calm = GEM_STYLE_LOOK.calm;
    expect(calm.cut.kind).toBe(0);
    expect(calm.voro).toBeUndefined();
    expect(calm.shape).toBeUndefined();
    expect(calm.fire).toBeUndefined();
    const soft = GEM_STYLE_LOOK.soft;
    expect(soft.cut.kind).toBe(1);
    for (const r of soft.cut.rings) expect(r.tilt).toBeLessThanOrEqual(32);
    expect(soft.voro).toBeUndefined();
    expect(soft.shape).toBeUndefined();
    expect(soft.fire).toBeLessThan(0.3);
    // 반짝 점(보는 사람 쪽 점 조명)은 에메랄드가 가장 약하다
    for (const s of ["soft", "o1", "n"] as const)
      expect(calm.frontLights).toBeLessThan(GEM_STYLE_LOOK[s].frontLights);
    expect(GEM_STYLE_LOOK.o1.voro).toBeDefined();
    expect(GEM_STYLE_LOOK.n.shape).toBe("poly");
  });
});

describe("다이아몬드 얕은 계단(겉면 깎은 면)", () => {
  it("법선은 길이 1이고, 테이블(가운데)은 깎지 않은 면 그대로, 바깥 띠일수록 더 기울고 가까운 변 쪽으로 기운다", () => {
    for (const p of grid) {
      const n = facetNormal(SOFT, p, TOP, H);
      expect(len(n)).toBeCloseTo(1, 6);
      expect(n[1]).toBeGreaterThan(0.6);
    }
    expect(facetNormal(SOFT, [0, H, 0], TOP, H)).toEqual(TOP);
    const tilts = SOFT.rings.map((r) =>
      angle(facetNormal(SOFT, [(r.from + 0.01) * H, H, 0], TOP, H), TOP),
    );
    for (let i = 1; i < tilts.length; i++)
      expect(tilts[i]).toBeGreaterThan(tilts[i - 1] as number);
    expect(
      facetNormal(SOFT, [0.95 * H, H, 0.1 * H], TOP, H)[0],
    ).toBeGreaterThan(0.4);
  });

  it("깎은 면은 면 자리마다 다른 곳을 비춘다(밝고 어두운 조각 무늬): 평평한 면보다 갈래가 많다", () => {
    expect(spread(SOFT)).toBeGreaterThan(spread(undefined));
  });

  it("깎아도 빛이 새거나 생기지 않는다(흡수 없으면 겉 반사 + 나간 빛 + 남은 빛 = 1)", () => {
    for (const p of grid) {
      const r = traceGem("box", p, VIEW, TOP, 2.417, 0, undefined, SOFT);
      const total =
        r.reflect + r.exits.reduce((t, e) => t + e.weight, 0) + r.left;
      expect(total).toBeCloseTo(1, 4);
    }
  });
});
