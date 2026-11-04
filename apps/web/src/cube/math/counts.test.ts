import { cubeTopology, piecesOfKind } from "@game/cube-engine";
import { describe, expect, it } from "vitest";

import {
  COUNT_PLANS,
  factorial,
  groupDigits,
  koreanApprox,
  reassemblyCount,
  runningTotals,
  UNIVERSE_YEARS,
  yearsToSee,
} from "./counts";

const KNOWN: Record<2 | 3 | 4 | 5, string> = {
  2: "3674160",
  3: "43252003274489856000",
  4: "7401196841564901869874093974498574336000000000",
  5: "282870942277741856536180333107150328293127731985672134721536000000000000000",
};

describe("경우의 수", () => {
  it.each([2, 3, 4, 5] as const)("%d×%d는 알려진 값과 같다", (n) => {
    expect(COUNT_PLANS[n].total.toString()).toBe(KNOWN[n]);
    expect(runningTotals(COUNT_PLANS[n].steps).at(-1)).toBe(
      COUNT_PLANS[n].total,
    );
  });

  it("줄인 식과 같다", () => {
    const f = factorial;
    expect(COUNT_PLANS[2].total).toBe(f(7) * 3n ** 6n);
    expect(COUNT_PLANS[3].total).toBe(
      (f(8) * 3n ** 7n * f(12) * 2n ** 11n) / 2n,
    );
    expect(COUNT_PLANS[4].total).toBe(
      (f(7) * 3n ** 6n * f(24) * f(24)) / f(4) ** 6n,
    );
    expect(COUNT_PLANS[4].total).toBe(
      (f(8) * 3n ** 7n * f(24) * f(24)) / f(4) ** 6n / 24n,
    );
    expect(COUNT_PLANS[5].total).toBe(
      f(8) * 3n ** 7n * f(12) * 2n ** 10n * f(24) * (f(24) / f(4) ** 6n) ** 2n,
    );
  });

  it("단계마다 나눗셈이 나누어떨어진다", () => {
    for (const plan of Object.values(COUNT_PLANS)) {
      let v = 1n;
      for (const s of plan.steps) {
        if (s.op === "div") expect(v % s.value).toBe(0n);
        v = s.op === "mul" ? v * s.value : v / s.value;
      }
    }
  });

  it("고를 것의 답 자리가 있다", () => {
    for (const plan of Object.values(COUNT_PLANS)) {
      for (const s of plan.steps) {
        expect(s.choices[s.answer]).toBeDefined();
      }
    }
  });

  it("조각 수가 엔진과 같다", () => {
    expect(piecesOfKind(3, "corner")).toHaveLength(8);
    expect(piecesOfKind(3, "edge")).toHaveLength(12);
    expect(piecesOfKind(4, "wing")).toHaveLength(24);
    expect(piecesOfKind(4, "innerCenter")).toHaveLength(24);
    expect(piecesOfKind(5, "wing")).toHaveLength(24);
    expect(piecesOfKind(5, "innerCenter")).toHaveLength(48);
    expect(cubeTopology(2).pieces).toHaveLength(8);
  });

  it("뽑아서 다시 끼우면 12배", () => {
    const steps = COUNT_PLANS[3].steps;
    const all = reassemblyCount(steps);
    const f = factorial;
    expect(all).toBe(f(8) * 3n ** 8n * f(12) * 2n ** 12n);
    expect(all / COUNT_PLANS[3].total).toBe(12n);
    expect(all % COUNT_PLANS[3].total).toBe(0n);
  });

  it("그림 큐브는 3×3 × 4⁶ ÷ 2", () => {
    expect(((COUNT_PLANS[3].total * 4n ** 6n) / 2n).toString()).toBe(
      "88580102706155225088000",
    );
  });

  it("크기 비교", () => {
    const years = yearsToSee(COUNT_PLANS[3].total, 1n);
    expect(years).toBe(1_370_573_277_894n);
    expect(years / UNIVERSE_YEARS).toBe(99n);
    expect(koreanApprox(COUNT_PLANS[3].total)).toBe("약 4,325경");
    expect(koreanApprox(COUNT_PLANS[2].total)).toBe("약 367만");
    expect(groupDigits(COUNT_PLANS[2].total)).toBe("3,674,160");
  });
});
