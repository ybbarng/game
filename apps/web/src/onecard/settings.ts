import {
  type OnecardRules,
  STANDARD_ONECARD_RULES,
} from "@game/onecard-engine";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 컴퓨터 단계. 지금은 "보통" 하나(컴퓨터 패키지가 생기면 셋) */
export type OnecardLevel = 1;

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
      level: 1,
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

export const ONECARD_LEVELS: readonly {
  value: OnecardLevel;
  label: string;
  description: string;
}[] = [
  {
    value: 1,
    label: "보통",
    description:
      "아끼는 카드(조커·공격·7)는 뒤로 미룬다. 원카드는 자주 외치고, 잊은 사람을 가끔 잡는다",
  },
];
