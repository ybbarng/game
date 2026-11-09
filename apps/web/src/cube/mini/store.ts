import { averageOf, resultMs, type SolveRecord } from "../records";

/**
 * 미니 모드(`/cube/mini`, 맥 앱 Cubie가 여는 작은 창, docs/47 14절)의 이 기기 저장.
 *
 * 기록은 혼자 맞추기 기록(`cube.records.v1`)과 따로 둔다. 미니 모드는 살펴보기 없이 첫 수부터 재고, 창이 포커스를
 * 잃은 동안은 시계를 멈춘다. 같은 목록에 섞으면 혼자 맞추기의 평균·구간 골드·개인 최고가 다른 규칙의 시간과 견주어진다.
 * 기록 칸의 꼴은 혼자 맞추기와 같아(`SolveRecord`) 평균·시간 글 함수를 그대로 쓴다.
 */

export const MINI_KEY = "cube.mini.v1";
/** 크기마다 남기는 기록 수(혼자 맞추기와 같다) */
export const MINI_MAX_RECORDS = 100;
/** 고를 수 있는 크기(사이트의 혼자 맞추기와 같다) */
export const MINI_SIZES = [2, 3, 4, 5, 6, 7] as const;
export const DEFAULT_MINI_SIZE = 3;

export interface MiniPrefs {
  n: number;
  /** 거울 판(뒤·왼쪽·아래 면 비추기). 끄면 끌어 돌려 본다 */
  mirror: boolean;
}

interface MiniBook extends MiniPrefs {
  version: 1;
  /** 크기("3" 등)마다 최근 기록(새것이 앞) */
  records: Record<string, SolveRecord[]>;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

const isSize = (v: unknown): v is number =>
  typeof v === "number" && (MINI_SIZES as readonly number[]).includes(v);

function isRecord(r: unknown): r is SolveRecord {
  if (typeof r !== "object" || r === null) return false;
  const x = r as Partial<SolveRecord>;
  return (
    typeof x.at === "number" &&
    typeof x.n === "number" &&
    (x.ms === null || typeof x.ms === "number") &&
    typeof x.moves === "number"
  );
}

function read(storage: StorageLike | null): MiniBook {
  const empty: MiniBook = {
    version: 1,
    n: DEFAULT_MINI_SIZE,
    mirror: true,
    records: {},
  };
  try {
    const text = storage?.getItem(MINI_KEY);
    if (!text) return empty;
    const data = JSON.parse(text) as Partial<MiniBook> | null;
    if (typeof data !== "object" || data === null || Array.isArray(data))
      return empty;
    const records: Record<string, SolveRecord[]> = {};
    if (data.records && typeof data.records === "object")
      for (const [k, list] of Object.entries(data.records))
        if (Array.isArray(list)) records[k] = list.filter(isRecord);
    return {
      version: 1,
      n: isSize(data.n) ? data.n : DEFAULT_MINI_SIZE,
      mirror: typeof data.mirror === "boolean" ? data.mirror : true,
      records,
    };
  } catch {
    return empty;
  }
}

function write(storage: StorageLike | null, book: MiniBook): void {
  try {
    storage?.setItem(MINI_KEY, JSON.stringify(book));
  } catch {
    // 저장소가 막혀도 이번 화면에서는 그대로 돈다
  }
}

export function loadMiniPrefs(
  storage: StorageLike | null = defaultStorage(),
): MiniPrefs {
  const b = read(storage);
  return { n: b.n, mirror: b.mirror };
}

export function saveMiniPrefs(
  prefs: MiniPrefs,
  storage: StorageLike | null = defaultStorage(),
): void {
  const b = read(storage);
  write(storage, {
    ...b,
    n: isSize(prefs.n) ? prefs.n : b.n,
    mirror: prefs.mirror,
  });
}

/** 그 크기의 최근 기록(새것이 앞) */
export function loadMiniRecords(
  n: number,
  storage: StorageLike | null = defaultStorage(),
): SolveRecord[] {
  return read(storage).records[String(n)] ?? [];
}

/** 기록을 더하고 그 크기의 새 목록을 돌려준다. 번호(`no`)는 크기마다 1부터 이어진다 */
export function addMiniRecord(
  record: SolveRecord,
  storage: StorageLike | null = defaultStorage(),
): SolveRecord[] {
  const b = read(storage);
  const key = String(record.n);
  const before = b.records[key] ?? [];
  const list = [{ ...record, no: (before[0]?.no ?? 0) + 1 }, ...before].slice(
    0,
    MINI_MAX_RECORDS,
  );
  write(storage, { ...b, records: { ...b.records, [key]: list } });
  return list;
}

export interface MiniSummary {
  count: number;
  /** 가장 빠른 시간(ms). 기록이 없으면 null */
  best: number | null;
  /** 모든 기록의 평균(ms) */
  mean: number | null;
  /** 5번·12번 평균(대회 규칙, 모자라면 undefined) */
  ao5: number | null | undefined;
  ao12: number | null | undefined;
}

export function summarize(records: readonly SolveRecord[]): MiniSummary {
  const times = records.map(resultMs).filter((t): t is number => t !== null);
  return {
    count: records.length,
    best: times.length ? Math.min(...times) : null,
    mean: times.length
      ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
      : null,
    ao5: averageOf(records, 5),
    ao12: averageOf(records, 12),
  };
}
