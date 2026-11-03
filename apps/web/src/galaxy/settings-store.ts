import type { GalaxyLength } from "@game/galaxy-engine";
import type { TimePreset } from "@game/mighty-engine";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * 은하 한 바퀴 설정 저장소. 루트 layout의 StoreHydration이 모든 페이지에서 부르므로 엔진 값을 가져오지 않는다
 * (타입만). 엔진을 부르면 사계절 하늘 자료까지 모든 페이지 묶음에 실린다. 규칙 만들기는 `settings.ts`
 */

/** 0 입문, 1 중수, 2 고수 */
export type GalaxyLevel = 0 | 1 | 2;

/** 은하 한 바퀴만의 설정. 첫 그리기 뒤에 저장값을 읽는다(StoreHydration) */
export interface GalaxySettings {
  players: 2 | 3 | 4;
  length: GalaxyLength;
  trade: boolean;
  /** 제철 하늘(docs/48 2-12 1번) */
  seasonal: boolean;
  /** 유성우의 밤(docs/48 2-12 7번): 마지막 두 돌림 이용료 2배. 기본 끔 */
  meteor: boolean;
  level: GalaxyLevel;
  /** 개인 시간(docs/24). 굴리기·사기·차례 마치기·거래 답·빚 정리에만 시계가 간다 */
  time: TimePreset;
  /** 휴대폰 세로에서 우주선이 움직이는 동안 그 변을 크게 따라가 보기(움직임 줄이기면 쓰지 않는다) */
  follow: boolean;
  set(patch: Partial<Omit<GalaxySettings, "set">>): void;
}

export const useGalaxySettings = create<GalaxySettings>()(
  persist(
    (set) => ({
      players: 2,
      length: "standard",
      trade: true,
      seasonal: true,
      meteor: false,
      level: 0,
      time: "none",
      follow: true,
      set: (patch) => set(patch),
    }),
    {
      name: "galaxy-settings",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);
