/**
 * 혼자 맞추기·블라인드 기록(docs/47 1·6절). 이 기기 localStorage에만 둔다. 크기·모드마다 최근 기록 목록.
 * 평균은 대회 규칙(WCA 9f): 5번·12번 평균은 가장 좋은 것과 가장 나쁜 것을 빼고 나머지의 평균,
 * 기권(DNF)은 가장 나쁜 것으로 치고 둘 이상이면 평균도 DNF.
 */

import { ao5, bestAo5 } from "./tiers/rank";

export type SolveMode = "solo" | "blind";

/**
 * 맞추는 동안 쓴 입력(2026-11-09, docs/47 14-4). 이 화면이 실제로 가를 수 있는 것만: 실물 키보드(`keyboard`), 화면
 * 키보드(`screenKeys`, 키 그림 누르기), 큐브를 밀어 돌리기(`swipe`, 손가락이나 마우스 끌기), 화면의 면 단추(`buttons`). 티어 보정에는 쓰지 않고 나중에 견줄 재료로 둔다
 */
export type SolveInput = "keyboard" | "screenKeys" | "swipe" | "buttons";

export const SOLVE_INPUTS: readonly SolveInput[] = [
  "keyboard",
  "screenKeys",
  "swipe",
  "buttons",
];

export interface SolveRecord {
  /** 끝난 시각(Date.now) */
  at: number;
  /**
   * 크기·모드마다 1부터 늘어나는 번호. 저장할 때 매긴다(목록이 상한에 닿아 옛것이 빠져도 이어진다).
   * 번호가 없던 옛 기록은 읽을 때 오래된 것부터 매긴다
   */
  no?: number;
  n: number;
  mode: SolveMode;
  /** 맞춘 시간(ms, 벌점 빼고). DNF면 null */
  ms: number | null;
  /** 살펴보기 벌점(ms, 0 또는 2000) */
  penalty: number;
  /** 면 돌린 수(큐브 돌리기 x·y·z는 빼고) */
  moves: number;
  /** 섞기 글(WCA 표기). 해법기가 바뀌면 같은 씨앗에서도 섞기가 달라질 수 있어 글을 그대로 남긴다 */
  scramble: string;
  /** 섞기를 만든 씨앗(있으면) */
  seed?: number;
  /** 블라인드: 외우기 시간(ms) */
  memoMs?: number;
  /** 다시 보기용: 수와 시각(맞추기 시작부터 ms). "R@120 U'@380" 꼴 */
  replay?: string;
  /**
   * 구간 기록(2026-11-05, docs/51 1-2): 이정표(`@game/cube-engine`의 `MILESTONES` id)를 처음 지난 시각(맞추기 시작부터
   * ms), 지난 차례대로. 다시 보기 글과 같은 꼴 "cross@3210 f2l1@8020". 이 칸이 없는 옛 기록도 그대로 읽힌다
   */
  splits?: string;
  /** 가장 긴 흐름 콤보(2026-11-05, docs/51 2-1). 4수 아래면 남기지 않는다 */
  combo?: number;
  /**
   * 오늘의 섞기로 기록한 시도면 그 날짜(한국 시각 "YYYY-MM-DD", 2026-11-05, docs/51 2-4). 연습은 기록에 넣지 않는다.
   * 날마다의 결과는 따로 `cube.daily.v1`(`daily.ts`)에도 둔다
   */
  daily?: string;
  /** 혼자 맞추기 「상황 알림」을 켰을 때 이번 판에서 만난 내 목록 상황 id(만난 차례, 2026-11-04) */
  myCases?: string[];
  /**
   * 입력 방식(2026-11-09): 섞은 뒤 맞추기 동안 수를 둔 입력, 처음 쓴 차례로. 칸이 없으면 알 수 없음(옛 기록·다른 화면)
   */
  inputs?: SolveInput[];
  /** 15초 살펴보기를 켠 판인지(2026-11-09). 칸이 없으면 알 수 없음 */
  inspection?: boolean;
}

export const RECORDS_KEY = "cube.records.v1";
/** 크기·모드마다 남기는 기록 수 */
export const MAX_RECORDS = 100;
/**
 * 다시 보기 글(`replay`)을 남기는 최근 기록 수(2026-11-09). 7×7 한 판은 수가 수백~천 개라 다시 보기 글이 10KB쯤 되어,
 * 100판 모두 남기면 크기마다 1MB 가까이 된다. localStorage는 이 사이트(모든 게임)가 함께 쓰는 5MB 안팎이라, 화면이
 * 다시 보기를 보이는 최근 30판만 남기고 그 뒤는 글을 지운다. 티어를 정한 5판은 `BEST_FIVE_KEY`에 수 목록까지 따로 둔다
 */
export const KEEP_REPLAYS = 30;
/** 크기마다 최고 Ao5를 낸 5판(수 목록 포함). 목록 상한에 밀려 빠져도 티어와 나중 확인 재료가 남게 */
export const BEST_FIVE_KEY = "cube.best5.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

type Book = Record<string, SolveRecord[]>;

const bookKey = (mode: SolveMode, n: number) => `${mode}-${n}`;

function readBook(storage: StorageLike | null): Book {
  try {
    const text = storage?.getItem(RECORDS_KEY);
    if (!text) return {};
    const data: unknown = JSON.parse(text);
    return typeof data === "object" && data !== null && !Array.isArray(data)
      ? (data as Book)
      : {};
  } catch {
    return {};
  }
}

/** 최근 기록(새것이 앞) */
export function loadRecords(
  mode: SolveMode,
  n: number,
  storage: StorageLike | null = defaultStorage(),
): SolveRecord[] {
  const list = readBook(storage)[bookKey(mode, n)];
  return Array.isArray(list) ? numbered(list.filter(isRecord)) : [];
}

/** 번호가 없는 기록에 번호를 매긴다(새것이 앞인 목록, 오래된 것부터 앞 번호에 이어서) */
function numbered(list: SolveRecord[]): SolveRecord[] {
  let last = 0;
  const out = [...list];
  for (let i = out.length - 1; i >= 0; i--) {
    const r = out[i] as SolveRecord;
    if (typeof r.no === "number" && r.no > last) last = r.no;
    else out[i] = { ...r, no: ++last };
  }
  return out;
}

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

/** 기록을 더하고 새 목록을 돌려준다. 저장을 못 해도 목록은 돌려준다 */
export function addRecord(
  record: SolveRecord,
  storage: StorageLike | null = defaultStorage(),
): SolveRecord[] {
  const book = readBook(storage);
  const key = bookKey(record.mode, record.n);
  const before = Array.isArray(book[key])
    ? numbered((book[key] as unknown[]).filter(isRecord))
    : [];
  const list = [{ ...record, no: (before[0]?.no ?? 0) + 1 }, ...before].slice(
    0,
    MAX_RECORDS,
  );
  if (record.mode === "solo") keepBestFive(record.n, list, storage);
  book[key] = withoutOldReplays(list, KEEP_REPLAYS);
  try {
    storage?.setItem(RECORDS_KEY, JSON.stringify(book));
  } catch {
    // 자리가 모자라면 다시 보기 글을 최근 5판만 남기고 한 번 더. 그래도 막혀도 이번 화면에서는 보인다
    try {
      for (const k of Object.keys(book))
        book[k] = withoutOldReplays(book[k] as SolveRecord[], 5);
      storage?.setItem(RECORDS_KEY, JSON.stringify(book));
    } catch {
      // 저장소가 막혔다
    }
  }
  return list;
}

/** 앞 `keep`판 뒤로는 다시 보기 글을 지운 목록(미니 모드 기록도 같은 규칙, `mini/store.ts`) */
export function withoutOldReplays<R extends SolveRecord>(
  list: readonly R[],
  keep: number,
): R[] {
  return list.map((r, i) => {
    if (i < keep || r.replay === undefined) return r;
    const { replay: _, ...rest } = r;
    return rest as R;
  });
}

function readBestFive(storage: StorageLike | null): Record<string, unknown> {
  try {
    const text = storage?.getItem(BEST_FIVE_KEY);
    const data: unknown = text ? JSON.parse(text) : {};
    return typeof data === "object" && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** 크기 `n` 혼자 맞추기에서 최고 Ao5를 낸 5판(새것이 앞). 없으면 빈 목록 */
export function loadBestFive(
  n: number,
  storage: StorageLike | null = defaultStorage(),
): SolveRecord[] {
  const list = readBestFive(storage)[String(n)];
  return Array.isArray(list) && list.length === 5 && list.every(isRecord)
    ? list
    : [];
}

/** 목록에 남겨 둔 것보다 좋은 Ao5가 있으면 그 5판을 남긴다(다시 보기 글 포함) */
function keepBestFive(
  n: number,
  list: readonly SolveRecord[],
  storage: StorageLike | null,
): void {
  const found = bestAo5(list);
  if (!found) return;
  const kept = loadBestFive(n, storage);
  const keptMs = kept.length === 5 ? ao5(kept) : null;
  if (keptMs !== null && keptMs <= found.ms) return;
  const all = readBestFive(storage);
  all[String(n)] = list.slice(found.at, found.at + 5);
  try {
    storage?.setItem(BEST_FIVE_KEY, JSON.stringify(all));
  } catch {
    // 저장소가 막혀도 티어는 목록에서 센다
  }
}

/** 기록 하나의 결과 시간(벌점 포함, DNF는 null) */
export function resultMs(
  r: Pick<SolveRecord, "ms" | "penalty">,
): number | null {
  return r.ms === null ? null : r.ms + r.penalty;
}

/**
 * 최근 `count`번 평균(새것이 앞인 목록). 기록이 모자라면 undefined, DNF면 null.
 * 3번 이하는 그냥 평균(mean), 그 위는 가장 좋은·나쁜 것을 하나씩 뺀다.
 */
export function averageOf(
  records: readonly Pick<SolveRecord, "ms" | "penalty">[],
  count: number,
): number | null | undefined {
  if (records.length < count) return undefined;
  const times = records.slice(0, count).map(resultMs);
  const dnf = times.filter((t) => t === null).length;
  const trim = count > 3 ? 1 : 0;
  if (dnf > trim) return null;
  const sorted = times
    .map((t) => (t === null ? Number.POSITIVE_INFINITY : t))
    .sort((a, b) => a - b);
  const kept = sorted.slice(trim, sorted.length - trim);
  return Math.round(kept.reduce((a, b) => a + b, 0) / kept.length);
}

/** 시간 글(초.백분의 일초, 1분 넘으면 분:초) */
export function formatMs(ms: number | null | undefined): string {
  if (ms === undefined) return "-";
  if (ms === null) return "DNF";
  const cs = Math.floor(ms / 10);
  const s = Math.floor(cs / 100);
  const frac = String(cs % 100).padStart(2, "0");
  if (s < 60) return `${s}.${frac}`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}.${frac}`;
}

export interface Split {
  /** 이정표 id */
  id: string;
  /** 맞추기 시작부터 ms */
  ms: number;
}

/** 구간 기록 → 저장 글 */
export function formatSplits(splits: readonly Split[]): string {
  return splits.map((s) => `${s.id}@${Math.round(s.ms)}`).join(" ");
}

/** 저장 글 → 구간 기록. 모르는 꼴·음수 시각은 건너뛰고, 같은 이정표는 처음 것만 */
export function parseSplits(text: unknown): Split[] {
  if (typeof text !== "string" || text === "") return [];
  const seen = new Set<string>();
  const out: Split[] = [];
  for (const part of text.split(" ")) {
    const m = /^([a-z0-9]+)@(\d+)$/.exec(part);
    if (!m || seen.has(m[1] as string)) continue;
    seen.add(m[1] as string);
    out.push({ id: m[1] as string, ms: Number(m[2]) });
  }
  return out;
}

/** 수와 시각(맞추기 시작부터 ms) → 다시 보기 글 "R@120 U'@380". 시각은 반올림한다 */
export function formatReplay(
  events: readonly { notation: string; t: number }[],
): string {
  return events.map((e) => `${e.notation}@${Math.round(e.t)}`).join(" ");
}

/** 다시 보기 글 → [표기, 시각] 목록 */
export function parseReplay(text: string | undefined): [string, number][] {
  if (!text) return [];
  return text
    .split(" ")
    .map((part) => {
      const [m, t] = part.split("@");
      return [m ?? "", Number(t)] as [string, number];
    })
    .filter(([m, t]) => m !== "" && Number.isFinite(t));
}
