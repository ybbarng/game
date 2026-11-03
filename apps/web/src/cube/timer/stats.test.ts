import { describe, expect, it } from "vitest";

import type { Penalty } from "./machine";
import {
  averageOf,
  best,
  bestAverage,
  currentAverage,
  DNF,
  formatAverage,
  formatSingle,
  formatSolve,
  meanOf,
  sessionStats,
  type Timed,
  trimCount,
} from "./stats";

const t = (ms: number, penalty: Penalty = "none"): Timed => ({ ms, penalty });
const dnf = (ms = 1000) => t(ms, "DNF");

describe("평균", () => {
  it("빼는 개수: 5·12번은 하나, 100번은 다섯", () => {
    expect(trimCount(5)).toBe(1);
    expect(trimCount(12)).toBe(1);
    expect(trimCount(100)).toBe(5);
  });

  it("5번 평균은 가장 좋은·나쁜 것을 빼고 셋의 평균", () => {
    expect(averageOf([10, 20, 30, 40, 1000].map((v) => t(v)))).toBe(30);
  });

  it("+2는 2초를 더해 센다", () => {
    expect(
      averageOf([t(10_000), t(10_000, "+2"), t(11_000), t(9_000), t(30_000)]),
    ).toBe((10_000 + 12_000 + 11_000) / 3);
  });

  it("DNF 하나는 가장 나쁜 것으로 빠진다", () => {
    expect(averageOf([t(10), t(20), t(30), t(40), dnf()])).toBe(30);
  });

  it("DNF 둘이면 5번 평균은 DNF", () => {
    expect(averageOf([t(10), t(20), t(30), dnf(), dnf()])).toBe(DNF);
  });

  it("12번 평균은 위아래 하나씩 빼고 열의 평균", () => {
    const list = Array.from({ length: 12 }, (_, i) => t((i + 1) * 1000));
    expect(averageOf(list)).toBe(6500);
    list[0] = dnf();
    // 1초가 DNF가 되면 가장 나쁜 것으로 빠지고 2초가 가장 좋은 것으로 빠진다
    expect(averageOf(list)).toBe(7500);
    list[1] = dnf();
    expect(averageOf(list)).toBe(DNF);
  });

  it("100번 평균은 DNF 다섯까지 버틴다", () => {
    const list = Array.from({ length: 100 }, () => t(1000));
    for (let i = 0; i < 5; i++) list[i] = dnf();
    expect(averageOf(list)).toBe(1000);
    list[5] = dnf();
    expect(averageOf(list)).toBe(DNF);
  });

  it("마지막 n개로 낸다. 모자라면 없음", () => {
    const list = [1, 2, 3, 4, 5, 6].map((v) => t(v * 1000));
    expect(currentAverage(list, 5)).toBe(4000);
    expect(currentAverage(list.slice(0, 4), 5)).toBeNull();
  });

  it("가장 좋은 5번 평균", () => {
    const list = [9, 1, 2, 3, 4, 5, 20].map((v) => t(v * 1000));
    expect(bestAverage(list, 5)).toBe(3000);
  });

  it("세 번 평균은 빼지 않고, DNF 하나면 DNF", () => {
    expect(meanOf([t(1000), t(2000), t(6000)])).toBe(3000);
    expect(meanOf([t(1000), t(2000), dnf()])).toBe(DNF);
  });

  it("최고 기록: 모두 DNF면 DNF, 없으면 없음", () => {
    expect(best([])).toBeNull();
    expect(best([dnf(), dnf()])).toBe(DNF);
    expect(best([dnf(), t(5000, "+2"), t(6500)])).toBe(6500);
  });

  it("블라인드 통계(mo3·bo3)", () => {
    const s = sessionStats([t(90_000), dnf(), t(60_000)]);
    expect(s.mo3).toBe(DNF);
    expect(s.bo3).toBe(60_000);
  });
});

describe("글자", () => {
  it("한 번 기록은 1/100초 아래를 버리고, 평균은 반올림한다", () => {
    expect(formatSingle(12_349)).toBe("12.34");
    expect(formatAverage(12_345)).toBe("12.35");
    expect(formatSingle(75_010)).toBe("1:15.01");
    expect(formatSingle(DNF)).toBe("DNF");
    expect(formatAverage(null)).toBe("-");
  });

  it("기록 한 줄", () => {
    expect(formatSolve(t(10_000, "+2"))).toBe("12.00+");
    expect(formatSolve(t(10_000, "DNF"))).toBe("DNF(10.00)");
  });
});
