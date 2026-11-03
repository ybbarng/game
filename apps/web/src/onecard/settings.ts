import { ONECARD_LEVELS as AI_LEVELS } from "@game/onecard-ai";
import {
  type OnecardRules,
  STANDARD_ONECARD_RULES,
} from "@game/onecard-engine";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 0 입문, 1 중수, 2 고수 */
export type OnecardLevel = 0 | 1 | 2;

/** 원카드에서 고르는 것. 첫 그리기 뒤에 저장값을 읽는다(StoreHydration) */
interface OnecardSettings {
  players: number;
  handSize: OnecardRules["handSize"];
  endOnFirst: boolean;
  level: OnecardLevel;
  set(patch: Partial<Omit<OnecardSettings, "set">>): void;
}

export const useOnecardSettings = create<OnecardSettings>()(
  persist(
    (set) => ({
      players: STANDARD_ONECARD_RULES.players,
      handSize: STANDARD_ONECARD_RULES.handSize,
      endOnFirst: STANDARD_ONECARD_RULES.endOnFirst,
      level: 0,
      set: (patch) => set(patch),
    }),
    {
      name: "onecard-settings",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);

/** 지금 고른 규칙(나머지는 기본값, docs/42 12-1) */
export function rulesOf(s: {
  players: number;
  handSize: OnecardRules["handSize"];
  endOnFirst: boolean;
}): OnecardRules {
  return {
    ...STANDARD_ONECARD_RULES,
    players: s.players,
    handSize: s.handSize,
    endOnFirst: s.endOnFirst,
  };
}

/** 컴퓨터 단계(`@game/onecard-ai`의 입문·중수·고수, docs/42 13절) */
export const ONECARD_LEVELS: readonly {
  value: OnecardLevel;
  label: string;
  description: string;
}[] = AI_LEVELS.map((l) => ({
  value: l.level,
  label: l.name,
  description: l.description,
}));
