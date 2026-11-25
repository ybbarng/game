import { useSyncExternalStore } from "react";

/**
 * 「지금 크기」(docs/47 16-28): 사이트가 기억하는 큐브 크기 하나. 기본은 3×3.
 *
 * - 하는 화면(혼자 맞추기·타이머·대결·해법 배우기·패턴·모양 만들기·단축키 표 등)은 이 크기로 열고, 화면 안에서 크기를
 *   바꾸면 이 값도 바꾼다(`setCurrentSize`).
 * - 보는 화면(티어표·큐브의 수학 카드 등)은 이 크기로 열되, 화면 안에서 바꿔도 이 값을 그대로 둔다.
 * - 그 화면에 없는 크기면 이 값은 그대로 두고 화면은 3×3으로 연다(`sizeFor`).
 *
 * 이 기기 localStorage(`cube.size.v1`)에 둔다. 같은 탭의 다른 화면은 구독으로, 다른 탭은 `storage` 사건으로 따라간다.
 * Cubie 앱의 크기(`cube.mini.v1`의 `n`)와는 따로다(앱은 앱대로 메뉴 「큐브 크기」가 지금 크기 구실을 한다).
 */

export const CURRENT_SIZE_KEY = "cube.size.v1";
/** 첫 화면 연출 크기를 두던 곳(없앤 `heroSize` 칸을 처음 한 번 옮겨 온다) */
const OLD_SETTINGS_KEY = "cube.settings.v1";
export const DEFAULT_SIZE = 3;
/** 지금 크기로 둘 수 있는 크기 */
export const ALL_SIZES = [2, 3, 4, 5, 6, 7] as const;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export const isCubeSize = (v: unknown): v is number =>
  typeof v === "number" && (ALL_SIZES as readonly number[]).includes(v);

/** 저장된 글 → 크기. 없거나 틀렸으면 null */
export function parseCurrentSize(
  text: string | null | undefined,
): number | null {
  if (!text) return null;
  try {
    const d = JSON.parse(text) as { n?: unknown } | null;
    return d && typeof d === "object" && isCubeSize(d.n) ? d.n : null;
  } catch {
    return null;
  }
}

/** 옛 설정의 첫 화면 연출 크기(`heroSize`). 3이 아니고 맞는 크기일 때만 */
function oldHeroSize(storage: StorageLike): number | null {
  try {
    const d = JSON.parse(storage.getItem(OLD_SETTINGS_KEY) ?? "null") as {
      heroSize?: unknown;
    } | null;
    const n = d && typeof d === "object" ? d.heroSize : undefined;
    return isCubeSize(n) && n !== DEFAULT_SIZE ? n : null;
  } catch {
    return null;
  }
}

/**
 * 지금 크기를 읽는다. 아직 저장한 적이 없고 옛 설정에 첫 화면 연출 크기(3이 아닌 값)가 있으면 그 값을 지금 크기로
 * 한 번 옮겨 저장한다(2026-11-26, 설정 「첫 화면 큐브 크기」를 없애며). 그 밖에는 3
 */
export function loadCurrentSize(
  storage: StorageLike | null = defaultStorage(),
): number {
  try {
    if (!storage) return DEFAULT_SIZE;
    const saved = parseCurrentSize(storage.getItem(CURRENT_SIZE_KEY));
    if (saved !== null) return saved;
    const old = oldHeroSize(storage);
    if (old === null) return DEFAULT_SIZE;
    saveCurrentSize(old, storage);
    return old;
  } catch {
    return DEFAULT_SIZE;
  }
}

/** 저장한다. 맞지 않는 크기거나 못 하면 false */
export function saveCurrentSize(
  n: number,
  storage: StorageLike | null = defaultStorage(),
): boolean {
  if (!isCubeSize(n)) return false;
  try {
    if (!storage) return false;
    storage.setItem(CURRENT_SIZE_KEY, JSON.stringify({ v: 1, n }));
    return true;
  } catch {
    return false;
  }
}

/**
 * 이 화면이 열 크기: 지금 크기가 이 화면에 있으면 그것, 없으면 3×3(3도 없으면 첫 크기). 지금 크기는 바꾸지 않는다
 */
export function sizeFor(available: readonly number[], current: number): number {
  if (available.includes(current)) return current;
  if (available.includes(DEFAULT_SIZE)) return DEFAULT_SIZE;
  return available[0] ?? DEFAULT_SIZE;
}

// ---------------------------------------------------------------- 화면에서 함께 쓰는 저장소

let current: number | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function snapshot(): number {
  current ??= loadCurrentSize();
  return current;
}

/** 지금 크기를 바꿔 저장하고 큐브 화면들에 알린다(하는 화면만 부른다) */
export function setCurrentSize(n: number): void {
  if (!isCubeSize(n)) return;
  current = n;
  saveCurrentSize(n);
  notify();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  // 다른 탭이 바꾸면 다시 읽는다(첫 구독 때 한 번만 건다)
  if (listeners.size === 1 && typeof window !== "undefined")
    window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    if (listeners.size === 0 && typeof window !== "undefined")
      window.removeEventListener("storage", onStorage);
  };
}

function onStorage(e: StorageEvent) {
  if (e.key !== CURRENT_SIZE_KEY && e.key !== null) return;
  const next = loadCurrentSize();
  if (next === current) return;
  current = next;
  notify();
}

/** 시험만: 기억해 둔 값을 버린다(다음 읽기에서 저장소를 다시 읽는다) */
export function resetCurrentSizeForTest(): void {
  current = null;
}

/** 지금 크기(정적 빌드의 첫 그리기에서는 3, 그 뒤 이 기기 값) */
export function useCurrentSize(): number {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_SIZE);
}
