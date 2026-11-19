import { describe, expect, it } from "vitest";

import type { SolveRecord } from "../records";
import {
  ao5,
  bestAo5,
  bestFiveDetail,
  myTier,
  nextSolve,
  nextTier,
  tierBand,
  tierHistory,
  tierName,
  tierOf,
  trimmedOf,
} from "./rank";
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

/**
 * 2026-11-18 사용자 Cubie 3×3 기록 11판(새것이 앞). 1번 8:28.45와 7~11번(4:09.71·3:06.83·2:03.81·2:19.80·2:18.65)은
 * 사용자 기록 창 스크린샷 값, 2~6번은 그 사이를 채운 느린 판. 기록 창 「최고 Ao5」 2:35.09 = 브론즈 II
 */
const USER = [
  138_650, 139_800, 123_810, 186_830, 249_710, 290_000, 330_000, 370_000,
  415_000, 460_000, 508_450,
].map((ms, i, all) => ({
  ms,
  penalty: 0,
  no: all.length - i,
  // 오래된 판부터 이틀에 세 판쯤: 1번 11/10 … 11번 11/15(한국 시각 낮)
  at: Date.UTC(2026, 10, 10 + Math.floor((all.length - 1 - i) / 2), 3),
}));

describe("최고 5판(티어를 정한 5판)", () => {
  it("사용자 예: 7~11번, 빠진 판은 9번(가장 빠름)과 7번(가장 느림)", () => {
    expect(bestFiveDetail(USER)).toEqual({
      ms: 155_090,
      from: "list",
      at: 0,
      fast: 2,
      slow: 4,
    });
  });

  it("남겨 둔 최고 5판이 더 좋으면 그것, 같으면 목록", () => {
    const kept = five(10_000, 11_000, 12_000, 13_000, 14_000);
    expect(bestFiveDetail(USER, kept)).toMatchObject({
      ms: 12_000,
      from: "kept",
      fast: 0,
      slow: 4,
    });
    const same = USER.slice(0, 5).map((x) => r(x.ms));
    expect(bestFiveDetail(USER, same)?.from).toBe("list");
  });

  it("DNF는 가장 느린 판으로, 같은 시간이면 앞(새것) 판", () => {
    expect(trimmedOf(five(10_000, null, 9_000, 12_000, 9_000))).toEqual({
      fast: 2,
      slow: 1,
    });
    expect(trimmedOf(five(5_000, 5_000, 5_000, 5_000, 5_000))).toEqual({
      fast: 0,
      slow: 1,
    });
  });
});

describe("다음 판 목표", () => {
  it("사용자 예: 다음 판 2:51.56 안이면 브론즈 I, 2:51.57이면 브론즈 II 그대로", () => {
    // 2:18.65·2:19.80과 다음 판 X가 가운데 셋이면 (278.45 + X) / 3 ≤ 150초. 평균은 1/100초로 반올림하므로
    // X = 171.56초면 150.0033초 → 150.00초로 닿는다(반올림 없이 셈하면 2:51.55)
    const got = nextSolve(3, USER);
    expect(got).toEqual({
      kind: "within",
      to: { tier: "bronze", division: "I", step: 7 },
      cutMs: 150_000,
      ms: 171_560,
    });
    const after = (ms: number) => {
      const t = myTier(3, [r(ms), ...USER]);
      return t ? tierName(t.place) : null;
    };
    expect(after(171_560)).toBe("브론즈 I");
    expect(after(171_570)).toBe("브론즈 II");
  });

  it("앞 네 판이 이미 빠르면 다음 판이 몇 초든(DNF여도) 닿는다", () => {
    // 최근 네 판은 1분대, 그 앞 판은 힌트를 봐서 그 판이 든 5판은 티어에 넣지 않았다. 최고는 그 앞 5판(브론즈 IV)
    const recs = [
      ...five(60_000, 61_000, 62_000, 63_000),
      { ms: 300_000, penalty: 0, hints: 1 },
      ...five(280_000, 290_000, 295_000, 299_000, 300_000),
    ];
    expect(myTier(3, recs)?.place.step).toBe(4);
    expect(nextSolve(3, recs)).toEqual({
      kind: "any",
      to: { tier: "bronze", division: "III", step: 5 },
      cutMs: 240_000,
    });
  });

  it("다음 판 하나로 못 닿으면 그 사실과 지금 최고에서 줄일 시간", () => {
    // 최고는 옛 5판 2:35.09(브론즈 II), 최근 네 판은 4분대라 다음 판이 0초여도 브론즈 I(2:30)에 못 닿는다
    const recs = five(240_000, 245_000, 250_000, 255_000).concat(
      USER.slice(0, 5).map((x) => r(x.ms)),
    );
    expect(nextSolve(3, recs)).toEqual({
      kind: "out",
      to: { tier: "bronze", division: "I", step: 7 },
      cutMs: 150_000,
      gapMs: 5_090,
    });
  });

  it("최근 네 판에 힌트 판이 있으면 다음 판으로는 못 닿는다", () => {
    const recs = USER.map((x, i) => (i === 1 ? { ...x, hints: 1 } : x));
    const kept = USER.slice(0, 5).map((x) => r(x.ms));
    expect(nextSolve(3, recs, kept)?.kind).toBe("out");
  });

  it("티어가 없거나 꼭대기면 없다", () => {
    expect(nextSolve(3, five(10_000, 11_000, 12_000, 13_000))).toBeNull();
    expect(nextSolve(3, five(5_000, 5_000, 5_000, 5_000, 5_000))).toBeNull();
  });
});

describe("티어 이력", () => {
  it("사용자 예: 5번에서 아이언 I, 8번 브론즈 IV, 10번 브론즈 III, 11번 브론즈 II", () => {
    const h = tierHistory(3, USER);
    expect(h.points.map((p) => p.ms)).toEqual([
      null,
      null,
      null,
      null,
      415_000,
      371_670,
      330_000,
      289_900,
      242_180,
      192_110,
      155_090,
    ]);
    expect(
      h.changes.map((c) => [
        c.no,
        new Date(c.at).getUTCDate(),
        c.from ? tierName(c.from) : null,
        tierName(c.to),
      ]),
    ).toEqual([
      [5, 12, null, "아이언 I"],
      [8, 13, "아이언 I", "브론즈 IV"],
      [10, 14, "브론즈 IV", "브론즈 III"],
      [11, 15, "브론즈 III", "브론즈 II"],
    ]);
  });

  it("힌트 판이 든 5판은 넣지 않는다", () => {
    const recs = USER.map((x, i) => (i === 0 ? { ...x, hints: 1 } : x));
    const h = tierHistory(3, recs);
    expect(h.points.at(-1)?.ms).toBe(192_110);
    expect(h.changes.at(-1)?.to.division).toBe("III");
  });
});

describe("다음 티어(티어 화면 진열)", () => {
  it("바로 위 티어의 가장 낮은 구간 상한까지 줄일 시간", () => {
    // 3×3 Ao5 13.40초 = 다이아몬드 IV → 마스터(10초 이하)까지 3.40초
    expect(nextTier(3, 13_400)).toEqual({
      tier: "master",
      cutMs: 10_000,
      gapMs: 3_400,
    });
    // 같은 티어 안에서 구간이 올라도 다음 티어는 같다(다이아몬드 I 11.00초 → 마스터까지 1초)
    expect(nextTier(3, 11_000)?.gapMs).toBe(1_000);
    // 구간 없는 티어: 그랜드마스터 → 챌린저(6.5초)
    expect(nextTier(3, 7_000)).toEqual({
      tier: "challenger",
      cutMs: 6_500,
      gapMs: 500,
    });
  });

  it("꼭대기(챌린저)와 표 없는 크기는 없다", () => {
    expect(nextTier(3, 6_000)).toBeNull();
    expect(nextTier(8, 10_000)).toBeNull();
  });

  it("모든 크기·티어에서 다음 티어는 한 칸 위다", () => {
    for (const n of TIER_SIZES) {
      const table = TIER_TABLE[n] ?? [];
      for (const [i, row] of table.entries()) {
        const ms = Math.round((row.cuts[row.cuts.length - 1] as number) * 1000);
        // 구간 없는 아이언(6×6·7×7)은 상한이 끝없음이라 그 안의 아무 시간
        if (!Number.isFinite(ms)) continue;
        const next = nextTier(n, ms);
        expect(next?.tier ?? null).toBe(TIER_IDS[i + 1] ?? null);
      }
    }
  });
});

describe("구간 안 자리(기록 창 가로 막대)", () => {
  it("사용자 예: 브론즈 II(3:10.00)와 브론즈 I(2:30.00) 사이 2:35.09는 시간에 비례한 자리", () => {
    const b = tierBand(3, 155_090);
    expect(b).toEqual({
      down: { tier: "bronze", division: "III", step: 5 },
      here: { tier: "bronze", division: "II", step: 6 },
      lowMs: 190_000,
      up: { tier: "bronze", division: "I", step: 7 },
      highMs: 150_000,
      ratio: (190_000 - 155_090) / 40_000,
    });
    expect(b?.ratio).toBeCloseTo(0.87275, 10);
  });

  it("구간에 딱 든 경계는 왼쪽 끝, 위 구간 바로 앞은 오른쪽 끝 가까이", () => {
    expect(tierBand(3, 190_000)?.ratio).toBe(0);
    expect(tierBand(3, 150_010)?.ratio).toBeCloseTo(0.99975, 10);
    // 위 구간 경계에 닿으면 그 구간의 왼쪽 끝
    const at = tierBand(3, 150_000);
    expect(at?.here.division).toBe("I");
    expect(at?.lowMs).toBe(150_000);
    expect(at?.ratio).toBe(0);
  });

  it("꼭대기(챌린저)는 오른쪽 끝이 0초, 위 구간이 없다", () => {
    expect(tierBand(3, 5_200)).toEqual({
      down: { tier: "grandmaster", division: null, step: 32 },
      here: { tier: "challenger", division: null, step: 33 },
      lowMs: 6_500,
      up: null,
      highMs: 0,
      ratio: 0.2,
    });
  });

  it("맨 아래 아이언 IV는 왼쪽 상한이 없어 오른쪽 경계의 두 배를 왼쪽 끝으로 셈한다", () => {
    const b = tierBand(3, 1_350_000);
    // 맨 아래라 아래 구간(막대 왼쪽 칸)도 없다
    expect(b?.down).toBeNull();
    expect(b?.lowMs).toBeNull();
    expect(b?.highMs).toBe(900_000);
    expect(b?.ratio).toBe(0.5);
    expect(tierBand(3, 4_000_000)?.ratio).toBe(0);
  });

  it("5판 평균이 없거나 표 없는 크기면 없다", () => {
    expect(tierBand(3, Number.POSITIVE_INFINITY)).toBeNull();
    expect(tierBand(8, 10_000)).toBeNull();
  });
});
