import { describe, expect, it } from "vitest";

import {
  addRecord,
  averageOf,
  formatMs,
  loadRecords,
  MAX_RECORDS,
  parseReplay,
  type SolveRecord,
} from "./records";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

const rec = (ms: number | null, penalty = 0): SolveRecord => ({
  at: 0,
  n: 3,
  mode: "solo",
  ms,
  penalty,
  moves: 50,
  scramble: "R U",
});

describe("기록", () => {
  it("크기·모드마다 따로, 새것이 앞, 최대 개수까지", () => {
    const store = memoryStorage();
    addRecord({ ...rec(1000), n: 2 }, store);
    for (let i = 0; i < MAX_RECORDS + 3; i++) addRecord(rec(i), store);
    const list = loadRecords("solo", 3, store);
    expect(list).toHaveLength(MAX_RECORDS);
    expect(list[0]?.ms).toBe(MAX_RECORDS + 2);
    expect(loadRecords("solo", 2, store)).toHaveLength(1);
    expect(loadRecords("blind", 3, store)).toHaveLength(0);
  });

  it("번호는 상한에 닿아도 이어지고, 번호 없는 옛 기록은 오래된 것부터 매긴다", () => {
    const store = memoryStorage();
    for (let i = 0; i < MAX_RECORDS + 3; i++) addRecord(rec(i), store);
    const list = loadRecords("solo", 3, store);
    expect(list[0]?.no).toBe(MAX_RECORDS + 3);
    expect(list.at(-1)?.no).toBe(4);

    const old = memoryStorage();
    old.setItem(
      "cube.records.v1",
      JSON.stringify({ "solo-3": [rec(3), rec(2), rec(1)] }),
    );
    expect(loadRecords("solo", 3, old).map((r) => r.no)).toEqual([3, 2, 1]);
    expect(addRecord(rec(4), old)[0]?.no).toBe(4);
    expect(loadRecords("solo", 3, old).map((r) => r.no)).toEqual([4, 3, 2, 1]);
  });

  it("5번 평균: 가장 좋은·나쁜 것을 빼고(벌점 포함), DNF 하나는 가장 나쁜 것", () => {
    expect(
      averageOf(
        [
          rec(10_000),
          rec(20_000),
          rec(12_000),
          rec(14_000),
          rec(11_000, 2_000),
        ],
        5,
      ),
    ).toBe(Math.round((12_000 + 14_000 + 13_000) / 3));
    expect(
      averageOf(
        [rec(null), rec(20_000), rec(12_000), rec(14_000), rec(10_000)],
        5,
      ),
    ).toBe(Math.round((12_000 + 14_000 + 20_000) / 3));
    expect(
      averageOf(
        [rec(null), rec(null), rec(12_000), rec(14_000), rec(10_000)],
        5,
      ),
    ).toBeNull();
    expect(averageOf([rec(1)], 5)).toBeUndefined();
  });

  it("12번 평균은 최근 12개만", () => {
    const list = [
      ...Array.from({ length: 12 }, () => rec(10_000)),
      rec(99_000),
    ];
    expect(averageOf(list, 12)).toBe(10_000);
  });

  it("시간 글과 다시 보기 글", () => {
    expect(formatMs(12_345)).toBe("12.34");
    expect(formatMs(75_010)).toBe("1:15.01");
    expect(formatMs(null)).toBe("DNF");
    expect(parseReplay("R@0 U'@120 y@-30")).toEqual([
      ["R", 0],
      ["U'", 120],
      ["y", -30],
    ]);
  });
});
