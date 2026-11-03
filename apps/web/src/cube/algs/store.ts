// 내 공식(이 기기 localStorage). 상황마다 내가 넣은 공식 여러 개와 「쓰는 공식」 하나를 둔다.
// 넣을 때·가져올 때 모두 검사기(checkAlg)를 거쳐 그 상황의 역할에 맞는 것만 남긴다.
import { ALG_SETS, type AlgCase, type AlgSetInfo } from "../learn";
import { caseById, checkAlg, shortName } from "./check";
import { tidyAlg } from "./transform";

export const ALGS_KEY = "cube.algs.v1";

export interface CaseAlgs {
  /** 내가 넣은 공식(넣은 차례) */
  mine: string[];
  /** 쓰는 공식. 없으면 자료의 대표 공식 */
  use?: string;
}

export type AlgBook = Record<string, CaseAlgs>;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** 겉모양만 맞춘다(문자열 배열·문자열). 공식 내용 검사는 넣을 때 했다 */
function sanitize(data: unknown): AlgBook {
  const out: AlgBook = {};
  if (typeof data !== "object" || data === null || Array.isArray(data))
    return out;
  for (const [id, v] of Object.entries(data)) {
    if (!caseById(id) || typeof v !== "object" || v === null) continue;
    const raw = v as { mine?: unknown; use?: unknown };
    const mine = Array.isArray(raw.mine)
      ? raw.mine.filter((x): x is string => typeof x === "string")
      : [];
    const entry: CaseAlgs = { mine };
    if (typeof raw.use === "string") entry.use = raw.use;
    out[id] = entry;
  }
  return out;
}

export function loadAlgBook(
  storage: StorageLike | null = defaultStorage(),
): AlgBook {
  try {
    const text = storage?.getItem(ALGS_KEY);
    return text ? sanitize(JSON.parse(text)) : {};
  } catch {
    return {};
  }
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

/** 쓰는 공식. 고른 공식이 목록에 없으면(지웠으면) 대표 공식 */
export function usedAlg(book: AlgBook, c: AlgCase): string {
  const use = book[c.id]?.use;
  if (use && algsOf(book, c).some((x) => x.alg === use)) return use;
  return c.algs[0] as string;
}

export type AddResult =
  | { ok: true; book: AlgBook; alg: string; message: string }
  | { ok: false; book: AlgBook; message: string };

/** 검사해서 맞으면 내 공식에 넣는다(앞 윗면 돌리기가 필요하면 붙여 넣는다). 이미 있으면 그대로 */
export function addMine(book: AlgBook, c: AlgCase, input: string): AddResult {
  const r = checkAlg(c, input);
  if (!r.ok) return { ok: false, book, message: r.message };
  const alg = r.text;
  const entry = book[c.id] ?? { mine: [] };
  if (algsOf(book, c).some((x) => x.alg === alg))
    return { ok: true, book, alg, message: "이미 있음" };
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
  return { ...book, [c.id]: next };
}

/** 쓰는 공식 고르기. 대표 공식을 고르면 기본값으로 돌린다 */
export function setUsed(book: AlgBook, c: AlgCase, alg: string): AlgBook {
  const entry = book[c.id] ?? { mine: [] };
  const next: CaseAlgs = { mine: entry.mine };
  if (alg !== c.algs[0]) next.use = alg;
  return { ...book, [c.id]: next };
}

// ── 내보내기·가져오기 ─────────────────────────────────────

const FORMAT = "cube-algs";

export function exportAlgBook(book: AlgBook): string {
  const cases: AlgBook = {};
  for (const [id, v] of Object.entries(book))
    if (v.mine.length > 0 || v.use) cases[id] = v;
  return JSON.stringify({ format: FORMAT, version: 1, cases }, null, 2);
}

export interface ImportResult {
  book: AlgBook;
  added: number;
  rejected: { caseId: string; alg: string; message: string }[];
}

/**
 * 내보낸 글을 지금 공식에 더한다. 공식마다 다시 검사해 맞는 것만 넣고, 쓰는 공식도 목록에 있을 때만 따른다.
 * 글을 못 읽으면 Error
 */
export function importAlgBook(book: AlgBook, text: string): ImportResult {
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
  const rejected: ImportResult["rejected"] = [];
  for (const [id, raw] of Object.entries(d.cases as Record<string, unknown>)) {
    const c = caseById(id);
    const v = raw as { mine?: unknown; use?: unknown };
    const mine = Array.isArray(v?.mine) ? v.mine : [];
    if (!c) {
      for (const alg of mine)
        rejected.push({ caseId: id, alg: String(alg), message: "없는 상황" });
      continue;
    }
    for (const alg of mine) {
      if (typeof alg !== "string") continue;
      const before = algsOf(next, c).length;
      const r = addMine(next, c, alg);
      if (!r.ok) rejected.push({ caseId: id, alg, message: r.message });
      else {
        next = r.book;
        if (algsOf(next, c).length > before) added++;
      }
    }
    if (typeof v?.use === "string") {
      const use = tidyAlg(v.use);
      if (algsOf(next, c).some((x) => x.alg === use))
        next = setUsed(next, c, use);
    }
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
