import type { Bikjang } from "@game/janggi-engine";
import type { TimePreset } from "@game/mighty-engine";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 0 입문, 1 중수, 2 고수, 3 초고수 */
export type JanggiLevel = 0 | 1 | 2 | 3;

/** 나홀로 장기에서 내 편: 초(먼저)·한·무작위 */
export type SidePick = "cho" | "han" | "random";

/** 기물 글자: 한자(車·包…) 또는 한글(차·포…) */
export type PieceLabels = "hanja" | "hangul";

/** 장기만의 설정. 첫 그리기 뒤에 저장값을 읽는다(StoreHydration) */
interface JanggiSettings {
  bikjang: Bikjang;
  winsToFinish: number;
  level: JanggiLevel;
  pick: SidePick;
  labels: PieceLabels;
  /** 개인 시간(기본 시간 + 초읽기) */
  time: TimePreset;
  /** 잡힐 위험이 있는 내 기물에 빨간 점선 고리. 화면 도움일 뿐 규칙과 상관없다 */
  dangerHint: boolean;
  set(patch: Partial<Omit<JanggiSettings, "set">>): void;
}

export const useJanggiSettings = create<JanggiSettings>()(
  persist(
    (set) => ({
      bikjang: "score",
      winsToFinish: 1,
      level: 0,
      pick: "cho",
      labels: "hanja",
      time: "none",
      dangerHint: true,
      set: (patch) => set(patch),
    }),
    {
      name: "janggi-settings",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);

export const JANGGI_LEVELS: readonly {
  value: JanggiLevel;
  label: string;
  description: string;
}[] = [
  {
    value: 0,
    label: "입문",
    description: "한 수만 본다. 공짜 기물은 잡지만 자기 기물을 자주 내준다.",
  },
  {
    value: 1,
    label: "중수",
    description:
      "두 수 앞을 보고, 기물을 주고받을 때 손해인지 따진다. 기물을 공짜로 주지 않는다.",
  },
  {
    value: 2,
    label: "고수",
    description: "세 수 앞까지 읽는다. 외통으로 몰 수 있으면 놓치지 않는다.",
  },
  {
    value: 3,
    label: "초고수",
    description:
      "수마다 목표(기물 펼치기·궁성 공격·외통 몰기)를 세우고 더 깊이 읽는다.",
  },
];

export const BIKJANG_INFO: readonly {
  value: Bikjang;
  label: string;
  description: string;
}[] = [
  {
    value: "score",
    label: "빅장은 점수로",
    description:
      "두 궁이 사이에 아무 기물 없이 마주 보면(빅장) 그 판을 남은 기물 점수로 가린다.",
  },
  {
    value: "forbidden",
    label: "빅장 금지",
    description:
      "두 궁이 사이에 아무 기물 없이 마주 보게 되는 수는 둘 수 없다.",
  },
];
