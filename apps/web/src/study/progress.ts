import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { hydrateAfterFirstPaint } from "@/lib/persist-hydration";
import { localDay, type PuzzleRecord, recordMiss, recordSolve } from "./review";

export type { PuzzleRecord } from "./review";

export interface StudyProgress {
  records: Record<string, PuzzleRecord>;
  /** 풀었다. `now`는 시험이 넣는 때(없으면 지금) */
  solve(id: string, now?: number): void;
  /** 틀렸다. `now`는 시험이 넣는 때(없으면 지금) */
  miss(id: string, now?: number): void;
  reset(): void;
}

/**
 * 수 배우기 진행 기록(docs/23). 이 브라우저에만 남는다. 게임마다 저장 이름을 달리 한다.
 * 기록 모양과 다음 복습 날은 `review.ts`가 정한다(옛 기록도 그대로 읽는다)
 */
export function createStudyProgress(name: string) {
  return hydrateAfterFirstPaint(
    create<StudyProgress>()(
      persist(
        (set) => ({
          records: {},
          solve: (id, now = Date.now()) =>
            set((s) => ({
              records: {
                ...s.records,
                [id]: recordSolve(s.records[id], now, localDay),
              },
            })),
          miss: (id, now = Date.now()) =>
            set((s) => ({
              records: { ...s.records, [id]: recordMiss(s.records[id], now) },
            })),
          reset: () => set({ records: {} }),
        }),
        {
          name,
          storage: createJSONStorage(() => localStorage),
          // 미리 그려 둔 HTML과 첫 화면이 같아야 하므로 저장값은 첫 그리기 뒤에 읽는다(StoreHydration).
          skipHydration: true,
        },
      ),
    ),
  );
}

export type StudyProgressStore = ReturnType<typeof createStudyProgress>;

/** 장기 수 배우기 진행 기록 */
export const useJanggiStudyProgress = createStudyProgress("janggi-study");

/** 묶음에서 다음에 풀 문제: 안 푼 것 먼저, 다 풀었으면 틀린 적이 많은 것 */
export function nextPuzzle(
  ids: readonly string[],
  records: Record<string, PuzzleRecord>,
): string | null {
  const unsolved = ids.find((id) => !records[id]?.solvedAt);
  if (unsolved) return unsolved;
  const sorted = [...ids].sort(
    (a, b) => (records[b]?.misses ?? 0) - (records[a]?.misses ?? 0),
  );
  return sorted[0] ?? null;
}
