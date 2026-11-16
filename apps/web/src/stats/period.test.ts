import { describe, expect, it } from "vitest";

import { filterBook, inPeriod, periodStart } from "./period";
import type { GameRecord, RoundRecord, StatsBook } from "./records";

const DAY = 24 * 60 * 60 * 1000;
/** 이 기기 시간대의 2026-11-17 15:00 */
const NOW = new Date(2026, 10, 17, 15, 0);

function round(id: string, at: number): RoundRecord {
  return { id, game: "omok", at, mode: "solo", data: {} };
}

function game(id: string, at: number): GameRecord {
  return { id, game: "omok", at, mode: "solo", data: {} };
}

describe("기간 고르기", () => {
  it("최근 7일은 지금으로부터 7일 전 같은 시각부터다", () => {
    expect(periodStart("week", NOW)).toBe(NOW.getTime() - 7 * DAY);
    expect(inPeriod(NOW.getTime() - 7 * DAY, "week", NOW)).toBe(true);
    expect(inPeriod(NOW.getTime() - 7 * DAY - 1, "week", NOW)).toBe(false);
  });

  it("최근 30일은 30일 전 같은 시각부터다", () => {
    expect(inPeriod(NOW.getTime() - 30 * DAY, "month", NOW)).toBe(true);
    expect(inPeriod(NOW.getTime() - 31 * DAY, "month", NOW)).toBe(false);
  });

  it("올해는 이 기기 시간대의 1월 1일 0시부터다", () => {
    const newYear = new Date(2026, 0, 1).getTime();
    expect(periodStart("year", NOW)).toBe(newYear);
    expect(inPeriod(newYear, "year", NOW)).toBe(true);
    expect(inPeriod(newYear - 1, "year", NOW)).toBe(false);
  });

  it("전체는 아무리 오래된 기록도 남긴다", () => {
    expect(periodStart("all", NOW)).toBeNull();
    expect(inPeriod(0, "all", NOW)).toBe(true);
  });

  it("기록을 거르면 기간 안의 판과 게임만 남고 처음 기록한 때는 그대로다", () => {
    const book: StatsBook = {
      version: 1,
      since: 100,
      rounds: [
        round("old", NOW.getTime() - 40 * DAY),
        round("mid", NOW.getTime() - 10 * DAY),
        round("new", NOW.getTime() - DAY),
      ],
      games: [
        game("old", NOW.getTime() - 40 * DAY),
        game("new", NOW.getTime() - DAY),
      ],
    };
    const month = filterBook(book, "month", NOW);
    expect(month.rounds.map((r) => r.id)).toEqual(["mid", "new"]);
    expect(month.games.map((g) => g.id)).toEqual(["new"]);
    expect(month.since).toBe(100);
    expect(filterBook(book, "week", NOW).rounds.map((r) => r.id)).toEqual([
      "new",
    ]);
    expect(filterBook(book, "all", NOW)).toBe(book);
  });
});
