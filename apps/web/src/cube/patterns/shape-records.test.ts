import { describe, expect, it } from "vitest";
import {
  addShapeResult,
  loadShapeRecords,
  recordKey,
  SHAPE_RECORDS_KEY,
  saveShapeRecords,
} from "./shape-records";

function memory(init: Record<string, string> = {}) {
  const data = { ...init };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

describe("모양 만들기 기록", () => {
  it("모양·시작마다 가장 빠른 시간과 횟수를 둔다", () => {
    const key = recordKey("3-checkerboard", "solved");
    let r = addShapeResult({}, key, 9_000, 6);
    expect(r.best).toBe(true);
    r = addShapeResult(r.records, key, 12_000, 8);
    expect(r.best).toBe(false);
    r = addShapeResult(r.records, key, 7_000, 6);
    expect(r.best).toBe(true);
    expect(r.records[key]).toEqual({
      best: 7_000,
      bestMoves: 6,
      count: 3,
      last: 7_000,
    });
    expect(r.records[recordKey("3-checkerboard", "scrambled")]).toBeUndefined();
  });

  it("저장하고 다시 읽는다, 망가진 값은 버린다", () => {
    const store = memory();
    const { records } = addShapeResult({}, "a|solved", 1_000, 3);
    saveShapeRecords(records, store);
    expect(loadShapeRecords(store)).toEqual(records);
    const bad = memory({
      [SHAPE_RECORDS_KEY]: JSON.stringify({
        x: { best: -1, bestMoves: 1, count: 1, last: 1 },
        y: "아님",
      }),
    });
    expect(loadShapeRecords(bad)).toEqual({});
    expect(loadShapeRecords(memory({ [SHAPE_RECORDS_KEY]: "{" }))).toEqual({});
    expect(loadShapeRecords(null)).toEqual({});
  });

  it("공식을 본 판은 따로 세고, 공식 보기 전의 기록은 안 본 판으로 그대로 읽힌다", () => {
    const old = memory({
      [SHAPE_RECORDS_KEY]: JSON.stringify({
        "3-checkerboard|solved": {
          best: 9_000,
          bestMoves: 6,
          count: 2,
          last: 9_500,
        },
      }),
    });
    const records = loadShapeRecords(old);
    const plain = recordKey("3-checkerboard", "solved");
    const seen = recordKey("3-checkerboard", "solved", true);
    expect(plain).toBe("3-checkerboard|solved");
    expect(records[plain]?.best).toBe(9_000);
    const r = addShapeResult(records, seen, 4_000, 6);
    expect(r.best).toBe(true);
    expect(r.records[plain]?.best).toBe(9_000);
    expect(r.records[seen]).toEqual({
      best: 4_000,
      bestMoves: 6,
      count: 1,
      last: 4_000,
    });
    saveShapeRecords(r.records, old);
    expect(loadShapeRecords(old)).toEqual(r.records);
  });
});
