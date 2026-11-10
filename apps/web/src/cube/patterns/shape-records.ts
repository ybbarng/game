import type { ShapeStart } from "./race";

/**
 * 혼자 하는 모양 만들기의 기록(이 기기 localStorage, docs/47 9-10). 모양과 시작(맞춘 큐브/섞인 큐브)마다
 * 가장 빠른 시간·그때 수·한 번 수를 둔다. 저장소가 막혀 있으면 빈 기록으로 돌고 저장은 조용히 건너뛴다.
 * 「만드는 법」를 연 판은 따로 센다(열쇠 끝 `|formula`): 공식을 보면 훨씬 빨라 외워서 한 기록과 견줄 수 없다.
 * 공식 보기가 생기기 전의 기록(`모양|시작`)은 모두 공식을 보지 않은 판이라 그대로 읽힌다.
 */

export const SHAPE_RECORDS_KEY = "cube.shape-records.v1";
/** 처음 들어왔을 때 안내를 본 표시 */
export const SHAPE_INTRO_KEY = "cube.shape-intro.v1";

export interface ShapeRecord {
  /** 가장 빠른 시간(ms) */
  best: number;
  /** 가장 빠른 판의 수 */
  bestMoves: number;
  /** 완성한 횟수 */
  count: number;
  /** 마지막으로 완성한 시간(ms) */
  last: number;
}

export type ShapeRecords = Record<string, ShapeRecord>;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function recordKey(
  id: string,
  start: ShapeStart,
  /** 「만드는 법」를 연 판 */
  formula = false,
): string {
  return formula ? `${id}|${start}|formula` : `${id}|${start}`;
}

const okNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

function sanitize(data: unknown): ShapeRecords {
  if (typeof data !== "object" || data === null || Array.isArray(data))
    return {};
  const out: ShapeRecords = {};
  for (const [k, v] of Object.entries(data)) {
    if (k.length > 64 || typeof v !== "object" || v === null) continue;
    const { best, bestMoves, count, last } = v as Record<string, unknown>;
    if (
      okNumber(best) &&
      okNumber(bestMoves) &&
      okNumber(count) &&
      okNumber(last)
    )
      out[k] = { best, bestMoves, count, last };
  }
  return out;
}

export function loadShapeRecords(
  storage: StorageLike | null = defaultStorage(),
): ShapeRecords {
  if (!storage) return {};
  try {
    const text = storage.getItem(SHAPE_RECORDS_KEY);
    return text ? sanitize(JSON.parse(text)) : {};
  } catch {
    return {};
  }
}

/** 완성한 판 하나를 더한다. 새 기록이면 `best: true` */
export function addShapeResult(
  records: ShapeRecords,
  key: string,
  ms: number,
  moves: number,
): { records: ShapeRecords; best: boolean } {
  const had = records[key];
  const best = !had || ms < had.best;
  return {
    records: {
      ...records,
      [key]: {
        best: best ? ms : (had as ShapeRecord).best,
        bestMoves: best ? moves : (had as ShapeRecord).bestMoves,
        count: (had?.count ?? 0) + 1,
        last: ms,
      },
    },
    best,
  };
}

export function saveShapeRecords(
  records: ShapeRecords,
  storage: StorageLike | null = defaultStorage(),
): void {
  try {
    storage?.setItem(SHAPE_RECORDS_KEY, JSON.stringify(records));
  } catch {
    // 저장소가 막혀 있으면 건너뛴다
  }
}

export function introSeen(
  storage: StorageLike | null = defaultStorage(),
): boolean {
  try {
    return storage?.getItem(SHAPE_INTRO_KEY) === "1";
  } catch {
    return true;
  }
}

export function markIntroSeen(
  storage: StorageLike | null = defaultStorage(),
): void {
  try {
    storage?.setItem(SHAPE_INTRO_KEY, "1");
  } catch {
    // 건너뛴다
  }
}
