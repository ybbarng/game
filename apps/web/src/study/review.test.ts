// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  dayLabel,
  dueDay,
  dueToday,
  localDay,
  nextReviewDay,
  type PuzzleRecord,
  recordMiss,
  recordSolve,
  utcDay,
} from "./review";

/** 2026년 11월 `d`일 UTC `h`시 */
const at = (d: number, h = 12) => Date.UTC(2026, 10, d, h);
const day = (d: number) => utcDay(at(d));

describe("다음에 다시 낼 날", () => {
  it("손대지 않은 문제는 복습 대상이 아니다", () => {
    expect(dueDay(undefined, utcDay)).toBeNull();
  });

  it("처음 풀면 다음 날, 잇달아 맞출수록 3·7·14·30·60일 뒤", () => {
    const gaps = [1, 2, 3, 4, 5, 6, 9].map((streak) =>
      dueDay({ misses: 0, solvedAt: at(1), streak }, utcDay),
    );
    expect(gaps.map((d) => (d as number) - day(1))).toEqual([
      1, 3, 7, 14, 30, 60, 60,
    ]);
  });

  it("틀리면 다음 날 다시 낸다", () => {
    expect(
      dueDay(
        { misses: 2, solvedAt: at(1), streak: 0, missedAt: at(5) },
        utcDay,
      ),
    ).toBe(day(6));
  });

  it("옛 기록(푼 때와 틀린 횟수만)도 읽는다: 푼 적이 있으면 한 번 맞춘 것으로 본다", () => {
    expect(dueDay({ misses: 3, solvedAt: at(1) }, utcDay)).toBe(day(2));
  });

  it("옛 기록에서 풀지 못하고 틀리기만 한 문제는 바로 낸다", () => {
    expect(dueDay({ misses: 1 }, utcDay)).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe("풀거나 틀렸을 때 기록", () => {
  it("처음 풀면 잇달아 맞춘 횟수 1", () => {
    expect(recordSolve(undefined, at(1), utcDay)).toEqual({
      misses: 0,
      solvedAt: at(1),
      streak: 1,
    });
  });

  it("다시 낼 날에 풀면 횟수가 늘어 간격이 길어진다", () => {
    const first = recordSolve(undefined, at(1), utcDay);
    const second = recordSolve(first, at(2), utcDay);
    expect(second.streak).toBe(2);
    expect(dueDay(second, utcDay)).toBe(day(5));
  });

  it("다시 낼 날 전에 또 풀면 기록이 그대로다", () => {
    const first = recordSolve(undefined, at(1, 9), utcDay);
    expect(recordSolve(first, at(1, 20), utcDay)).toEqual(first);
  });

  it("틀리면 횟수가 0이 되고, 그 뒤 풀면 다시 1부터", () => {
    const solved: PuzzleRecord = { misses: 0, solvedAt: at(1), streak: 4 };
    const missed = recordMiss(solved, at(20));
    expect(missed).toEqual({
      misses: 1,
      solvedAt: at(1),
      streak: 0,
      missedAt: at(20),
    });
    const again = recordSolve(missed, at(20, 13), utcDay);
    expect(again.streak).toBe(1);
    expect(dueDay(again, utcDay)).toBe(day(21));
  });
});

describe("오늘 복습 묶음", () => {
  const records: Record<string, PuzzleRecord> = {
    later: { misses: 0, solvedAt: at(10), streak: 3 }, // 17일
    today: { misses: 0, solvedAt: at(16), streak: 1 }, // 17일
    old: { misses: 0, solvedAt: at(1), streak: 2 }, // 4일
    missed: { misses: 2, missedAt: at(16) }, // 17일, 많이 틀림
    future: { misses: 0, solvedAt: at(16), streak: 2 }, // 19일
  };
  const ids = ["later", "today", "old", "missed", "future", "fresh"];

  it("날이 된 문제를 늦은 것부터, 같은 날이면 많이 틀린 것부터, 그다음은 묶음 차례로", () => {
    expect(dueToday(ids, records, at(17), utcDay)).toEqual([
      "old",
      "missed",
      "later",
      "today",
    ]);
  });

  it("오늘 낼 것이 없으면 그다음 복습 날을 알려 준다", () => {
    expect(dueToday(["future"], records, at(17), utcDay)).toEqual([]);
    expect(nextReviewDay(ids, records, at(17), utcDay)).toBe(day(19));
    expect(nextReviewDay(["fresh"], records, at(17), utcDay)).toBeNull();
  });

  it("날 번호를 달력 날짜 글로 바꾼다", () => {
    expect(dayLabel(day(19))).toBe("11월 19일");
  });
});

describe("이 기기의 날짜", () => {
  it("같은 날의 아침과 밤은 같은 날, 다음 날은 1 크다", () => {
    const morning = new Date(2026, 10, 17, 0, 5).getTime();
    const night = new Date(2026, 10, 17, 23, 55).getTime();
    const next = new Date(2026, 10, 18, 0, 5).getTime();
    expect(localDay(night)).toBe(localDay(morning));
    expect(localDay(next)).toBe(localDay(morning) + 1);
    expect(dayLabel(localDay(night))).toBe("11월 17일");
  });
});
