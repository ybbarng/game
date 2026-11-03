// 배우기 진도와 훈련 기록(docs/47 8-1). 이 기기 localStorage에만 둔다. 저장소가 막혀 있어도 빈 값으로 돈다.

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function readJson<T extends object>(
  storage: StorageLike | null,
  key: string,
): Partial<T> {
  try {
    const text = storage?.getItem(key);
    if (!text) return {};
    const data: unknown = JSON.parse(text);
    return typeof data === "object" && data !== null && !Array.isArray(data)
      ? (data as Partial<T>)
      : {};
  } catch {
    return {};
  }
}

function writeJson(storage: StorageLike | null, key: string, value: unknown) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // 저장소가 가득 찼거나 막혔으면 이번 기록만 잃는다
  }
}

// ── 배우기 진도 ──────────────────────────────────────────

export const LEARN_KEY = "cube.learn.v1";

export interface LessonProgress {
  /** 통과한 해보기 단계 번호들 */
  passed: number[];
  /** 단원을 끝까지 봤다 */
  done: boolean;
}

export interface LearnProgress {
  lessons: Record<string, LessonProgress>;
  /** 마지막으로 연 단원 */
  last?: string;
}

export function loadLearn(storage = defaultStorage()): LearnProgress {
  const raw = readJson<LearnProgress>(storage, LEARN_KEY);
  const lessons =
    typeof raw.lessons === "object" && raw.lessons !== null ? raw.lessons : {};
  return {
    lessons,
    ...(typeof raw.last === "string" ? { last: raw.last } : {}),
  };
}

function updateLesson(
  lessonId: string,
  change: (p: LessonProgress) => LessonProgress,
  storage: StorageLike | null,
): LearnProgress {
  const all = loadLearn(storage);
  const before = all.lessons[lessonId] ?? { passed: [], done: false };
  const next: LearnProgress = {
    lessons: { ...all.lessons, [lessonId]: change(before) },
    last: lessonId,
  };
  writeJson(storage, LEARN_KEY, next);
  return next;
}

/** 해보기 단계 하나를 통과했다 */
export function markTryPassed(
  lessonId: string,
  step: number,
  storage = defaultStorage(),
): LearnProgress {
  return updateLesson(
    lessonId,
    (p) => ({
      ...p,
      passed: p.passed.includes(step)
        ? p.passed
        : [...p.passed, step].sort((a, b) => a - b),
    }),
    storage,
  );
}

/** 단원을 끝까지 봤다 */
export function markLessonDone(
  lessonId: string,
  storage = defaultStorage(),
): LearnProgress {
  return updateLesson(lessonId, (p) => ({ ...p, done: true }), storage);
}

/** 단원을 열었다(「이어서 하기」용) */
export function markLessonOpened(
  lessonId: string,
  storage = defaultStorage(),
): LearnProgress {
  return updateLesson(lessonId, (p) => p, storage);
}

// ── 훈련 기록 ──────────────────────────────────────────

export const TRAIN_KEY = "cube.train.v1";
/** 상황마다 남기는 최근 시간 수 */
export const RECENT_TIMES = 12;

export interface CaseStats {
  /** 맞춘 횟수 */
  solves: number;
  /** 포기한 횟수 */
  fails: number;
  /** 가장 빠른 시간(ms) */
  best: number | null;
  /** 최근 시간(ms, 새것이 앞) */
  times: number[];
  /** 최근 수(times와 같은 차례) */
  moves: number[];
}

export type TrainBook = Record<string, CaseStats>;

const emptyStats = (): CaseStats => ({
  solves: 0,
  fails: 0,
  best: null,
  times: [],
  moves: [],
});

export function loadTrain(storage = defaultStorage()): TrainBook {
  return readJson<TrainBook>(storage, TRAIN_KEY) as TrainBook;
}

export function recordSolve(
  caseId: string,
  ms: number,
  moves: number,
  storage = defaultStorage(),
): TrainBook {
  const book = loadTrain(storage);
  const s = book[caseId] ?? emptyStats();
  const next: TrainBook = {
    ...book,
    [caseId]: {
      ...s,
      solves: s.solves + 1,
      best: s.best === null ? ms : Math.min(s.best, ms),
      times: [ms, ...s.times].slice(0, RECENT_TIMES),
      moves: [moves, ...s.moves].slice(0, RECENT_TIMES),
    },
  };
  writeJson(storage, TRAIN_KEY, next);
  return next;
}

export function recordFail(
  caseId: string,
  storage = defaultStorage(),
): TrainBook {
  const book = loadTrain(storage);
  const s = book[caseId] ?? emptyStats();
  const next: TrainBook = { ...book, [caseId]: { ...s, fails: s.fails + 1 } };
  writeJson(storage, TRAIN_KEY, next);
  return next;
}

/** 최근 시간의 평균(ms). 없으면 null */
export function averageMs(s: CaseStats | undefined): number | null {
  if (!s || s.times.length === 0) return null;
  return s.times.reduce((a, b) => a + b, 0) / s.times.length;
}

/**
 * 약한 상황: 포기가 잦거나 평균이 느린 것 먼저. 한 번도 안 해 본 상황도 약한 것으로 친다.
 * 묶음 안 상황 id 중 앞쪽 절반쯤(적어도 하나)을 돌려준다.
 */
export function weakCases(ids: readonly string[], book: TrainBook): string[] {
  if (ids.length === 0) return [];
  const score = (id: string) => {
    const s = book[id];
    if (!s || s.solves + s.fails === 0) return Number.POSITIVE_INFINITY;
    const failRate = s.fails / (s.solves + s.fails);
    const avg = averageMs(s) ?? 60_000;
    return avg * (1 + 4 * failRate);
  };
  const sorted = [...ids].sort((a, b) => score(b) - score(a));
  return sorted.slice(0, Math.max(1, Math.ceil(ids.length / 2)));
}
