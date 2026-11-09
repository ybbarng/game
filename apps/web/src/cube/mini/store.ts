import { averageOf, resultMs, type SolveRecord } from "../records";
import { ao5, bestAo5, type MyTier, myTier } from "../tiers/rank";

/**
 * 미니 모드(`/cube/mini`, 맥 앱 Cubie가 여는 작은 창, docs/47 15절)의 이 기기 저장.
 *
 * 기록은 혼자 맞추기 기록(`cube.records.v1`)과 따로 둔다. 미니 모드는 살펴보기 없이 첫 수부터 재고, 창이 포커스를
 * 잃은 동안은 시계를 멈춘다. 같은 목록에 섞으면 혼자 맞추기의 평균·구간 골드·개인 최고가 다른 규칙의 시간과 견주어진다.
 * 기록 칸의 꼴은 혼자 맞추기와 같아(`SolveRecord`, 입력 방식 `inputs`·살펴보기 `inspection` 포함) 평균·시간 글·티어
 * 함수를 그대로 쓴다.
 */

export const MINI_KEY = "cube.mini.v1";
/** 크기마다 남기는 기록 수(혼자 맞추기와 같다) */
export const MINI_MAX_RECORDS = 100;
/** 고를 수 있는 크기(사이트의 혼자 맞추기와 같다) */
export const MINI_SIZES = [2, 3, 4, 5, 6, 7] as const;
export const DEFAULT_MINI_SIZE = 3;

/**
 * 키를 넣은 곳(공정함 확인, 2026-11-09). 입력 방식(`SolveRecord.inputs`: 키보드·화면 키보드·밀기·단추)과 다른 결이다:
 * `inputs`의 `keyboard`는 「키 사건으로 수를 뒀다」까지이고, 그 키가 실제 키보드에서 왔는지 다른 프로그램이 넣었는지는
 * 브라우저가 알 수 없다(osascript로 넣은 키도 `isTrusted`가 참). 맥 앱이 키마다 운영체제의 출처 칸을 읽어 넘긴 것을
 * 한 판으로 모은다(`apps/cubie` `KeySource.swift`). 막지는 않고 기록에 표시만 한다.
 * - `hardware`: 이 판의 키가 모두 하드웨어 입력 계층에서 왔고 넣은 프로세스가 없음
 * - `synthetic`: 다른 프로그램이 넣은 키가 하나라도 섞임(CGEventPost 등)
 * - `unknown`: 출처를 모르는 키가 섞임(브라우저에서 열었거나 앱이 알리지 못함)
 * 키로 둔 수가 없으면 칸을 남기지 않는다. 여럿이면 synthetic > unknown > hardware.
 */
export type KeyOrigin = "hardware" | "synthetic" | "unknown";

const ORIGIN_RANK: Record<KeyOrigin, number> = {
  hardware: 0,
  unknown: 1,
  synthetic: 2,
};

/** 한 판에 들어온 키들의 출처 → 그 판의 출처. 키가 없으면 undefined */
export function keyOriginOf(seen: Iterable<KeyOrigin>): KeyOrigin | undefined {
  let out: KeyOrigin | undefined;
  for (const s of seen)
    if (out === undefined || ORIGIN_RANK[s] > ORIGIN_RANK[out]) out = s;
  return out;
}

/** 미니 모드 기록 한 판: 혼자 맞추기 기록 꼴에 키 출처를 덧붙인다 */
export interface MiniRecord extends SolveRecord {
  keyOrigin?: KeyOrigin;
}

export interface MiniPrefs {
  n: number;
  /** 거울 판(뒤·왼쪽·아래 면 비추기). 끄면 끌어 돌려 본다 */
  mirror: boolean;
}

interface MiniBook extends MiniPrefs {
  version: 1;
  /** 크기("3" 등)마다 최근 기록(새것이 앞) */
  records: Record<string, MiniRecord[]>;
  /**
   * 크기마다 최고 Ao5를 낸 5판(혼자 맞추기의 `cube.best5.v1`과 같은 뜻). 목록 상한(100판)에 밀려도 티어가 떨어지지 않게
   */
  best5: Record<string, MiniRecord[]>;
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

function isRecord(r: unknown): r is MiniRecord {
  if (typeof r !== "object" || r === null) return false;
  const x = r as Partial<SolveRecord>;
  return (
    typeof x.at === "number" &&
    typeof x.n === "number" &&
    (x.ms === null || typeof x.ms === "number") &&
    typeof x.moves === "number"
  );
}

function lists(v: unknown): Record<string, MiniRecord[]> {
  const out: Record<string, MiniRecord[]> = {};
  if (v && typeof v === "object")
    for (const [k, list] of Object.entries(v))
      if (Array.isArray(list)) out[k] = list.filter(isRecord);
  return out;
}

function read(storage: StorageLike | null): MiniBook {
  const empty: MiniBook = {
    version: 1,
    n: DEFAULT_MINI_SIZE,
    mirror: true,
    records: {},
    best5: {},
  };
  try {
    const text = storage?.getItem(MINI_KEY);
    if (!text) return empty;
    const data = JSON.parse(text) as Partial<MiniBook> | null;
    if (typeof data !== "object" || data === null || Array.isArray(data))
      return empty;
    return {
      version: 1,
      n: isSize(data.n) ? data.n : DEFAULT_MINI_SIZE,
      mirror: typeof data.mirror === "boolean" ? data.mirror : true,
      records: lists(data.records),
      best5: lists(data.best5),
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
): MiniRecord[] {
  return read(storage).records[String(n)] ?? [];
}

/** 그 크기의 최고 Ao5 5판(없으면 빈 목록) */
export function loadMiniBestFive(
  n: number,
  storage: StorageLike | null = defaultStorage(),
): MiniRecord[] {
  return read(storage).best5[String(n)] ?? [];
}

/**
 * 기록을 더하고 그 크기의 새 목록을 돌려준다. 번호(`no`)는 크기마다 1부터 이어진다.
 * 새 목록에서 더 좋은 Ao5가 나오면 그 5판을 `best5`에 남긴다
 */
export function addMiniRecord(
  record: MiniRecord,
  storage: StorageLike | null = defaultStorage(),
): MiniRecord[] {
  const b = read(storage);
  const key = String(record.n);
  const before = b.records[key] ?? [];
  const list = [{ ...record, no: (before[0]?.no ?? 0) + 1 }, ...before].slice(
    0,
    MINI_MAX_RECORDS,
  );
  const best5 = { ...b.best5 };
  const found = bestAo5(list);
  const kept = best5[key];
  const keptMs = kept?.length === 5 ? ao5(kept) : null;
  if (found && (keptMs === null || found.ms < keptMs))
    best5[key] = list.slice(found.at, found.at + 5);
  write(storage, { ...b, records: { ...b.records, [key]: list }, best5 });
  return list;
}

/** Cubie 기록으로 매긴 그 크기의 최고 티어(혼자 맞추기와 같은 Ao5 규칙, 기록은 미니 모드 것). 없으면 null */
export function miniTier(
  n: number,
  storage: StorageLike | null = defaultStorage(),
): MyTier | null {
  return myTier(n, loadMiniRecords(n, storage), loadMiniBestFive(n, storage));
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

export function summarize(records: readonly MiniRecord[]): MiniSummary {
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
