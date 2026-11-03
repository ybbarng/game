import type { DrillStats, KeyStat } from "./drill";

/**
 * 키 익히기 진도·조작 훈련 기록(이 기기 localStorage). 저장소가 막혀 있어도(사생활 창 등) 빈 기록으로 돈다.
 */

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export const LEARN_KEY = "cube.keylearn.v1";
export const DRILL_KEY = "cube.keydrill.v1";

export interface LearnProgress {
  /** 마친 단계 id */
  done: string[];
}

export interface DrillRecord {
  /** 수 보고 치기: 동작별 */
  see: DrillStats;
  /** 키 보고 맞히기: 동작별 */
  quiz: DrillStats;
  /** 공식 따라 치기: 공식 id → 가장 빠른 초당 수 */
  formulas: Record<string, number>;
}

function read(key: string, storage: StorageLike | null): unknown {
  try {
    const t = storage?.getItem(key);
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown, storage: StorageLike | null) {
  try {
    storage?.setItem(key, JSON.stringify(value));
    return !!storage;
  } catch {
    return false;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function loadLearn(
  storage: StorageLike | null = defaultStorage(),
): LearnProgress {
  const d = read(LEARN_KEY, storage);
  if (isObj(d) && Array.isArray(d.done))
    return { done: d.done.filter((x): x is string => typeof x === "string") };
  return { done: [] };
}

export function saveLearn(
  p: LearnProgress,
  storage: StorageLike | null = defaultStorage(),
): boolean {
  return write(LEARN_KEY, p, storage);
}

const okNum = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

function cleanStats(v: unknown): DrillStats {
  const out: DrillStats = {};
  if (!isObj(v)) return out;
  for (const [k, s] of Object.entries(v))
    if (isObj(s) && okNum(s.tries) && okNum(s.hits) && okNum(s.ms))
      out[k] = { tries: s.tries, hits: s.hits, ms: s.ms } as KeyStat;
  return out;
}

export function emptyRecord(): DrillRecord {
  return { see: {}, quiz: {}, formulas: {} };
}

export function loadDrill(
  storage: StorageLike | null = defaultStorage(),
): DrillRecord {
  const d = read(DRILL_KEY, storage);
  if (!isObj(d)) return emptyRecord();
  const formulas: Record<string, number> = {};
  if (isObj(d.formulas))
    for (const [k, v] of Object.entries(d.formulas))
      if (okNum(v)) formulas[k] = v as number;
  return { see: cleanStats(d.see), quiz: cleanStats(d.quiz), formulas };
}

export function saveDrill(
  r: DrillRecord,
  storage: StorageLike | null = defaultStorage(),
): boolean {
  return write(DRILL_KEY, r, storage);
}
