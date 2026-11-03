import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { createTutorialProgress } from "@/tutorial/progress";

/** 은하 한 바퀴 배우기 진행 기록. `StoreHydration`에서 첫 그리기 뒤에 읽는다 */
export const useGalaxyTutorialProgress =
  createTutorialProgress("galaxy-tutorial");

interface StarQuizProgress {
  /** 푼 문제 수 */
  answered: number;
  /** 처음 고른 답이 맞은 문제 수 */
  correct: number;
  /** 지금 이어 맞힌 수 */
  streak: number;
  /** 가장 길게 이어 맞힌 수 */
  best: number;
  record(correct: boolean): void;
}

/** 별자리 퀴즈 기록(이 기기에만, 게임 안 이득은 없다) */
export const useGalaxyStarQuiz = create<StarQuizProgress>()(
  persist(
    (set) => ({
      answered: 0,
      correct: 0,
      streak: 0,
      best: 0,
      record: (ok) =>
        set((s) => {
          const streak = ok ? s.streak + 1 : 0;
          return {
            answered: s.answered + 1,
            correct: s.correct + (ok ? 1 : 0),
            streak,
            best: Math.max(s.best, streak),
          };
        }),
    }),
    {
      name: "galaxy-star-quiz",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);
