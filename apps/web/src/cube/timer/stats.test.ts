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
  recordedMs,
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

  it("3×3 블라인드: 마지막 5번 중 최고(Bo5)와 5번 평균(Ao5)", () => {
    const list = [t(50_000), t(90_000), dnf(), t(70_000), t(60_000)];
    expect(sessionStats(list.slice(0, 4)).bo5).toBeNull();
    const s = sessionStats(list);
    expect(s.bo5).toBe(50_000);
    expect(s.ao5).toBe(73_330); // (60 + 70 + 90) / 3 = 73.333… → 73.33
    expect(sessionStats([...list, t(40_000)]).bo5).toBe(40_000);
  });

  it("4×4·5×5 블라인드용 세 번 평균·3번 중 최고", () => {
    const s = sessionStats([t(90_000), dnf(), t(60_000)]);
    expect(s.mo3).toBe(DNF);
    expect(s.bo3).toBe(60_000);
  });
});

describe("규정대로 버리고 반올림하기(9f1·9f2)", () => {
  it("한 번 기록은 원래 값을 1/100초로 버린 뒤 +2를 더한다", () => {
    expect(recordedMs(t(12_349))).toBe(12_340);
    expect(recordedMs(t(12_349, "+2"))).toBe(14_340);
    expect(recordedMs(dnf())).toBe(DNF);
  });

  it("10분 이상 기록은 초 아래를 버린다(+2를 더해 10분이 넘어도)", () => {
    expect(recordedMs(t(612_345))).toBe(612_000);
    expect(recordedMs(t(599_999))).toBe(599_990);
    expect(recordedMs(t(599_500, "+2"))).toBe(601_000);
  });

  it("평균은 버린 기록으로 낸 뒤 1/100초로 반올림한다", () => {
    // 버리지 않으면 (10.009 + 10.009 + 10.019) / 3 = 10.01233 → 10.01
    // 버리면 (10.00 + 10.00 + 10.01) / 3 = 10.00333 → 10.00
    expect(meanOf([t(10_009), t(10_009), t(10_019)])).toBe(10_000);
    // (10.00 + 10.01 + 10.01) / 3 = 10.00666 → 10.01(반올림)
    expect(meanOf([t(10_000), t(10_010), t(10_010)])).toBe(10_010);
    // +2는 버린 뒤에 더한다: 9.999 → 9.99 + 2 = 11.99
    expect(meanOf([t(9_999, "+2"), t(11_990), t(11_990)])).toBe(11_990);
  });

  it("10분 이상 평균은 초로 반올림한다(X.50은 올림)", () => {
    expect(meanOf([t(600_000), t(601_000)])).toBe(601_000); // 600.5 → 601
    expect(meanOf([t(600_000), t(600_000), t(601_000)])).toBe(600_000); // 600.33 → 600
    expect(meanOf([t(600_000), t(601_000), t(601_000)])).toBe(601_000); // 600.67 → 601
  });

  it("평균이 10분 바로 아래면 1/100초로 반올림한다", () => {
    expect(meanOf([t(599_990), t(599_990), t(599_980)])).toBe(599_990);
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
