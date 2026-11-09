import { describe, expect, it } from "vitest";

import type { SolveRecord } from "../records";
import { ao5, bestAo5, myTier, tierName, tierOf } from "./rank";
import { TIER_IDS, TIER_SIZES, TIER_TABLE } from "./table";

const r = (
  ms: number | null,
  penalty = 0,
): Pick<SolveRecord, "ms" | "penalty"> => ({
  ms,
  penalty,
});
const five = (...ms: (number | null)[]) => ms.map((m) => r(m));
const name = (n: number, ms: number) => {
  const p = tierOf(n, ms);
  return p ? tierName(p) : null;
};

describe("Ao5(WCA 규칙)", () => {
  it("가장 좋은·나쁜 판을 빼고 셋의 평균", () => {
    expect(ao5(five(10_000, 12_000, 11_000, 30_000, 9_000))).toBe(11_000);
  });

  it("+2는 더하고, 한 판은 1/100초 아래를 버리고, 평균은 1/100초로 반올림", () => {
    expect(
      ao5([r(10_000, 2000), r(10_000), r(10_000), r(1_000), r(50_000)]),
    ).toBe(10_670);
    expect(ao5(five(10_009, 10_009, 10_009, 1, 99_999))).toBe(10_000);
  });

  it("DNF 하나는 가장 나쁜 판으로 빠지고, 둘이면 DNF", () => {
    expect(ao5(five(10_000, null, 11_000, 12_000, 9_000))).toBe(11_000);
    expect(ao5(five(10_000, null, 11_000, null, 9_000))).toBeNull();
  });

  it("10분이 넘는 평균은 초로 반올림", () => {
    expect(ao5(five(600_400, 601_400, 601_900, 1, 9_999_999))).toBe(601_000);
  });

  it("5판이 아니면 던진다", () => {
    expect(() => ao5(five(1, 2, 3))).toThrow(RangeError);
  });
});

describe("최고 Ao5", () => {
  it("연달아 5판씩 본 가운데 가장 좋은 것과 자리", () => {
    const list = five(20_000, 20_000, 10_000, 10_000, 10_000, 10_000, 10_000);
    expect(bestAo5(list)).toEqual({ ms: 10_000, at: 1 });
  });

  it("5판 아래거나 모두 DNF면 없다", () => {
    expect(bestAo5(five(1, 2, 3, 4))).toBeNull();
    expect(bestAo5(five(null, null, 1, 2, 3))).toBeNull();
  });

  it("목록과 따로 남겨 둔 5판 가운데 좋은 쪽", () => {
    const list = five(20_000, 20_000, 20_000, 20_000, 20_000);
    const kept = five(13_500, 13_500, 13_500, 13_500, 13_500);
    expect(myTier(3, list, kept)).toMatchObject({ ao5: 13_500 });
    expect(myTier(3, list)).toMatchObject({ ao5: 20_000 });
    expect(myTier(3, five(1, 2))).toBeNull();
    expect(myTier(3, five(1, 2), kept)?.place.tier).toBe("diamond");
  });
});

describe("티어 경계(상한 이하)", () => {
  it("3×3: 초안 예시와 경계값 양쪽", () => {
    expect(name(3, 13_400)).toBe("다이아몬드 IV");
    expect(name(3, 12_900)).toBe("다이아몬드 III");
    expect(name(3, 14_000)).toBe("다이아몬드 IV");
    expect(name(3, 14_010)).toBe("에메랄드 I");
    expect(name(3, 10_000)).toBe("마스터 IV");
    expect(name(3, 10_010)).toBe("다이아몬드 I");
    expect(name(3, 7_500)).toBe("그랜드마스터");
    expect(name(3, 7_510)).toBe("마스터 I");
    expect(name(3, 6_500)).toBe("챌린저");
    expect(name(3, 1_000)).toBe("챌린저");
    expect(name(3, 120_000)).toBe("실버 IV");
    expect(name(3, 120_010)).toBe("브론즈 I");
    expect(name(3, 900_000)).toBe("아이언 III");
    expect(name(3, 900_010)).toBe("아이언 IV");
    expect(name(3, 99 * 3_600_000)).toBe("아이언 IV");
  });

  it("크기마다 각 칸의 상한은 그 칸, 조금 넘으면 한 칸 아래", () => {
    for (const n of TIER_SIZES) {
      const steps = (TIER_TABLE[n] ?? []).flatMap((row) =>
        row.cuts.map((cut) => ({ tier: row.tier, cut })),
      );
      steps.forEach(({ tier, cut }, i) => {
        if (!Number.isFinite(cut)) return;
        expect(tierOf(n, Math.round(cut * 1000))?.tier).toBe(tier);
        expect(tierOf(n, Math.round(cut * 1000))?.step).toBe(i);
        expect(tierOf(n, Math.round(cut * 1000) + 10)?.step).toBe(i - 1);
      });
    }
  });

  it("크기마다 열 티어, 상한은 위로 갈수록 짧다", () => {
    for (const n of TIER_SIZES) {
      const table = TIER_TABLE[n] ?? [];
      expect(table.map((row) => row.tier)).toEqual([...TIER_IDS]);
      const cuts = table.flatMap((row) => row.cuts);
      for (let i = 1; i < cuts.length; i++)
        expect(cuts[i]).toBeLessThan(cuts[i - 1] as number);
      // 그랜드마스터·챌린저는 구간 없음
      expect(table[8]?.cuts).toHaveLength(1);
      expect(table[9]?.cuts).toHaveLength(1);
    }
  });

  it("다른 크기의 대표 칸", () => {
    expect(name(2, 2_000)).toBe("그랜드마스터");
    expect(name(2, 2_010)).toBe("마스터 I");
    expect(name(4, 45_000)).toBe("마스터 IV");
    expect(name(4, 45_010)).toBe("다이아몬드 I");
    expect(name(5, 85_000)).toBe("마스터 IV");
    expect(name(5, 51_000)).toBe("챌린저");
    expect(name(6, 4_800_000)).toBe("브론즈 IV");
    expect(name(6, 4_800_010)).toBe("아이언");
    expect(name(7, 146_000)).toBe("챌린저");
    expect(name(7, 176_010)).toBe("마스터 I");
  });

  it("표가 없는 크기는 없다", () => {
    expect(tierOf(8, 10_000)).toBeNull();
  });
});
