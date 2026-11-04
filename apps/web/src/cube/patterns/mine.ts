import { formatMoves, NotationError, parseMoves } from "@game/cube-engine";

import { MAX_ALG_LENGTH } from "../algs/check";

/**
 * 내 패턴(이 기기 localStorage). 사용자가 넣은 공식과 이름을 크기별로 둔다.
 * 저장소가 막혀 있으면(사생활 창 등) 빈 목록으로 돌고 저장은 조용히 건너뛴다.
 */

export const MY_PATTERNS_KEY = "cube.patterns.v1";
export const MAX_MY_PATTERNS = 60;
export const MAX_PATTERN_NAME = 30;

export interface MyPattern {
  id: string;
  size: number;
  name: string;
  alg: string;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function sanitize(data: unknown): MyPattern[] {
  if (!Array.isArray(data)) return [];
  const out: MyPattern[] = [];
  for (const v of data) {
    if (typeof v !== "object" || v === null) continue;
    const { id, size, name, alg } = v as Record<string, unknown>;
    if (
      typeof id === "string" &&
      typeof size === "number" &&
      size >= 2 &&
      size <= 5 &&
      typeof name === "string" &&
      typeof alg === "string"
    )
      out.push({ id, size, name, alg });
  }
  return out.slice(0, MAX_MY_PATTERNS);
}

export function loadMyPatterns(
  storage: StorageLike | null = defaultStorage(),
): MyPattern[] {
  if (!storage) return [];
  try {
    const text = storage.getItem(MY_PATTERNS_KEY);
    return text ? sanitize(JSON.parse(text)) : [];
  } catch {
    return [];
  }
}

export function saveMyPatterns(
  list: readonly MyPattern[],
  storage: StorageLike | null = defaultStorage(),
): void {
  try {
    storage?.setItem(MY_PATTERNS_KEY, JSON.stringify(list));
  } catch {
    // 저장소가 꽉 찼거나 막혔다: 이번 화면에서만 쓴다
  }
}

export type ReadAlg =
  | { ok: true; alg: string; count: number }
  | { ok: false; message: string };

/** 입력한 공식을 읽어 고른 크기의 표기로 다듬는다. 틀린 곳은 쉬운 말로 알려 준다 */
export function readPatternAlg(size: number, text: string): ReadAlg {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, message: "공식을 넣어 주세요." };
  if (trimmed.length > MAX_ALG_LENGTH)
    return {
      ok: false,
      message: `공식이 너무 길어요(${MAX_ALG_LENGTH}글자까지).`,
    };
  try {
    const moves = parseMoves(size, trimmed);
    if (moves.length === 0)
      return { ok: false, message: "공식을 넣어 주세요." };
    return { ok: true, alg: formatMoves(size, moves), count: moves.length };
  } catch (e) {
    if (e instanceof NotationError)
      return {
        ok: false,
        message: `${e.index + 1}번째 글자 「${e.token}」을 읽을 수 없어요.`,
      };
    return { ok: false, message: "공식을 읽을 수 없어요." };
  }
}

/** 새 패턴을 맨 앞에 넣는다(같은 크기·같은 공식이 있으면 이름만 바꾼다) */
export function addMyPattern(
  list: readonly MyPattern[],
  entry: Omit<MyPattern, "id">,
  id: string,
): MyPattern[] {
  const name = entry.name.trim().slice(0, MAX_PATTERN_NAME) || "내 패턴";
  const same = list.find((p) => p.size === entry.size && p.alg === entry.alg);
  if (same) return list.map((p) => (p === same ? { ...p, name } : p));
  return [{ ...entry, name, id }, ...list].slice(0, MAX_MY_PATTERNS);
}

export function removeMyPattern(
  list: readonly MyPattern[],
  id: string,
): MyPattern[] {
  return list.filter((p) => p.id !== id);
}
