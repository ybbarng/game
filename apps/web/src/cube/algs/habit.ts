// 버릇 들이기 기록(이 기기 localStorage `cube.habit.v1`, docs/47 8-1).
// 상황마다 「내 공식으로 푼 연속 횟수」·최근 시간·마지막 연습 시각을 둔다. 버릇 상태(안 정함·들이는 중·익숙함)는
// 내 공식(`cube.algs.v1`의 habit)에 있어 내보내기·가져오기로 함께 옮겨진다. 이 기록은 연습 자취라 이 기기에만 둔다.
import type { AlgSet } from "../learn/types";

export const HABIT_KEY = "cube.habit.v1";
/** 상황마다 남기는 최근 시간 수(내 공식으로 푼 것만) */
export const HABIT_TIMES = 10;

export interface HabitStats {
  /** 맞춘 횟수(어느 공식이든) */
  solves: number;
  /** 내 공식으로 맞춘 횟수 */
  mine: number;
  /** 내 공식으로 잇달아 맞춘 횟수. 다른 공식·포기면 0 */
  streak: number;
  /** 내 공식으로 맞춘 최근 시간(ms, 새것이 앞) */
  times: number[];
  /** 마지막 연습 시각(Date.now) */
  last: number;
}

export type HabitLog = Record<string, HabitStats>;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

const count = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;

/** 겉모양만 맞춘다. 숫자가 아니거나 음수면 0, 시간 목록은 숫자만 상한까지 */
export function sanitizeHabit(data: unknown): HabitLog {
  const out: HabitLog = {};
  if (typeof data !== "object" || data === null || Array.isArray(data))
    return out;
  for (const [id, v] of Object.entries(data)) {
    if (typeof v !== "object" || v === null) continue;
    const r = v as Partial<Record<keyof HabitStats, unknown>>;
    out[id] = {
      solves: count(r.solves),
      mine: count(r.mine),
      streak: count(r.streak),
      times: Array.isArray(r.times)
        ? r.times
            .filter(
              (t): t is number =>
                typeof t === "number" && Number.isFinite(t) && t >= 0,
            )
            .slice(0, HABIT_TIMES)
        : [],
      last: count(r.last),
    };
  }
  return out;
}

export function loadHabit(
  storage: StorageLike | null = defaultStorage(),
): HabitLog {
  try {
    const text = storage?.getItem(HABIT_KEY);
    return text ? sanitizeHabit(JSON.parse(text)) : {};
  } catch {
    return {};
  }
}

function save(log: HabitLog, storage: StorageLike | null) {
  try {
    storage?.setItem(HABIT_KEY, JSON.stringify(log));
  } catch {
    // 저장소가 막혔으면 이번 기록만 잃는다
  }
}

const empty = (): HabitStats => ({
  solves: 0,
  mine: 0,
  streak: 0,
  times: [],
  last: 0,
});

/** 한 번 맞췄다. 내 공식으로 풀었으면 연속에 더하고 시간을 남긴다(다른 공식이면 연속이 끊긴다) */
export function recordHabitSolve(
  caseId: string,
  run: { ms: number; mine: boolean; now: number },
  storage: StorageLike | null = defaultStorage(),
): HabitLog {
  const log = loadHabit(storage);
  const s = log[caseId] ?? empty();
  const next: HabitLog = {
    ...log,
    [caseId]: {
      solves: s.solves + 1,
      mine: s.mine + (run.mine ? 1 : 0),
      streak: run.mine ? s.streak + 1 : 0,
      times: run.mine ? [run.ms, ...s.times].slice(0, HABIT_TIMES) : s.times,
      last: run.now,
    },
  };
  save(next, storage);
  return next;
}

/** 포기했다(연속이 끊긴다) */
export function recordHabitFail(
  caseId: string,
  now: number,
  storage: StorageLike | null = defaultStorage(),
): HabitLog {
  const log = loadHabit(storage);
  const s = log[caseId] ?? empty();
  const next: HabitLog = { ...log, [caseId]: { ...s, streak: 0, last: now } };
  save(next, storage);
  return next;
}

/** 내 공식으로 푼 최근 시간의 평균(ms). 없으면 null */
export function habitAverage(s: HabitStats | undefined): number | null {
  if (!s || s.times.length === 0) return null;
  return Math.round(s.times.reduce((a, b) => a + b, 0) / s.times.length);
}

// ── 익숙함으로 옮기기 ──────────────────────────────────────

/** 익숙함으로 옮기자고 할 연속 횟수(내 공식으로) */
export const KNOWN_STREAK = 5;

/**
 * 익숙함 시간 기준(ms): 최근 KNOWN_STREAK번 평균이 이 안이면. 키보드로 치는 가상 큐브 기준이라 실물보다 넉넉하다.
 * 마지막 층·F2L은 짧고, 큰 큐브·블라인드 공식은 길다
 */
export const KNOWN_MS: Readonly<Record<AlgSet, number>> = {
  "2look-oll": 5000,
  "2look-pll": 6000,
  oll: 5000,
  pll: 6000,
  f2l: 5000,
  "ortega-oll": 4000,
  "ortega-pbl": 5000,
  "parity-4x4": 12000,
  "edges-5x5": 12000,
  "bld-op": 10000,
};

/** 내 공식으로 KNOWN_STREAK번 잇달아, 그 평균이 시간 기준 안이면 익숙함으로 옮기자고 한다 */
export function readyForKnown(s: HabitStats | undefined, set: AlgSet): boolean {
  if (!s || s.streak < KNOWN_STREAK) return false;
  const recent = s.times.slice(0, KNOWN_STREAK);
  if (recent.length < KNOWN_STREAK) return false;
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  return avg <= KNOWN_MS[set];
}

// ── 내 목록에서 고르기(간단한 간격 반복) ─────────────────────────

export type HabitState = "learning" | "known";

const DAY = 24 * 60 * 60 * 1000;

/**
 * 상황을 낼 비중. 덜 익은 것을 더 자주:
 * - 들이는 중은 1, 익숙함은 0.25(가끔 다시 본다)
 * - 내 공식 연속이 길수록 줄고(1 / (1 + 연속)), 안 해 본 상황은 3배
 * - 마지막 연습이 오래될수록 늘어난다(하루마다 +1, 최대 3배)
 */
export function habitWeight(
  state: HabitState,
  s: HabitStats | undefined,
  now: number,
): number {
  const base = state === "learning" ? 1 : 0.25;
  if (!s || s.last === 0) return base * 3;
  const fresh = 1 / (1 + s.streak);
  const stale = Math.min(3, 1 + Math.max(0, now - s.last) / DAY);
  return base * fresh * stale;
}

/**
 * 비중대로 하나 고른다. `rand`는 [0, 1) 수. 바로 앞 상황은 다른 것이 있으면 빼고 고른다.
 * 목록이 비면 null
 */
export function pickHabitCase(
  list: readonly { id: string; state: HabitState }[],
  log: HabitLog,
  now: number,
  rand: number,
  prev?: string,
): string | null {
  const pool = list.length > 1 ? list.filter((x) => x.id !== prev) : list;
  if (pool.length === 0) return null;
  const weights = pool.map((x) => habitWeight(x.state, log[x.id], now));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i] as number;
    if (r < 0) return (pool[i] as { id: string }).id;
  }
  return (pool.at(-1) as { id: string }).id;
}
