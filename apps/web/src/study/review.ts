/*
 * 수 배우기 날짜 간격 복습(docs/23 「날짜 간격 복습」). 장기·체스·바둑·오목이 함께 쓴다.
 * 문제마다 마지막으로 푼 날과 잇달아 맞춘 횟수로 다음에 다시 낼 날을 정한다.
 * - 틀리면 다음 날 다시 낸다(잇달아 맞춘 횟수는 0으로)
 * - 맞추면 1·3·7·14·30·60일 뒤(잇달아 맞춘 횟수가 늘수록 길게)
 * 날짜는 넣어 주는 값이다(`now`, `dayOf`). 시험은 고정 날짜와 UTC 날짜로 본다.
 */

/** 문제 하나의 기록. 옛 기록(2026-11-17 전)은 `solvedAt`·`misses`만 있다 */
export interface PuzzleRecord {
  /** 마지막으로 푼 때(ms). 안 풀었으면 없다 */
  solvedAt?: number;
  /** 틀린 횟수 */
  misses: number;
  /** 잇달아 맞춘 횟수(틀리면 0). 없으면 옛 기록이라 푼 적이 있으면 1로 본다 */
  streak?: number;
  /** 마지막으로 틀린 때(ms) */
  missedAt?: number;
}

/** 잇달아 맞춘 횟수마다 다음 복습까지 날 수. 끝을 넘으면 마지막 값 */
export const REVIEW_INTERVALS: readonly number[] = [1, 3, 7, 14, 30, 60];

/** 때(ms)를 날 번호로. 같은 날이면 같은 번호, 다음 날이면 1 큰 번호 */
export type DayOf = (ms: number) => number;

/** 이 기기의 달력 날짜로 센 날 번호(제품이 쓴다) */
export const localDay: DayOf = (ms) => {
  const d = new Date(ms);
  return Math.round(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000,
  );
};

/** UTC 날짜로 센 날 번호(시험이 쓴다, 기기 시간대와 상관없다) */
export const utcDay: DayOf = (ms) => Math.floor(ms / 86_400_000);

/** 잇달아 맞춘 횟수. 옛 기록은 푼 적이 있으면 1 */
export function streakOf(record: PuzzleRecord | undefined): number {
  if (!record) return 0;
  if (record.streak !== undefined) return record.streak;
  return record.solvedAt ? 1 : 0;
}

/** 마지막으로 한 일이 틀림인가(푼 뒤에 틀렸거나, 틀리기만 했다) */
function lastWasMiss(record: PuzzleRecord): boolean {
  if (record.missedAt !== undefined)
    return record.solvedAt === undefined || record.missedAt > record.solvedAt;
  // 옛 기록: 틀린 때를 모른다. 풀지 못한 채 틀리기만 했으면 틀림으로 본다
  return record.solvedAt === undefined && record.misses > 0;
}

/**
 * 다음에 다시 낼 날 번호. 손대지 않은 문제는 null(복습 대상이 아니다).
 * 틀린 때를 모르는 옛 기록(풀지 못하고 틀리기만 함)은 -Infinity(바로 낸다)
 */
export function dueDay(
  record: PuzzleRecord | undefined,
  dayOf: DayOf,
): number | null {
  if (!record) return null;
  if (lastWasMiss(record)) {
    if (record.missedAt === undefined) return Number.NEGATIVE_INFINITY;
    return dayOf(record.missedAt) + 1;
  }
  if (record.solvedAt === undefined) return null;
  const streak = Math.max(1, streakOf(record));
  const gap =
    REVIEW_INTERVALS[Math.min(streak, REVIEW_INTERVALS.length) - 1] ?? 1;
  return dayOf(record.solvedAt) + gap;
}

/**
 * 풀었을 때 새 기록.
 * - 처음 풀었거나 틀린 뒤 풀면 잇달아 맞춘 횟수 1
 * - 다시 낼 날이 됐거나 지나서 풀면 1 늘린다
 * - 다시 낼 날 전에 또 풀면 기록을 그대로 둔다(같은 날 여러 번 풀어 간격이 부풀지 않게)
 */
export function recordSolve(
  record: PuzzleRecord | undefined,
  now: number,
  dayOf: DayOf,
): PuzzleRecord {
  const misses = record?.misses ?? 0;
  if (!record || lastWasMiss(record) || record.solvedAt === undefined)
    return { ...record, misses, solvedAt: now, streak: 1 };
  const due = dueDay(record, dayOf) ?? Number.NEGATIVE_INFINITY;
  if (dayOf(now) < due) return { ...record, misses };
  return { ...record, misses, solvedAt: now, streak: streakOf(record) + 1 };
}

/** 틀렸을 때 새 기록: 틀린 횟수를 늘리고 잇달아 맞춘 횟수는 0 */
export function recordMiss(
  record: PuzzleRecord | undefined,
  now: number,
): PuzzleRecord {
  return {
    ...record,
    misses: (record?.misses ?? 0) + 1,
    streak: 0,
    missedAt: now,
  };
}

/**
 * 오늘 복습할 문제: 다시 낼 날이 오늘이거나 지난 문제를 늦은 것부터.
 * 날이 같으면 많이 틀린 것 먼저, 그다음은 넘겨준 차례(묶음 차례) 그대로
 */
export function dueToday(
  ids: readonly string[],
  records: Readonly<Record<string, PuzzleRecord>>,
  now: number,
  dayOf: DayOf,
): string[] {
  const today = dayOf(now);
  return ids
    .map((id, order) => ({
      id,
      order,
      due: dueDay(records[id], dayOf),
      misses: records[id]?.misses ?? 0,
    }))
    .filter(
      (x): x is typeof x & { due: number } => x.due !== null && x.due <= today,
    )
    .sort((a, b) => a.due - b.due || b.misses - a.misses || a.order - b.order)
    .map((x) => x.id);
}

/** 오늘 복습할 문제가 없을 때 그다음 복습 날 번호. 손댄 문제가 없으면 null */
export function nextReviewDay(
  ids: readonly string[],
  records: Readonly<Record<string, PuzzleRecord>>,
  now: number,
  dayOf: DayOf,
): number | null {
  const today = dayOf(now);
  let next: number | null = null;
  for (const id of ids) {
    const due = dueDay(records[id], dayOf);
    if (due === null || due <= today) continue;
    if (next === null || due < next) next = due;
  }
  return next;
}

/** 날 번호를 「11월 20일」처럼(`localDay`·`utcDay` 모두 UTC 자정 기준 날 번호라 같은 글이 나온다) */
export function dayLabel(day: number): string {
  const d = new Date(day * 86_400_000);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}
