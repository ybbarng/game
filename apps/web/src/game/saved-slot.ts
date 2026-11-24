/**
 * 이 기기에 남기는 저장 칸 하나(localStorage 열쇠 하나). 브라우저 저장소를 쓸 수 없는 환경(사생활 보호 창 등)에서는
 * 조용히 넘어간다: 저장하지 못하면 이어하기만 안 될 뿐 게임은 계속된다.
 * 모든 게임의 이어하기 저장이 쓴다. 저장소 공장(`match-store.ts`)과 따로 두어 공장을 쓰지 않는 게임이 공장을 끌어오지 않는다
 */
export interface SavedSlot<T> {
  save(value: T): void;
  /** 없거나 읽을 수 없거나 `isValid`가 거르면 null */
  load(): T | null;
  clear(): void;
}

/** 이어하기 저장본의 기본 검사: 판 번호 1과 기록 목록 */
export const isSavedMatch = (value: unknown): boolean => {
  const saved = value as { version?: unknown; log?: unknown } | null;
  return saved?.version === 1 && Array.isArray(saved.log);
};

export function savedMatchSlot<T>(
  key: string,
  isValid: (value: unknown) => boolean = isSavedMatch,
): SavedSlot<T> {
  return {
    save(value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // 저장할 수 없으면 이어하기만 안 된다.
      }
    },
    load() {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const value: unknown = JSON.parse(raw);
        return isValid(value) ? (value as T) : null;
      } catch {
        return null;
      }
    },
    clear() {
      try {
        localStorage.removeItem(key);
      } catch {
        // 지울 수 없어도 문제없다.
      }
    },
  };
}
