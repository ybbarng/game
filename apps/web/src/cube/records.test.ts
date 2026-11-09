import { describe, expect, it } from "vitest";

import {
  addRecord,
  averageOf,
  BEST_FIVE_KEY,
  formatMs,
  formatSplits,
  KEEP_REPLAYS,
  loadBestFive,
  loadRecords,
  MAX_RECORDS,
  parseReplay,
  parseSplits,
  type SolveRecord,
} from "./records";
import { ao5 } from "./tiers/rank";

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

describe("구간 기록", () => {
  it("저장하고 다시 읽는다", () => {
    const store = memoryStorage();
    const splits = formatSplits([
      { id: "cross", ms: 3210.4 },
      { id: "f2l1", ms: 8020 },
    ]);
    expect(splits).toBe("cross@3210 f2l1@8020");
    addRecord({ ...rec(9000), splits }, store);
    const got = loadRecords("solo", 3, store)[0];
    expect(parseSplits(got?.splits)).toEqual([
      { id: "cross", ms: 3210 },
      { id: "f2l1", ms: 8020 },
    ]);
  });

  it("구간 기록이 없던 옛 기록도 그대로 읽히고, 새 기록과 섞여도 번호가 이어진다", () => {
    const old = memoryStorage();
    // 2026-11-04 꼴 그대로(splits 칸 없음)
    old.setItem(
      "cube.records.v1",
      JSON.stringify({
        "solo-3": [
          {
            at: 1,
            n: 3,
            mode: "solo",
            ms: 20000,
            penalty: 0,
            moves: 60,
            scramble: "R U",
            replay: "R@0 U@100",
          },
        ],
      }),
    );
    const list = loadRecords("solo", 3, old);
    expect(list).toHaveLength(1);
    expect(parseSplits(list[0]?.splits)).toEqual([]);
    const next = addRecord({ ...rec(9000), splits: "cross@1000" }, old);
    expect(next.map((r) => r.no)).toEqual([2, 1]);
    expect(parseSplits(next[0]?.splits)).toEqual([{ id: "cross", ms: 1000 }]);
  });

  it("깨진 글은 그 조각만 건너뛴다", () => {
    expect(parseSplits("cross@1 bad f2l1@-3 f2l1@x cross@9 oll@20")).toEqual([
      { id: "cross", ms: 1 },
      { id: "oll", ms: 20 },
    ]);
    expect(parseSplits(42)).toEqual([]);
    expect(parseSplits(undefined)).toEqual([]);
  });
});

describe("티어 재료(2026-11-09)", () => {
  const solved = (ms: number, i: number): SolveRecord => ({
    ...rec(ms),
    at: i,
    replay: `R@0 U@${ms}`,
    inputs: ["keyboard"],
    inspection: true,
  });

  it("입력 방식·살펴보기 칸이 그대로 남고, 없는 옛 기록도 읽힌다", () => {
    const store = memoryStorage();
    addRecord(rec(9000), store);
    addRecord(
      { ...rec(8000), inputs: ["swipe", "buttons"], inspection: false },
      store,
    );
    const [now, old] = loadRecords("solo", 3, store);
    expect(now?.inputs).toEqual(["swipe", "buttons"]);
    expect(now?.inspection).toBe(false);
    expect(old?.inputs).toBeUndefined();
    expect(old?.inspection).toBeUndefined();
  });

  it("다시 보기 글은 최근 몇 판만 남긴다", () => {
    const store = memoryStorage();
    for (let i = 0; i < KEEP_REPLAYS + 5; i++)
      addRecord(solved(20_000, i), store);
    const list = loadRecords("solo", 3, store);
    expect(list.slice(0, KEEP_REPLAYS).every((r) => r.replay)).toBe(true);
    expect(list.slice(KEEP_REPLAYS).some((r) => r.replay)).toBe(false);
    // 섞기·시간·입력 방식은 그대로
    expect(list.at(-1)).toMatchObject({
      scramble: "R U",
      ms: 20_000,
      inputs: ["keyboard"],
    });
  });

  it("최고 Ao5를 낸 5판은 목록에서 밀려나도 다시 보기 글째 남는다", () => {
    const store = memoryStorage();
    for (let i = 0; i < 5; i++) addRecord(solved(10_000, i), store);
    for (let i = 0; i < MAX_RECORDS + 1; i++)
      addRecord(solved(30_000, 100 + i), store);
    expect(loadRecords("solo", 3, store).every((r) => r.ms === 30_000)).toBe(
      true,
    );
    const best = loadBestFive(3, store);
    expect(best.map((r) => r.ms)).toEqual([
      10_000, 10_000, 10_000, 10_000, 10_000,
    ]);
    expect(best.every((r) => r.replay === "R@0 U@10000")).toBe(true);
    // 더 좋은 Ao5가 나오면 바뀐다(9초 넷 + 30초 하나에서 이미 9초)
    for (let i = 0; i < 5; i++) addRecord(solved(9_000, 300 + i), store);
    expect(ao5(loadBestFive(3, store))).toBe(9_000);
    // 블라인드·다른 크기는 따로
    expect(loadBestFive(2, store)).toEqual([]);
    for (let i = 0; i < 5; i++)
      addRecord({ ...solved(1_000, i), mode: "blind" }, store);
    expect(ao5(loadBestFive(3, store))).toBe(9_000);
  });

  it("깨진 최고 5판 칸은 없는 것으로 본다", () => {
    const store = memoryStorage();
    store.setItem(BEST_FIVE_KEY, JSON.stringify({ 3: [{ at: 1 }] }));
    expect(loadBestFive(3, store)).toEqual([]);
    store.setItem(BEST_FIVE_KEY, "{bad");
    expect(loadBestFive(3, store)).toEqual([]);
  });

  it("자리가 모자라면 다시 보기 글을 줄여 한 번 더 저장한다", () => {
    const map = new Map<string, string>();
    const store = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (k === "cube.records.v1" && v.length > 6_000)
          throw new Error("QuotaExceededError");
        map.set(k, v);
      },
    };
    const long = "R@0 ".repeat(50).trim();
    for (let i = 0; i < 25; i++)
      addRecord({ ...solved(20_000, i), replay: long }, store);
    const list = loadRecords("solo", 3, store);
    expect(list).toHaveLength(25);
    // 넘칠 때마다 최근 5판만 남기고 다시 쌓으므로, 기록은 모두 남고 다시 보기 글은 일부만
    const kept = list.filter((r) => r.replay).length;
    expect(kept).toBeGreaterThanOrEqual(5);
    expect(kept).toBeLessThan(25);
    expect(list[0]?.replay).toBe(long);
  });
});
