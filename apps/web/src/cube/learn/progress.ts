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
  /**
   * 마지막으로 본 단계 번호(2026-11-04 더함). 단원을 다시 열면 여기서 연다. 옛 기록에는 없고(0부터),
   * 모양이 틀린 값은 읽을 때 버린다
   */
  step?: number;
  /**
   * 마친 해 보기 밖 단계 번호들(시연을 끝까지 봄·찾기·문제·따라 하기 등, 2026-11-05 더함). 단계 띠의 초록 표시가
   * 나갔다 들어와도 남는다. 옛 기록에는 없고(빈 목록), 모양이 틀린 값은 읽을 때 버린다
   */
  acted?: number[];
}

/** 저장된 단계 번호가 쓸 만한가(0 이상의 정수) */
const validStep = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0;

/** 다시 열 단계: 저장된 번호가 단원 안이면 그것, 아니면 0 */
export function resumeStep(
  progress: LearnProgress,
  lessonId: string,
  stepCount: number,
): number {
  const at = progress.lessons[lessonId]?.step;
  return validStep(at) && at < stepCount ? at : 0;
}

export interface LearnProgress {
  lessons: Record<string, LessonProgress>;
  /** 마지막으로 연 단원 */
  last?: string;
}

/**
 * 내용을 새로 짠 단원의 옛 id → 새 id(2026-11-04 초보자 마지막 층·흰 면 위 첫 층). 단계 차례가 달라져
 * 해 보기 번호는 옮기지 않고 「끝냄」만 옮긴다. 옛 단원과 같은 차례의 새 단원으로 잇는다.
 */
export const LESSON_RENAMES: Readonly<Record<string, string>> = {
  "333-first-corners": "333-first-corners-up",
  "333-yellow-cross": "333-ll-cross",
  "333-yellow-face": "333-ll-edges",
  "333-yellow-corners": "333-ll-corner-place",
  "333-yellow-edges": "333-ll-corner-twist",
  "222-first-layer": "222-first-layer-up",
  "222-from333-first-layer": "222-from333-first-layer-up",
  "222-from333-yellow-face": "222-from333-corner-place",
  "222-from333-yellow-corners": "222-from333-corner-twist",
  // 2026-11-05 「조각의 움직임」을 센터 → 엣지 → 코너 차례로 바꾸고 자리·방향 단계를 더함(해 보기 번호가 달라짐)
  "333-pieces": "333-piece-moves",
};

function migrate(
  lessons: Record<string, LessonProgress>,
): Record<string, LessonProgress> {
  const out: Record<string, LessonProgress> = {};
  for (const [id, p] of Object.entries(lessons)) {
    if (typeof p !== "object" || p === null) continue;
    const passed = Array.isArray(p.passed) ? p.passed.filter(validStep) : [];
    const acted = Array.isArray(p.acted) ? p.acted.filter(validStep) : [];
    out[id] = {
      passed,
      done: p.done === true,
      ...(validStep(p.step) ? { step: p.step } : {}),
      ...(acted.length > 0 ? { acted } : {}),
    };
  }
  for (const [from, to] of Object.entries(LESSON_RENAMES)) {
    const old = lessons[from];
    if (!old || out[to]) continue;
    out[to] = { passed: [], done: old.done === true };
  }
  return out;
}

export function loadLearn(storage = defaultStorage()): LearnProgress {
  const raw = readJson<LearnProgress>(storage, LEARN_KEY);
  const lessons =
    typeof raw.lessons === "object" && raw.lessons !== null
      ? migrate(raw.lessons)
      : {};
  const last =
    typeof raw.last === "string"
      ? (LESSON_RENAMES[raw.last] ?? raw.last)
      : undefined;
  return { lessons, ...(last ? { last } : {}) };
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

/** 해 보기 밖 단계 하나를 마쳤다(단계 띠 초록) */
export function markStepActed(
  lessonId: string,
  step: number,
  storage = defaultStorage(),
): LearnProgress {
  return updateLesson(
    lessonId,
    (p) => {
      const acted = p.acted ?? [];
      return acted.includes(step)
        ? p
        : { ...p, acted: [...acted, step].sort((a, b) => a - b) };
    },
    storage,
  );
}

/** 단계를 봤다(다시 열 때 여기서 연다) */
export function markStepSeen(
  lessonId: string,
  step: number,
  storage = defaultStorage(),
): LearnProgress {
  return updateLesson(lessonId, (p) => ({ ...p, step }), storage);
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
