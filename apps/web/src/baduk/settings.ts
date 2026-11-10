import type { BoardSize, Komi } from "@game/baduk-engine";
import type { TimePreset } from "@game/mighty-engine";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 0 입문, 1 중수, 2 고수, 3 초고수 */
export type BadukLevel = 0 | 1 | 2 | 3;

/** 나홀로 바둑에서 내 돌: 흑(먼저)·백·무작위 */
export type StonePick = "black" | "white" | "random";

/** 바둑만의 설정. 첫 그리기 뒤에 저장값을 읽는다(StoreHydration) */
interface BadukSettings {
  size: BoardSize;
  komi: Komi;
  winsToFinish: number;
  level: BadukLevel;
  pick: StonePick;
  /** 개인 시간(기본 시간 + 초읽기) */
  time: TimePreset;
  /** 활로가 하나 남은(단수) 돌을 판에 빨간 테두리로 보인다. 화면 도움일 뿐 규칙과 상관없다 */
  atariHint: boolean;
  set(patch: Partial<Omit<BadukSettings, "set">>): void;
}

export const useBadukSettings = create<BadukSettings>()(
  persist(
    (set) => ({
      // 일반 바둑처럼 19줄이 기본이다. 작은 판은 배우기·문제 풀기에서 쓴다(2026-10-29 사용자)
      size: 19,
      komi: 7.5,
      winsToFinish: 1,
      level: 0,
      pick: "black",
      time: "none",
      atariHint: true,
      set: (patch) => set(patch),
    }),
    {
      name: "baduk-settings",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      // 1: 기본 판을 9줄에서 19줄로. 예전 기본값(9줄)으로 남은 기기는 한 번 19줄로 옮긴다
      version: 1,
      migrate: (persisted, version) => {
        const state = persisted as Partial<BadukSettings>;
        if (version < 1 && state.size === 9) state.size = 19;
        return state as BadukSettings;
      },
    },
  ),
);

export const BADUK_LEVELS: readonly {
  value: BadukLevel;
  label: string;
  description: string;
}[] = [
  {
    value: 0,
    label: "입문",
    description:
      "따낼 수 있는 돌은 따내고 단수에 걸린 돌은 달아나지만, 그 밖에는 아무 데나 둔다.",
  },
  {
    value: 1,
    label: "중수",
    description:
      "둘 만한 수마다 판 끝까지 여러 번 둬 보고, 이긴 비율이 높은 수를 고른다.",
  },
  {
    value: 2,
    label: "고수",
    description:
      "좋아 보이는 수를 골라 가며 수천 판을 끝까지 둬 보고 고른다. 큰 판에서는 조금 약하다.",
  },
  {
    value: 3,
    label: "초고수",
    description:
      "돌이 잡히는 길과 살고 죽음을 더 깊이 읽고, 지금 누가 앞서는지 세며 둔다. 앞서면 안전하게, 뒤지면 과감하게 둔다. 큰 판은 생각이 조금 길다.",
  },
];

export const SIZE_INFO: readonly {
  value: BoardSize;
  label: string;
  description: string;
}[] = [
  {
    value: 9,
    label: "9줄",
    description: "처음 배우기 좋은 작은 판이다. 한 판이 짧다.",
  },
  {
    value: 13,
    label: "13줄",
    description:
      "9줄과 19줄 사이 크기다. 9줄보다 넓어 초반에 판 여기저기 자리를 먼저 잡는 수가 조금 중요해진다.",
  },
  {
    value: 19,
    label: "19줄",
    description: "정식 판이다. 길고 넓다. 컴퓨터 고수는 9줄보다 약하다.",
  },
];
