import { describe, expect, it } from "vitest";

import {
  criticalAngle,
  fresnel,
  GEM_BOX_HALF,
  REAL,
  traceGem,
  type Vec3,
} from "./gem";
import { absorbOf, channelIor, disperses } from "./gemMaterial";
import { LOOK } from "./scene";

const deg = (r: number) => (r * 180) / Math.PI;

/** 등각으로 놓인 조각을 정면에서 볼 때: 물체 좌표로 눈 방향은 몸통 대각선, 윗면(+y)에 닿는다 */
const VIEW: Vec3 = [-1, -1, -1];
const TOP: Vec3 = [0, 1, 0];
const hits: Vec3[] = [];
for (const x of [-0.3, -0.1, 0.1, 0.3])
  for (const z of [-0.3, -0.1, 0.1, 0.3]) hits.push([x, GEM_BOX_HALF, z]);

/** 눈 쪽으로 돌아오는 빛 몫(겉 반사 빼고)과 끝까지 남은 몫의 평균 */
function split(ior: number, bounces?: number) {
  let back = 0;
  let left = 0;
  let reflect = 0;
  for (const p of hits) {
    const r = traceGem("box", p, VIEW, TOP, ior, 0, bounces);
    reflect += r.reflect;
    left += r.left;
    for (const e of r.exits)
      if (e.dir[0] + e.dir[1] + e.dir[2] > 0) back += e.weight;
  }
  const n = hits.length;
  return { back: back / n, left: left / n, reflect: reflect / n };
}

describe("보석 빛길(docs/47 14-7 셋째 시안)", () => {
  it("임계각과 수직 반사율이 물리 값과 같다", () => {
    expect(deg(criticalAngle(REAL.diamond.ior))).toBeCloseTo(24.4, 1);
    expect(deg(criticalAngle(REAL.emerald.ior))).toBeCloseTo(39.4, 1);
    for (const n of [1.544, 1.577, 1.77, 2.417])
      expect(fresnel(1, 1, n)).toBeCloseTo(((n - 1) / (n + 1)) ** 2, 4);
    // 안에서 임계각보다 비스듬하면 모두 되튄다
    const c = Math.cos(criticalAngle(2.417) + 0.01);
    expect(fresnel(c, 2.417, 1)).toBe(1);
  });

  it("흡수가 없으면 빛이 새거나 생기지 않는다(겉 반사 + 나간 빛 + 남은 빛 = 1)", () => {
    for (const ior of [1.544, 1.77, 2.417])
      for (const p of hits) {
        const r = traceGem("box", p, VIEW, TOP, ior, 0);
        const total =
          r.reflect + r.exits.reduce((s, e) => s + e.weight, 0) + r.left;
        expect(total).toBeCloseTo(1, 4);
      }
  });

  it("네모 보석은 안에서 되튄 빛이 눈 쪽으로 돌아온다(모서리 반사), 다섯 번이면 빛이 거의 다 나간다", () => {
    for (const real of Object.values(REAL)) {
      const s = split(real.ior);
      // 뒤쪽 세 면이 이루는 모서리가 빛을 되돌린다: 보석이 뒤 배경만큼 어둡지 않고 안에서 빛나 보인다
      expect(s.back).toBeGreaterThan(0.1);
      // 벽에 닿는 횟수 GEM_BOUNCES(5)면 남는 빛이 1% 아래(셰이더가 남은 몫을 버려도 티가 나지 않는다)
      expect(s.left).toBeLessThan(0.01);
      // 한 번만 따라가면(three 투과처럼 뒤로 곧게 지나기만) 눈 쪽으로 돌아오는 빛이 없다
      expect(split(real.ior, 1).back).toBe(0);
    }
    // 다이아몬드는 겉 반사가 크고(약 0.17~0.2) 안에서 전반사로 되튄 뒤 나가는 빛이 있다
    expect(split(REAL.diamond.ior).reflect).toBeGreaterThan(
      split(REAL.emerald.ior).reflect * 2,
    );
    const r = traceGem("box", hits[5] as Vec3, VIEW, TOP, REAL.diamond.ior, 0);
    expect(r.exits.some((e) => e.afterTir)).toBe(true);
  });

  it("흡수는 지나온 길이만큼 빛을 줄인다(얇은 곳은 밝다)", () => {
    const p = hits[5] as Vec3;
    const clear = traceGem("box", p, VIEW, TOP, 1.577, 0);
    const deep = traceGem("box", p, VIEW, TOP, 1.577, 1.2);
    const first = (r: typeof clear) => r.exits[0]?.weight ?? 0;
    expect(first(deep)).toBeLessThan(first(clear));
    // 비어-람베르트: 흡수 없을 때의 몫 × e^(-흡수 × 지나온 길이) 아래
    expect(first(deep)).toBeGreaterThanOrEqual(
      first(clear) * Math.exp(-1.2 * deep.path) - 1e-9,
    );
    const sum = (r: typeof clear) => r.exits.reduce((s, e) => s + e.weight, 0);
    expect(sum(deep)).toBeLessThan(sum(clear));
  });

  it("보석 티어의 굴절률은 실제 보석 값, 분산은 다이아몬드·챌린저만 따로 따라간다", () => {
    expect(LOOK.emerald.gem?.ior).toBe(REAL.emerald.ior);
    expect(LOOK.master.gem?.ior).toBe(REAL.amethyst.ior);
    expect(LOOK.grandmaster.gem?.ior).toBe(REAL.ruby.ior);
    expect(LOOK.diamond.gem?.ior).toBe(REAL.diamond.ior);
    expect(LOOK.challenger.gem?.ior).toBe(REAL.diamond.ior);
    const spreading = (
      ["emerald", "diamond", "master", "grandmaster", "challenger"] as const
    ).filter((t) => {
      const g = LOOK[t].gem;
      return g ? disperses(g) : false;
    });
    expect(spreading).toEqual(["diamond", "challenger"]);
    const dia = LOOK.diamond.gem;
    const ch = LOOK.challenger.gem;
    if (!dia || !ch) throw new Error("보석 없음");
    const [r, , b] = channelIor(dia);
    expect(r).toBeLessThan(b);
    // 챌린저 무지개가 다이아몬드보다 크다
    expect(ch.spread).toBeGreaterThan(dia.spread);
  });

  it("다이아몬드·챌린저는 무색, 색 보석은 그 색만 덜 흡수한다", () => {
    const g = (t: "emerald" | "master" | "grandmaster" | "diamond") => {
      const x = LOOK[t].gem;
      if (!x) throw new Error(t);
      return x.absorb;
    };
    expect(Math.max(...g("diamond"))).toBeLessThan(0.02);
    const [er, eg, eb] = g("emerald");
    expect(eg).toBeLessThan(er);
    expect(eg).toBeLessThan(eb);
    const [rr, rg, rb] = g("grandmaster");
    expect(rr).toBeLessThan(rg);
    expect(rr).toBeLessThan(rb);
    const [mr, mg, mb] = g("master");
    expect(mb).toBeLessThan(mg);
    expect(mr).toBeLessThan(mg);
    // 얇은 날개 판은 같은 색으로 읽히게 흡수를 키운다
    const em = LOOK.emerald.gem;
    if (!em) throw new Error("emerald");
    expect(absorbOf(em, "slab")[0]).toBeGreaterThan(absorbOf(em, "box")[0]);
  });
});
