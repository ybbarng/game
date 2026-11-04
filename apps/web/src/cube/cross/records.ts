import type { CrossFail, CrossRecord } from "./session";

/**
 * 십자 훈련 기록(docs/47 8절). 이 기기 localStorage에만 둔다. 새것이 앞인 목록 하나에 조건 열쇠(`cond`)를 붙여
 * 두고, 조건별 통계는 읽을 때 낸다. 모양이 틀린 줄은 읽을 때 버린다(혼자 맞추기 기록과 같은 방식).
 */

export const CROSS_RECORDS_KEY = "cube.cross.v1";
/** 남기는 기록 수(모든 조건 합쳐서) */
export const MAX_CROSS_RECORDS = 300;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

const FAILS: readonly CrossFail[] = [
  "over",
  "unsolved",
  "inspection",
  "gaveUp",
];

const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

export function isCrossRecord(r: unknown): r is CrossRecord {
  if (typeof r !== "object" || r === null) return false;
  const x = r as Partial<CrossRecord>;
  return (
    isNum(x.at) &&
    typeof x.cond === "string" &&
    x.cond.length < 100 &&
    typeof x.ok === "boolean" &&
    (x.reason === undefined || FAILS.includes(x.reason)) &&
    isNum(x.moves) &&
    isNum(x.optimal) &&
    x.optimal <= 8 &&
    isNum(x.solveMs) &&
    isNum(x.inspectMs) &&
    (x.penalty === 0 || x.penalty === 2_000) &&
    typeof x.scramble === "string" &&
    x.scramble.length < 200
  );
}

/** 기록(새것이 앞) */
export function loadCrossRecords(
  storage: StorageLike | null = defaultStorage(),
): CrossRecord[] {
  try {
    const text = storage?.getItem(CROSS_RECORDS_KEY);
    if (!text) return [];
    const data: unknown = JSON.parse(text);
    const list =
      typeof data === "object" && data !== null && "records" in data
        ? (data as { records: unknown }).records
        : null;
    return Array.isArray(list)
      ? list.filter(isCrossRecord).slice(0, MAX_CROSS_RECORDS)
      : [];
  } catch {
    return [];
  }
}

/** 기록을 더하고 새 목록을 돌려준다. 저장을 못 해도 목록은 돌려준다 */
export function addCrossRecord(
  record: CrossRecord,
  storage: StorageLike | null = defaultStorage(),
): CrossRecord[] {
  const list = [record, ...loadCrossRecords(storage)].slice(
    0,
    MAX_CROSS_RECORDS,
  );
  try {
    storage?.setItem(
      CROSS_RECORDS_KEY,
      JSON.stringify({ version: 1, records: list }),
    );
  } catch {
    // 저장소가 막혀도 이번 화면에서는 보인다
  }
  return list;
}

export interface CrossStats {
  count: number;
  /** 성공률(0~1). 기록이 없으면 null */
  successRate: number | null;
  /** 성공한 판의 평균 (내 수 − 최적 수). 없으면 null */
  avgExtra: number | null;
  /** 평균 살펴보기 사용 시간(ms, 시작한 판만). 없으면 null */
  avgInspectMs: number | null;
}

const mean = (xs: number[]) =>
  xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;

/** 한 조건의 통계 */
export function crossStats(
  records: readonly CrossRecord[],
  cond: string,
): CrossStats {
  const mine = records.filter((r) => r.cond === cond);
  const ok = mine.filter((r) => r.ok);
  return {
    count: mine.length,
    successRate: mine.length === 0 ? null : ok.length / mine.length,
    avgExtra: mean(ok.map((r) => r.moves - r.optimal)),
    avgInspectMs: mean(
      mine.filter((r) => r.reason !== "inspection").map((r) => r.inspectMs),
    ),
  };
}
