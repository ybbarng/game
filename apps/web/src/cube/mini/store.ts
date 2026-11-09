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

/**
 * 한 판의 입력 출처(공정함 확인, 2026-11-09). 맥 앱이 키마다 출처를 판별해 넘긴다(`apps/cubie` `KeySource.swift`).
 * 막지는 않고 기록에 표시만 한다.
 * - `keyboard`: 실제 키보드만(하드웨어 입력 계층에서 온 키, 넣은 프로세스 없음)
 * - `synthetic`: 다른 프로그램이 넣은 키가 섞임(osascript·CGEventPost 등)
 * - `pointer`: 화면을 끌어 돌린 수가 섞임(마우스·트랙패드·화면 밀기)
 * - `unknown`: 출처를 모름(브라우저에서 열었거나 앱이 출처를 못 넘김)
 * 여럿이 섞이면 synthetic > pointer > unknown > keyboard 차례로 하나를 남긴다.
 * 칸 이름 `inputSource`는 미니 모드 기록에만 덧붙인다(혼자 맞추기 기록에 입력 방식 칸을 더하는 작업과 머지 뒤 합친다)
 */
export type InputSource = "keyboard" | "synthetic" | "pointer" | "unknown";

const SOURCE_RANK: Record<InputSource, number> = {
  keyboard: 0,
  unknown: 1,
  pointer: 2,
  synthetic: 3,
};

/** 한 판에 들어온 수들의 출처 → 그 판의 출처. 수가 없으면 unknown */
export function inputSourceOf(seen: Iterable<InputSource>): InputSource {
  let out: InputSource | null = null;
  for (const s of seen)
    if (out === null || SOURCE_RANK[s] > SOURCE_RANK[out]) out = s;
  return out ?? "unknown";
}

export const INPUT_SOURCE_LABEL: Record<InputSource, string> = {
  keyboard: "키보드",
  synthetic: "다른 프로그램 입력",
  pointer: "마우스·화면",
  unknown: "출처 모름",
};

/** 미니 모드 기록 한 판: 혼자 맞추기 기록 꼴에 입력 출처를 덧붙인다 */
export interface MiniRecord extends SolveRecord {
  inputSource?: InputSource;
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
    const records: Record<string, MiniRecord[]> = {};
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
): MiniRecord[] {
  return read(storage).records[String(n)] ?? [];
}

/** 기록을 더하고 그 크기의 새 목록을 돌려준다. 번호(`no`)는 크기마다 1부터 이어진다 */
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
