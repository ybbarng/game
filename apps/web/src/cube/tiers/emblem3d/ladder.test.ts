import { describe, expect, it } from "vitest";

import {
  condKey,
  type LadderMeasure,
  ladderViolations,
  lookPrint,
  MEASURE_BGS,
  MEASURE_TIERS,
  MEASURE_YAWS,
  type MeasureTier,
} from "./ladder";
import measured from "./ladder-measure.json";
import { lightness, lookParts, lookStat } from "./lookStats";

const m = measured as unknown as LadderMeasure;

describe("밝기·반짝임 재기(lookStats)", () => {
  it("L*는 검정 0, 흰색 100, 가운데 회색(sRGB 119) 약 50", () => {
    expect(lightness(0, 0, 0)).toBeCloseTo(0, 6);
    expect(lightness(255, 255, 255)).toBeCloseTo(100, 4);
    expect(lightness(119, 119, 119)).toBeCloseTo(50, 0);
    // 순수 빨강은 지각 밝기가 낮다(루비가 어둡게 가라앉는 까닭)
    expect(lightness(255, 0, 0)).toBeLessThan(lightness(0, 0, 255) + 30);
  });

  it("본(흰 몸) 안 화소만 세고, 큐브와 장식으로 가른다", () => {
    // 화소 넷: 흰(장식) · 검정(장식) · 흰(큐브) · 바탕(빨강, 몸 밖)
    const color = [
      255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 255,
    ];
    const body = [255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 255];
    const core = [0, 0, 0, 255, 0, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 255];
    const p = lookParts(color, body, core);
    expect(p.body.area).toBe(3);
    expect(p.core).toEqual({ meanL: 100, sparkle: 1, area: 1 });
    expect(p.deco.area).toBe(2);
    expect(p.deco.meanL).toBeCloseTo(50, 4);
    expect(p.deco.sparkle).toBe(0.5);
    expect(lookStat(color, () => false)).toEqual({
      meanL: 0,
      sparkle: 0,
      area: 0,
    });
  });
});

describe("밝기 사다리(docs/47 14-7, 고정 규칙 2-1절): 남긴 측정값", () => {
  it("지금 값 표로 잰 숫자다(값을 바꿨으면 `ONLY=ladder node scripts/render-emblem-posters.mjs`로 다시 잰다)", () => {
    expect(m.print).toBe(lookPrint());
  });

  it("열 티어 × 바탕 둘 × 각 둘을 모두 쟀다", () => {
    for (const t of MEASURE_TIERS)
      for (const bg of MEASURE_BGS)
        for (const yaw of MEASURE_YAWS) {
          const p = m.tiers[t][condKey(bg, yaw)];
          expect(p, `${t} ${bg} ${yaw}`).toBeDefined();
          expect(p?.body.area).toBeGreaterThan(1000);
          expect(p?.core.area).toBeGreaterThan(100);
          expect(p?.deco.area).toBeGreaterThan(100);
        }
  });

  it("위 티어일수록 밝고 화려하다: 장식은 에메랄드·다이아몬드·마스터가 한 단계, 그 위 그랜드마스터, 꼭대기 챌린저. 큐브는 그랜드마스터 ≥ 마스터", () => {
    expect(ladderViolations(m)).toEqual([]);
  });

  it("금속은 아이언 < 브론즈 < 실버 < 골드 < 플래티넘 < 에메랄드: 바꿔 넣으면 어긴다", () => {
    const swap = (a: MeasureTier, b: MeasureTier): LadderMeasure => ({
      ...m,
      tiers: { ...m.tiers, [a]: m.tiers[b], [b]: m.tiers[a] },
    });
    expect(
      ladderViolations(swap("platinum", "emerald")).length,
    ).toBeGreaterThan(0);
    expect(ladderViolations(swap("silver", "gold")).length).toBeGreaterThan(0);
    expect(ladderViolations(swap("iron", "bronze")).length).toBeGreaterThan(0);
  });

  it("규칙이 실제로 잡는다: 그랜드마스터와 마스터를 바꿔 넣으면 어긴다", () => {
    const swapped: LadderMeasure = {
      ...m,
      tiers: {
        ...m.tiers,
        master: m.tiers.grandmaster,
        grandmaster: m.tiers.master,
      },
    };
    expect(ladderViolations(swapped).length).toBeGreaterThan(0);
  });
});
