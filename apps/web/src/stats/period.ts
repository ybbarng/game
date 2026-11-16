import type { StatsBook } from "./records";

/*
 * 기간 고르기: 내 기록 화면에서 전체·최근 7일·최근 30일·올해로 걸러 본다.
 * 지금 시각은 부르는 쪽이 넣어 준다(시험은 고정 시각). 「올해」는 이 기기 시간대의 1월 1일 0시부터다.
 */

export type Period = "all" | "week" | "month" | "year";

export const PERIODS: readonly Period[] = ["all", "week", "month", "year"];

export const PERIOD_LABEL: Record<Period, string> = {
  all: "전체",
  week: "최근 7일",
  month: "최근 30일",
  year: "올해",
};

const DAY = 24 * 60 * 60 * 1000;

/** 이 기간이 시작하는 시각(ms). 전체면 null */
export function periodStart(period: Period, now: Date): number | null {
  switch (period) {
    case "all":
      return null;
    case "week":
      return now.getTime() - 7 * DAY;
    case "month":
      return now.getTime() - 30 * DAY;
    case "year":
      return new Date(now.getFullYear(), 0, 1).getTime();
  }
}

/** 이 시각(ms)의 기록이 기간 안인가. 앞으로의 시각(기기 시계가 바뀐 기록)도 안으로 본다 */
export function inPeriod(at: number, period: Period, now: Date): boolean {
  const start = periodStart(period, now);
  return start === null || at >= start;
}

/** 기간 안의 판·게임만 남긴 기록. 전체면 그대로 돌려준다 */
export function filterBook(
  book: StatsBook,
  period: Period,
  now: Date,
): StatsBook {
  if (period === "all") return book;
  return {
    ...book,
    rounds: book.rounds.filter((r) => inPeriod(r.at, period, now)),
    games: book.games.filter((g) => inPeriod(g.at, period, now)),
  };
}
