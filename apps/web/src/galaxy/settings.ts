import {
  DEFAULT_SKY,
  type GalaxyLength,
  type GalaxyRules,
  NUMBERS,
  turnLimitOf,
} from "@game/galaxy-engine";
import type { TimePreset } from "@game/mighty-engine";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 0 입문, 1 중수, 2 고수 */
export type GalaxyLevel = 0 | 1 | 2;

/** 은하 한 바퀴만의 설정. 첫 그리기 뒤에 저장값을 읽는다(StoreHydration) */
interface GalaxySettings {
  players: 2 | 3 | 4;
  length: GalaxyLength;
  trade: boolean;
  /** 제철 하늘(docs/48 2-12 1번) */
  seasonal: boolean;
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

/** 지금 설정으로 만든 규칙(하늘은 G7 전까지 사계절 하늘 하나) */
export function rulesFromSettings(
  s: Pick<GalaxySettings, "players" | "length" | "trade" | "seasonal"> & {
    time?: TimePreset;
  },
): GalaxyRules {
  return {
    players: s.players,
    length: s.length,
    trade: s.trade,
    seasonal: s.seasonal,
    sky: DEFAULT_SKY,
    ...(s.time && s.time !== "none" ? { time: s.time } : {}),
  };
}

/**
 * 컴퓨터와 하는 판의 어림 시간(분). 내 차례 약 15초, 컴퓨터 차례 약 8초로 잡는다(docs/48 2-11의 혼자 하기 어림).
 * 긴 판은 차례 수가 없어 null
 */
export function soloMinutes(rules: GalaxyRules): number | null {
  const turns = turnLimitOf(rules);
  if (turns === null) return null;
  const seconds = turns * (15 + 8 * (rules.players - 1));
  return Math.max(5, Math.round(seconds / 60 / 5) * 5);
}

export const GALAXY_LENGTHS: readonly {
  value: GalaxyLength;
  label: string;
}[] = [
  { value: "short", label: "짧은 판" },
  { value: "standard", label: "기본 판" },
  { value: "long", label: "긴 판" },
];

/** 판 길이 설명: 차례 수와 어림 시간 */
export function lengthDetail(rules: GalaxyRules): string {
  const turns = turnLimitOf(rules);
  const minutes = soloMinutes(rules);
  if (turns === null || minutes === null)
    return "한 사람만 남을 때까지 해요(30분 넘게 걸려요)";
  const dealt = NUMBERS.dealStars[rules.length];
  const deal = dealt > 0 ? ` · 시작할 때 별 ${dealt}개씩 나눠 받아요` : "";
  return `한 사람에 ${turns}차례 · 약 ${minutes}분${deal}`;
}

export const GALAXY_LEVELS: readonly {
  value: GalaxyLevel;
  label: string;
  description: string;
}[] = [
  {
    value: 0,
    label: "입문",
    description: "별빛이 넉넉하면 거의 다 사고, 입찰은 어림으로 낸다",
  },
  {
    value: 1,
    label: "중수",
    description: "쓸 돈을 남겨 두며 사고, 별자리를 잇거나 막는 별을 더 쳐준다",
  },
  {
    value: 2,
    label: "고수",
    description: "칸마다 밟힐 확률로 앞으로 받을 이용료를 세어 값을 매긴다",
  },
];
