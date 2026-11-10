// 내 공식(이 기기 localStorage). 상황마다 내가 넣은 공식 여러 개와 「쓰는 공식」 하나를 둔다.
// 넣을 때·가져올 때 모두 검사기(checkAlg)를 거쳐 그 상황의 역할에 맞는 것만 남긴다.
import { ALG_SETS, type AlgSetInfo } from "../learn/alg-sets";
import type { AlgCase } from "../learn/types";
import { candidatesOf } from "./candidates";
import { caseById, checkAlg, MAX_ALG_LENGTH, shortName } from "./check";
import type { HabitState } from "./habit";
import { tidyAlg } from "./transform";

export const ALGS_KEY = "cube.algs.v1";

export interface CaseAlgs {
  /** 내가 넣은 공식(넣은 차례) */
  mine: string[];
  /** 쓰는 공식. 없으면 자료의 대표 공식 */
  use?: string;
  /** 버릇 상태(2026-11-04). 없으면 「안 정함」, 들이는 중·익숙함은 내 훈련 목록에 든다 */
  habit?: HabitState;
}

const HABITS: readonly HabitState[] = ["learning", "known"];
const isHabit = (v: unknown): v is HabitState =>
  HABITS.includes(v as HabitState);

export type AlgBook = Record<string, CaseAlgs>;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * 겉모양만 맞춘다(문자열 배열·문자열). 공식 내용 검사는 넣을 때 했다.
 * 자료에 없는 상황 id(자료에서 id를 바꾸거나 지웠을 때)도 버리지 않고 남겨 둔다: 저장할 때도 그대로 쓰고,
 * 화면은 「모르는 상황」으로 알려 내보내기로 꺼낼 수 있게 한다
 */
function sanitize(data: unknown): AlgBook {
  const out: AlgBook = {};
  if (typeof data !== "object" || data === null || Array.isArray(data))
    return out;
  for (const [id, v] of Object.entries(data)) {
    if (typeof v !== "object" || v === null) continue;
    const raw = v as { mine?: unknown; use?: unknown; habit?: unknown };
    const mine = Array.isArray(raw.mine)
      ? raw.mine.filter((x): x is string => typeof x === "string")
      : [];
    const entry: CaseAlgs = { mine };
    if (typeof raw.use === "string") entry.use = raw.use;
    if (isHabit(raw.habit)) entry.habit = raw.habit;
    out[id] = entry;
  }
  return out;
}

export function loadAlgBook(
  storage: StorageLike | null = defaultStorage(),
): AlgBook {
  return readStored(storage) ?? {};
}

/** 저장소의 지금 값. 저장소가 없거나 읽지 못하면 null */
function readStored(storage: StorageLike | null): AlgBook | null {
  if (!storage) return null;
  try {
    const text = storage.getItem(ALGS_KEY);
    return text ? sanitize(JSON.parse(text)) : {};
  } catch {
    return null;
  }
}

/** 남길 것이 있는 칸인가(내 공식·쓰는 공식·버릇 중 하나) */
const kept = (v: CaseAlgs) => v.mine.length > 0 || !!v.use || !!v.habit;

/** 자료에 없는 상황 id(내 공식이나 쓰는 공식이 남아 있는 것만) */
export function unknownCaseIds(book: AlgBook): string[] {
  return Object.entries(book)
    .filter(([id, v]) => !caseById(id) && kept(v))
    .map(([id]) => id);
}

export function saveAlgBook(
  book: AlgBook,
  storage: StorageLike | null = defaultStorage(),
): void {
  try {
    storage?.setItem(ALGS_KEY, JSON.stringify(book));
  } catch {
    // 저장소가 막혔으면 이번 변경만 잃는다
  }
}

const sameEntry = (a: CaseAlgs | undefined, b: CaseAlgs | undefined) =>
  a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * prev에서 next로 바뀐 상황만 저장소의 지금 값 위에 덮어 쓰고, 합친 것을 돌려준다.
 * 다른 탭(훈련·공식 모음)이 그사이 저장한 다른 상황은 그대로 남는다. 같은 상황은 나중 저장이 이긴다.
 * 저장소를 못 읽으면 next를 그대로 저장한다
 */
export function commitAlgBook(
  prev: AlgBook,
  next: AlgBook,
  storage: StorageLike | null = defaultStorage(),
): AlgBook {
  const stored = readStored(storage);
  if (stored === null) {
    saveAlgBook(next, storage);
    return next;
  }
  const merged: AlgBook = { ...stored };
  for (const id of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    if (sameEntry(prev[id], next[id])) continue;
    const v = next[id];
    if (v) merged[id] = v;
    else delete merged[id];
  }
  saveAlgBook(merged, storage);
  return merged;
}

type EventTargetLike = Pick<
  EventTarget,
  "addEventListener" | "removeEventListener"
>;

/**
 * 다른 탭이 내 공식을 저장하면 다시 읽어 알려 준다(`storage` 이벤트). 끄는 함수를 돌려준다
 */
export function watchAlgBook(
  onChange: (book: AlgBook) => void,
  target: EventTargetLike | null = typeof window === "undefined"
    ? null
    : window,
  storage: StorageLike | null = defaultStorage(),
): () => void {
  if (!target) return () => {};
  const listener = (e: Event) => {
    const key = (e as StorageEvent).key;
    // key가 null이면 저장소를 통째로 비웠다
    if (key === ALGS_KEY || key === null) onChange(loadAlgBook(storage));
  };
  target.addEventListener("storage", listener);
  return () => target.removeEventListener("storage", listener);
}

/** 상황의 공식 목록: 자료(대표·대안) 다음에 내 공식 */
export function algsOf(
  book: AlgBook,
  c: AlgCase,
): { alg: string; kind: "main" | "alt" | "mine" }[] {
  return [
    ...c.algs.map((alg, i) => ({
      alg,
      kind: i === 0 ? ("main" as const) : ("alt" as const),
    })),
    ...(book[c.id]?.mine ?? [])
      .filter((a) => !c.algs.includes(a))
      .map((alg) => ({ alg, kind: "mine" as const })),
  ];
}

/** 쓸 수 있는 공식인가: 자료(대표·대안)·내 공식·추천 후보 중 하나 */
export function knownAlg(book: AlgBook, c: AlgCase, alg: string): boolean {
  return (
    algsOf(book, c).some((x) => x.alg === alg) ||
    candidatesOf(c).some((x) => x.alg === alg)
  );
}

/** 쓰는 공식. 고른 공식이 목록에 없으면(지웠으면) 대표 공식 */
export function usedAlg(book: AlgBook, c: AlgCase): string {
  const use = book[c.id]?.use;
  if (use && knownAlg(book, c, use)) return use;
  return c.algs[0] as string;
}

/** 쓰는 공식이 배우기에서 보이는 대표 공식과 다른가 */
export function differsFromLesson(book: AlgBook, c: AlgCase): boolean {
  return usedAlg(book, c) !== c.algs[0];
}

/** 버릇 상태. 없으면 undefined(안 정함) */
export function habitOf(book: AlgBook, c: AlgCase): HabitState | undefined {
  return book[c.id]?.habit;
}

/** 버릇 상태 바꾸기. undefined면 「안 정함」으로 */
export function setHabit(
  book: AlgBook,
  c: AlgCase,
  habit: HabitState | undefined,
): AlgBook {
  const entry = book[c.id] ?? { mine: [] };
  const next: CaseAlgs = { ...entry };
  if (habit) next.habit = habit;
  else delete next.habit;
  return { ...book, [c.id]: next };
}

/** 내 훈련 목록: 버릇 상태가 있는 상황(자료에 있는 것만, 묶음 차례) */
export function habitList(book: AlgBook): { c: AlgCase; state: HabitState }[] {
  const out: { c: AlgCase; state: HabitState }[] = [];
  for (const s of ALG_SETS)
    for (const c of s.cases) {
      const state = book[c.id]?.habit;
      if (state) out.push({ c, state });
    }
  return out;
}

/** 상황마다 내 공식 개수 상한 */
export const MAX_MINE_PER_CASE = 20;
const FULL_MESSAGE = `상황마다 ${MAX_MINE_PER_CASE}개까지`;

export type AddResult =
  | { ok: true; book: AlgBook; alg: string; message: string }
  | { ok: false; book: AlgBook; message: string };

/** 검사해서 맞으면 내 공식에 넣는다(앞 윗면 돌리기가 필요하면 붙여 넣는다). 이미 있으면 그대로 */
export function addMine(
  book: AlgBook,
  c: AlgCase,
  input: string,
  opts: { findOther?: boolean } = {},
): AddResult {
  const r = checkAlg(c, input, opts);
  if (!r.ok) return { ok: false, book, message: r.message };
  const alg = r.text;
  const entry = book[c.id] ?? { mine: [] };
  if (algsOf(book, c).some((x) => x.alg === alg))
    return { ok: true, book, alg, message: "이미 있음" };
  if (entry.mine.length >= MAX_MINE_PER_CASE)
    return { ok: false, book, message: FULL_MESSAGE };
  return {
    ok: true,
    alg,
    message: r.message,
    book: { ...book, [c.id]: { ...entry, mine: [...entry.mine, alg] } },
  };
}

export function removeMine(book: AlgBook, c: AlgCase, alg: string): AlgBook {
  const entry = book[c.id];
  if (!entry) return book;
  const next: CaseAlgs = { mine: entry.mine.filter((a) => a !== alg) };
  if (entry.use && entry.use !== alg) next.use = entry.use;
  if (entry.habit) next.habit = entry.habit;
  return { ...book, [c.id]: next };
}

/** 쓰는 공식 고르기. 대표 공식을 고르면 기본값으로 돌린다 */
export function setUsed(book: AlgBook, c: AlgCase, alg: string): AlgBook {
  const entry = book[c.id] ?? { mine: [] };
  const next: CaseAlgs = { mine: entry.mine };
  if (alg !== c.algs[0]) next.use = alg;
  if (entry.habit) next.habit = entry.habit;
  return { ...book, [c.id]: next };
}

// ── 내보내기·가져오기 ─────────────────────────────────────

const FORMAT = "cube-algs";

export function exportAlgBook(book: AlgBook): string {
  const cases: AlgBook = {};
  for (const [id, v] of Object.entries(book)) if (kept(v)) cases[id] = v;
  return JSON.stringify({ format: FORMAT, version: 1, cases }, null, 2);
}

/** 가져올 파일 크기 상한(글자 수, 1MB쯤). 넘으면 읽지 않는다 */
export const MAX_IMPORT_BYTES = 1_000_000;
/** 한 번에 가져올 공식 수 상한. 넘는 것은 검사하지 않고 뺀다 */
export const MAX_IMPORT_ALGS = 1000;

export interface ImportResult {
  book: AlgBook;
  added: number;
  rejected: { caseId: string; alg: string; message: string }[];
}

/** 뺀 목록에 보일 공식 글(너무 길면 앞만) */
function clip(alg: string): string {
  return alg.length > MAX_ALG_LENGTH ? `${alg.slice(0, 60)}…` : alg;
}

/**
 * 내보낸 글을 지금 공식에 더한다. 공식마다 다시 검사해 맞는 것만 넣고, 쓰는 공식도 목록에 있을 때만 따른다.
 * 무거운 검사가 끝없이 늘지 않게 상한을 둔다: 한 줄이 MAX_ALG_LENGTH를 넘거나, 상황의 내 공식이
 * MAX_MINE_PER_CASE개 찼거나, 파일 전체에서 MAX_IMPORT_ALGS번째를 넘는 공식은 검사하지 않고 뺀다.
 * 틀린 공식이 어느 상황을 푸는지는 찾지 않는다(까닭만).
 * 글을 못 읽거나 MAX_IMPORT_BYTES를 넘으면 Error
 */
export function importAlgBook(book: AlgBook, text: string): ImportResult {
  if (text.length > MAX_IMPORT_BYTES) throw new Error("파일이 너무 큼");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("JSON을 읽지 못함");
  }
  const d = data as { format?: unknown; cases?: unknown };
  if (d?.format !== FORMAT || typeof d.cases !== "object" || !d.cases)
    throw new Error("공식 파일이 아님");
  let next = book;
  let added = 0;
  let seen = 0;
  const rejected: ImportResult["rejected"] = [];
  for (const [id, raw] of Object.entries(d.cases as Record<string, unknown>)) {
    const c = caseById(id);
    const v = raw as { mine?: unknown; use?: unknown; habit?: unknown };
    const mine = Array.isArray(v?.mine) ? v.mine : [];
    for (const alg of mine) {
      if (typeof alg !== "string") continue;
      const reject = (message: string) =>
        rejected.push({ caseId: id, alg: clip(alg), message });
      if (++seen > MAX_IMPORT_ALGS) {
        reject("너무 많음");
        continue;
      }
      if (!c) {
        reject("없는 상황");
        continue;
      }
      const tidy = tidyAlg(alg);
      if (tidy.length > MAX_ALG_LENGTH) {
        reject("너무 김");
        continue;
      }
      const list = algsOf(next, c);
      // 이미 있는 공식(내보낸 것을 다시 가져올 때)은 검사하지 않는다
      if (list.some((x) => x.alg === tidy)) continue;
      if ((next[id]?.mine.length ?? 0) >= MAX_MINE_PER_CASE) {
        reject(FULL_MESSAGE);
        continue;
      }
      const r = addMine(next, c, alg, { findOther: false });
      if (!r.ok) reject(r.message);
      else if (r.book !== next) {
        next = r.book;
        added++;
      }
    }
    if (!c) continue;
    if (typeof v?.use === "string") {
      const use = tidyAlg(v.use);
      if (knownAlg(next, c, use)) next = setUsed(next, c, use);
    }
    if (isHabit(v?.habit)) next = setHabit(next, c, v.habit);
  }
  return { book: next, added, rejected };
}

// ── 글로 복사 ─────────────────────────────────────────

/** 묶음 전체를 「OLL 27 수네: R U R' U R U2 R'」 줄 목록으로 */
export function setAsText(book: AlgBook, set: AlgSetInfo): string {
  return set.cases
    .map((c) => `${shortName(c)}: ${usedAlg(book, c)}`)
    .join("\n");
}

export function setById(id: string): AlgSetInfo | undefined {
  return ALG_SETS.find((s) => s.set === id);
}

/** 자료 공식(대표·대안)으로 그 상황을 찾는다. 배우기 단원의 모범 답이 어느 상황인지 알아볼 때 */
export function caseOfAlg(alg: string): AlgCase | undefined {
  const t = tidyAlg(alg);
  for (const s of ALG_SETS) {
    const c = s.cases.find((x) => x.algs.includes(t));
    if (c) return c;
  }
  return undefined;
}
