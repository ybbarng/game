// 오늘의 섞기(docs/51 2-4, docs/47 8-9). 화면을 모르는 순수 함수와 이 기기 저장.
//
// - 날짜는 한국 시각(UTC+9) 자정에 바뀐다. 씨앗은 날짜와 크기로만 정해 서버 없이 모두가 같은 섞기를 받는다
//   (섞기는 `scrambleInWorker(event, seed)`, 2×2·3×3은 대회 규칙의 무작위 상태).
// - 하루에 기록되는 시도는 크기마다 한 번이다. 섞기를 받는 순간 「시작함」으로 적어 두고, 다 맞추지 않고 떠나면 DNF로 친다.
//   그 뒤로 같은 날 다시 받는 섞기는 「연습」이라 어디에도 남기지 않는다. 막는 것은 이 기기 안에서만이다(서버가 없고,
//   IP·기기 식별자로 1인 1회를 막지 않는다).
// - 순위표는 두지 않는다(서버에 기록을 모으지 않는다). 친구끼리는 공유 글로 견준다. 공유 글에 섞기는 넣지 않는다.

import { milestoneLabel } from "@game/cube-engine";
import type { ScrambleEvent } from "@game/cube-scramble";

import { segmentsOf } from "./progress/gold";
import { groupSplits } from "./progress/splits";
import {
  formatMs,
  parseSplits,
  resultMs,
  type SolveRecord,
  type Split,
} from "./records";

/** 고를 수 있는 크기(앞이 기본) */
export const DAILY_SIZES = [3, 2, 4] as const;
export const DAILY_KEY = "cube.daily.v1";
/** 남기는 날 수(크기마다 하나씩이라 넉넉히) */
export const MAX_DAILY = 400;
export const DAILY_URL = "https://game.byb.kr/cube/daily";

const KST_OFFSET_MS = 9 * 3_600_000;
const DAY_MS = 86_400_000;

/** 한국 시각의 날짜 "YYYY-MM-DD" */
export function kstDate(now: number): string {
  return new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 하루 앞 날짜 */
export function prevDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** "2026-11-05" → "11/05" */
export function shortDate(date: string): string {
  return `${date.slice(5, 7)}/${date.slice(8, 10)}`;
}

/** 날짜·크기의 씨앗(FNV-1a 32비트). 모든 기기가 같은 값을 낸다 */
export function dailySeed(date: string, n: number): number {
  let h = 0x811c9dc5;
  for (const ch of `cube-daily:${date}:${n}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function dailyEvent(n: number): ScrambleEvent {
  return `${n}${n}${n}` as ScrambleEvent;
}

export interface DailyEntry {
  /** 한국 시각 날짜 */
  date: string;
  n: number;
  seed: number;
  /** 받은 섞기(이 기기 안에만, 공유 글에는 넣지 않는다) */
  scramble: string;
  /** 섞기를 받은 시각 */
  startedAt: number;
  /** started: 섞기를 받았고 아직 끝나지 않음(화면을 떠났으면 DNF로 본다) · done: 끝남 */
  status: "started" | "done";
  /** 끝난 시각 */
  at?: number;
  /** 맞춘 시간(ms, 벌점 빼고). DNF면 null */
  ms: number | null;
  penalty: number;
  moves: number;
  /** 구간 기록(`records.ts`의 `formatSplits` 꼴) */
  splits?: string;
  combo?: number;
  /**
   * 구간마다 내 평균과 견준 표시(🟩🟨🟥⬜, 칩 차례). 끝난 순간의 평균으로 정해 남긴다(뒤에 기록이 늘어도 그날 공유 글이
   * 바뀌지 않게)
   */
  marks?: string;
  dnfReason?: "inspection" | "unsolved" | "left";
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function isEntry(x: unknown): x is DailyEntry {
  if (typeof x !== "object" || x === null) return false;
  const e = x as Partial<DailyEntry>;
  return (
    typeof e.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(e.date) &&
    typeof e.n === "number" &&
    (e.status === "started" || e.status === "done") &&
    (e.ms === null || typeof e.ms === "number") &&
    typeof e.startedAt === "number"
  );
}

/** 새 날이 앞, 같은 날은 작은 크기가 앞 */
function sorted(list: DailyEntry[]): DailyEntry[] {
  return [...list].sort((a, b) =>
    a.date === b.date ? a.n - b.n : a.date < b.date ? 1 : -1,
  );
}

/** 저장된 오늘의 섞기 기록(새 날이 앞). 깨진 칸·모르는 꼴은 건너뛴다 */
export function loadDaily(
  storage: StorageLike | null = defaultStorage(),
): DailyEntry[] {
  try {
    const text = storage?.getItem(DAILY_KEY);
    if (!text) return [];
    const data = JSON.parse(text) as { entries?: unknown };
    if (!data || !Array.isArray(data.entries)) return [];
    const seen = new Set<string>();
    const out: DailyEntry[] = [];
    for (const e of data.entries) {
      if (!isEntry(e)) continue;
      const key = `${e.date}:${e.n}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
    }
    return sorted(out);
  } catch {
    return [];
  }
}

function save(list: DailyEntry[], storage: StorageLike | null): DailyEntry[] {
  const out = sorted(list).slice(0, MAX_DAILY);
  try {
    storage?.setItem(DAILY_KEY, JSON.stringify({ version: 1, entries: out }));
  } catch {
    // 저장소가 막혀도 이번 화면에서는 보인다
  }
  return out;
}

export function dailyEntry(
  list: readonly DailyEntry[],
  date: string,
  n: number,
): DailyEntry | undefined {
  return list.find((e) => e.date === date && e.n === n);
}

/**
 * 오늘의 섞기를 받았다. 그날 그 크기의 기록이 없으면 「시작함」을 적고 "official", 이미 있으면 "practice"(아무것도 적지
 * 않는다). 섞기를 받는 순간 적어 두어, 섞기를 본 뒤 새로 고쳐 다시 받는 것도 연습이 된다
 */
export function beginDaily(
  start: {
    date: string;
    n: number;
    seed: number;
    scramble: string;
    now: number;
  },
  storage: StorageLike | null = defaultStorage(),
): { kind: "official" | "practice"; entries: DailyEntry[] } {
  const list = loadDaily(storage);
  if (dailyEntry(list, start.date, start.n))
    return { kind: "practice", entries: list };
  const entry: DailyEntry = {
    date: start.date,
    n: start.n,
    seed: start.seed,
    scramble: start.scramble,
    startedAt: start.now,
    status: "started",
    ms: null,
    penalty: 0,
    moves: 0,
  };
  return { kind: "official", entries: save([entry, ...list], storage) };
}

/** 그날의 시도가 끝났다. 「시작함」인 기록만 채운다(이미 끝난 기록은 그대로) */
export function finishDaily(
  date: string,
  record: Pick<
    SolveRecord,
    "n" | "at" | "ms" | "penalty" | "moves" | "splits" | "combo"
  > & { dnfReason?: DailyEntry["dnfReason"]; marks?: string },
  storage: StorageLike | null = defaultStorage(),
): DailyEntry[] {
  const list = loadDaily(storage);
  const old = dailyEntry(list, date, record.n);
  if (old?.status !== "started") return list;
  const done: DailyEntry = {
    ...old,
    status: "done",
    at: record.at,
    ms: record.ms,
    penalty: record.penalty,
    moves: record.moves,
    ...(record.splits ? { splits: record.splits } : {}),
    ...(record.combo ? { combo: record.combo } : {}),
    ...(record.ms !== null && record.marks ? { marks: record.marks } : {}),
    ...(record.ms === null
      ? { dnfReason: record.dnfReason ?? "unsolved" }
      : {}),
  };
  return save([done, ...list.filter((e) => e !== old)], storage);
}

/** 결과 시간(벌점 포함). DNF·끝내지 않고 떠난 시도는 null */
export function entryMs(e: DailyEntry): number | null {
  return e.status === "done" ? resultMs(e) : null;
}

/**
 * 연속 일수: 맞춘(DNF가 아닌) 오늘의 섞기가 있는 날이 하루도 빠짐없이 이어진 수. 크기는 어느 것이든 하루로 센다.
 * 오늘 아직 안 했으면 어제까지 센다(오늘 하면 이어진다)
 */
export function dailyStreak(
  list: readonly DailyEntry[],
  today: string,
): number {
  const solved = new Set(
    list.filter((e) => entryMs(e) !== null).map((e) => e.date),
  );
  let day = solved.has(today) ? today : prevDate(today);
  let count = 0;
  while (solved.has(day)) {
    count++;
    day = prevDate(day);
  }
  return count;
}

/** 옛 기록들의 구간(`segmentsOf`)마다 평균 길이 */
export function segmentAverages(
  records: readonly Pick<SolveRecord, "splits">[],
): Map<string, number> {
  const sum = new Map<string, [number, number]>();
  for (const r of records) {
    if (!r.splits) continue;
    for (const s of segmentsOf(parseSplits(r.splits))) {
      const [t, c] = sum.get(s.key) ?? [0, 0];
      sum.set(s.key, [t + s.lap, c + 1]);
    }
  }
  return new Map([...sum].map(([k, [t, c]]) => [k, t / c]));
}

/** 내 평균보다 이만큼 빠르면 🟩, 이만큼 느린 데까지 🟨, 그보다 느리면 🟥 */
export const SIMILAR = 0.05;

export type SegmentMark = "fast" | "same" | "slow" | "new";

export const MARK_EMOJI: Record<SegmentMark, string> = {
  fast: "🟩",
  same: "🟨",
  slow: "🟥",
  new: "⬜",
};

/** 구간마다 평균과 견준 표시(칩 차례). 견줄 평균이 없으면 "new" */
export function segmentMarks(
  splits: readonly Split[],
  averages: ReadonlyMap<string, number>,
): { label: string; mark: SegmentMark }[] {
  const groups = groupSplits(splits);
  return segmentsOf(splits).map((s, i) => {
    const avg = averages.get(s.key);
    const mark: SegmentMark =
      avg === undefined
        ? "new"
        : s.lap < avg * (1 - SIMILAR)
          ? "fast"
          : s.lap <= avg * (1 + SIMILAR)
            ? "same"
            : "slow";
    return { label: milestoneLabel(groups[i]?.main ?? ""), mark };
  });
}

/** 구간 표시를 글로(🟩🟨🟥⬜) */
export function markString(
  splits: readonly Split[],
  averages: ReadonlyMap<string, number>,
): string {
  return segmentMarks(splits, averages)
    .map((m) => MARK_EMOJI[m.mark])
    .join("");
}

/**
 * 공유 글. 날짜·크기·시간·구간 칩 모양·단계 이름만 담고 섞기는 넣지 않는다(아직 안 푼 친구가 보게 되므로).
 *   큐브 맞추기 오늘의 섞기 11/05 3×3
 *   42.10초 🟩🟩🟨🟩
 *   십자 · 둘째 층 · 윗면 · 윗층
 *   https://game.byb.kr/cube/daily
 */
export function shareText(entry: DailyEntry): string {
  const ms = entryMs(entry);
  const time =
    ms === null ? "DNF" : `${formatMs(ms)}초${entry.penalty > 0 ? "(+2)" : ""}`;
  const labels =
    ms === null
      ? []
      : groupSplits(parseSplits(entry.splits)).map((g) =>
          milestoneLabel(g.main),
        );
  const lines = [
    `큐브 맞추기 오늘의 섞기 ${shortDate(entry.date)} ${entry.n}×${entry.n}`,
    [time, ms === null ? "" : (entry.marks ?? "")].filter(Boolean).join(" "),
  ];
  if (labels.length > 0) lines.push(labels.join(" · "));
  lines.push(DAILY_URL);
  return lines.join("\n");
}
